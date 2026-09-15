// transcript-window.js — read a slice of a .jsonl transcript instead of all of it.
//
// A long session's transcript reaches tens of megabytes, and the chat view only
// ever shows the end of it. Reading the whole file and JSON.parsing every line
// cost 190ms of blocked main thread and ~270MB of garbage per call on a 44MB
// transcript; the same window costs ~47ms cold and ~1ms warm, because parsing
// is what is expensive and only the requested lines are parsed.
//
// The file is scanned as a Buffer — no utf8 decode of 44MB — to record where
// each record starts and which of them are compact boundaries. That index is
// cached per file and reused until the file's size or mtime moves, which is
// what makes paging back through a transcript cheap.
//
// ── Compact boundaries ────────────────────────────────────────────
//
// `/compact` writes a `{ type: 'system', subtype: 'compact_boundary' }` record
// carrying how many tokens went in and came out, followed by the summary the
// next turn was resumed from. Everything above it was dropped from the model's
// context, so it is also the natural floor for the view: a window never spans
// one. Reaching it is a thing the reader is told about and can step over on
// purpose, not something an upward scroll does by accident.

const fs = require('fs');

const NEWLINE = 10;
const BOUNDARY_NEEDLE = Buffer.from('"compact_boundary"');
const TIMESTAMP_NEEDLE = Buffer.from('"timestamp":"');
/** A tool that came back failed, and an API call that did. */
const ERROR_NEEDLES = [
  Buffer.from('"is_error":true'),
  Buffer.from('"isApiErrorMessage":true'),
];

/** Cache of line indexes, keyed by path. One entry per file, not per window. */
const indexCache = new Map();
/** Enough to page back through the longest transcripts without unbounded growth. */
const MAX_CACHED_INDEXES = 8;

/**
 * Record offsets and compact-boundary positions for one file.
 *
 * Blank lines are skipped here rather than by the caller, so a record index is
 * the same number on both sides of the IPC boundary and `before` from a
 * previous window can be handed straight back.
 *
 * @param {Buffer} buf
 * @returns {{ starts: number[], ends: number[], boundaries: number[] }}
 */
function indexBuffer(buf) {
  const starts = [];
  const ends = [];
  const boundaryBytes = [];

  let at = 0;
  let found = 0;
  while ((found = buf.indexOf(BOUNDARY_NEEDLE, at)) !== -1) {
    boundaryBytes.push(found);
    at = found + BOUNDARY_NEEDLE.length;
  }

  let lineStart = 0;
  let boundaryCursor = 0;
  const boundaries = [];
  while (lineStart < buf.length) {
    let lineEnd = buf.indexOf(NEWLINE, lineStart);
    if (lineEnd === -1) lineEnd = buf.length;
    // Blank or whitespace-only lines carry no record and must not consume an index.
    let blank = true;
    for (let i = lineStart; i < lineEnd; i++) {
      const c = buf[i];
      if (c !== 32 && c !== 9 && c !== 13) { blank = false; break; }
    }
    if (!blank) {
      const index = starts.length;
      starts.push(lineStart);
      ends.push(lineEnd);
      // The byte hits are in file order, so one cursor walks them alongside the
      // lines rather than searching per line.
      while (boundaryCursor < boundaryBytes.length && boundaryBytes[boundaryCursor] < lineStart) boundaryCursor++;
      if (boundaryCursor < boundaryBytes.length && boundaryBytes[boundaryCursor] < lineEnd) {
        boundaries.push(index);
        boundaryCursor++;
      }
    }
    lineStart = lineEnd + 1;
  }

  return { starts, ends, boundaries };
}

/** Read the file and index it, reusing the last index while the file has not moved. */
function loadIndex(filePath) {
  const stat = fs.statSync(filePath);
  const cached = indexCache.get(filePath);
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
    // Refresh recency so the cap evicts the least recently used file.
    indexCache.delete(filePath);
    indexCache.set(filePath, cached);
    return cached;
  }

  const buf = fs.readFileSync(filePath);
  const entry = { size: stat.size, mtimeMs: stat.mtimeMs, buf, ...indexBuffer(buf) };
  indexCache.set(filePath, entry);
  while (indexCache.size > MAX_CACHED_INDEXES) {
    indexCache.delete(indexCache.keys().next().value);
  }
  return entry;
}

