// usage-stats.js — keeps the usage ledger and the plan's limit readings, and
// answers the stats views.
//
// The arithmetic is usage-ledger.js; this file is the part with side effects:
// the scan worker, the DB, and the usage API. main.js wires it with
// `configure()` — accounts, how to name a project, how to reach the API — and
// owns the IPC.
//
// Limit readings come from three places, all recorded the same way:
//   * `rate_limit_event`s from SDK sessions (every turn, for free);
//   * the usage API answers the app already asks for (account list, Check);
//   * a poll of its own while the app runs: every 5 minutes while something is
//     being worked on, every 30 when idle. Nothing else records them, and the
//     API only ever tells you the current value, so a reading not taken is a
//     point missing from the chart for good.

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const db = require('./db');
const ledger = require('./usage-ledger');
const { summaryFromUserText } = require('./read-session-file');

const MINUTE = 60000;
const DAY = 24 * 60 * MINUTE;

// A reading equal to the last one is still stored now and then, so a flat
// stretch has points along it rather than only at its two ends.
const FLAT_RECORD_MS = 10 * MINUTE;
const POLL_BUSY_MS = 5 * MINUTE;
const POLL_IDLE_MS = 30 * MINUTE;
const BUSY_FOR_MS = 10 * MINUTE;
const POLL_TICK_MS = MINUTE;
// The stats view asks for a fresh reading when the last one is older than
// this, and waits at most this long for it before drawing what it has.
const VIEW_FRESH_MS = 5 * MINUTE;
const VIEW_WAIT_MS = 3000;
const SYNC_FRESH_MS = 30 * 1000;

const RANGES = {
  '24h': { bucket: 'hour', hours: 24 },
  '7d': { bucket: 'day', days: 7 },
  '30d': { bucket: 'day', days: 30 },
};

let deps = {
  log: console,
  getAccounts: () => [],
  getActiveAccount: () => null,
  projectsDirOf: (account) => path.join(account.configDir, 'projects'),
  // Raw usage API JSON for an account, `{ _rateLimited, retryAfterSeconds }`,
  // or null when there is no token or the API said no.
  fetchUsageRaw: async () => null,
  // { chatDirs, groupsRoot } for projectKeyFor.
  keyContext: () => ({}),
  // key → { label, kind, path? }
  describeKey: (_account, key) => ({ label: key, kind: 'project' }),
  sessionTitle: () => null,
  isBusy: () => false,
};

function configure(d) {
  deps = { ...deps, ...d };
}

// ── Ledger ────────────────────────────────────────────────────────────────

const syncs = new Map(); // accountId → { promise, at }

/**
 * Bring the account's ledger up to date with its transcripts. Concurrent
 * callers share one scan; a scan finished within SYNC_FRESH_MS is good enough.
 */
function syncLedger(account, { maxAgeMs = SYNC_FRESH_MS } = {}) {
  const id = account.id;
  const state = syncs.get(id);
  if (state?.promise) return state.promise;
  if (state?.at && Date.now() - state.at < maxAgeMs) return Promise.resolve({ ok: true, fresh: true });

  const started = Date.now();
  const promise = new Promise((resolve) => {
    let settled = false;
    const done = (res) => {
      if (settled) return;
      settled = true;
      syncs.set(id, { promise: null, at: res.ok ? Date.now() : (state?.at || 0) });
      resolve(res);
    };
    let worker;
    try {
      worker = new Worker(path.join(__dirname, 'workers', 'usage-scan.js'), {
        workerData: {
          projectsDir: deps.projectsDirOf(account),
          files: db.getUsageFileStates(id),
          folderPaths: db.getUsageFolderPaths(id),
        },
      });
    } catch (err) {
      done({ ok: false, error: err.message });
      return;
    }
    worker.on('message', (msg) => {
      if (msg.type === 'progress') return;
      if (!msg.ok) {
        deps.log.warn?.(`[usage] scan of ${id} failed: ${msg.error}`);
        done({ ok: false, error: msg.error });
        return;
      }
      try {
        db.storeUsageScan(id, msg.rows, msg.files);
      } catch (err) {
        deps.log.warn?.(`[usage] storing scan of ${id} failed: ${err.message}`);
        done({ ok: false, error: err.message });
        return;
      }
      if (msg.rows.length) {
        deps.log.info?.(`[usage] ${id}: ${msg.rows.length} responses from ${msg.scanned} transcripts in ${Date.now() - started}ms`);
      }
      done({ ok: true, rows: msg.rows.length });
    });
    worker.on('error', (err) => done({ ok: false, error: err.message }));
    worker.on('exit', () => done({ ok: false, error: 'scan worker exited' }));
  });
  syncs.set(id, { promise, at: state?.at || 0 });
  return promise;
}

// ── Limit readings ────────────────────────────────────────────────────────

function sameResetOrBothNone(a, b) {
  return (a == null && b == null) || ledger.sameReset(a, b);
}

