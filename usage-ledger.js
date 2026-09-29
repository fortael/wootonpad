// usage-ledger.js — tokens per project per day, and how much of the plan's
// limits each project used.
//
// Two sources, neither of which says the whole thing on its own:
//
//   * The transcripts. Every API response the CLI records carries its `usage`:
//     input, output, cache writes, cache reads, and the model. That is exact,
//     per session, per project, back to the first transcript on disk — but it
//     says nothing about the plan.
//   * Readings of the plan's meters (`five_hour`, `seven_day`): the usage API
//     polled while the app runs, and the `rate_limit_event` an SDK session gets
//     every turn. Those are exact for the account, but they are one number for
//     everything — every project, every machine, claude.ai too — and there is
//     no history before the app started recording them.
//
// Joining them: between two readings in the same window the meter moved by
// some delta, and the messages sent in that interval are what moved it. Each
// message gets a share of the delta in proportion to its API-equivalent cost.
// Cost rather than tokens because the plan does not count a token as a token:
// an Opus output token costs the limit far more than a Haiku cache read, and
// the published prices are the closest thing to that weighting anyone outside
// Anthropic has. It is an estimate and the UI says so.
//
// A reading that opens a new window starts from zero at the window's start
// (reset time minus the window's length), so the first reading after a reset
// is attributed to everything sent since the window opened. A delta with no
// message behind it here was spent somewhere else — another machine,
// claude.ai — and is kept as its own line rather than smeared over projects.
//
// Pure: no fs, no DB. The worker reads files with `usageRowsFromText`,
// usage-stats.js stores and queries, and this file does the arithmetic.

const HOUR = 3600000;
const DAY = 24 * HOUR;

/** Length of each plan window. Its start is its reset time minus this. */
const WINDOW_MS = { five_hour: 5 * HOUR, seven_day: 7 * DAY };
const WINDOWS = Object.keys(WINDOW_MS);

// Two readings of one window can disagree about its reset by a few seconds
// (the stream rounds to the second, the API does not); two different windows
// are at least five hours apart.
const SAME_RESET_MS = 10 * 60000;

// Readings further apart than this are drawn unjoined: the line between them
// would claim to know what happened while nobody was looking.
const GAP_MS = 60 * 60000;

// ── Prices ───────────────────────────────────────────────────────────────
//
// Dollars per million tokens, for weighting only. Ordered most specific first:
// the old Opus 4/4.1 price has to be matched before the later, cheaper one.
// An unknown model — a new family — is priced as Opus rather than as nothing,
// so it still carries weight in the split.
const PRICES = [
  { test: /opus-4-(0|1)\b|opus-4-20|opus-4$|claude-3-opus|3-opus/, input: 15, output: 75 },
  { test: /opus/, input: 5, output: 25 },
  { test: /sonnet/, input: 3, output: 15 },
  { test: /haiku-3-5|3-5-haiku/, input: 0.8, output: 4 },
  { test: /3-haiku|haiku-3\b/, input: 0.25, output: 1.25 },
  { test: /haiku/, input: 1, output: 5 },
];
const FALLBACK_PRICE = { input: 5, output: 25 };

function priceFor(model) {
  const id = String(model || '').toLowerCase();
  for (const p of PRICES) if (p.test.test(id)) return p;
  return FALLBACK_PRICE;
}

/**
 * API-equivalent dollars for one message. Cache writes are 1.25× input for the
 * five-minute cache and 2× for the hour-long one; reads are a tenth of input.
 */
function messageCost(row) {
  const p = priceFor(row.model);
  const write1h = Math.min(row.cacheWrite1h || 0, row.cacheWrite || 0);
  const write5m = (row.cacheWrite || 0) - write1h;
  return (
    (row.input || 0) * p.input
    + (row.output || 0) * p.output
    + write5m * p.input * 1.25
    + write1h * p.input * 2
    + (row.cacheRead || 0) * p.input * 0.1
  ) / 1e6;
}

/** Every token the request processed, cached or not — what `ccusage` calls total. */
function totalTokens(row) {
  return (row.input || 0) + (row.output || 0) + (row.cacheWrite || 0) + (row.cacheRead || 0);
}

