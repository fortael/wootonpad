const test = require('node:test');
const assert = require('node:assert/strict');
const { unreadCount, formatUnread } = require('../src/vue/unread.js');

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
