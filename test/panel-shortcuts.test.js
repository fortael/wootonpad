const test = require('node:test');
const assert = require('node:assert/strict');
const { matchShortcut, formatShortcut, shortcutFor, PANEL_SHORTCUTS } = require('../src/vue/panel-shortcuts.js');

const key = (over = {}) => ({ key: 't', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over });

test('the modifier is Cmd on a Mac and Ctrl everywhere else', () => {
  assert.equal(matchShortcut(key({ metaKey: true }), true), 'shell');
  assert.equal(matchShortcut(key({ ctrlKey: true }), true), null, 'Ctrl on a Mac is a different gesture');
  assert.equal(matchShortcut(key({ ctrlKey: true }), false), 'shell');
  assert.equal(matchShortcut(key({ metaKey: true }), false), null);
});

test('every panel gets its key', () => {
  const at = (k, isMac = true) => matchShortcut(key({ key: k, metaKey: isMac, ctrlKey: !isMac }), isMac);
  assert.equal(at('t'), 'shell');
  assert.equal(at('d'), 'changes');
  assert.equal(at('o'), 'todos');
  assert.equal(at('b'), 'tasks');
  assert.equal(at('p'), 'containers');
  assert.equal(at(';'), 'stop');
});

test('a shift in the combination has to be a shift in the key', () => {
  assert.equal(matchShortcut(key({ key: 'h', metaKey: true, shiftKey: true }), true), 'hide');
  assert.equal(matchShortcut(key({ key: 'h', metaKey: true }), true), null, 'plain Cmd+H is the OS hiding the app');
  assert.equal(matchShortcut(key({ key: 't', metaKey: true, shiftKey: true }), true), null);
});

// A capital letter is what the browser reports while Shift is down, and a
// keyboard layout may report either case.
test('the key is matched whatever case it arrives in', () => {
  assert.equal(matchShortcut(key({ key: 'T', metaKey: true }), true), 'shell');
  assert.equal(matchShortcut(key({ key: 'H', metaKey: true, shiftKey: true }), true), 'hide');
});

test('a modifier that is not part of the combination refuses it', () => {
  assert.equal(matchShortcut(key({ metaKey: true, altKey: true }), true), null);
  assert.equal(matchShortcut(key({ metaKey: true, ctrlKey: true }), true), null);
  assert.equal(matchShortcut(key({ ctrlKey: true, metaKey: true }), false), null);
});

test('an ordinary keystroke is not a shortcut', () => {
  assert.equal(matchShortcut(key(), true), null);
  assert.equal(matchShortcut(key({ key: 'z', metaKey: true }), true), null);
  assert.equal(matchShortcut(null, true), null);
  assert.equal(matchShortcut({}, true), null);
});

// ⌘K is the command palette and ⌘H is "Hide WootonPad" — neither is ours to
// take, and the pair this file avoids is the whole reason it documents itself.
test('the two keys that were already spoken for are not claimed', () => {
  assert.equal(matchShortcut(key({ key: 'k', metaKey: true }), true), null);
  assert.equal(matchShortcut(key({ key: 'h', metaKey: true }), true), null);
});

test('the label is written the way the platform writes it', () => {
  assert.equal(formatShortcut('changes', true), '⌘D');
  assert.equal(formatShortcut('changes', false), 'Ctrl+D');
  assert.equal(formatShortcut('hide', true), '⇧⌘H');
  assert.equal(formatShortcut('hide', false), 'Ctrl+Shift+H');
  assert.equal(formatShortcut('stop', true), '⌘;');
  assert.equal(formatShortcut('nothing', true), '');
  assert.equal(formatShortcut(null, true), '');
});

test('every shortcut is unique', () => {
  const seen = new Set(PANEL_SHORTCUTS.map(s => `${s.shift ? 'S' : ''}${s.key}`));
  assert.equal(seen.size, PANEL_SHORTCUTS.length);
  assert.ok(shortcutFor('shell'));
});
