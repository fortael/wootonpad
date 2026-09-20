// buddy-scene.js — everything around the mascot that is not the robot itself.
//
// PixelBuddy.vue stands the robot — whichever design is picked
// (buddy-designs.js) — in a wider scene:
//
//   drones   one per live session, each hovering in a place of its own
//            beside the robot and weaving about it. A new session takes off
//            from over the robot's head and flies out to its place; a session
//            that ends flies away. Seven at most — more than that is a swarm
//            — and "+N" says how many more there are.
//   brain    how full Buddy's context is, filling from the bottom. Measured
//            against 200k whatever the model's own window — past that the
//            conversation is long enough to be worth a fresh one either way.
//   props    the magnifier the classic robot searches with — a pixel table,
//            like the robot itself.
//
// Pure: positions are functions of time, so nothing here holds a clock.

// ── The stage ────────────────────────────────────────────────────
//
// 40×20 scene units, six screen pixels each at full width. The classic
// robot's pixel is one unit; a detailed design's is half (buddy-designs.js),
// which is why it fits the same square while holding twice the detail.

export const STAGE = { w: 40, h: 20 };

/** The square the robot stands in, whichever design it is. */
export const ROBOT_AT = { x: 12, y: 2 };

/**
 * Where the drones hover: a place each, out of the robot's way — up the
 * sides, down by its feet, one over its shoulder. They do not circle it;
 * each holds its own spot and weaves about it (drift()).
 */
export const ANCHORS = [
  { x: 6.5, y: 9 },
  { x: 33.5, y: 8 },
  { x: 3.5, y: 14 },
  { x: 36, y: 13 },
  { x: 9, y: 18 },
  { x: 30.5, y: 18 },
  { x: 33, y: 3 },
];

/** Where a drone leaves the robot from — just over its head. */
export const LAUNCH_FROM = { x: 20, y: 2 };

export const LAUNCH_MS = 1400;
export const LEAVE_MS = 1100;
export const MAX_DRONES = 7;

// ── Context ──────────────────────────────────────────────────────

export const CONTEXT_CAP = 200_000;

/** "54k", "1.2M" — the count a gauge has room for. */
export function shortTokens(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v < 1000) return String(Math.round(v));
  if (v < 1e6) return `${Math.round(v / 1000)}k`;
  return `${(v / 1e6).toFixed(1)}M`;
}

/**
 * How full the brain is.
 *
 * @param {number|null|undefined} tokens  what the context holds now, or
 *   nothing yet — an unknown gauge is drawn empty and says so, not "0k"
 * @returns {{ known: boolean, tokens: number, fill: number, pct: number,
 *   level: 'low'|'mid'|'high'|'full', label: string, over: boolean }}
 */
export function contextGauge(tokens, cap = CONTEXT_CAP) {
  const known = tokens != null && Number.isFinite(Number(tokens)) && Number(tokens) > 0;
  const n = known ? Number(tokens) : 0;
  const fill = Math.min(1, n / cap);
  const pct = Math.round(fill * 100);
  const level = fill >= 0.9 ? 'full' : fill >= 0.75 ? 'high' : fill >= 0.5 ? 'mid' : 'low';
  return { known, tokens: n, fill, pct, level, label: known ? shortTokens(n) : '—', over: n > cap };
}

// ── Drones ───────────────────────────────────────────────────────

/**
 * The sessions that fly, from the Active rail's rows (already in worklist
 * order: waiting, finished, working, idle). Only live ones — a drone is a
 * process in the air — and never a plain terminal, which is not a session.
 *
 * @param {Array<{ sessionId: string, status: string, session?: object }>} rows
 * @param {(id: string) => boolean} isLive
 * @param {(session: object) => string} titleOf
 * @returns {{ drones: Array<{ id: string, name: string, status: string }>, extra: number }}
 */
export function pickDrones(rows, isLive, titleOf, max = MAX_DRONES) {
  const flying = (rows || []).filter(r => r?.sessionId && isLive(r.sessionId) && r.session?.type !== 'terminal');
  return {
    drones: flying.slice(0, max).map(r => ({
      id: r.sessionId,
      name: titleOf(r.session || {}),
      status: r.status || 'idle',
    })),
    extra: Math.max(0, flying.length - max),
  };
}

/** The place drone `i` holds. Places and drones are both seven. */
export function anchorFor(i) {
  return ANCHORS[i % ANCHORS.length];
}

/**
 * Where a drone is at time `t`: its place, plus a slow figure-of-eight round
 * it, each drone out of step with the others. Weaving, not orbiting — it
 * stays where you last looked for it.
 */
