// buddy-rig.js — how a drawn robot moves, whatever it is drawn like.
//
// The classic 16×16 robot acts by swapping pixels: every pose is drawn, arm
// by arm (PixelBuddy.vue). Seven designs' worth of that is seven times the
// drawing, so the detailed ones (buddy-designs.js) are rigged instead: the
// sprite is cut into the parts that move — eyes, mouth, lights — and the rest
// is moved about as one body.
//
// It gives four things a body can do without new art:
//
//   blink   the eyes are hidden and a line is drawn across each, worked out
//           from where the eyes are
//   look    the eyes slide a pixel to one side
//   talk    the mouth drops a pixel, and back
//   move    the whole body leans, hops, or dims
//
// Poses are per state, one per tick, so a design animates the moment it is
// drawn — and it is all in scene pixels of the design itself, so a sprite's
// own scale is the component's business.
//
// Pure.

/** The letters that move on their own; everything else is the body. */
// 'e' is the eye itself, 'i' the pupil in it — both shut together, so a
// design whose pupil is a different colour still blinks as one eye.
const EYES = 'ei';
const MOUTH = 'm';
const LIGHTS = 'al';

/**
 * A sprite cut into its moving parts.
 *
 * @param {Array<[number, number, string]>} sprite  pixels, from buddy-scene's pixels()
 * @returns {{ body: Array, eyes: Array, mouth: Array, lights: Array }}
 */
export function splitSprite(sprite) {
  const all = sprite || [];
  return {
    body: all.filter(p => !EYES.includes(p[2]) && p[2] !== MOUTH && !LIGHTS.includes(p[2])),
    eyes: all.filter(p => EYES.includes(p[2])),
    mouth: all.filter(p => p[2] === MOUTH),
    lights: all.filter(p => LIGHTS.includes(p[2])),
  };
}

/**
 * A shut eye, per eye: the line the lid leaves. Eye pixels are grouped by
 * which side of the face they are on — anything more than a couple of pixels
 * apart is the other eye — and each group becomes one line across its middle.
 *
 * @param {Array<[number, number, string]>} eyes
 * @returns {Array<{ x: number, y: number, w: number }>}
 */
export function eyeLines(eyes) {
  if (!eyes?.length) return [];
  const byX = [...eyes].sort((a, b) => a[0] - b[0]);
  const groups = [[byX[0]]];
  for (const px of byX.slice(1)) {
    const group = groups[groups.length - 1];
    if (px[0] - group[group.length - 1][0] > 2) groups.push([px]);
    else group.push(px);
  }
  return groups.map(group => {
    const xs = group.map(p => p[0]);
    const ys = group.map(p => p[1]);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return {
      x: Math.min(...xs),
      y: Math.round((top + bottom) / 2),
      w: Math.max(...xs) - Math.min(...xs) + 1,
    };
  });
}

/**
 * What the body is doing this tick.
 *
 * @param {object} opts
 * @param {'idle'|'busy'|'waiting'|'stopped'} opts.state
 * @param {number} opts.frame      the mascot's tick counter
 * @param {string|null} [opts.action]  a scripted moment: celebrate, launch, poke
 * @param {number} [opts.actionFrame]  how far into it
 * @param {{ lean?: number, hop?: number }} [opts.motion]  how much of the
 *   body's movement this design wants. A robot on legs takes all of it; a
 *   blob leaning a pixel each way looks like it is being shaken, so Slime
 *   asks for none of the lean and half the hop (buddy-designs.js).
 * @returns {{ lean: number, hop: number, shut: boolean, gaze: number,
 *   mouthDrop: number, lit: boolean, dim: boolean, mark: boolean }}
 */
export function rigPose({ state, frame, action = null, actionFrame = 0, motion = null }) {
  const scale = { lean: 1, hop: 1, ...(motion || {}) };
  const pose = { lean: 0, hop: 0, shut: false, gaze: 0, mouthDrop: 0, lit: true, dim: false, mark: false };
  const damp = () => {
    pose.lean = Math.round(pose.lean * scale.lean);
    pose.hop = Math.round(pose.hop * scale.hop);
    return pose;
  };

  if (action) {
    // Every scripted moment is a bounce; what differs is how pleased it looks.
    const i = actionFrame;
    if (action === 'poke') {
      pose.hop = i < 1 ? 1 : i < 3 ? -2 : 0;         // knocked down, then up
      pose.shut = i < 1;
      return damp();
    }
    pose.hop = [-2, 0, -3, -1, -2, 0][i % 6];
    pose.lean = i % 4 < 2 ? -1 : 1;
    pose.mark = action === 'celebrate' && i % 4 < 2;
    return damp();
  }

  switch (state) {
    case 'busy':
      // Head down, working: a shuffle, a moving jaw, a blinking light. The
      // shuffle is slow on purpose — a pixel each way every other tick reads
      // as a fit, not as work.
      pose.lean = frame % 8 < 4 ? 0 : 1;
      pose.gaze = [-1, -1, 0, 1, 1, 0][Math.floor(frame / 3) % 6];
      pose.mouthDrop = frame % 2;
      pose.lit = frame % 4 < 2;
      break;
    case 'waiting':
      // Bouncing on the spot with a mark over its head: it needs you.
      pose.hop = frame % 6 < 3 ? -2 : 0;
      pose.lean = frame % 6 < 3 ? -1 : 1;
      pose.mark = frame % 4 < 3;
      pose.lit = frame % 2 === 0;
      break;
    case 'stopped':
      pose.shut = true;
      pose.lit = false;
      pose.dim = true;
      break;
    default:
      // Idle: a slow sway, a blink now and then, and a hop once in a while.
      pose.lean = Math.round(Math.sin(frame / 17));
      pose.shut = frame % 28 === 0;
      pose.gaze = Math.round(Math.sin(frame / 19));
      if (frame % 53 === 0) pose.hop = -2;
      break;
  }
  return damp();
}
