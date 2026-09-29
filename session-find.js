// session-find.js — how Buddy finds sessions by what was said in them, and
// reads many of them in one call.
//
// Two jobs, both for questions a single transcript read cannot answer cheaply:
//
// - "what did I work on on Monday" — every session that was alive that day,
//   each with what it was asked and where it got to *that day*;
// - "the session where I did the auth work" — a match on meaning the user
//   remembers in their own words, often in another language than the
//   transcript, and often from the end of a long session.
//
// The search index (search_fts) only holds the first ~8 KB of a transcript, so
// the end of a long session is invisible to it. This module reads the tail of
// the file instead: the last `maxBytes`, parsed line by line. Cheap — no full
// read, no index — which is what lets a search look at dozens of sessions.
//
// Everything but readTailRecords is pure.

const fs = require('fs');

const DAY_MS = 24 * 3600 * 1000;
const TAIL_BYTES = 512 * 1024;

/** Local midnight of a 'YYYY-MM-DD', or null. */
function dayStart(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * The window a request names, as [sinceMs, untilMs). `from`/`to` are local
 * dates, both inclusive; `to` alone is that one day, `from` alone runs to now.
 * `withinDays` counts back from now. Null when nothing narrows it.
 */
function timeWindow({ from, to, withinDays } = {}, now = Date.now()) {
  const start = dayStart(from);
  const end = dayStart(to);
  if (start !== null || end !== null) {
    const sinceMs = start !== null ? start : end;
    const untilMs = end !== null ? end + DAY_MS : now + 1;
    return sinceMs < untilMs ? { sinceMs, untilMs } : null;
  }
  const days = Number(withinDays);
  if (days > 0) return { sinceMs: now - days * DAY_MS, untilMs: now + 1 };
  return null;
}

const toMs = (v) => {
  const ms = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Was the session alive at some point inside the window? Started before it
 * ended and last touched after it began — so a session opened on Monday and
 * picked up again on Wednesday counts for Tuesday's question too, which is
 * the honest answer: it may or may not have been touched that day, and its
 * messages (filtered by time) say which.
 */
function overlaps(session, win) {
  if (!win) return true;
  const created = toMs(session.created) ?? toMs(session.modified);
  const modified = toMs(session.modified) ?? created;
  if (created === null || modified === null) return false;
  return created < win.untilMs && modified >= win.sinceMs;
}

/** The plain text of one transcript record, with its role, or null. */
function recordMessage(entry) {
  if (!entry || (entry.type !== 'user' && entry.type !== 'assistant')) return null;
  if (entry.isMeta || entry.isSidechain) return null;
  const content = entry.message?.content;
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    // Tool calls and results are plumbing; what was said is in the text blocks.
    text = content.filter(b => b?.type === 'text' && b.text).map(b => b.text).join('\n');
  }
  text = text.trim();
  if (!text || /^\[Request interrupted by user/.test(text)) return null;
  // The CLI's own injected wrappers (<command-name>, <local-command-stdout>,
  // <system-reminder>…) are not the conversation.
  if (entry.type === 'user' && /^<[a-z-]+>/.test(text)) return null;
  return { role: entry.type, text, ts: entry.timestamp || null };
}

/**
 * The last `maxBytes` of a JSONL transcript, as parsed records, oldest first.
 * The first line of the chunk is usually cut in half and is dropped.
 */
function readTailRecords(filePath, maxBytes = TAIL_BYTES) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const { size } = fs.fstatSync(fd);
    const length = Math.min(size, maxBytes);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    const lines = buf.toString('utf8').split('\n');
    if (length < size) lines.shift();
    const out = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch {}
    }
    return out;
  } catch {
    return [];
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

/** Messages of a record list, optionally only those inside the window. */
function messagesOf(records, win = null) {
  const out = [];
  for (const r of records) {
    const m = recordMessage(r);
    if (!m) continue;
    if (win) {
      const ts = toMs(m.ts);
      if (ts === null || ts < win.sinceMs || ts >= win.untilMs) continue;
    }
    out.push(m);
  }
  return out;
}

/**
 * The search terms, cleaned: trimmed, lower-cased, deduplicated, one-letter
 * noise dropped. A `query` with several words becomes several terms — the
 * model tends to pass "auth login work" as one string, and as one phrase it
 * matches nothing.
 */
function normalizeTerms({ query, terms } = {}) {
  const raw = [];
  if (Array.isArray(terms)) raw.push(...terms);
  if (query) raw.push(...String(query).split(/[\s,;]+/));
  const seen = new Set();
  for (const t of raw) {
    const term = String(t || '').trim().toLowerCase();
    if (term.length >= 2) seen.add(term);
  }
  return [...seen].slice(0, 12);
}

/** Around the first place `term` occurs in `text`, on one line. */
function snippetAround(text, term, width = 160) {
  const flat = String(text || '').replace(/\s+/g, ' ');
  const at = flat.toLowerCase().indexOf(term);
  if (at === -1) return '';
  const start = Math.max(0, at - Math.floor(width / 3));
  const end = Math.min(flat.length, start + width);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

/**
 * Which terms a piece of text contains (substring, case-insensitive — a stem
 * like "авториз" finds every form of the word), and a snippet at the first.
 */
function matchTerms(text, terms) {
  const lower = String(text || '').toLowerCase();
  const matched = terms.filter(t => lower.includes(t));
  return { matched, snippet: matched.length ? snippetAround(text, matched[0]) : '' };
}

/**
 * Rank candidates. Each hit carries the terms it matched and where: a match
 * in the title or first prompt says what the session was *about*, so it
 * outweighs one somewhere in the talk. Ties go to the more recent session.
 */
function rankHits(hits) {
  const score = (h) => h.matched.size * 10 + (h.inTitle ? 5 : 0) + (h.inPrompt ? 3 : 0);
  return [...hits].sort((a, b) => (score(b) - score(a))
    || ((toMs(b.modified) || 0) - (toMs(a.modified) || 0)));
}

module.exports = {
  DAY_MS, TAIL_BYTES,
  dayStart, timeWindow, overlaps, recordMessage, readTailRecords, messagesOf,
  normalizeTerms, snippetAround, matchTerms, rankHits,
};
