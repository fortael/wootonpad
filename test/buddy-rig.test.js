const test = require('node:test');
const assert = require('node:assert/strict');
const { splitSprite, eyeLines, rigPose } = require('../src/vue/buddy-rig.js');
const { pixels } = require('../src/vue/buddy-scene.js');
const { DESIGNS } = require('../src/vue/buddy-designs.js');

test('a sprite comes apart into the bits that move', () => {
  const sprite = pixels([
    '.kkk.',
    'kesek',
    'k.m.k',
    '..a..',
  ]);
  const parts = splitSprite(sprite);
  assert.deepEqual(parts.eyes, [[1, 1, 'e'], [3, 1, 'e']]);
  assert.deepEqual(parts.mouth, [[2, 2, 'm']]);
  assert.deepEqual(parts.lights, [[2, 3, 'a']]);
  assert.ok(parts.body.every(p => !'ema'.includes(p[2])), 'the body keeps everything else');
  assert.equal(parts.body.length + parts.eyes.length + parts.mouth.length + parts.lights.length, sprite.length);
  assert.deepEqual(splitSprite(null).eyes, []);
});

test('a shut eye is one line per eye, across its middle', () => {
  const eyes = [
    [4, 6, 'e'], [5, 6, 'e'], [4, 7, 'e'], [5, 7, 'e'],      // left, 2×2
    [11, 6, 'e'], [12, 6, 'e'], [11, 7, 'e'], [12, 7, 'e'],  // right, far away
  ];
  assert.deepEqual(eyeLines(eyes), [
    { x: 4, y: 7, w: 2 },
    { x: 11, y: 7, w: 2 },
  ]);
  assert.deepEqual(eyeLines([]), []);
  assert.equal(eyeLines([[3, 3, 'e']]).length, 1, 'one eye is one line');
});

test('every design the rig has to move can be moved', () => {
  for (const d of DESIGNS.filter(x => x.rows)) {
    const parts = splitSprite(pixels(d.rows));
    assert.ok(parts.eyes.length, `${d.id} has eyes to blink`);
    const lines = eyeLines(parts.eyes).length;
    assert.ok(lines >= 1 && lines <= 2, `${d.id} shuts as one or two eyes, not ${lines}`);
    assert.ok(parts.body.length > 100, `${d.id} has a body`);
  }
});

test('each state moves differently, and a stopped one does not move at all', () => {
  const over = (state, n = 60) => Array.from({ length: n }, (_, frame) => rigPose({ state, frame }));

  const idle = over('idle');
  assert.ok(idle.some(p => p.lean !== 0) && idle.some(p => p.lean === 0), 'idle sways');
  assert.ok(idle.some(p => p.shut), 'and blinks');
  assert.ok(idle.every(p => !p.mark && !p.dim));

  const busy = over('busy');
  assert.ok(busy.some(p => p.mouthDrop === 1), 'working, the jaw moves');
  assert.ok(busy.some(p => !p.lit) && busy.some(p => p.lit), 'and the light blinks');

  const waiting = over('waiting');
  assert.ok(waiting.some(p => p.hop < 0), 'waiting bounces');
  assert.ok(waiting.some(p => p.mark), 'with a mark over its head');

  const stopped = rigPose({ state: 'stopped', frame: 7 });
  assert.deepEqual(stopped, { lean: 0, hop: 0, shut: true, gaze: 0, mouthDrop: 0, lit: false, dim: true, mark: false });
});

test('a design can ask for gentler movement', () => {
  const calm = { lean: 0, hop: 0.5 };
  const over = (state, motion) => Array.from({ length: 60 }, (_, frame) => rigPose({ state, frame, motion }));

  for (const state of ['idle', 'busy', 'waiting']) {
    assert.ok(over(state).some(p => p.lean !== 0), `${state} leans by default`);
    assert.ok(over(state, calm).every(p => p.lean === 0), `${state} does not lean when asked not to`);
  }
  const hops = over('waiting', calm).map(p => p.hop);
  assert.ok(hops.some(h => h === -1) && !hops.some(h => h < -1), 'and hops half as high');
  // Blinking, looking about and the light are not movement, so they stay.
  assert.ok(over('busy', calm).some(p => p.mouthDrop === 1));
  assert.ok(over('idle', calm).some(p => p.shut));
});

test('a scripted moment bounces; a poke knocks it down first', () => {
  const cheer = Array.from({ length: 6 }, (_, i) => rigPose({ state: 'idle', frame: i, action: 'celebrate', actionFrame: i }));
  assert.ok(cheer.some(p => p.hop <= -2), 'celebrating jumps');
  assert.ok(cheer.some(p => p.mark), 'and shows it');

  const poked = [0, 1, 2, 4].map(i => rigPose({ state: 'idle', frame: i, action: 'poke', actionFrame: i }));
  assert.equal(poked[0].hop, 1, 'down first');
  assert.equal(poked[0].shut, true);
  assert.ok(poked[1].hop < 0, 'then up');
  assert.equal(poked[3].hop, 0, 'then back');
});