function recordReadings(accountId, readings, source, ts = Date.now()) {
  let stored = 0;
  for (const r of readings) {
    const last = db.getLastLimitObservation(accountId, r.kind);
    if (last && last.utilization === r.utilization
        && sameResetOrBothNone(last.resetsAt, r.resetsAt)
        && ts - last.ts < FLAT_RECORD_MS) continue;
    db.addLimitObservation(accountId, r.kind, ts, r.utilization, r.resetsAt, source);
    stored++;
  }
  return stored;
}

/** A usage API answer the app got for any reason. */
function recordUsageApi(accountId, raw) {
  try {
    return recordReadings(accountId || 'default', ledger.readingsFromUsageApi(raw), 'api');
  } catch (err) {
    deps.log.warn?.(`[usage] could not record API reading: ${err.message}`);
    return 0;
  }
}

/** The `rate_limit_info` of an SDK session's `rate_limit_event`. */
function recordRateLimitEvent(accountId, info) {
  try {
    return recordReadings(accountId || 'default', ledger.readingsFromRateLimitInfo(info), 'stream');
  } catch (err) {
    deps.log.warn?.(`[usage] could not record stream reading: ${err.message}`);
    return 0;
  }
}

// ── Polling ───────────────────────────────────────────────────────────────

let lastActivity = 0;
const lastPolled = new Map();
const backoffUntil = new Map();
const inflight = new Map();
let pollTimer = null;

/** Something is being worked on: poll at the busy rate for a while. */
function noteActivity() {
  lastActivity = Date.now();
}

/**
 * Ask the usage API for the account's meters, unless a reading younger than
 * `maxAgeMs` exists or the API asked us to wait.
 * @returns {Promise<boolean>} whether a reading was taken
 */
function pollAccount(account, { maxAgeMs }) {
  const id = account.id;
  const now = Date.now();
  if (inflight.has(id)) return inflight.get(id);
  if ((backoffUntil.get(id) || 0) > now) return Promise.resolve(false);
  const last = db.getLastLimitObservation(id, 'five_hour');
  const newest = Math.max(last?.ts || 0, lastPolled.get(id) || 0);
  if (now - newest < maxAgeMs) return Promise.resolve(false);

  const p = (async () => {
    try {
      const raw = await deps.fetchUsageRaw(account);
      lastPolled.set(id, Date.now());
      if (raw && raw._rateLimited) {
        const wait = Math.max(10 * MINUTE, (raw.retryAfterSeconds || 0) * 1000);
        backoffUntil.set(id, Date.now() + wait);
        return false;
      }
      if (!raw) {
        // No token, or the API refused it: nothing to read until that changes.
        backoffUntil.set(id, Date.now() + POLL_IDLE_MS);
        return false;
      }
      recordUsageApi(id, raw);
      return true;
    } catch {
      backoffUntil.set(id, Date.now() + POLL_BUSY_MS);
      return false;
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, p);
  return p;
}

function pollTick() {
  const account = deps.getActiveAccount();
  if (!account) return;
  const busy = Date.now() - lastActivity < BUSY_FOR_MS || Boolean(deps.isBusy());
  pollAccount(account, { maxAgeMs: busy ? POLL_BUSY_MS : POLL_IDLE_MS }).catch(() => {});
}

/** Start polling, and read the active account's transcripts once in the background. */
function start() {
  if (pollTimer) return;
  pollTimer = setInterval(pollTick, POLL_TICK_MS);
  pollTimer.unref?.();
  const warm = setTimeout(() => {
    pollTick();
    const account = deps.getActiveAccount();
    if (account) syncLedger(account).catch(() => {});
  }, 15000);
  warm.unref?.();
}

function stop() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ── Session titles ────────────────────────────────────────────────────────
//
// The session cache names the active account's sessions. Another account's,
// or one the cache has not reached, gets its name from the head of its own
// transcript: a /rename, the CLI's AI title, or the first thing the user said.

const transcriptTitles = new Map();
const TITLE_HEAD_BYTES = 256 * 1024;

function titleFromTranscript(file) {
  if (transcriptTitles.has(file)) return transcriptTitles.get(file);
  let title = null;
  try {
    const fd = fs.openSync(file, 'r');
    let text;
    try {
      const buf = Buffer.alloc(TITLE_HEAD_BYTES);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      text = buf.toString('utf8', 0, n);
    } finally {
      fs.closeSync(fd);
    }
    let custom = null;
    let ai = null;
    let first = null;
    for (const line of text.split('\n')) {
      if (!line) continue;
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (e.type === 'custom-title' && e.customTitle) custom = e.customTitle;
      else if (e.type === 'ai-title' && e.aiTitle) ai = e.aiTitle;
      else if (!first && e.type === 'user') {
        const m = e.message;
        const said = typeof m === 'string' ? m
          : typeof m?.content === 'string' ? m.content
          : (Array.isArray(m?.content) ? m.content.find(b => b?.type === 'text')?.text : '') || '';
        first = summaryFromUserText(said);
      }
    }
    title = custom || ai || first;
  } catch {
    title = null;
  }
  transcriptTitles.set(file, title);
  return title;
}

function titleOf(account, sessionId, key, folder) {
  const known = deps.sessionTitle(sessionId, key);
  if (known || !folder) return known;
  return titleFromTranscript(path.join(deps.projectsDirOf(account), folder, sessionId + '.jsonl'));
}

// ── Queries ───────────────────────────────────────────────────────────────

function rangeBounds(range, now = Date.now()) {
  const cfg = RANGES[range] || RANGES['7d'];
  let from;
  if (cfg.bucket === 'hour') {
    from = ledger.bucketStart(now - (cfg.hours - 1) * 3600000, 'hour');
  } else {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (cfg.days - 1));
    from = d.getTime();
  }
  return { from, to: now, bucket: cfg.bucket };
}

function withKeys(account, rows) {
  const ctx = deps.keyContext(account);
  for (const r of rows) r.key = ledger.projectKeyFor(r.projectPath, ctx) || r.folder || 'unknown';
  return rows;
}

function labelsFor(account, keys) {
  const out = {};
  for (const key of keys) {
    if (key === ledger.OTHER_KEY) out[key] = { label: 'Outside this app', kind: 'elsewhere' };
    else out[key] = deps.describeKey(account, key);
  }
  return out;
}

async function waitAtMost(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, ms); });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Everything the stats view draws for one account over one range.
 * @param {object} account
 * @param {{ range?: '24h'|'7d'|'30d' }} [opts]
 */
