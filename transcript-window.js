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

/**
 * Every compact boundary in the file, in order, with where it sits.
 *
 * The index already knows which records they are — it has to, to floor a
 * window — so this parses only those lines: a transcript has single digits of
 * them at most, whatever its size. It is what the chat's timeline rail is drawn
 * from: the shape of a long session is mostly where its context was thrown
 * away, and that is the one thing the scroll position cannot show.
 *
 * @returns {{ total: number, compacts: Array<{
 *   index: number, timestamp: string|null, trigger: string|null,
 *   preTokens: number, postTokens: number,
 * }> }}
 */
function readCompactBoundaries(filePath) {
  const index = loadIndex(filePath);
  const compacts = index.boundaries.map((at) => {
    const record = parseRecord(index, at) || {};
    const meta = record.compactMetadata || {};
    return {
      index: at,
      timestamp: record.timestamp || null,
      trigger: meta.trigger || null,
      preTokens: meta.preTokens || 0,
      postTokens: meta.postTokens || 0,
    };
  });
  return { total: index.starts.length, compacts };
}

/** Drop a file's cached index — used when a session is deleted or re-keyed. */
function forgetTranscript(filePath) {
  indexCache.delete(filePath);
}

module.exports = { readTranscriptWindow, readCompactBoundaries, forgetTranscript };
