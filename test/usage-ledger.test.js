const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../usage-ledger');

const H = 3600000;
const T0 = Date.parse('2026-09-21T08:00:00Z');

function entry({ id = 'msg_1', ts = T0, model = 'claude-opus-5', usage, sessionId = 's1', type = 'assistant' } = {}) {
  return {
    type,
    sessionId,
    timestamp: new Date(ts).toISOString(),
    cwd: '/p/a',
    message: {
      id, model,
      usage: usage || { input_tokens: 10, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 5000 },
    },
  };
}

test('a transcript entry becomes one usage row', () => {
  const row = L.usageRowFromEntry(entry());
  assert.equal(row.messageId, 'msg_1');
  assert.equal(row.sessionId, 's1');
  assert.equal(row.ts, T0);
  assert.equal(L.totalTokens(row), 6110);
});

test('entries without usage, synthetic ones and user lines are not rows', () => {
  assert.equal(L.usageRowFromEntry(entry({ type: 'user' })), null);
  assert.equal(L.usageRowFromEntry(entry({ model: '<synthetic>' })), null);
  assert.equal(L.usageRowFromEntry(entry({ usage: { input_tokens: 0, output_tokens: 0 } })), null);
  assert.equal(L.usageRowFromEntry({ type: 'assistant', message: { id: 'x' } }), null);
});

test('rows are read from JSONL text, skipping lines that cannot carry usage', () => {
  const text = [
    JSON.stringify({ type: 'user', message: { content: 'hi' } }),
    JSON.stringify(entry({ id: 'a' })),
    '{"type":"assistant","usage": half a line',
    JSON.stringify(entry({ id: 'b', ts: T0 + 1000 })),
    '',
  ].join('\n');
  assert.deepEqual(L.usageRowsFromText(text).map(r => r.messageId), ['a', 'b']);
});

test('prices weight Opus above Sonnet above Haiku, and cache reads at a tenth', () => {
  const row = (model, extra) => ({ model, input: 1e6, output: 0, cacheWrite: 0, cacheRead: 0, ...extra });
  assert.equal(L.messageCost(row('claude-opus-5')), 5);
  assert.equal(L.messageCost(row('claude-opus-4-1-20250805')), 15);
  assert.equal(L.messageCost(row('claude-sonnet-4-5')), 3);
  assert.equal(L.messageCost(row('claude-haiku-4-5-20251001')), 1);
  assert.equal(L.messageCost(row('claude-sonnet-4-5', { input: 0, cacheRead: 1e6 })), 0.3);
  // one-hour cache writes cost twice input, five-minute ones 1.25×
  assert.equal(L.messageCost(row('claude-sonnet-4-5', { input: 0, cacheWrite: 2e6, cacheWrite1h: 1e6 })), 3 * 2 + 3 * 1.25);
});

test('usage API answers are percents with ISO resets', () => {
  const r = L.readingsFromUsageApi({
    five_hour: { utilization: 23, resets_at: '2026-09-21T13:00:00+00:00' },
    seven_day: { utilization: 0.5, resets_at: '2026-09-25T00:00:00Z' },
    seven_day_opus: { utilization: 9 },
  });
  assert.deepEqual(r, [
    { kind: 'five_hour', utilization: 23, resetsAt: Date.parse('2026-09-21T13:00:00Z') },
    // 0.5 here is half a percent, not fifty: the API speaks percents
    { kind: 'seven_day', utilization: 0.5, resetsAt: Date.parse('2026-09-25T00:00:00Z') },
  ]);
});

test('rate_limit_event readings are fractions with resets in seconds', () => {
  const r = L.readingsFromRateLimitInfo({
    rateLimitType: 'seven_day', utilization: 0.81, resetsAt: 1789192800,
    unifiedWindows: { five_hour: { utilization: 0.07, resetsAt: 1789124400 } },
  });
  assert.deepEqual(r, [
    { kind: 'five_hour', utilization: 7, resetsAt: 1789124400000 },
    { kind: 'seven_day', utilization: 81, resetsAt: 1789192800000 },
  ]);
});

function msg(ts, cost, key = 'A', extra = {}) {
  return { ts, cost, key, sessionId: key + '-s', input: 0, output: 0, cacheWrite: 0, cacheRead: 0, ...extra };
}

test('a delta between two readings is split by cost', () => {
  const reset = T0 + 5 * H;
  const readings = [
    { ts: T0 + 10 * 60000, utilization: 10, resetsAt: reset },
    { ts: T0 + 20 * 60000, utilization: 16, resetsAt: reset },
  ];
  const messages = [msg(T0 + 12 * 60000, 1, 'A'), msg(T0 + 15 * 60000, 2, 'B')];
  const { alloc, points } = L.attributeWindow(readings, messages, L.WINDOW_MS.five_hour);
  assert.deepEqual([...alloc], [2, 4]);
  assert.equal(points[1].delta, 6);
  assert.equal(points[1].joinPrev, true);
});

test('the first reading of a window is attributed back to the window start', () => {
  const reset = T0 + 5 * H; // window opened at T0
  const readings = [{ ts: T0 + 2 * H, utilization: 30, resetsAt: reset }];
  const messages = [
    msg(T0 - 10 * 60000, 5, 'old'),  // before the window: not this window's
    msg(T0 + 30 * 60000, 1, 'A'),
    msg(T0 + 90 * 60000, 2, 'B'),
  ];
  const { alloc } = L.attributeWindow(readings, messages, L.WINDOW_MS.five_hour);
  assert.deepEqual([...alloc], [0, 10, 20]);
});