export function drift(anchor, t, seed) {
  return {
    x: anchor.x + 1.3 * Math.sin(t / 1900 + seed * 6),
    y: anchor.y + 0.8 * Math.sin(t / 1450 + seed * 9),
  };
}

export const easeInOut = p => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2);

/**
 * Take-off: up off the robot's head first, then out to its place. A quadratic
 * curve pulled towards a point above the scene, which is what makes it climb
 * before it heads off rather than sliding there in a straight line.
 */
export function launchPoint(p, from, to) {
  const e = easeInOut(Math.min(1, Math.max(0, p)));
  const c = { x: from.x + (to.x - from.x) * 0.2, y: from.y - 6 };
  const u = 1 - e;
  return { x: u * u * from.x + 2 * u * e * c.x + e * e * to.x, y: u * u * from.y + 2 * u * e * c.y + e * e * to.y };
}

/** Leaving: up and away on the side it is already on, fading as it goes. */
export function leavePoint(p, from) {
  const e = Math.min(1, Math.max(0, p)) ** 2;
  const dir = from.x >= LAUNCH_FROM.x ? 1 : -1;
  return { x: from.x + dir * 18 * e, y: from.y - 16 * e, opacity: 1 - e };
}

// ── Pixel tables ─────────────────────────────────────────────────
//
// One character per pixel, '.' empty; the letter is the colour class the
// component gives it (px-<letter>).

/** Rows of characters → [x, y, class] for every drawn pixel. */
export function pixels(rows) {
  const out = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') out.push([x, y, c]); }));
  return out;
}

// A quadcopter seen side on, 11×5 at a detailed design's pixel (DETAIL): two
// rotors on masts (blades in two frames, spinning), arms, a body with its
// status light (drawn by the component at DRONE_LIGHT), legs.
export const DRONE_W = 11;
export const DRONE_H = 5;
export const DRONE_LIGHT = { x: 5, y: 3 };
export const DRONE_ROTORS = [pixels(['rrrrr.rrrrr']), pixels(['..r.....r..'])];
export const DRONE_BODY = pixels([
  '...........',
  '..k.....k..',
  '.kkkbbbkkk.',
  '...kbbbk...',
  '...k...k...',
]);

// The brain, 13×8 at a detailed pixel, in the very corner of the scene: a
// bumpy outline, folds ('f'), a stem, and the tissue ('p') that fills with
// context from the bottom up.
export const BRAIN_AT = { x: 0.5, y: 0.5 };
export const BRAIN_W = 13;
export const BRAIN_H = 8;
export const BRAIN = pixels([
  '..kk.kkk.kk..',
  '.kppkpppkppk.',
  'kppfppfppfppk',
  'kpfpppfpppfpk',
  'kppfppfppfppk',
  '.kppfppppppk.',
  '..kkkkpkkkk..',
  '......kk.....',
]);

/**
 * Which of the brain's tissue pixels are lit for a fill of 0..1: bottom row
 * first, left to right, so the level rises smoothly rather than a row at a time.
 */
export function brainPixels(fill) {
  const tissue = BRAIN.filter(p => p[2] === 'p')
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const lit = Math.round(Math.min(1, Math.max(0, fill)) * tissue.length);
  const on = new Set(tissue.slice(0, lit).map(([x, y]) => `${x},${y}`));
  return BRAIN.map(([x, y, c]) => [x, y, c === 'p' ? (on.has(`${x},${y}`) ? 'p' : 'o') : c]);
}

// A magnifier held up to the right eye, in the robot's own coordinates: the
// ring round the eye and a handle down to the raised hand.
export const MAGNIFIER = [
  [10, 4, 'k'], [11, 4, 'k'], [9, 5, 'k'], [12, 5, 'k'],
  [9, 6, 'k'], [12, 6, 'k'], [10, 7, 'k'], [11, 7, 'k'],
  [12, 8, 't'], [13, 9, 't'],
];

// ── What a working robot acts out ────────────────────────────────

// Steps that look for something, by how buddy-activity.js words them.
const SEARCHING = /^(Searching|Looking|Peeking|Going through|Reading|Browsing|Finding|Checking)\b/;

/**
 * The kind of step Buddy is on, from the line in its bubble: 'think' while it
 * thinks (no tool yet, or one just came back), 'search' while a tool looks
 * something up, 'type' for everything else — it is writing or doing.
 */
export function busyMode(activity) {
  const a = String(activity || '');
  if (!a || a === 'Thinking') return 'think';
  if (SEARCHING.test(a)) return 'search';
  return 'type';
}
