const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseRateLimitEvent, tightestWindow, resetsIn, WINDOW_LABEL, WINDOWS,
} = require('../src/vue/rate-limits.js');

// Captured verbatim from a live session's `rate_limit_event`. The control
// request reported the same two windows as 6%/81% and an ISO reset of
// 2026-09-12T06:00:00.000Z, which is what pins the units below.
const LIVE = {
  status: 'allowed_warning',
  resetsAt: 1789192800,
  rateLimitType: 'seven_day',
  utilization: 0.81,
  isUsingOverage: false,
  surpassedThreshold: 0.75,
  unifiedWindows: {
    five_hour: { utilization: 0.07, resetsAt: 1789124400 },
    seven_day: { utilization: 0.81, resetsAt: 1789192800 },
  },
};

const NOW = Date.UTC(2026, 8, 11, 10, 0, 0);

// ── Units ─────────────────────────────────────────────────────────

// The stream sends fractions; the control request sends percents for the same
// number. Everything downstream reads percent.
test('a fraction is read as a percentage', () => {
  const limits = parseRateLimitEvent(LIVE, NOW);
  assert.equal(limits.windows.five_hour.utilization, 7);
  assert.equal(limits.windows.seven_day.utilization, 81);
});

// 1789192800 is 2026-09-12T06:00:00Z — the same instant the control request
// gave as an ISO string, which is how we know these are seconds.
test('epoch seconds become milliseconds', () => {
  const limits = parseRateLimitEvent(LIVE, NOW);
  assert.equal(new Date(limits.windows.seven_day.resetsAt).toISOString(),
    '2026-09-12T06:00:00.000Z');
});

test('a timestamp already in milliseconds is left alone', () => {
  const ms = Date.UTC(2026, 8, 12, 6, 0, 0);
  const limits = parseRateLimitEvent({ rateLimitType: 'seven_day', utilization: 0.5, resetsAt: ms }, NOW);
  assert.equal(limits.windows.seven_day.resetsAt, ms);
});

test('a percentage above one is not doubled into a fraction', () => {
  const limits = parseRateLimitEvent({ rateLimitType: 'five_hour', utilization: 42 }, NOW);
  assert.equal(limits.windows.five_hour.utilization, 42);
});

test('utilization is capped at a full window', () => {
  const limits = parseRateLimitEvent({ rateLimitType: 'five_hour', utilization: 140 }, NOW);
  assert.equal(limits.windows.five_hour.utilization, 100);
});

// ── Reading the payload ───────────────────────────────────────────

test('both windows come from unifiedWindows in one event', () => {
  const limits = parseRateLimitEvent(LIVE, NOW);
  assert.deepEqual(Object.keys(limits.windows).sort(), ['five_hour', 'seven_day']);
  assert.equal(limits.status, 'allowed_warning');
  assert.equal(limits.surpassedThreshold, 75);
  assert.equal(limits.isUsingOverage, false);
  assert.equal(limits.updatedAt, NOW);
});

// unifiedWindows is not in the shipped types, so a build that stops sending it
// has to degrade to the window the CLI is warning about, not to nothing.
test('without unifiedWindows the named window still reports', () => {
  const { unifiedWindows, ...flat } = LIVE;
  const limits = parseRateLimitEvent(flat, NOW);
  assert.deepEqual(Object.keys(limits.windows), ['seven_day']);
  assert.equal(limits.windows.seven_day.utilization, 81);
});

test('unifiedWindows wins over the single-window fields for the same window', () => {
  const limits = parseRateLimitEvent({
    ...LIVE,
    utilization: 0.99,                       // the top-level number disagrees
    unifiedWindows: { seven_day: { utilization: 0.81, resetsAt: 1789192800 } },
  }, NOW);
  assert.equal(limits.windows.seven_day.utilization, 81);
});

test('windows the meter does not show are dropped', () => {
  const limits = parseRateLimitEvent({
    rateLimitType: 'seven_day_opus',
    utilization: 0.5,
    unifiedWindows: { five_hour: { utilization: 0.1, resetsAt: 1789124400 }, overage: { utilization: 0.9 } },
  }, NOW);
  assert.deepEqual(Object.keys(limits.windows), ['five_hour']);
});

test('a window with no usable number is not invented', () => {
  assert.equal(parseRateLimitEvent({ rateLimitType: 'five_hour' }, NOW), null);
  assert.equal(parseRateLimitEvent({ unifiedWindows: { five_hour: {} } }, NOW), null);
});

test('overage is reported under either spelling', () => {
  const base = { rateLimitType: 'five_hour', utilization: 0.2 };
  assert.equal(parseRateLimitEvent({ ...base, isUsingOverage: true }, NOW).isUsingOverage, true);
  assert.equal(parseRateLimitEvent({ ...base, overageInUse: true }, NOW).isUsingOverage, true);
  assert.equal(parseRateLimitEvent(base, NOW).isUsingOverage, false);
});

test('a missing reset time is absent rather than wrong', () => {
  const limits = parseRateLimitEvent({ rateLimitType: 'five_hour', utilization: 0.2 }, NOW);
  assert.equal(limits.windows.five_hour.resetsAt, null);
});

test('nonsense never throws', () => {
  for (const value of [null, undefined, 'nope', 42, {}, { unifiedWindows: 'no' }]) {
    assert.equal(parseRateLimitEvent(value, NOW), null);
  }
});

// ── The one-line meter ────────────────────────────────────────────

test('the tightest window is the one closest to running out', () => {
  const limits = parseRateLimitEvent(LIVE, NOW);
  const worst = tightestWindow(limits);
  assert.equal(worst.name, 'seven_day');
  assert.equal(worst.utilization, 81);
  assert.equal(WINDOW_LABEL[worst.name], '7d');
});

test('the five-hour window leads when it is the fuller one', () => {
  const limits = parseRateLimitEvent({
    unifiedWindows: { five_hour: { utilization: 0.9 }, seven_day: { utilization: 0.2 } },
  }, NOW);
  assert.equal(tightestWindow(limits).name, 'five_hour');
});

test('nothing to show yields nothing rather than throwing', () => {
  assert.equal(tightestWindow(null), null);
  assert.equal(tightestWindow({}), null);
  assert.equal(tightestWindow({ windows: {} }), null);
});

// ── Time to reset ─────────────────────────────────────────────────

test('the wait reads in the largest unit that fits', () => {
  assert.equal(resetsIn(NOW + 45 * 60000, NOW), '45m');
  assert.equal(resetsIn(NOW + 2 * 3600000, NOW), '2h');
  assert.equal(resetsIn(NOW + (2 * 3600 + 15 * 60) * 1000, NOW), '2h 15m');
  assert.equal(resetsIn(NOW + 26 * 3600000, NOW), '1d 2h');
  assert.equal(resetsIn(NOW + 48 * 3600000, NOW), '2d');
});

// The next event carries the new window; saying "-3m" until then helps nobody.
test('a reset already past reports nothing', () => {
  assert.equal(resetsIn(NOW - 60000, NOW), '');
  assert.equal(resetsIn(NOW, NOW), '');
});

test('under a minute still reads as a minute rather than as zero', () => {
  assert.equal(resetsIn(NOW + 20000, NOW), '1m');
});

test('a missing reset time reads as nothing', () => {
  for (const value of [null, undefined, NaN, 'soon']) assert.equal(resetsIn(value, NOW), '');
});

test('both windows the meter knows about have a short label', () => {
  for (const name of WINDOWS) assert.ok(WINDOW_LABEL[name]);
});
