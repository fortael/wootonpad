// tray-status.js — the menu-bar status light: what it says, and what it looks like.
//
// Three states, one glance:
//
//   idle      nothing working, nothing waiting — a thin ring
//   working   at least one session in a turn — the ring with an arc that turns
//   waiting   at least one session blocked on you — a filled orange disc with
//             an exclamation mark, and it wins over working: blocked work is
//             the thing to go and do something about
//
// Beside it, the count that matters for that state. The menu under it lists
// the sessions by name, waiting first.
//
// The icons are drawn here, pixel by pixel, rather than shipped as files: they
// are three shapes and a handful of spinner frames, and drawing them keeps the
// set in one place with the rules that pick between them. Pure — main.js turns
// the buffers into NativeImages and owns the Tray.

/** @typedef {{ sessionId: string, state: string, updatedAt?: number }} Snapshot */

/**
 * The light's state from every session's status.
 *
 * @param {Snapshot[]} snapshots
 * @param {(id: string) => boolean} isLive  still running in this app — a dead
 *   session's last word is not something to show as current
 */
function summarize(snapshots, isLive = () => true) {
  const working = [];
  const waiting = [];
  for (const s of snapshots || []) {
    if (!s?.sessionId || !isLive(s.sessionId)) continue;
    if (s.state === 'requires_action') waiting.push(s);
    else if (s.state === 'running') working.push(s);
  }
  const byAge = (a, b) => (a.updatedAt || 0) - (b.updatedAt || 0);
  waiting.sort(byAge);
  working.sort(byAge);
  const state = waiting.length ? 'waiting' : working.length ? 'working' : 'idle';
  return { state, working, waiting };
}

/** The text beside the icon — a count, or nothing when there is nothing on. */
function trayTitle(summary) {
  if (summary.state === 'waiting') return ` ${summary.waiting.length}`;
  if (summary.state === 'working') return ` ${summary.working.length}`;
  return '';
}

/** The tooltip: both counts, in words. */
function trayTooltip(summary) {
  const parts = [];
  if (summary.waiting.length) parts.push(`${summary.waiting.length} waiting for you`);
  if (summary.working.length) parts.push(`${summary.working.length} working`);
  return parts.length ? `WootonPad — ${parts.join(' · ')}` : 'WootonPad — nothing running';
}

// ── Drawing ───────────────────────────────────────────────────────
//
// 32×32 at scale factor 2 — the menu bar's 16pt. Each pixel's coverage is
// sampled 4×4 so the curves come out smooth. BGRA, premultiplied, the layout
// nativeImage.createFromBitmap reads.

const SIZE = 32;
const SAMPLES = 4;
const FRAMES = 12;

function draw(shape, [r, g, b]) {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  const c = SIZE / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = x + (sx + 0.5) / SAMPLES - c;
          const py = y + (sy + 0.5) / SAMPLES - c;
          hits += shape(px, py);
        }
      }
      const a = hits / (SAMPLES * SAMPLES);
      const i = (y * SIZE + x) * 4;
      buf[i] = Math.round(b * a);
      buf[i + 1] = Math.round(g * a);
      buf[i + 2] = Math.round(r * a);
      buf[i + 3] = Math.round(255 * a);
    }
  }
  return buf;
}

const ring = (inner, outer) => (x, y) => {
  const d = Math.hypot(x, y);
  return d >= inner && d <= outer ? 1 : 0;
};

/** Faint full ring plus a bright arc starting at `start` radians. */
function spinner(start) {
  const span = Math.PI * 0.6;
  return (x, y) => {
    const d = Math.hypot(x, y);
    if (d < 8.5 || d > 12.5) return 0;
    let a = Math.atan2(y, x) - start;
    a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return a <= span ? 1 : 0.35;
  };
}

/** A disc with an exclamation mark cut out of it. */
function alertDisc(x, y) {
  if (Math.hypot(x, y) > 13) return 0;
  const inBar = Math.abs(x) <= 1.6 && y >= -8 && y <= 2.5;
  const inDot = Math.hypot(x, y - 6.5) <= 1.9;
  return inBar || inDot ? 0 : 1;
}

/**
 * Every icon the light uses, as raw bitmaps. Idle and working are black —
 * macOS template images, recoloured for a dark or light menu bar. Waiting is
 * orange and stays orange: it is the one meant to catch the eye.
 *
 * @returns {{ idle: Buffer, waiting: Buffer, working: Buffer[], size: number, scaleFactor: number }}
 */
function drawIcons() {
  const black = [0, 0, 0];
  return {
    idle: draw(ring(9.5, 12), black),
    waiting: draw(alertDisc, [242, 136, 75]),
    working: Array.from({ length: FRAMES }, (_, i) => draw(spinner((i / FRAMES) * 2 * Math.PI - Math.PI / 2), black)),
    size: SIZE,
    scaleFactor: 2,
  };
}

module.exports = { summarize, trayTitle, trayTooltip, drawIcons, FRAMES };