/** Parse one record, or null if the line is not JSON. */
function parseRecord(entry, index) {
  try {
    return JSON.parse(entry.buf.toString('utf8', entry.starts[index], entry.ends[index]));
  } catch {
    return null;
  }
}

/**
 * The last compact boundary strictly before `before`, or -1.
 * Boundaries are in ascending order, so a backward walk finds it immediately —
 * a transcript has single digits of them at most.
 */
function boundaryBelow(boundaries, before) {
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (boundaries[i] < before) return boundaries[i];
  }
  return -1;
}

/**
 * A window of records ending just before `before`.
 *
 * @param {string} filePath
 * @param {{ before?: number|null, limit?: number }} [opts]
 *   `before` is the exclusive upper record index — pass the previous window's
 *   `from` to page upward, or a compact boundary's own index to step over it.
 * @returns {{
 *   entries: object[], from: number, to: number, total: number,
 *   hasMore: boolean,
 *   compact: null | { index: number, timestamp: string|null, trigger: string|null,
 *                     preTokens: number, postTokens: number },
 * }}
 */
function readTranscriptWindow(filePath, opts = {}) {
  const index = loadIndex(filePath);
  const total = index.starts.length;

  const limit = Math.max(1, opts.limit || 50);
  let before = opts.before === null || opts.before === undefined ? total : opts.before;
  before = Math.max(0, Math.min(total, Math.trunc(before)));

  const boundary = boundaryBelow(index.boundaries, before);
  // The boundary itself is not a message; the window starts after it and the
  // caller is handed its metadata to draw the marker from.
  const floor = boundary === -1 ? 0 : boundary + 1;
  const from = Math.max(floor, before - limit);

  const entries = [];
  for (let i = from; i < before; i++) {
    const record = parseRecord(index, i);
    if (record) entries.push(record);
  }

  let compact = null;
  if (boundary !== -1 && from === floor) {
    const record = parseRecord(index, boundary) || {};
    const meta = record.compactMetadata || {};
    compact = {
      index: boundary,
      timestamp: record.timestamp || null,
      trigger: meta.trigger || null,
      preTokens: meta.preTokens || 0,
      postTokens: meta.postTokens || 0,
    };
  }

  return {
    entries,
    from,
    to: before,
    total,
    // The marker is itself something to step over, so a window sitting on one
    // has more above it even when `from` is only one record past the start.
    hasMore: from > 0,
    compact,
  };
}

// ── The timeline rail ─────────────────────────────────────────────
//
// A compact is not the only thing in a session's shape that a scrollbar cannot
// show. The rail also marks where something failed and where the calendar
// turned over.
//
// The end of each turn was on here too, and it was a mistake: a working day is
// hundreds of turns, and hundreds of notches down an eight-pixel strip is a
// striped bar rather than a map. A rail earns its width by being mostly empty.
//
// All three are found in the buffer rather than by parsing records: a 44MB
// transcript is 40k records, and JSON.parsing them to read four fields is the
// cost this module exists to avoid. Each kind is one native substring search
// over the bytes, matched back to record indices by walking the line index
// alongside it.

/**
 * Record indices whose own line contains `needle`, in order.
 *
 * One hit per record: the search resumes at the end of the record it landed in,
 * so a record mentioning the needle twice is still one index.
 */
function recordsMatching(index, needle) {
  const { buf, starts, ends } = index;
  const out = [];
  let at = 0;
  let rec = 0;
  let found = 0;
  while ((found = buf.indexOf(needle, at)) !== -1) {
    while (rec < starts.length && ends[rec] <= found) rec++;
    if (rec >= starts.length) break;
    if (found >= starts[rec]) {
      out.push(rec);
      at = ends[rec];
      rec++;
    } else {
      // In the newline between two records — impossible for a real needle, but
      // a corrupt file must not spin here.
      at = found + needle.length;
    }
  }
  return out;
}

/** The record's own timestamp in ms, or NaN when it carries none. */
function recordTime(index, at) {
  const start = index.starts[at];
  const end = index.ends[at];
  if (start === undefined) return NaN;
  const found = index.buf.indexOf(TIMESTAMP_NEEDLE, start);
  if (found === -1 || found >= end) return NaN;
  const from = found + TIMESTAMP_NEEDLE.length;
  // ISO-8601 with milliseconds and a zone is 24 characters; latin1 because the
  // field is ASCII by construction and decoding it as utf8 is not free.
  const iso = index.buf.toString('latin1', from, Math.min(end, from + 24));
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : NaN;
}

