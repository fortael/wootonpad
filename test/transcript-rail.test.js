const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeSegments, paintedCount, recordAtOffset, railBand, MIN_THUMB_PERCENT,
} = require('../src/vue/transcript-rail.js');

// The whole file painted, so a fraction of the scroll is a fraction of the file.
const WHOLE = [{ from: 0, to: 1000 }];

// ── Runs ──────────────────────────────────────────────────────────

test('paging upward produces runs that touch, and touching runs are one run', () => {
  assert.deepEqual(
    mergeSegments([{ from: 100, to: 150 }, { from: 150, to: 200 }]),
    [{ from: 100, to: 200 }],
  );
});

test('a gap between runs is kept — that is what a compact left behind', () => {
  assert.deepEqual(
    mergeSegments([{ from: 900, to: 1000 }, { from: 100, to: 150 }]),
    [{ from: 100, to: 150 }, { from: 900, to: 1000 }],
  );
});

test('empty and inverted runs are not runs', () => {
  assert.deepEqual(mergeSegments([{ from: 5, to: 5 }, { from: 9, to: 2 }]), []);
  assert.deepEqual(mergeSegments(undefined), []);
});

test('overlapping runs are absorbed rather than counted twice', () => {
  assert.deepEqual(mergeSegments([{ from: 0, to: 80 }, { from: 40, to: 120 }]), [{ from: 0, to: 120 }]);
  assert.equal(paintedCount(mergeSegments([{ from: 0, to: 80 }, { from: 40, to: 120 }])), 120);
});

// ── Walking the runs ──────────────────────────────────────────────

test('an offset into one run is a record in it', () => {
  assert.equal(recordAtOffset([{ from: 900, to: 1000 }], 0), 900);
  assert.equal(recordAtOffset([{ from: 900, to: 1000 }], 40), 940);
});

// The reason this walks instead of interpolating: with two runs either side of a
// compact, half way down the scroll is the boundary between them — not the
// record half way between their indices, which is in the part that was dropped.
test('an offset past one run continues in the next, skipping the gap', () => {
  const runs = [{ from: 100, to: 150 }, { from: 900, to: 1000 }];
  assert.equal(recordAtOffset(runs, 49), 149);     // last record of the first run
  assert.equal(recordAtOffset(runs, 50), 900);     // first record of the second
  assert.equal(recordAtOffset(runs, 75), 925);
});

test('an offset past everything painted lands at the end of the last run', () => {
  assert.equal(recordAtOffset([{ from: 0, to: 10 }], 999), 10);
  assert.equal(recordAtOffset([], 5), 0);
});

// ── The thumb ─────────────────────────────────────────────────────

test('a viewport at the top of the whole file puts the thumb at the top', () => {
  const band = railBand(WHOLE, 1000, { start: 0, end: 0.1 });
  assert.equal(band.top, 0);
  assert.equal(band.height, 10);
});

// The bug this replaces: the band was the loaded range, so scrolling up grew it
// and scrolling back down left it where it was.
test('scrolling down moves the thumb down', () => {
  const top = railBand(WHOLE, 1000, { start: 0, end: 0.1 });
  const middle = railBand(WHOLE, 1000, { start: 0.45, end: 0.55 });
  const bottom = railBand(WHOLE, 1000, { start: 0.9, end: 1 });
  assert.ok(top.top < middle.top, `${top.top} < ${middle.top}`);
  assert.ok(middle.top < bottom.top, `${middle.top} < ${bottom.top}`);
  assert.equal(bottom.top + bottom.height, 100);
});

test('the thumb never leaves the rail', () => {
  for (const start of [0, 0.5, 0.99, 1]) {
    const band = railBand(WHOLE, 1000, { start, end: 1 });
    assert.ok(band.top >= 0 && band.top + band.height <= 100.0001,
      `start=${start} gave ${band.top}..${band.top + band.height}`);
  }
});

// Only the tail of a long file is painted, so the reader really is at the end of
// it — the thumb says so rather than pretending the session is short.
test('with only the tail painted the thumb sits at the end of the file', () => {
  const band = railBand([{ from: 9950, to: 10000 }], 10000, { start: 0, end: 1 });
  // Fifty records of ten thousand is half a percent of the rail, so the floor
  // decides the height — and the thumb is pushed up to keep its end on the end.
  assert.equal(band.height, MIN_THUMB_PERCENT);
  assert.equal(band.top + band.height, 100);
});

test('a sliver of a long file still has a thumb you can see', () => {
  const band = railBand([{ from: 9950, to: 10000 }], 10000, { start: 0.2, end: 0.3 });
  assert.equal(band.height, MIN_THUMB_PERCENT);
});

// Stepping over a compact: the two painted halves scroll as one column, and the
// thumb has to be over the half being read rather than over the gap.
test('across a compact, the thumb jumps the gap rather than crossing it', () => {
  const runs = [{ from: 100, to: 200 }, { from: 900, to: 1000 }];
  const inOlder = railBand(runs, 1000, { start: 0, end: 0.1 });
  const inNewer = railBand(runs, 1000, { start: 0.9, end: 1 });
  assert.ok(inOlder.top >= 10 && inOlder.top < 20, `older half: ${inOlder.top}`);
  assert.ok(inNewer.top >= 90, `newer half: ${inNewer.top}`);
  // Half way down the scroll is the boundary — record 900, where the newer run
  // starts — not record 550, which the compact threw away.
  const atBoundary = railBand(runs, 1000, { start: 0.5, end: 0.5 });
  assert.equal(atBoundary.top, 90);
});

test('nothing painted and no file leave nothing to place', () => {
  assert.equal(railBand([], 1000, { start: 0, end: 1 }), null);
  assert.equal(railBand(WHOLE, 0, { start: 0, end: 1 }), null);
});

test('a viewport reported out of order or out of range is clamped, not trusted', () => {
  const band = railBand(WHOLE, 1000, { start: 0.8, end: 0.2 });
  assert.ok(band.top >= 0 && band.top + band.height <= 100.0001);
  const over = railBand(WHOLE, 1000, { start: -1, end: 4 });
  assert.equal(over.top, 0);
  assert.equal(over.height, 100);
});
