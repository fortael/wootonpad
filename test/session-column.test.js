const test = require('node:test');
const assert = require('node:assert/strict');
const {
  columnOf, mostUrgent, worstColumn, wantsAttention, unreadSessions, OPEN_ORDER,
} = require('../src/vue/session-column.js');

const state = (over = {}) => ({
  attention: new Set(over.attention || []),
  busy: new Map((over.busy || []).map(id => [id, true])),
  responseReady: new Set(over.responseReady || []),
  readPending: new Set(over.readPending || []),
  ...(over.raw || {}),
});

const at = (sessionId, minutesAgo) => ({
  sessionId,
  modified: new Date(Date.now() - minutesAgo * 60000).toISOString(),
});

// ── Placement ─────────────────────────────────────────────────────

test('a session with nothing on it is idle', () => {
  assert.equal(columnOf('a', state()), 'idle');
});

test('blocked on the user outranks everything else', () => {
  const s = state({ attention: ['a'], busy: ['a'], responseReady: ['a'] });
  assert.equal(columnOf('a', s), 'waiting');
});

// A session you read and then sent back to work is working, not finished.
test('running outranks a turn that was already read', () => {
  assert.equal(columnOf('a', state({ busy: ['a'], readPending: ['a'] })), 'running');
});

test('a finished turn is done whether it was read or not', () => {
  assert.equal(columnOf('a', state({ responseReady: ['a'] })), 'done');
  assert.equal(columnOf('a', state({ readPending: ['a'] })), 'done');
});

test('missing collections never throw', () => {
  assert.equal(columnOf('a', {}), 'idle');
});

// ── Which one to open ─────────────────────────────────────────────

// The whole point: a project with a dozen sessions has one holding a dialog,
// and clicking the project should land there rather than on the newest.
test('the session holding a dialog wins over a more recent one', () => {
  const sessions = [at('busy', 1), at('waiting', 90), at('quiet', 0)];
  const s = state({ attention: ['waiting'], busy: ['busy'] });
  assert.equal(mostUrgent(sessions, s).sessionId, 'waiting');
});

test('a finished turn is opened before one still being written', () => {
  const sessions = [at('busy', 0), at('done', 30)];
  assert.equal(mostUrgent(sessions, state({ busy: ['busy'], responseReady: ['done'] })).sessionId, 'done');
});

test('and a running one before an idle one', () => {
  const sessions = [at('idle', 0), at('busy', 60)];
  assert.equal(mostUrgent(sessions, state({ busy: ['busy'] })).sessionId, 'busy');
});

test('inside one lane the most recent wins', () => {
  const sessions = [at('old', 120), at('new', 2), at('mid', 40)];
  assert.equal(mostUrgent(sessions, state()).sessionId, 'new');
});

test('two sessions waiting: the one touched last', () => {
  const sessions = [at('first', 200), at('second', 5)];
  assert.equal(mostUrgent(sessions, state({ attention: ['first', 'second'] })).sessionId, 'second');
});

test('an empty or malformed list yields nothing rather than throwing', () => {
  assert.equal(mostUrgent([], state()), null);
  assert.equal(mostUrgent(undefined, state()), null);
  assert.equal(mostUrgent([null, {}], state()), null);
});

test('a session with no timestamp is still openable', () => {
  assert.equal(mostUrgent([{ sessionId: 'a' }], state()).sessionId, 'a');
});

// ── A project's status ────────────────────────────────────────────

test('a project takes the worst state anything in it is in', () => {
  const sessions = [at('a', 1), at('b', 2), at('c', 3)];
  assert.equal(worstColumn(sessions, state({ busy: ['a'] })), 'running');
  assert.equal(worstColumn(sessions, state({ busy: ['a'], attention: ['c'] })), 'waiting');
  assert.equal(worstColumn(sessions, state({ busy: ['a'], responseReady: ['b'] })), 'done');
  assert.equal(worstColumn(sessions, state()), 'idle');
});

// ── What the dock counts ──────────────────────────────────────────

// Opening a finished session is reading it. The card stays in DONE until you
// put it away, but a badge still counting it points at where you already are.
test('a finished turn stops counting the moment it is read', () => {
  const unread = wantsAttention(state({ responseReady: ['a'] }));
  assert.deepEqual(unread.done, ['a']);

  const read = wantsAttention(state({ readPending: ['a'] }));
  assert.deepEqual(read.done, []);
  // ...and it is still in DONE on the board.
  assert.equal(columnOf('a', state({ readPending: ['a'] })), 'done');
});

test('only blocked and finished sessions want anything', () => {
  const s = state({ attention: ['a'], busy: ['b'], responseReady: ['c'] });
  const { waiting, done } = wantsAttention(s);
  assert.deepEqual(waiting, ['a']);
  assert.deepEqual(done, ['c']);
});

// A session that is working wants nothing. Putting it on the dock would be a
// number you cannot act on.
test('a session in progress is counted in neither half', () => {
  const { waiting, done } = wantsAttention(state({ busy: ['a', 'b'] }));
  assert.deepEqual(waiting, []);
  assert.deepEqual(done, []);
});

