const test = require('node:test');
const assert = require('node:assert/strict');
const tray = require('../tray-status');

test('waiting wins over working, and dead sessions do not count', () => {
  const snaps = [
    { sessionId: 'a', state: 'running', updatedAt: 2 },
    { sessionId: 'b', state: 'requires_action', updatedAt: 1 },
    { sessionId: 'c', state: 'running', updatedAt: 1 },
    { sessionId: 'dead', state: 'requires_action' },
    { sessionId: 'd', state: 'idle' },
  ];
  const s = tray.summarize(snaps, id => id !== 'dead');
  assert.equal(s.state, 'waiting');
  assert.deepEqual(s.waiting.map(x => x.sessionId), ['b']);
  assert.deepEqual(s.working.map(x => x.sessionId), ['c', 'a'], 'longest-running first');
  assert.equal(tray.trayTitle(s), ' 1');
  assert.equal(tray.trayTooltip(s), 'WootonPad — 1 waiting for you · 2 working');
});

test('nothing on is idle, with no count', () => {
  const s = tray.summarize([{ sessionId: 'x', state: 'idle' }]);
  assert.equal(s.state, 'idle');
  assert.equal(tray.trayTitle(s), '');
  assert.equal(tray.trayTooltip(s), 'WootonPad — nothing running');
});

test('the icons are 16pt bitmaps at 2x, one per spinner frame', () => {
  const icons = tray.drawIcons();
  const bytes = 32 * 32 * 4;
  assert.equal(icons.idle.length, bytes);
  assert.equal(icons.waiting.length, bytes);
  assert.equal(icons.working.length, tray.FRAMES);
  for (const f of icons.working) assert.equal(f.length, bytes);
  const alpha = (buf, x, y) => buf[(y * 32 + x) * 4 + 3];
  assert.equal(alpha(icons.idle, 16, 16), 0, 'the ring is hollow');
  assert.equal(alpha(icons.waiting, 16, 16), 0, 'the exclamation mark is cut out of the disc');
  assert.equal(alpha(icons.waiting, 8, 16), 255, 'the disc beside it is solid');
  assert.notDeepEqual(icons.working[0], icons.working[3], 'the arc moves');
});
