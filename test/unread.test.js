const test = require('node:test');
const assert = require('node:assert/strict');
const { unreadCount, formatUnread, mergeSeen } = require('../src/vue/unread.js');

test('unread is what arrived since it was last on screen', () => {
  assert.equal(unreadCount(12, 9), 3);
  assert.equal(unreadCount(9, 9), 0);
  assert.equal(unreadCount(5, 9), 0, 'a shrinking transcript is never negative');
  assert.equal(unreadCount(40, undefined), 0, 'never seen means not counted yet, not 40 unread');
});

test('past 99 the exact number stops mattering', () => {
  assert.equal(formatUnread(7), '7');
  assert.equal(formatUnread(99), '99');
  assert.equal(formatUnread(100), '99+');
});

test('the number is still coming only while the session works', () => {
  const { unreadStillComing } = require('../src/vue/unread.js');
  const { store } = require('../src/vue/store.js');
  store.sessionBusyState = new Map([['busy', true], ['asking', true]]);
  store.attentionSessions = new Set(['asking']);
  store.responseReadySessions = new Set(['done']);
  store.readPendingSessions = new Set();
  assert.equal(unreadStillComing('busy'), true, 'mid-turn: grey');
  assert.equal(unreadStillComing('asking'), false, 'waiting on you outranks busy: accent');
  assert.equal(unreadStillComing('done'), false, 'finished turn: accent');
  assert.equal(unreadStillComing('quiet'), false, 'nothing running: accent');
});

test('baselines from two windows merge to the furthest read, and say what the database lacks', () => {
  const { merged, ahead } = mergeSeen({ a: 894, b: 10, c: 5 }, { a: 212, b: 40, d: 7 });
  assert.deepEqual(merged, { a: 894, b: 40, c: 5, d: 7 });
  assert.deepEqual(ahead.sort(), ['a', 'c']);
  assert.deepEqual(mergeSeen(null, null), { merged: {}, ahead: [] });
});
