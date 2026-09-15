const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readTranscriptWindow, readSessionLandmarks, recordIndexAtTime, forgetTranscript,
} = require('../transcript-window');

let dirCount = 0;
function makeTranscript(records, { trailingNewline = true, blanks = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `wp-window-${dirCount++}-`));
  const file = path.join(dir, 'session.jsonl');
  const lines = records.map(r => JSON.stringify(r));
  const body = blanks ? lines.join('\n\n') : lines.join('\n');
  fs.writeFileSync(file, body + (trailingNewline ? '\n' : ''), 'utf8');
  return { dir, file };
}

function msg(i) {
  return { type: i % 2 ? 'assistant' : 'user', n: i, message: { role: i % 2 ? 'assistant' : 'user', content: 'm' + i } };
}

function boundary(opts = {}) {
  return {
    type: 'system',
    subtype: 'compact_boundary',
    content: 'Conversation compacted',
    timestamp: opts.timestamp || '2026-09-10T18:34:23.711Z',
    compactMetadata: { trigger: opts.trigger || 'manual', preTokens: 936783, postTokens: 11112 },
  };
}

function cleanup(dir, file) {
  forgetTranscript(file);
  fs.rmSync(dir, { recursive: true, force: true });
}

test('returns the last records by default', () => {
  const records = Array.from({ length: 120 }, (_, i) => msg(i));
  const { dir, file } = makeTranscript(records);
  try {
    const win = readTranscriptWindow(file, { limit: 50 });
    assert.equal(win.total, 120);
    assert.equal(win.from, 70);
    assert.equal(win.to, 120);
    assert.equal(win.entries.length, 50);
    assert.equal(win.entries[0].n, 70);
    assert.equal(win.entries[49].n, 119);
    assert.equal(win.hasMore, true);
    assert.equal(win.compact, null);
  } finally {
    cleanup(dir, file);
  }
});

test('pages upward when `before` is the previous window start', () => {
  const records = Array.from({ length: 120 }, (_, i) => msg(i));
  const { dir, file } = makeTranscript(records);
  try {
    const first = readTranscriptWindow(file, { limit: 50 });
    const second = readTranscriptWindow(file, { before: first.from, limit: 50 });
    assert.equal(second.from, 20);
    assert.equal(second.to, 70);
    assert.equal(second.entries[0].n, 20);
    assert.equal(second.hasMore, true);

    const third = readTranscriptWindow(file, { before: second.from, limit: 50 });
    assert.equal(third.from, 0);
    assert.equal(third.to, 20);
    assert.equal(third.entries.length, 20);
    assert.equal(third.hasMore, false);
  } finally {
    cleanup(dir, file);
  }
});

test('stops at a compact boundary and reports it', () => {
  const records = [
    ...Array.from({ length: 40 }, (_, i) => msg(i)),
    boundary({ trigger: 'auto' }),
    ...Array.from({ length: 10 }, (_, i) => msg(100 + i)),
  ];
  const { dir, file } = makeTranscript(records);
  try {
    const win = readTranscriptWindow(file, { limit: 50 });
    // 40 messages, the boundary at index 40, then 10 more: the window is the
    // 10 that follow the boundary even though the limit would allow 50.
    assert.equal(win.from, 41);
    assert.equal(win.to, 51);
    assert.equal(win.entries.length, 10);
    assert.equal(win.entries[0].n, 100);
    assert.ok(win.compact);
    assert.equal(win.compact.index, 40);
    assert.equal(win.compact.trigger, 'auto');
    assert.equal(win.compact.preTokens, 936783);
    assert.equal(win.compact.postTokens, 11112);
    assert.equal(win.hasMore, true);
  } finally {
    cleanup(dir, file);
  }
});

test('stepping over a boundary reads the segment before it', () => {
  const records = [
    ...Array.from({ length: 40 }, (_, i) => msg(i)),
    boundary(),
    ...Array.from({ length: 10 }, (_, i) => msg(100 + i)),
  ];
  const { dir, file } = makeTranscript(records);
  try {
    const win = readTranscriptWindow(file, { limit: 50 });
    const earlier = readTranscriptWindow(file, { before: win.compact.index, limit: 50 });
    assert.equal(earlier.to, 40);
    assert.equal(earlier.from, 0);
    assert.equal(earlier.entries.length, 40);
    assert.equal(earlier.entries[39].n, 39);
    assert.equal(earlier.compact, null);
    assert.equal(earlier.hasMore, false);
  } finally {
    cleanup(dir, file);
  }
});