// ── Transcript rows ──────────────────────────────────────────────────────

/**
 * One transcript entry → the usage it records, or null.
 *
 * The CLI writes each content block of a response as its own line, all under
 * one message id and each carrying the message's usage; the caller keys on
 * the id so the message is counted once. Forked sessions copy their parent's
 * lines, ids included, which the same key takes care of.
 */
function usageRowFromEntry(entry) {
  if (!entry || entry.type !== 'assistant') return null;
  const msg = entry.message;
  const u = msg && msg.usage;
  if (!u || !msg.id) return null;
  if (msg.model === '<synthetic>') return null;
  const ts = Date.parse(entry.timestamp);
  if (!Number.isFinite(ts)) return null;
  const row = {
    messageId: String(msg.id),
    sessionId: entry.sessionId ? String(entry.sessionId) : null,
    ts,
    model: msg.model || null,
    input: u.input_tokens || 0,
    output: u.output_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
    cacheWrite1h: (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    sidechain: entry.isSidechain ? 1 : 0,
    cwd: entry.cwd || null,
  };
  return totalTokens(row) > 0 ? row : null;
}

/**
 * Rows from a run of complete JSONL lines. Lines that cannot carry usage are
 * skipped before parsing — a transcript is mostly tool output, and parsing it
 * all to find the few hundred responses in it is most of the cost of a scan.
 */
function usageRowsFromText(text) {
  const rows = [];
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    if (end > start) {
      const line = text.slice(start, end);
      if (line.includes('"usage"') && line.includes('"assistant"')) {
        try {
          const row = usageRowFromEntry(JSON.parse(line));
          if (row) rows.push(row);
        } catch { /* a line the CLI was still writing */ }
      }
    }
    start = end + 1;
  }
  return rows;
}

// ── Limit readings ───────────────────────────────────────────────────────

/** A fraction (0.23) or a percent (23) in, a percent out — see rate-limits.js. */
function toPercent(value, { fraction } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const pct = fraction === true || (fraction === undefined && value <= 1) ? value * 100 : value;
  return Math.min(100, Math.round(pct * 10) / 10);
}

/** Epoch seconds, epoch millis or an ISO string → millis, or null. */
function toMillis(value) {
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
}

/**
 * The usage API's answer → readings. It reports percents (23.0) and ISO reset
 * times; a window that has not started yet comes back as null or without a
 * reset, and says nothing worth recording.
 */
function readingsFromUsageApi(raw) {
  const out = [];
  if (!raw || typeof raw !== 'object') return out;
  for (const kind of WINDOWS) {
    const w = raw[kind];
    if (!w || typeof w !== 'object') continue;
    const utilization = toPercent(w.utilization, { fraction: false });
    if (utilization === null) continue;
    out.push({ kind, utilization, resetsAt: toMillis(w.resets_at ?? w.resetsAt) });
  }
  return out;
}

/**
 * A `rate_limit_event`'s `rate_limit_info` → readings. Same rules as
 * parseRateLimitEvent in rate-limits.js (fractions, reset in epoch seconds,
 * `unifiedWindows` preferred over the single named window).
 */
function readingsFromRateLimitInfo(info) {
  const out = [];
  if (!info || typeof info !== 'object') return out;
  const seen = new Set();
  const unified = info.unifiedWindows;
  if (unified && typeof unified === 'object') {
    for (const kind of WINDOWS) {
      const w = unified[kind];
      if (!w || typeof w !== 'object') continue;
      const utilization = toPercent(w.utilization);
      if (utilization === null) continue;
      out.push({ kind, utilization, resetsAt: toMillis(w.resetsAt ?? w.resets_at) });
      seen.add(kind);
    }
  }
  const named = info.rateLimitType;
  if (WINDOWS.includes(named) && !seen.has(named)) {
    const utilization = toPercent(info.utilization);
    if (utilization !== null) out.push({ kind: named, utilization, resetsAt: toMillis(info.resetsAt) });
  }
  return out;
}

