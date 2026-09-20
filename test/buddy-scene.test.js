const test = require('node:test');
const assert = require('node:assert/strict');
const scene = require('../src/vue/buddy-scene.js');

test('the brain fills against 200k whatever the model window, and says when it is unknown', () => {
  assert.deepEqual(scene.contextGauge(null), { known: false, tokens: 0, fill: 0, pct: 0, level: 'low', label: '—', over: false });
  const g = scene.contextGauge(54_321);
  assert.equal(g.label, '54k');
  assert.equal(g.pct, 27);
  assert.equal(g.level, 'low');
  assert.equal(scene.contextGauge(124_000).level, 'mid');
  assert.equal(scene.contextGauge(160_000).level, 'high');
  assert.equal(scene.contextGauge(186_000).level, 'full');
  const over = scene.contextGauge(640_000);
  assert.equal(over.fill, 1, 'a 1M window still fills at 200k');
  assert.equal(over.over, true);
  assert.equal(over.label, '640k');
  assert.equal(scene.shortTokens(1_383), '1k');
  assert.equal(scene.shortTokens(2_400_000), '2.4M');
});

test('brain tissue lights from the bottom row up', () => {
  const tissue = scene.BRAIN.filter(p => p[2] === 'p').length;
  const lit = f => scene.brainPixels(f).filter(p => p[2] === 'p');
  assert.equal(lit(0).length, 0);
  assert.equal(lit(1).length, tissue);
  const half = lit(0.5);
  const lowest = Math.max(...scene.BRAIN.map(p => p[1]).filter((_, i) => scene.BRAIN[i][2] === 'p'));
  assert.ok(half.some(p => p[1] === lowest), 'the bottom goes first');
  assert.ok(!half.some(p => p[1] === 1), 'the top waits');
});

test('drones: live sessions only, no plain terminals, seven at most', () => {
  const rows = [
    { sessionId: 'w', status: 'waiting', session: { name: 'W' } },
    { sessionId: 'term', status: 'idle', session: { type: 'terminal' } },
    { sessionId: 'dead', status: 'done', session: {} },
    ...Array.from({ length: 8 }, (_, i) => ({ sessionId: `s${i}`, status: 'running', session: { name: `S${i}` } })),
  ];
  const { drones, extra } = scene.pickDrones(rows, id => id !== 'dead', s => s.name || '?');
  assert.equal(drones.length, 7);
  assert.equal(extra, 2);
  assert.deepEqual(drones[0], { id: 'w', name: 'W', status: 'waiting' }, 'worklist order kept');
  assert.ok(!drones.some(d => d.id === 'term' || d.id === 'dead'));
});

test('drones hold a place each and weave about it', () => {
  assert.equal(scene.ANCHORS.length, scene.MAX_DRONES, 'a place for every drone shown');
  assert.equal(scene.anchorFor(0), scene.ANCHORS[0]);
  assert.equal(scene.anchorFor(7), scene.ANCHORS[0], 'places are dealt round');

  const anchor = { x: 10, y: 10 };
  const seen = [0, 700, 1400, 2100, 2800].map(t => scene.drift(anchor, t, 0.3));
  for (const p of seen) {
    assert.ok(Math.abs(p.x - anchor.x) <= 1.3 && Math.abs(p.y - anchor.y) <= 0.8, 'never wanders off its spot');
  }
  assert.ok(new Set(seen.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size > 3, 'and never sits still');
  assert.notEqual(scene.drift(anchor, 0, 0.1).x, scene.drift(anchor, 0, 0.9).x, 'out of step with each other');
});

test('take-off leaves the robot, and a session that ends flies away', () => {
  const to = { x: 34, y: 13 };
  assert.deepEqual(scene.launchPoint(0, scene.LAUNCH_FROM, to), scene.LAUNCH_FROM);
  const end = scene.launchPoint(1, scene.LAUNCH_FROM, to);
  assert.ok(Math.abs(end.x - to.x) < 1e-9 && Math.abs(end.y - to.y) < 1e-9);
  assert.ok(scene.launchPoint(0.35, scene.LAUNCH_FROM, to).y < scene.LAUNCH_FROM.y, 'climbs off its head first');

  const gone = scene.leavePoint(1, { x: 35, y: 18 });
  assert.equal(gone.opacity, 0);
  assert.ok(gone.x > 35 && gone.y < 18, 'away on its own side, upwards');
  assert.ok(scene.leavePoint(1, { x: 4, y: 14 }).x < 4, 'the other side goes left');
});

test('a working robot thinks, searches, or types', () => {
  assert.equal(scene.busyMode(''), 'think');
  assert.equal(scene.busyMode('Thinking'), 'think');
  assert.equal(scene.busyMode('Searching “censor”'), 'search');
  assert.equal(scene.busyMode('Going through sessions'), 'search');
  assert.equal(scene.busyMode('Reading README.md'), 'search');
  assert.equal(scene.busyMode('Starting a session'), 'type');
  assert.equal(scene.busyMode('Writing a TODO'), 'type');
});

test('every design is a 32×32 sprite, and the classic robot is the one that acts', () => {
  const { DESIGNS, designById, DETAIL } = require('../src/vue/buddy-designs.js');
  assert.equal(DESIGNS[0].id, 'classic');
  assert.equal(DESIGNS[0].rows, null, 'the classic robot is drawn from its poses');
  assert.ok(DESIGNS.length > 1, 'several to choose between');
  assert.equal(new Set(DESIGNS.map(d => d.id)).size, DESIGNS.length, 'ids are unique');
  for (const d of DESIGNS.slice(1)) {
    assert.equal(d.rows.length, 32, d.id);
    assert.ok(d.rows.every(r => r.length === 32), d.id);
    assert.ok(scene.pixels(d.rows).length > 200, `${d.id} is not blank`);
    // Movement is asked for as a share of the usual, never more than it.
    for (const [part, share] of Object.entries(d.motion || {})) {
      assert.ok(share >= 0 && share <= 1, `${d.id} asks for ${share} of the ${part}`);
    }
    // A design that brings its own colours must have one for every letter it
    // draws with, or that letter falls back to the theme and clashes.
    if (!d.palette) continue;
    for (const [, , letter] of scene.pixels(d.rows)) {
      assert.ok(/^#[0-9a-f]{6}$/i.test(d.palette[letter] || ''), `${d.id} has no colour for '${letter}'`);
    }
  }
  assert.equal(designById('nope').id, 'classic', 'an unknown design falls back');
  // A design's pixel is half a unit, so 32 of them fill the robot's square.
  assert.equal(32 * DETAIL, 16);
});