// The reason this goes through columnOf rather than reading the sets: open a
// finished session, then send it back to work, and it sits in readPending and
// busy at once. The board calls that IN PROGRESS and so must the dock.
test('a finished session sent back to work stops being finished', () => {
  const { waiting, done } = wantsAttention(state({ readPending: ['a'], busy: ['a'] }));
  assert.deepEqual(done, []);
  assert.deepEqual(waiting, []);
});

test('a blocked session is counted once even when it is also marked busy', () => {
  const { waiting, done } = wantsAttention(state({ attention: ['a'], busy: ['a'], readPending: ['a'] }));
  assert.deepEqual(waiting, ['a']);
  assert.deepEqual(done, []);
});

test('a session in both sets counts once, because it is still unread', () => {
  const { done } = wantsAttention(state({ responseReady: ['a'], readPending: ['a', 'b'] }));
  assert.deepEqual(done, ['a']);   // 'b' has been read
});

test('nothing happening counts nothing', () => {
  const { waiting, done } = wantsAttention(state());
  assert.deepEqual(waiting, []);
  assert.deepEqual(done, []);
});

test('a missing state never throws', () => {
  assert.deepEqual(wantsAttention({}), { waiting: [], done: [] });
  assert.deepEqual(wantsAttention(undefined), { waiting: [], done: [] });
});

test('the open order puts an answer before a read and a read before work', () => {
  assert.ok(OPEN_ORDER.waiting < OPEN_ORDER.done);
  assert.ok(OPEN_ORDER.done < OPEN_ORDER.running);
  assert.ok(OPEN_ORDER.running < OPEN_ORDER.idle);
});

// ── The unread rail ───────────────────────────────────────────────
//
// The rail used to show one entry per project with a live PTY, which is a
// different question from the one the dock badge answers. The badge could read
// 1 with nothing on the rail accounting for it — "непонятно из-за какой
// сессии у нас единичка на доке". Both read unreadSessions/wantsAttention now.

const proj = (path, sessions) => ({ projectPath: path, sessions });
const sess = (sessionId, modified) => ({ sessionId, modified });

test('the rail shows exactly what the dock counts', () => {
  const s = state({ attention: ['a'], responseReady: ['b'], busy: ['c'], readPending: ['d'] });
  const projects = [proj('/x/one', [sess('a'), sess('b'), sess('c'), sess('d')])];

  const rows = unreadSessions(projects, s);
  const { waiting, done } = wantsAttention(s);

  assert.deepEqual(rows.map(r => r.sessionId).sort(), [...waiting, ...done].sort());
  // Working and already-read are not unread, on the rail or on the dock.
  assert.deepEqual(rows.map(r => r.sessionId).sort(), ['a', 'b']);
});

test('every unread session gets its own entry, never stacked per project', () => {
  const s = state({ attention: ['a', 'b'] });
  const rows = unreadSessions([proj('/x/one', [sess('a'), sess('b')])], s);
  assert.equal(rows.length, 2, 'two sessions of one project collapsed into one entry');
  assert.deepEqual(rows.map(r => r.project), ['one', 'one']);
});

test('waiting comes before done, and newer before older inside a band', () => {
  const s = state({ attention: ['w1', 'w2'], responseReady: ['d1'] });
  const rows = unreadSessions([proj('/x/one', [
    sess('d1', '2026-01-03'),
    sess('w1', '2026-01-01'),
    sess('w2', '2026-01-02'),
  ])], s);
  assert.deepEqual(rows.map(r => r.sessionId), ['w2', 'w1', 'd1']);
});

test('a session both blocked and finished is listed once, as blocked', () => {
  const s = state({ attention: ['a'], responseReady: ['a'] });
  const rows = unreadSessions([proj('/x/one', [sess('a')])], s);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'waiting');
});

test('each entry carries its project and the session itself', () => {
  const session = sess('a', '2026-01-01');
  const rows = unreadSessions([proj('/Users/me/Projects/thing', [session])], state({ attention: ['a'] }));
  assert.equal(rows[0].projectPath, '/Users/me/Projects/thing');
  assert.equal(rows[0].project, 'thing');
  assert.equal(rows[0].session, session, 'the row cannot open the session it names');
});

test('nothing unread is an empty list, not a missing one', () => {
  assert.deepEqual(unreadSessions([proj('/x/one', [sess('a')])], state({ busy: ['a'] })), []);
  assert.deepEqual(unreadSessions([], state({})), []);
  assert.deepEqual(unreadSessions(null, state({})), []);
});

// A session marked unread that no project claims cannot be drawn, and must not
// crash the rail on its way past.
test('an id with no session behind it is skipped', () => {
  const rows = unreadSessions([proj('/x/one', [sess('a')])], state({ attention: ['a', 'ghost'] }));
  assert.deepEqual(rows.map(r => r.sessionId), ['a']);
});