test('only the nearest boundary below the window floors it', () => {
  const records = [
    ...Array.from({ length: 5 }, (_, i) => msg(i)),
    boundary({ timestamp: '2026-01-01T00:00:00.000Z' }),
    ...Array.from({ length: 5 }, (_, i) => msg(50 + i)),
    boundary({ timestamp: '2026-02-02T00:00:00.000Z' }),
    ...Array.from({ length: 5 }, (_, i) => msg(90 + i)),
  ];
  const { dir, file } = makeTranscript(records);
  try {
    const win = readTranscriptWindow(file, { limit: 50 });
    assert.equal(win.compact.timestamp, '2026-02-02T00:00:00.000Z');
    assert.equal(win.entries.length, 5);

    const middle = readTranscriptWindow(file, { before: win.compact.index, limit: 50 });
    assert.equal(middle.compact.timestamp, '2026-01-01T00:00:00.000Z');
    assert.equal(middle.entries.length, 5);
    assert.equal(middle.entries[0].n, 50);

    const head = readTranscriptWindow(file, { before: middle.compact.index, limit: 50 });
    assert.equal(head.compact, null);
    assert.equal(head.entries.length, 5);
    assert.equal(head.hasMore, false);
  } finally {
    cleanup(dir, file);
  }
});

test('blank lines do not consume a record index', () => {
  const records = Array.from({ length: 10 }, (_, i) => msg(i));
  const { dir, file } = makeTranscript(records, { blanks: true });
  try {
    const win = readTranscriptWindow(file, { limit: 50 });
    assert.equal(win.total, 10);
    assert.equal(win.entries.length, 10);
    assert.equal(win.entries[0].n, 0);
    assert.equal(win.entries[9].n, 9);
  } finally {
    cleanup(dir, file);
  }
});

test('a file with no trailing newline keeps its last record', () => {
  const records = Array.from({ length: 3 }, (_, i) => msg(i));
  const { dir, file } = makeTranscript(records, { trailingNewline: false });
  try {
    const win = readTranscriptWindow(file);
    assert.equal(win.total, 3);
    assert.equal(win.entries[2].n, 2);
  } finally {
    cleanup(dir, file);
  }
});

test('unparseable lines are skipped without shifting indices', () => {
  const { dir, file } = makeTranscript([msg(0), msg(1)]);
  try {
    fs.appendFileSync(file, 'not json\n' + JSON.stringify(msg(2)) + '\n', 'utf8');
    const win = readTranscriptWindow(file, { limit: 50 });
    assert.equal(win.total, 4);
    assert.equal(win.entries.length, 3);
    assert.deepEqual(win.entries.map(e => e.n), [0, 1, 2]);
  } finally {
    cleanup(dir, file);
  }
});

test('a growing file is re-indexed rather than served stale', () => {
  const { dir, file } = makeTranscript([msg(0)]);
  try {
    assert.equal(readTranscriptWindow(file).total, 1);
    // Same-millisecond appends are the normal case for a live session, so the
    // size has to be part of what invalidates the index.
    fs.appendFileSync(file, JSON.stringify(msg(1)) + '\n', 'utf8');
    const win = readTranscriptWindow(file);
    assert.equal(win.total, 2);
    assert.equal(win.entries[1].n, 1);
  } finally {
    cleanup(dir, file);
  }
});

test('an empty transcript reads as an empty window', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-window-empty-'));
  const file = path.join(dir, 'session.jsonl');
  fs.writeFileSync(file, '', 'utf8');
  try {
    const win = readTranscriptWindow(file);
    assert.equal(win.total, 0);
    assert.equal(win.entries.length, 0);
    assert.equal(win.hasMore, false);
    assert.equal(win.compact, null);
  } finally {
    cleanup(dir, file);
  }
});

// ── The compact rail ──────────────────────────────────────────────
//
// The rail down the left of the chat is drawn from every boundary in the file,
// not just the one flooring the current window — see readSessionLandmarks.

test('every compact boundary is reported, in file order, with its position', () => {
  const records = [
    ...Array.from({ length: 10 }, (_, i) => msg(i)),
    boundary({ timestamp: '2026-09-10T10:00:00.000Z', trigger: 'manual' }),
    ...Array.from({ length: 10 }, (_, i) => msg(i)),
    boundary({ timestamp: '2026-09-11T10:00:00.000Z', trigger: 'auto' }),
    ...Array.from({ length: 5 }, (_, i) => msg(i)),
  ];
  const { dir, file } = makeTranscript(records);
  try {
    const found = readSessionLandmarks(file);
    const compacts = found.marks.filter(m => m.kind === 'compact');
    assert.equal(found.total, 27);
    assert.deepEqual(compacts.map(c => c.index), [10, 21]);
    assert.deepEqual(compacts.map(c => c.trigger), ['manual', 'auto']);
    assert.equal(compacts[0].preTokens, 936783);
    assert.equal(compacts[1].postTokens, 11112);
  } finally { cleanup(dir, file); }
});