function sameReset(a, b) {
  return a != null && b != null && Math.abs(a - b) <= SAME_RESET_MS;
}

// ── Attribution ──────────────────────────────────────────────────────────

/**
 * Split each window's movement over the messages that caused it.
 *
 * @param {Array<{ts:number, utilization:number, resetsAt:number|null}>} readings  one window, ascending
 * @param {Array<{ts:number, cost:number}>} messages  ascending by ts
 * @param {number} windowMs
 * @returns {{ alloc: Float64Array, points: Array<object> }}
 *   alloc[i] — percentage points of this window message i used;
 *   points — one per reading: its interval, delta, and the messages behind it
 *   as an index range [first, last) into `messages`.
 */
function attributeWindow(readings, messages, windowMs) {
  const alloc = new Float64Array(messages.length);
  const points = [];
  let lo = 0;        // first message not yet behind any earlier reading
  let peak = 0;      // highest reading in the current window
  let prev = null;

  const firstAtOrAfter = (t, from) => {
    let i = from;
    while (i < messages.length && messages[i].ts <= t) i++;
    return i;
  };

  for (const r of readings) {
    const continuing = Boolean(prev) && (
      sameReset(prev.resetsAt, r.resetsAt)
      // No reset time on either side: the same window unless the meter fell,
      // which only a reset does.
      || (prev.resetsAt == null && r.resetsAt == null && r.utilization >= peak - 1)
    );
    let from;
    if (continuing) {
      from = prev.ts;
    } else {
      const windowStart = r.resetsAt != null ? r.resetsAt - windowMs : null;
      from = windowStart != null ? Math.min(windowStart, r.ts) : (prev ? prev.ts : r.ts);
      // The very first reading, with no reset time to say when its window
      // opened: what it shows was spent at some unknown point, so it is the
      // baseline rather than something to hand out.
      peak = !prev && windowStart == null ? r.utilization : 0;
    }

    // Messages in (from, r.ts]. The pointer only moves forward, so a window
    // start that reaches back before the previous reading cannot hand the same
    // message to two readings.
    let first = lo;
    while (first < messages.length && messages[first].ts <= from) first++;
    const last = firstAtOrAfter(r.ts, first);

    // Measured against the highest reading so far in this window rather than
    // the last one: two sources can disagree in the decimals (23.4 from the
    // stream, 23 from the API), and a dip followed by a rise must not be
    // counted twice.
    const delta = Math.max(0, r.utilization - peak);
    peak = Math.max(peak, r.utilization);

    let cost = 0;
    for (let i = first; i < last; i++) cost += messages[i].cost;
    if (delta > 0 && cost > 0) {
      for (let i = first; i < last; i++) alloc[i] += delta * messages[i].cost / cost;
    }

    points.push({
      ts: r.ts,
      utilization: r.utilization,
      resetsAt: r.resetsAt ?? null,
      from,
      delta,
      first,
      last,
      unattributed: delta > 0 && cost === 0 ? delta : 0,
      newWindow: !continuing,
      joinPrev: Boolean(continuing && r.ts - prev.ts <= GAP_MS),
    });
    if (last > lo) lo = last;
    prev = r;
  }
  return { alloc, points };
}

// ── Buckets ──────────────────────────────────────────────────────────────