test('a reset is not joined and starts again from zero', () => {
  const readings = [
    { ts: T0 + 4 * H, utilization: 90, resetsAt: T0 + 5 * H },
    { ts: T0 + 6 * H, utilization: 5, resetsAt: T0 + 10.5 * H }, // window opened at T0+5.5h
  ];
  const messages = [msg(T0 + 3 * H, 1, 'A'), msg(T0 + 5.75 * H, 1, 'B')];
  const { alloc, points } = L.attributeWindow(readings, messages, L.WINDOW_MS.five_hour);
  assert.equal(points[1].joinPrev, false);
  assert.equal(points[1].delta, 5);
  assert.equal(alloc[1], 5);
});

test('a rise nobody here caused is kept apart as spent elsewhere', () => {
  const reset = T0 + 5 * H;
  const readings = [
    { ts: T0 + H, utilization: 10, resetsAt: reset },
    { ts: T0 + 2 * H, utilization: 14, resetsAt: reset },
  ];
  const { points } = L.attributeWindow(readings, [], L.WINDOW_MS.five_hour);
  assert.equal(points[1].unattributed, 4);
});

test('two sources disagreeing in the decimals do not count the same rise twice', () => {
  const reset = T0 + 5 * H;
  const readings = [
    { ts: T0 + 10 * 60000, utilization: 23.4, resetsAt: reset },
    { ts: T0 + 11 * 60000, utilization: 23, resetsAt: reset + 2000 },
    { ts: T0 + 20 * 60000, utilization: 24, resetsAt: reset },
  ];
  const messages = [msg(T0 + 15 * 60000, 1, 'A')];
  const { alloc } = L.attributeWindow(readings, messages, L.WINDOW_MS.five_hour);
  assert.equal(Math.round(alloc[0] * 100) / 100, 0.6);
});

test('a first reading with no reset time is a baseline, not a spend', () => {
  const readings = [{ ts: T0, utilization: 40, resetsAt: null }];
  const { points } = L.attributeWindow(readings, [], L.WINDOW_MS.five_hour);
  assert.equal(points[0].delta, 0);
  assert.equal(points[0].unattributed, 0);
});

test('worktrees fold into their project, the chat folder is Buddy, groups stay groups', () => {
  const ctx = { chatDirs: ['/h/.acc/wooton-chat'], groupsRoot: '/h/.acc/groups' };
  assert.equal(L.projectKeyFor('/p/app/.claude/worktrees/fix-1', ctx), '/p/app');
  assert.equal(L.projectKeyFor('/h/.acc/wooton-chat', ctx), 'buddy');
  assert.equal(L.projectKeyFor('/h/.acc/groups/group-2', ctx), '/h/.acc/groups/group-2');
  assert.equal(L.projectKeyFor('/p/app', ctx), '/p/app');
  assert.equal(L.projectKeyFor('C:\\p\\app\\.claude\\worktrees\\x', ctx), 'C:\\p\\app');
});

test('summary buckets tokens and limit share per project per day', () => {
  const day1 = new Date(2026, 8, 20, 10).getTime();
  const day2 = new Date(2026, 8, 21, 10).getTime();
  const reset = day2 + 4 * H;
  const messages = [
    msg(day1, 0, 'A', { model: 'claude-sonnet-4-5', input: 1000, output: 100 }),
    msg(day2, 0, 'A', { model: 'claude-opus-5', input: 1000, output: 1000 }),
    msg(day2 + 60000, 0, 'B', { model: 'claude-opus-5', input: 1000, output: 1000 }),
  ];
  for (const m of messages) delete m.cost;
  const readings = { five_hour: [{ ts: day2 + 2 * 60000, utilization: 10, resetsAt: reset }] };
  const s = L.summarizeUsage({
    messages, readings,
    from: new Date(2026, 8, 20).getTime(), to: day2 + H, bucket: 'day',
  });
  assert.deepEqual(s.buckets.map(b => b.key), ['2026-09-20', '2026-09-21']);
  const A = s.projects.find(p => p.key === 'A');
  const B = s.projects.find(p => p.key === 'B');
  assert.equal(A.totals.tokens, 1100 + 2000);
  assert.equal(A.series[0].tokens, 1100);
  assert.equal(A.series[0].fiveHour, 0);
  assert.equal(A.series[1].fiveHour, 5);
  assert.equal(B.totals.fiveHour, 5);
  assert.equal(s.total.fiveHour, 10);
  assert.equal(s.timeline.five_hour.length, 1);
  assert.deepEqual(s.timeline.five_hour[0].byKey, { A: 5, B: 5 });
});

test('flat runs of readings keep their ends and their gaps', () => {
  const p = (ts, u, joinPrev = true, delta = 0) => ({ ts, utilization: u, resetsAt: T0 + 5 * H, delta, joinPrev, byKey: {} });
  const pts = [p(0, 10, false, 10), p(1, 10), p(2, 10), p(3, 10), p(4, 12, true, 2)];
  assert.deepEqual(L.compressFlats(pts).map(x => x.ts), [0, 3, 4]);
  const gap = [p(0, 10, false, 10), p(1, 10), p(2, 10, false), p(3, 10)];
  assert.deepEqual(L.compressFlats(gap).map(x => x.ts), [0, 1, 2, 3]);
});