test('a transcript that was never compacted reports none', () => {
  const { dir, file } = makeTranscript(Array.from({ length: 5 }, (_, i) => msg(i)));
  try {
    const found = readSessionLandmarks(file);
    assert.equal(found.total, 5);
    assert.deepEqual(found.marks.filter(m => m.kind === 'compact'), []);
  } finally { cleanup(dir, file); }
});

// The window read and the rail share one cached line index, so the record
// numbers they hand the renderer have to be the same numbers.
test('a boundary index matches the one the window floors on', () => {
  const records = [...Array.from({ length: 8 }, (_, i) => msg(i)), boundary(),
    ...Array.from({ length: 8 }, (_, i) => msg(i))];
  const { dir, file } = makeTranscript(records);
  try {
    const win = readTranscriptWindow(file, { limit: 50 });
    const found = readSessionLandmarks(file).marks.find(m => m.kind === 'compact');
    assert.equal(win.compact.index, found.index);
  } finally { cleanup(dir, file); }
});

// ── The timeline rail ─────────────────────────────────────────────
//
// Four kinds of mark, all found in the bytes rather than by parsing records.
// What each test is really guarding is that the needle still picks out the
// record the CLI writes, and nothing else.

const at = (ts) => ts;

/** A record the user typed. `promptSource` is what marks one in the CLI's own file. */
function prompt(ts) {
  return {
    type: 'user', promptSource: 'user', origin: 'cli', timestamp: at(ts),
    message: { role: 'user', content: 'hello' },
  };
}

function reply(ts) {
  return { type: 'assistant', timestamp: at(ts), message: { role: 'assistant', content: 'hi' } };
}

function failedTool(ts) {
  return {
    type: 'user', timestamp: at(ts),
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'boom' }] },
  };
}

const kinds = (marks, kind) => marks.filter(m => m.kind === kind).map(m => m.index);

// Turn ends used to be marked here and are deliberately not any more: a day's
// work is hundreds of them, and hundreds of notches down an eight-pixel strip
// is a striped bar rather than a map.
test('an ordinary exchange puts nothing on the rail', () => {
  const { dir, file } = makeTranscript([
    prompt('2026-09-10T10:00:00.000Z'),
    reply('2026-09-10T10:00:01.000Z'),
    reply('2026-09-10T10:00:02.000Z'),
    prompt('2026-09-10T10:00:03.000Z'),
    reply('2026-09-10T10:00:04.000Z'),
  ]);
  try {
    const { marks, total } = readSessionLandmarks(file);
    assert.equal(total, 5);
    assert.deepEqual(marks, []);
  } finally { cleanup(dir, file); }
});

test('a failed tool result is an error mark', () => {
  const { dir, file } = makeTranscript([
    reply('2026-09-10T10:00:00.000Z'),
    failedTool('2026-09-10T10:00:01.000Z'),
    reply('2026-09-10T10:00:02.000Z'),
  ]);
  try {
    const { marks } = readSessionLandmarks(file);
    assert.deepEqual(kinds(marks, 'error'), [1]);
    assert.equal(marks.find(m => m.kind === 'error').timestamp, '2026-09-10T10:00:01.000Z');
  } finally { cleanup(dir, file); }
});

// A tool that came back fine says so with the same field, and the rail must not
// flag every call in the session.
test('a tool result that succeeded is not an error', () => {
  const { dir, file } = makeTranscript([
    reply('2026-09-10T10:00:00.000Z'),
    {
      type: 'user', timestamp: '2026-09-10T10:00:01.000Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', is_error: false, content: 'ok' }] },
    },
  ]);
  try {
    assert.deepEqual(kinds(readSessionLandmarks(file).marks, 'error'), []);
  } finally { cleanup(dir, file); }
});

test('the day is marked where it turns over, and not at the start', () => {
  const { dir, file } = makeTranscript([
    reply('2026-09-10T10:00:00.000Z'),
    reply('2026-09-10T11:00:00.000Z'),
    reply('2026-09-12T09:00:00.000Z'),
    reply('2026-09-12T10:00:00.000Z'),
  ]);
  try {
    const days = kinds(readSessionLandmarks(file).marks, 'day');
    // Local days, so the exact indices depend on the machine's zone — what is
    // fixed is that the first record never carries one and a two-day gap does.
    assert.ok(!days.includes(0));
    assert.equal(days.length, 1);
  } finally { cleanup(dir, file); }
});

test('compacts are on the same rail as everything else', () => {
  const { dir, file } = makeTranscript([
    reply('2026-09-10T10:00:00.000Z'),
    boundary({ timestamp: '2026-09-10T10:05:00.000Z', trigger: 'auto' }),
    reply('2026-09-10T10:06:00.000Z'),
  ]);
  try {
    const { marks } = readSessionLandmarks(file);
    const compact = marks.find(m => m.kind === 'compact');
    assert.equal(compact.index, 1);
    assert.equal(compact.trigger, 'auto');
    assert.equal(compact.preTokens, 936783);
  } finally { cleanup(dir, file); }
});