async function getStats(account, { range = '7d' } = {}) {
  const [sync] = await Promise.all([
    syncLedger(account),
    waitAtMost(pollAccount(account, { maxAgeMs: VIEW_FRESH_MS }).catch(() => false), VIEW_WAIT_MS),
  ]);

  const { from, to, bucket } = rangeBounds(range);
  // A reading early in the range attributes everything since its window
  // opened — up to a week before `from` for the weekly one.
  const reach = from - ledger.WINDOW_MS.seven_day;
  const messages = withKeys(account, db.getUsageMessages(account.id, reach, to));
  const readings = {};
  for (const kind of ledger.WINDOWS) readings[kind] = db.getLimitObservations(account.id, kind, reach, to);

  const summary = ledger.summarizeUsage({ messages, readings, from, to, bucket });

  const keys = new Set(summary.projects.map(p => p.key));
  for (const kind of ledger.WINDOWS) {
    for (const p of summary.timeline[kind]) for (const k of Object.keys(p.byKey)) keys.add(k);
  }

  const folderOf = new Map();
  for (const m of messages) if (m.sessionId && m.folder) folderOf.set(m.sessionId, m.folder);
  const sessions = summary.sessions.slice(0, 300)
    .map(s => ({ ...s, title: titleOf(account, s.sessionId, s.key, folderOf.get(s.sessionId)) }));

  return {
    ok: true,
    accountId: account.id,
    range: RANGES[range] ? range : '7d',
    ...summary,
    sessions,
    labels: labelsFor(account, keys),
    observedSince: db.getFirstLimitObservationTs(account.id),
    syncError: sync && sync.ok === false ? sync.error : null,
  };
}

/**
 * What was sent between two readings, per session — the detail under a point
 * on the timeline. `share` is the session's part of the interval's cost, which
 * is the part of the meter's movement it is credited with.
 */
async function getInterval(account, from, to) {
  await syncLedger(account);
  const rows = withKeys(account, db.getUsageMessages(account.id, Math.floor(from) + 1, Math.ceil(to)));
  const bySession = new Map();
  let cost = 0;
  for (const r of rows) {
    const c = ledger.messageCost(r);
    cost += c;
    const id = r.sessionId || '?';
    let s = bySession.get(id);
    if (!s) {
      s = { sessionId: r.sessionId, key: r.key, folder: r.folder, tokens: 0, cost: 0, messages: 0, models: new Set(), lastTs: 0 };
      bySession.set(id, s);
    }
    s.tokens += ledger.totalTokens(r);
    s.cost += c;
    s.messages += 1;
    if (r.model) s.models.add(r.model);
    if (r.ts > s.lastTs) s.lastTs = r.ts;
  }
  const sessions = [...bySession.values()]
    .sort((a, b) => b.cost - a.cost)
    .map(s => ({
      sessionId: s.sessionId,
      key: s.key,
      title: s.sessionId ? titleOf(account, s.sessionId, s.key, s.folder) : null,
      tokens: s.tokens,
      cost: Math.round(s.cost * 10000) / 10000,
      share: cost > 0 ? s.cost / cost : 0,
      messages: s.messages,
      models: [...s.models],
      lastTs: s.lastTs,
    }));
  return {
    ok: true, from, to, sessions,
    labels: labelsFor(account, new Set(sessions.map(s => s.key))),
  };
}

module.exports = {
  configure, start, stop,
  syncLedger, recordUsageApi, recordRateLimitEvent, noteActivity, pollAccount,
  getStats, getInterval, rangeBounds, RANGES,
};