/** The ISO string, for a label the renderer can format in the user's locale. */
function recordStamp(index, at) {
  const ms = recordTime(index, at);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Local calendar day — the rail marks the days the user lived, not UTC's. */
function localDay(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Evenly thinned to at most `max`, keeping the first and the last.
 *
 * The rail is a few hundred pixels tall. A session that failed a thousand times
 * cannot draw a thousand notches, and the honest way to lose the rest is to
 * keep the shape rather than the tail.
 */
function thin(list, max) {
  if (list.length <= max) return list;
  const out = [];
  const step = (list.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(list[Math.round(i * step)]);
  return [...new Set(out)];
}

/** At most this many notches of any one kind — see thin(). */
const MAX_MARKS_PER_KIND = 90;

function buildLandmarks(index) {
  const total = index.starts.length;
  const marks = [];

  for (const at of index.boundaries) {
    const record = parseRecord(index, at) || {};
    const meta = record.compactMetadata || {};
    marks.push({
      kind: 'compact',
      index: at,
      timestamp: record.timestamp || null,
      trigger: meta.trigger || null,
      preTokens: meta.preTokens || 0,
      postTokens: meta.postTokens || 0,
    });
  }

  const errors = new Set();
  for (const needle of ERROR_NEEDLES) {
    for (const at of recordsMatching(index, needle)) errors.add(at);
  }
  for (const at of thin([...errors].sort((a, b) => a - b), MAX_MARKS_PER_KIND)) {
    marks.push({ kind: 'error', index: at, timestamp: recordStamp(index, at) });
  }

  // Days are walked rather than searched: there is no needle for "the first
  // record of a Tuesday", and reading one bounded field per record is cheap
  // next to the searches above. The first day is not a mark — a session
  // starting is not a day changing.
  let day = '';
  for (let at = 0; at < total; at++) {
    const ms = recordTime(index, at);
    if (!Number.isFinite(ms)) continue;
    const key = localDay(ms);
    if (key === day) continue;
    if (day) marks.push({ kind: 'day', index: at, timestamp: new Date(ms).toISOString() });
    day = key;
  }

  marks.sort((a, b) => a.index - b.index);
  return marks;
}

/**
 * Everything the chat's timeline rail draws, for one transcript.
 *
 * Cached on the line index, so it is rebuilt exactly when the file moves —
 * which is also when a mark could have been added.
 *
 * @returns {{ total: number, marks: Array<{ kind: 'compact'|'error'|'day',
 *   index: number, timestamp: string|null }> }}
 */
function readSessionLandmarks(filePath) {
  const index = loadIndex(filePath);
  if (!index.landmarks) index.landmarks = buildLandmarks(index);
  return { total: index.starts.length, marks: index.landmarks };
}

/**
 * The first record at or after `ms`.
 *
 * What a chat that has dropped its oldest messages from the DOM asks to find
 * out where it now starts: the nodes on screen carry the timestamps they were
 * rendered with, and a transcript is written in order, so one is the anchor for
 * the other. Records with no timestamp of their own — `custom-title`, `ai-title`
 * — take the time of the nearest record that has one, which is what puts them
 * on the right side of the answer.
 *
 * @returns {{ index: number, total: number }} `index` is `total` when every
 *   record is older than `ms`.
 */
function recordIndexAtTime(filePath, ms) {
  const index = loadIndex(filePath);
  const total = index.starts.length;
  if (!Number.isFinite(ms) || !total) return { index: total, total };

  /** The record's time, or the nearest one after it — NaN if there is none. */
  const timeAt = (at) => {
    for (let i = at; i < Math.min(total, at + 40); i++) {
      const found = recordTime(index, i);
      if (Number.isFinite(found)) return found;
    }
    return NaN;
  };

  let low = 0;
  let high = total;
  while (low < high) {
    const mid = (low + high) >> 1;
    const found = timeAt(mid);
    // A stretch with no timestamp at all cannot be ordered; treat it as older
    // so the search keeps moving rather than stalling on it.
    if (!Number.isFinite(found) || found < ms) low = mid + 1;
    else high = mid;
  }
  return { index: low, total };
}

/** Drop a file's cached index — used when a session is deleted or re-keyed. */
function forgetTranscript(filePath) {
  indexCache.delete(filePath);
}

module.exports = {
  readTranscriptWindow,
  readSessionLandmarks,
  recordIndexAtTime,
  forgetTranscript,
};