test('marks come back in file order whatever kind they are', () => {
  const { dir, file } = makeTranscript([
    reply('2026-09-10T10:00:00.000Z'),
    failedTool('2026-09-10T10:00:01.000Z'),
    reply('2026-09-10T10:00:02.000Z'),
    prompt('2026-09-10T10:00:03.000Z'),
    boundary({ timestamp: '2026-09-10T10:00:04.000Z' }),
  ]);
  try {
    const { marks } = readSessionLandmarks(file);
    const order = marks.map(m => m.index);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  } finally { cleanup(dir, file); }
});

test('a transcript with nothing to mark reports an empty rail', () => {
  const { dir, file } = makeTranscript([reply('2026-09-10T10:00:00.000Z')]);
  try {
    const { total, marks } = readSessionLandmarks(file);
    assert.equal(total, 1);
    assert.deepEqual(marks, []);
  } finally { cleanup(dir, file); }
});

// A rail is a few hundred pixels tall; a session that failed hundreds of times
// still has to draw as a shape rather than as a solid bar.
test('more marks of one kind than the rail can draw are thinned', () => {
  const records = [];
  for (let i = 0; i < 400; i++) {
    const at = new Date(Date.UTC(2026, 8, 10, 10, 0, i)).toISOString();
    records.push(reply(at));
    records.push(failedTool(at));
  }
  const { dir, file } = makeTranscript(records);
  try {
    const errors = kinds(readSessionLandmarks(file).marks, 'error');
    assert.ok(errors.length <= 90, `expected at most 90 notches, got ${errors.length}`);
    assert.ok(errors.length > 40, 'thinning must keep the shape, not just a handful');
    assert.deepEqual(errors, [...errors].sort((a, b) => a - b));
  } finally { cleanup(dir, file); }
});

// ── Anchoring a trimmed chat ──────────────────────────────────────

test('a timestamp resolves to the first record at or after it', () => {
  const { dir, file } = makeTranscript([
    reply('2026-09-10T10:00:00.000Z'),
    reply('2026-09-10T10:00:10.000Z'),
    reply('2026-09-10T10:00:20.000Z'),
    reply('2026-09-10T10:00:30.000Z'),
  ]);
  try {
    assert.equal(recordIndexAtTime(file, Date.parse('2026-09-10T10:00:20.000Z')).index, 2);
    assert.equal(recordIndexAtTime(file, Date.parse('2026-09-10T10:00:15.000Z')).index, 2);
    assert.equal(recordIndexAtTime(file, Date.parse('2026-09-10T09:00:00.000Z')).index, 0);
    assert.equal(recordIndexAtTime(file, Date.parse('2026-09-10T11:00:00.000Z')).index, 4);
    assert.equal(recordIndexAtTime(file, Date.parse('2026-09-10T10:00:20.000Z')).total, 4);
  } finally { cleanup(dir, file); }
});

// `custom-title` and `ai-title` records carry no timestamp of their own. They
// must not be able to stall the search or land on the wrong side of it.
test('records without a timestamp take the time of the next one that has one', () => {
  const { dir, file } = makeTranscript([
    reply('2026-09-10T10:00:00.000Z'),
    { type: 'custom-title', customTitle: 'named', sessionId: 'x' },
    { type: 'ai-title', aiTitle: 'titled', sessionId: 'x' },
    reply('2026-09-10T10:00:30.000Z'),
  ]);
  try {
    // 10:00:30 is record 3, and the two untimed records above it belong to it.
    assert.equal(recordIndexAtTime(file, Date.parse('2026-09-10T10:00:30.000Z')).index, 1);
    assert.equal(recordIndexAtTime(file, Date.parse('2026-09-10T10:00:00.000Z')).index, 0);
  } finally { cleanup(dir, file); }
});

test('an empty transcript anchors at nothing rather than throwing', () => {
  const { dir, file } = makeTranscript([]);
  try {
    assert.deepEqual(recordIndexAtTime(file, Date.now()), { index: 0, total: 0 });
    assert.deepEqual(readSessionLandmarks(file), { total: 0, marks: [] });
  } finally { cleanup(dir, file); }
});

test('an unreadable timestamp does not become an anchor', () => {
  const { dir, file } = makeTranscript([reply('2026-09-10T10:00:00.000Z')]);
  try {
    assert.equal(recordIndexAtTime(file, NaN).index, 1);
    assert.equal(recordIndexAtTime(file, undefined).index, 1);
  } finally { cleanup(dir, file); }
});
