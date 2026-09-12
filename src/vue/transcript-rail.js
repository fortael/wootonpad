// transcript-rail.js — where the reader is in a session, as a position on a rail.
//
// The rail beside the chat is drawn against the *file*: a compact notch sits at
// its own record index out of the transcript's total, because the whole point
// of the rail is to show the events a scrollbar cannot — the records above a
// compact are not loaded and have no height to scroll through.
//
// The thumb has to live in that same coordinate space or the notches lie. But
// what the browser can report is pixels of the painted transcript, and the
// painted transcript is not the file: it is the tail of it, plus whatever
// earlier runs were loaded by stepping over a compact. So the translation is
// pixels → painted records → file records, and the middle step is the one that
// matters. Two disjoint runs with three thousand dropped records between them
// scroll as one continuous column; a fraction of that column is a fraction of
// what is on screen, not a fraction of the range it spans.
//
// DOM-free so it can be tested; the component supplies the numbers.

/** Percent of the rail the thumb never shrinks below, so it stays findable. */
export const MIN_THUMB_PERCENT = 2.5;

/**
 * The viewport as fractions of the painted transcript — top edge and bottom.
 *
 * @param {{ scrollTop: number, scrollHeight: number, clientHeight: number }} el
 * @returns {{ start: number, end: number }}
 */
export function viewSpanOf(el) {
  const height = Math.max(1, el?.scrollHeight || 0);
  const top = Math.max(0, el?.scrollTop || 0);
  const visible = Math.max(0, el?.clientHeight || 0);
  return {
    start: Math.min(1, top / height),
    end: Math.min(1, (top + visible) / height),
  };
}

/**
 * The painted runs, merged and in file order.
 *
 * Paging upward produces runs that touch — `[2950,3000)` under `[3000,3050)` —
 * and a boundary between two touching runs is not a gap, so they are joined
 * before anything is measured against them.
 *
 * @param {Array<{from: number, to: number}>} segments
 * @returns {Array<{from: number, to: number}>}
 */
export function mergeSegments(segments) {
  const clean = (segments || [])
    .map(s => ({ from: Math.max(0, Math.trunc(s?.from ?? 0)), to: Math.trunc(s?.to ?? 0) }))
    .filter(s => s.to > s.from)
    .sort((a, b) => a.from - b.from);

  const merged = [];
  for (const segment of clean) {
    const last = merged[merged.length - 1];
    if (last && segment.from <= last.to) last.to = Math.max(last.to, segment.to);
    else merged.push({ ...segment });
  }
  return merged;
}

/** How many records are painted, across every run. */
export function paintedCount(segments) {
  return segments.reduce((sum, s) => sum + (s.to - s.from), 0);
}

/**
 * Would a window ending at `before` paint records that are already on screen?
 *
 * The runs are the record of what has been drawn, so they are also the answer
 * to "has this been drawn already". Without asking, a compact notch for a
 * boundary that had already been stepped over re-read its segment and prepended
 * a second copy of it — once per click, so the same pages could be scrolled
 * through over and over.
 *
 * `before` is exclusive, which is why the top edge of a run is not a hit: a
 * page ending exactly where the painted range starts is the next page up, and
 * it is the one legitimate way to walk backwards.
 */
export function isPainted(segments, before) {
  return (segments || []).some(s => s && s.from < before && before <= s.to);
}

/**
 * The file record `offset` painted records into the transcript.
 *
 * Walking the runs rather than interpolating across them is the whole job: half
 * way down a transcript whose two loaded halves sit either side of a compact,
 * the reader is at the boundary between them — not at the record half way
 * between their file indices, which is in the part that was thrown away.
 */
export function recordAtOffset(segments, offset) {
  if (!segments.length) return 0;
  let left = Math.max(0, offset);
  for (const segment of segments) {
    const length = segment.to - segment.from;
    if (left < length) return segment.from + left;
    left -= length;
  }
  return segments[segments.length - 1].to;
}

/**
 * Where to put the rail's thumb.
 *
 * @param {Array<{from: number, to: number}>} segments  painted runs of records
 * @param {number} total  records in the file
 * @param {{ start: number, end: number }} view  the viewport as fractions of the
 *        painted transcript's scroll height, top and bottom edge
 * @returns {{ top: number, height: number } | null}  percentages down the rail,
 *          or null when there is nothing to place one against
 */
export function railBand(segments, total, view) {
  const runs = mergeSegments(segments);
  const painted = paintedCount(runs);
  if (!painted || !(total > 0)) return null;

  const start = Math.min(Math.max(view?.start ?? 0, 0), 1);
  const end = Math.min(Math.max(view?.end ?? 1, start), 1);

  const first = recordAtOffset(runs, start * painted);
  const last = recordAtOffset(runs, end * painted);

  const top = (first / total) * 100;
  const bottom = (last / total) * 100;
  // A floor, because a viewport showing fifty records of forty thousand is a
  // true sliver — and a sliver nobody can see answers nothing.
  const height = Math.min(100, Math.max(MIN_THUMB_PERCENT, bottom - top));
  // Grown around its middle rather than downward from its top. Hanging the
  // extra height off the top pushes the thumb into the rail's end, where it
  // sticks: the last stretch of a scroll then moves nothing, which reads as the
  // rail having given up exactly where the reader was looking.
  const middle = (top + bottom) / 2;
  return {
    top: Math.min(100 - height, Math.max(0, middle - height / 2)),
    height,
  };
}
