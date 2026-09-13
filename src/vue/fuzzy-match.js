// Subsequence matching with a score and the positions that matched.
//
// The palette's own matcher, deliberately not the one the sidebar tabs use
// (project-search.js, plain substring). A list you are filtering wants
// substring — you can see the whole list, and a loose match adds noise. A
// palette you are typing into wants the opposite: "wp" has to find
// wooton-pad by the third keystroke, because the alternative is typing the
// whole name and the palette has bought you nothing.
//
// Greedy left-to-right, which can pick a worse alignment than an optimal
// search would — "abc" against "a-b-abc" matches the scattered letters rather
// than the run at the end. Names here are short and the scoring below leans
// hard enough on word starts and runs that it has not mattered; an optimal
// matcher is a much bigger thing to carry for that.

const BOUNDARY = /[\s/\-_.]/;

const SCORE = {
  firstChar: 16,     // the match starts at the start of the text
  boundary: 10,      // ...or at the start of a word inside it
  consecutive: 8,    // runs read as "the thing I typed", scattered hits do not
  gapPenalty: 1,     // per skipped character, so tight matches win
  maxGapPenalty: 12,
};

/**
 * @param {string} text
 * @param {string} query
 * @returns {{score: number, ranges: Array<[number, number]>, span: number,
 *   initials: boolean}|null} null when `query` is not a subsequence of
 *   `text`. An empty query matches everything with score 0 and no ranges.
 *   `initials` means the query spelled the first letters of consecutive words
 *   — "wp" over wooton-pad.
 */
export function fuzzyMatch(text, query) {
  const haystack = String(text || '');
  const needle = String(query || '').trim();
  if (!needle) return { score: 0, ranges: [] };
  if (!haystack) return null;

  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();

  const hits = [];
  let qi = 0;
  let score = 0;
  let gap = 0;
  let initials = true;
  let lastWord = -2;
  let word = 0;

  for (let i = 0; i < lowerHay.length && qi < lowerNeedle.length; i++) {
    const startsWord = i === 0 || BOUNDARY.test(lowerHay[i - 1]);
    if (startsWord && i > 0) word++;
    if (lowerHay[i] !== lowerNeedle[qi]) { gap++; continue; }

    const previousHit = hits.length ? hits[hits.length - 1] : -1;
    if (i === 0) score += SCORE.firstChar;
    else if (startsWord) score += SCORE.boundary;
    if (previousHit === i - 1) score += SCORE.consecutive;
    // Initials only counts when the letters are the heads of *consecutive*
    // words. Any word start will do otherwise, and a long sentence has plenty
    // — which is how "sess" ends up "matching" half a paragraph.
    if (!startsWord || (lastWord !== -2 && word !== lastWord + 1)) initials = false;
    lastWord = word;

    score -= Math.min(gap * SCORE.gapPenalty, SCORE.maxGapPenalty);
    gap = 0;
    hits.push(i);
    qi++;
  }

  if (qi < lowerNeedle.length) return null;
  // A short text that gave up all of itself to the match is a better answer
  // than a long one that matched the same letters.
  score += Math.max(0, 20 - (haystack.length - needle.length));
  return {
    score,
    ranges: toRanges(hits),
    span: hits[hits.length - 1] - hits[0] + 1,
    initials,
  };
}

/**
 * Is this match worth showing, or did the letters just happen to be in there?
 *
 * Subsequence matching over a long string finds nearly anything — "sess" is
 * hiding inside most two-line prompts — and a palette full of those is worse
 * than one that finds less. Two shapes survive: the initials of consecutive
 * words ("wp" → wooton-pad), and a run tight enough to read as the thing
 * typed.
 */
export function isTightMatch(hit, query) {
  if (!hit) return false;
  const n = String(query || '').trim().length;
  if (n === 0) return true;
  return hit.initials || hit.span <= n * 3 + 2;
}

/** Does `text` match `query` well enough to show as a hit? */
export function matches(text, query) {
  const hit = fuzzyMatch(text, query);
  return !!hit && isTightMatch(hit, query);
}

/**
 * The text split for rendering: `[{ text, hit }]`, hits being the matched
 * characters. Always returns the whole string, so it can render the row
 * whether or not this particular field is what matched.
 */
export function highlightParts(text, query) {
  const haystack = String(text || '');
  const match = fuzzyMatch(haystack, query);
  // Same bar the results use: a row that matched on some other field must not
  // sprinkle orange over every third letter of the one being shown.
  if (!match || !match.ranges.length || !isTightMatch(match, query)) {
    return [{ text: haystack, hit: false }];
  }

  const parts = [];
  let at = 0;
  for (const [start, end] of match.ranges) {
    if (start > at) parts.push({ text: haystack.slice(at, start), hit: false });
    parts.push({ text: haystack.slice(start, end), hit: true });
    at = end;
  }
  if (at < haystack.length) parts.push({ text: haystack.slice(at), hit: false });
  return parts;
}

/** [3,4,5,9] → [[3,6],[9,10]] — half-open, ready for slice(). */
function toRanges(indexes) {
  const ranges = [];
  for (const i of indexes) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else ranges.push([i, i + 1]);
  }
  return ranges;
}