/** Local midnight / top of the hour at or before `ts`. */
function bucketStart(ts, bucket) {
  const d = new Date(ts);
  if (bucket === 'hour') d.setMinutes(0, 0, 0);
  else d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function nextBucket(start, bucket) {
  const d = new Date(start);
  if (bucket === 'hour') d.setHours(d.getHours() + 1);
  else d.setDate(d.getDate() + 1);
  return d.getTime();
}

function bucketKey(start, bucket) {
  const d = new Date(start);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (bucket !== 'hour') return `${y}-${m}-${day}`;
  return `${y}-${m}-${day}T${String(d.getHours()).padStart(2, '0')}`;
}

/** Every bucket from the one holding `from` to the one holding `to`. */
function bucketsBetween(from, to, bucket) {
  const out = [];
  for (let t = bucketStart(from, bucket); t <= to; t = nextBucket(t, bucket)) {
    out.push({ key: bucketKey(t, bucket), start: t });
    if (out.length > 2000) break;
  }
  return out;
}

// ── Project keys ─────────────────────────────────────────────────────────

const OTHER_KEY = '__elsewhere__';

/**
 * Which project a message counts towards. A worktree the CLI made
 * (`<project>/.claude/worktrees/<name>`) is the project it came from; the
 * assistant's own folder is Buddy; a group folder is its group. Everything
 * else is its own path.
 */
function projectKeyFor(projectPath, { chatDirs = [], groupsRoot = '' } = {}) {
  const p = String(projectPath || '');
  if (!p) return '';
  const norm = (s) => String(s || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const n = norm(p);
  if (chatDirs.some(d => d && norm(d) === n)) return 'buddy';
  const g = norm(groupsRoot);
  if (g && n.startsWith(g + '/')) return p;
  const wt = p.match(/^(.*?)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+(?:[\\/].*)?$/);
  if (wt && wt[1]) return wt[1];
  return p;
}

// ── Summary ──────────────────────────────────────────────────────────────

function emptyTotals() {
  return { tokens: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0, fiveHour: 0, sevenDay: 0, messages: 0 };
}

function addRow(t, m, a5, a7) {
  t.tokens += totalTokens(m);
  t.input += m.input || 0;
  t.output += m.output || 0;
  t.cacheWrite += m.cacheWrite || 0;
  t.cacheRead += m.cacheRead || 0;
  t.cost += m.cost;
  t.fiveHour += a5;
  t.sevenDay += a7;
  t.messages += 1;
}

const ALLOC_FIELD = { five_hour: 'fiveHour', seven_day: 'sevenDay' };

/**
 * Everything the stats view draws, for one account and one range.
 *
 * @param {object} args
 * @param {Array<object>} args.messages  usage rows (see usageRowFromEntry) with
 *   `key` already set, ascending by ts, reaching back a full window before
 *   `from` so readings early in the range can find what they are attributing
 * @param {{five_hour?: Array, seven_day?: Array}} args.readings  ascending
 * @param {number} args.from
 * @param {number} args.to
 * @param {'hour'|'day'} args.bucket
 */
function summarizeUsage({ messages, readings = {}, from, to, bucket = 'day' }) {
  for (const m of messages) if (typeof m.cost !== 'number') m.cost = messageCost(m);

  const allocs = {};
  const timeline = {};
  for (const kind of WINDOWS) {
    const { alloc, points } = attributeWindow(readings[kind] || [], messages, WINDOW_MS[kind]);
    allocs[kind] = alloc;
    // `cum` is each key's running share of the window so far — what a
    // project's own line on the chart plots. Kept across the whole window,
    // including readings before the range, so a window the range opens in the
    // middle of does not start its projects at zero.
    let cum = {};
    const out = [];
    for (const p of points) {
      if (p.newWindow) cum = {};
      const byKey = {};
      for (let i = p.first; i < p.last; i++) {
        const a = alloc[i];
        if (a > 0) byKey[messages[i].key] = (byKey[messages[i].key] || 0) + a;
      }
      if (p.unattributed > 0) byKey[OTHER_KEY] = p.unattributed;
      for (const [k, v] of Object.entries(byKey)) cum[k] = (cum[k] || 0) + v;
      if (p.ts < from || p.ts > to) continue;
      out.push({
        ts: p.ts, utilization: p.utilization, resetsAt: p.resetsAt,
        from: p.from, delta: round(p.delta, 2), joinPrev: p.joinPrev,
        byKey: roundMap(byKey), cum: roundMap(cum),
      });
    }
    timeline[kind] = compressFlats(out);
  }

  const buckets = bucketsBetween(from, to, bucket);
  const index = new Map(buckets.map((b, i) => [b.start, i]));
  const projects = new Map();
  const sessions = new Map();
  const total = emptyTotals();

  const projectEntry = (key) => {
    let e = projects.get(key);
    if (!e) {
      e = { key, totals: emptyTotals(), series: buckets.map(() => emptyTotals()), sessions: new Set(), lastTs: 0 };
      projects.set(key, e);
    }
    return e;
  };

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.ts < from || m.ts > to) continue;
    const bi = index.get(bucketStart(m.ts, bucket));
    const a5 = allocs.five_hour[i];
    const a7 = allocs.seven_day[i];
    const e = projectEntry(m.key);
    addRow(e.totals, m, a5, a7);
    if (bi !== undefined) addRow(e.series[bi], m, a5, a7);
    addRow(total, m, a5, a7);
    if (m.sessionId) e.sessions.add(m.sessionId);
    if (m.ts > e.lastTs) e.lastTs = m.ts;

    if (m.sessionId) {
      let s = sessions.get(m.sessionId);
      if (!s) {
        s = { sessionId: m.sessionId, key: m.key, totals: emptyTotals(), firstTs: m.ts, lastTs: m.ts, models: new Set() };
        sessions.set(m.sessionId, s);
      }
      addRow(s.totals, m, a5, a7);
      s.lastTs = Math.max(s.lastTs, m.ts);
      if (m.model) s.models.add(m.model);
    }
  }

  // Limit spent where this app cannot see it, bucketed by the reading that
  // noticed it.
  const elsewhere = { totals: emptyTotals(), series: buckets.map(() => emptyTotals()) };
  for (const kind of WINDOWS) {
    const field = ALLOC_FIELD[kind];
    for (const p of timeline[kind]) {
      const v = p.byKey[OTHER_KEY];
      if (!v) continue;
      elsewhere.totals[field] += v;
      const bi = index.get(bucketStart(p.ts, bucket));
      if (bi !== undefined) elsewhere.series[bi][field] += v;
    }
  }

  const projectList = [...projects.values()]
    .map(e => ({
      key: e.key,
      totals: roundTotals(e.totals),
      series: e.series.map(roundTotals),
      sessionCount: e.sessions.size,
      lastTs: e.lastTs,
    }))
    .sort((a, b) => b.totals.cost - a.totals.cost);

  const sessionList = [...sessions.values()]
    .map(s => ({
      sessionId: s.sessionId, key: s.key, totals: roundTotals(s.totals),
      firstTs: s.firstTs, lastTs: s.lastTs, models: [...s.models],
    }))
    .sort((a, b) => b.totals.cost - a.totals.cost);

  return {
    from, to, bucket,
    buckets,
    total: roundTotals(total),
    projects: projectList,
    sessions: sessionList,
    elsewhere: { totals: roundTotals(elsewhere.totals), series: elsewhere.series.map(roundTotals) },
    timeline,
  };
}

/**
 * Drop the middle of a run of identical readings. They moved nothing (their
 * delta is zero) and there can be thousands of them in an idle month; the two
 * ends of the run keep its shape. A run broken by a gap is kept whole, so the
 * gap still shows.
 */
function compressFlats(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const prev = points[i - 1];
    const next = points[i + 1];
    const flat = p.delta === 0
      && p.utilization === prev.utilization && p.utilization === next.utilization
      && sameReset(p.resetsAt, prev.resetsAt) && sameReset(p.resetsAt, next.resetsAt)
      && p.joinPrev && next.joinPrev;
    if (!flat) out.push(p);
  }
  out.push(points[points.length - 1]);
  return out;
}

function round(n, digits) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function roundMap(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = round(v, 3);
  return out;
}

function roundTotals(t) {
  return {
    ...t,
    cost: round(t.cost, 4),
    fiveHour: round(t.fiveHour, 2),
    sevenDay: round(t.sevenDay, 2),
  };
}

module.exports = {
  WINDOW_MS, WINDOWS, GAP_MS, OTHER_KEY,
  priceFor, messageCost, totalTokens,
  usageRowFromEntry, usageRowsFromText,
  readingsFromUsageApi, readingsFromRateLimitInfo, sameReset,
  attributeWindow, bucketStart, bucketsBetween, bucketKey,
  projectKeyFor, summarizeUsage, compressFlats,
};
