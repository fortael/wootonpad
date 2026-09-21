<template>
  <!-- Buddy: the Chat tab's mascot, a small pixel robot at the foot of the
       sidebar that acts out what the assistant is doing. Decorative — the
       header's status badge is the real signal — but it reacts: it types while
       the assistant works, holds a magnifier up while it searches, waves for
       attention when a dialog is waiting on you, celebrates a finished turn,
       sleeps when stopped, and when idle looks about, fidgets and follows the
       pointer — or a passing drone — with its eyes. Every other design is
       rigged instead of drawn pose by pose (buddy-rig.js): the same states,
       acted out by a body that leans, hops, blinks and talks.

       Round it (buddy-scene.js): a drone for every live session, each hovering
       in a place of its own; a new one takes off from the robot, one that ends
       flies away. Beside it, a brain that fills with Buddy's context.

       It talks only while it works: the bubble types out what it is doing
       right now, step by step, and is gone once it is idle again. -->
  <div
    class="sbx-buddy"
    :class="[`is-${state}`, `art-${design}`, action ? `act-${action.name}` : '']"
    @mouseenter="onHover"
    @click="onPoke"
  >
    <!-- Typed out a few letters a tick, like the robot is typing it; the dots
         run once the line is out and it is still at it. The bubble stays put
         between lines — only its text changes — so a run of quick tool calls
         reads as one train of thought, not a blinking label. -->
    <div v-if="!bare" class="sbx-buddy__speech">
      <Transition name="sbx-buddy-bubble">
        <div v-if="line" class="sbx-buddy__bubble">
          <span>{{ line.slice(0, typed) }}</span><span
            v-if="typed < line.length"
            class="sbx-buddy__caret"
          >▍</span><span
            v-else-if="state === 'busy' && !actionFrame"
            class="sbx-buddy__dots"
          ><i>.</i><i>.</i><i>.</i></span>
        </div>
      </Transition>
    </div>

    <div class="sbx-buddy__stage">
      <svg
        ref="artRef"
        class="sbx-buddy__art"
        :viewBox="`0 0 ${STAGE.w} ${STAGE.h}`"
        shape-rendering="crispEdges"
        xmlns="http://www.w3.org/2000/svg"
      >
        <!-- Context: the brain fills from the bottom, 200k to the brim. -->
        <g
          v-if="showBrain"
          class="sbx-buddy__brain"
          :class="[`is-${gauge.level}`, { 'is-unknown': !gauge.known }]"
          :transform="`translate(${BRAIN_AT.x} ${BRAIN_AT.y}) scale(${DETAIL})`"
        >
          <title>{{ contextTitle }}</title>
          <rect v-for="(px, i) in brain" :key="i" :x="px[0]" :y="px[1]" width="1" height="1" :class="`px-${px[2]}`" />
        </g>
        <text
          v-if="showBrain"
          class="sbx-buddy__caption"
          :x="BRAIN_AT.x + (BRAIN_W * DETAIL) / 2"
          :y="BRAIN_AT.y + BRAIN_H * DETAIL + 2.2"
          text-anchor="middle"
        >{{ gauge.label }}</text>

        <!-- A design other than the classic robot: one sprite, rigged. The
             body leans and hops as a whole; the eyes blink, look about and
             shut; the jaw moves while it works; the lights blink. -->
        <g
          v-if="art"
          :transform="`translate(${ROBOT_AT.x + rig.lean * DETAIL} ${ROBOT_AT.y + rig.hop * DETAIL}) scale(${DETAIL})`"
          :style="artPalette"
          :opacity="rig.dim ? 0.55 : 1"
          aria-hidden="true"
        >
          <g class="sbx-buddy__bob">
            <rect
              v-for="(px, i) in art.body"
              :key="'a' + i"
              :x="px[0]" :y="px[1]" width="1" height="1"
              :class="`px-${px[2]}`"
            />
            <g v-if="!rig.shut" :transform="`translate(${rig.gaze} 0)`">
              <rect
                v-for="(px, i) in art.eyes"
                :key="'e' + i"
                :x="px[0]" :y="px[1]" width="1" height="1"
                :class="`px-${px[2]}`"
              />
            </g>
            <rect
              v-for="(line, i) in art.shutEyes"
              v-else
              :key="'s' + i"
              :x="line.x" :y="line.y" :width="line.w" height="1"
              class="px-k"
            />
            <g :transform="`translate(0 ${rig.mouthDrop})`">
              <rect
                v-for="(px, i) in art.mouth"
                :key="'m' + i"
                :x="px[0]" :y="px[1]" width="1" height="1"
                class="px-m"
              />
            </g>
            <g :opacity="rig.lit ? 1 : 0.3">
              <rect
                v-for="(px, i) in art.lights"
                :key="'l' + i"
                :x="px[0]" :y="px[1]" width="1" height="1"
                :class="`px-${px[2]}`"
              />
            </g>
          </g>
        </g>

        <!-- The classic robot: drawn pose by pose, so it can act. -->
        <g v-else :transform="`translate(${ROBOT_AT.x} ${ROBOT_AT.y})`" aria-hidden="true">
          <g class="sbx-buddy__bob">
            <g :transform="`translate(0 ${lift})`">
              <rect
                v-for="(px, i) in BODY"
                :key="'b' + i"
                :x="px[0]" :y="px[1]" width="1" height="1"
                :class="`px-${px[2]}`"
              />
              <rect class="px-a sbx-buddy__antenna" x="7" y="1" width="2" height="1" />
              <rect
                v-for="(px, i) in pose"
                :key="'p' + i"
                :x="px[0]" :y="px[1]" width="1" height="1"
                :class="`px-${px[2]}`"
              />
              <rect
                v-for="(px, i) in mouth"
                :key="'m' + i"
                :x="px[0]" :y="px[1]" width="1" height="1"
                class="px-m"
              />
              <!-- Two layers: the outer one moves with the gaze (an attribute,
                   set from here), the inner one blinks (a CSS animation) — a
                   transform on each, so they do not fight over one property.
                   The magnifier is held to the eye, so it moves with it. -->
              <g :transform="`translate(${gaze} 0)`">
                <g class="sbx-buddy__eyes">
                  <rect
                    v-for="(px, i) in eyes"
                    :key="'e' + i"
                    :x="px[0]" :y="px[1]" width="1" height="1"
                    class="px-e"
                  />
                </g>
                <template v-if="prop === 'magnifier'">
                  <rect
                    v-for="(px, i) in MAGNIFIER"
                    :key="'g' + i"
                    :x="px[0]" :y="px[1]" width="1" height="1"
                    :class="`px-${px[2]}`"
                  />
                </template>
              </g>
            </g>
          </g>
        </g>

        <!-- Over its head: it wants you. -->
        <g v-if="marked" class="sbx-buddy__mark">
          <rect class="px-a" x="28" y="2" width="1" height="3" />
          <rect class="px-a" x="28" y="6" width="1" height="1" />
        </g>

        <!-- A drone per live session, each hovering in its own place. -->
        <g
          v-for="d in (showDrones ? drones : [])"
          :key="d.id"
          class="sbx-buddy__drone"
          :transform="`translate(${d.x} ${d.y}) scale(${DETAIL})`"
          :opacity="d.opacity"
          @click.stop="emit('open-session', d.id)"
        >
          <title>{{ d.title }}</title>
          <rect v-for="(px, i) in d.pixels" :key="i" :x="px[0]" :y="px[1]" width="1" height="1" :class="`px-${px[2]}`" />
          <rect class="sbx-buddy__dronelight" :class="`is-${d.status}`" :x="DRONE_LIGHT.x" :y="DRONE_LIGHT.y" width="1" height="1" />
        </g>

        <text
          v-if="extraDrones && showDrones"
          class="sbx-buddy__caption sbx-buddy__extra"
          :x="STAGE.w - 0.5"
          :y="STAGE.h - 0.5"
          text-anchor="end"
        >+{{ extraDrones }}<title>{{ extraDrones }} more running</title></text>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { store } from '../store.js';
import {
  STAGE, ROBOT_AT, LAUNCH_FROM, LAUNCH_MS, LEAVE_MS, CONTEXT_CAP,
  BRAIN_AT, BRAIN_W, BRAIN_H, MAGNIFIER,
  DRONE_BODY, DRONE_ROTORS, DRONE_W, DRONE_H, DRONE_LIGHT,
  ANCHORS, contextGauge, brainPixels, anchorFor, drift, launchPoint, leavePoint, busyMode, pixels,
} from '../buddy-scene.js';
import { DESIGNS, DETAIL, designById } from '../buddy-designs.js';
import { splitSprite, eyeLines, rigPose } from '../buddy-rig.js';

const props = defineProps({
  // 'idle' | 'busy' | 'waiting' | 'stopped' — see ChatSidebarApp.vue.
  state: { type: String, default: 'idle' },
  // What the assistant is doing this moment, from its live messages —
  // buddy-activity.js. Only said while it is busy or waiting.
  activity: { type: String, default: '' },
  // The live sessions, as drones: [{ id, name, status }] — pickDrones().
  sessions: { type: Array, default: () => [] },
  // How many more are live than the ring shows.
  extraDrones: { type: Number, default: 0 },
  // Tokens in Buddy's context now, or null while nobody has asked yet.
  contextTokens: { type: Number, default: null },
  // Overrides the chosen design — for the preview in Settings, which has to
  // show what is being picked rather than what is in force.
  design: { type: String, default: '' },
  // A preview draws the robot and nothing else: no brain, no drones, no
  // speech. They belong to the sidebar it normally lives in.
  bare: { type: Boolean, default: false },
});
const emit = defineEmits(['open-session']);

// Put away for now, not removed: flip either back to true and it is drawn
// again. With the drones off, sessions still start the launch wave — there
// is just nothing flying off.
const DRONES_ON = false;
const BRAIN_ON = false;
const showDrones = computed(() => DRONES_ON && !props.bare);
const showBrain = computed(() => BRAIN_ON && !props.bare);

// ── The drawing ───────────────────────────────────────────────────
//
// 16×16, one character per pixel: k outline · h head · s screen · b body ·
// t tie. Arms, mouth and eyes are drawn on top from the tables below, so they
// can change pose frame by frame — pixel creatures animate by swapping pixels,
// not by rotating them.
const MAP = [
  '................',
  '................',
  '.......kk.......',
  '...kkkkkkkkkk...',
  '..khhhhhhhhhhk..',
  '..khsssssssshk..',
  '..khsssssssshk..',
  '..khsssssssshk..',
  '..khsssssssshk..',
  '..khsssssssshk..',
  '..khhhhhhhhhhk..',
  '...kkkkkkkkkk...',
  '....kbbbbbbk....',
  '....kbbttbbk....',
  '....kbbttbbk....',
  '....kk....kk....',
];

const BODY = [];
MAP.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') BODY.push([x, y, c]); }));

// Arms, per side, in the head's colour so they read against both the body and
// the background; the hand is the outline colour, a dark mitten in the light
// theme and a light one in the dark. The shoulder is the pixel beside the
// body's top row.
const L = {
  down: [[3, 12, 'h'], [3, 13, 'h'], [3, 14, 'k']],
  out: [[3, 12, 'h'], [2, 12, 'h'], [1, 12, 'k']],
  up: [[3, 12, 'h'], [2, 11, 'h'], [1, 10, 'k']],
  high: [[3, 12, 'h'], [2, 11, 'h'], [1, 10, 'h'], [1, 9, 'k']],
  key: [[3, 12, 'h'], [3, 13, 'k']],
};
const R = {
  down: [[12, 12, 'h'], [12, 13, 'h'], [12, 14, 'k']],
  out: [[12, 12, 'h'], [13, 12, 'h'], [14, 12, 'k']],
  up: [[12, 12, 'h'], [13, 11, 'h'], [14, 10, 'k']],
  high: [[12, 12, 'h'], [13, 11, 'h'], [14, 10, 'h'], [14, 9, 'k']],
  wave: [[12, 12, 'h'], [13, 12, 'h'], [14, 11, 'k']],
  key: [[12, 12, 'h'], [12, 13, 'k']],
  // Hand to the chin, the corner under the head.
  chin: [[12, 12, 'h'], [13, 11, 'k']],
};

const MOUTHS = {
  smile: [[6, 8], [9, 8], [7, 9], [8, 9]],
  open: [[7, 8], [8, 8], [7, 9], [8, 9]],
  flat: [[6, 9], [7, 9], [8, 9], [9, 9]],
  worried: [[7, 8], [8, 8], [6, 9], [9, 9]],
  sleep: [[7, 9], [8, 9]],
  hmm: [[8, 9], [9, 9]],
};

const EYES = {
  open: [[5, 5], [5, 6], [10, 5], [10, 6]],
  wide: [[4, 5], [5, 5], [4, 6], [5, 6], [10, 5], [11, 5], [10, 6], [11, 6]],
  happy: [[4, 6], [5, 5], [6, 6], [9, 6], [10, 5], [11, 6]],
  shut: [[4, 6], [5, 6], [10, 6], [11, 6]],
  // One shut, one to the eyepiece.
  squint: [[4, 6], [5, 6], [10, 5], [10, 6]],
  // The right eye, big behind the magnifier.
  lens: [[5, 5], [5, 6], [10, 5], [11, 5], [10, 6], [11, 6]],
};

// ── Actions ───────────────────────────────────────────────────────
//
// A short scripted animation that plays over the state's own loop. Each frame
// is [left arm, right arm, lift, mouth, eyes]; a frame lasts one tick. An
// action may bring a prop, script the gaze, and show a "!" on some frames.
const TICK_MS = 150;

function repeat(frames, times) {
  const out = [];
  for (let i = 0; i < times; i++) out.push(...frames);
  return out;
}
const hold = (value, times) => Array(times).fill(value);

const ACTIONS = {
  wave: {
    frames: repeat([['down', 'up', 0, 'smile', 'open'], ['down', 'wave', 0, 'smile', 'open']], 5),
  },
  stretch: {
    frames: [
      ['out', 'out', 0, 'open', 'open'], ['out', 'out', 0, 'open', 'open'],
      ...repeat([['up', 'up', -1, 'open', 'shut']], 6),
      ['out', 'out', 0, 'smile', 'open'], ['out', 'out', 0, 'smile', 'open'],
    ],
  },
  hop: {
    frames: [
      ['down', 'down', 0, 'smile', 'open'], ['out', 'out', -1, 'open', 'open'],
      ['up', 'up', -2, 'open', 'happy'], ['out', 'out', -1, 'open', 'happy'],
      ['down', 'down', 0, 'smile', 'open'],
    ],
  },
  look: {
    // Left, a blink, right, back ahead — the gaze is scripted alongside.
    frames: [
      ...hold(['down', 'down', 0, 'smile', 'open'], 5),
      ['down', 'down', 0, 'smile', 'shut'],
      ...hold(['down', 'down', 0, 'smile', 'open'], 6),
      ...hold(['down', 'down', 0, 'hmm', 'open'], 4),
    ],
    gaze: [-1, -1, -1, -1, -1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  },
  launch: {
    // A session took off: arms up, and the drone rises out of its hands.
    line: 'Off you go!',
    frames: [
      ['up', 'up', 0, 'open', 'wide'], ['high', 'high', -1, 'open', 'happy'],
      ['high', 'high', -2, 'open', 'happy'], ['out', 'out', -1, 'smile', 'happy'],
      ['down', 'down', 0, 'smile', 'happy'], ['down', 'wave', 0, 'smile', 'open'],
      ['down', 'up', 0, 'smile', 'open'], ['down', 'wave', 0, 'smile', 'open'],
    ],
    gaze: [0, 0, 0, 0, 0, 1, 1, 1],
  },
  celebrate: {
    line: 'Done!',
    frames: repeat([
      ['up', 'up', -2, 'open', 'happy'], ['out', 'out', -1, 'open', 'happy'],
      ['up', 'up', 0, 'smile', 'happy'], ['high', 'high', -1, 'open', 'happy'],
    ], 3),
  },
  poke: {
    frames: [
      ['out', 'out', -1, 'open', 'wide'], ['up', 'up', -2, 'open', 'wide'],
      ['out', 'out', -1, 'smile', 'happy'], ['down', 'down', 0, 'smile', 'happy'],
      ['down', 'down', 0, 'smile', 'happy'],
    ],
  },
};

// Looking about twice as often as anything else: it is the least distracting.
const IDLE_ACTIONS = ['wave', 'stretch', 'hop', 'look', 'look'];

// Letters typed per tick — a short line is out in about half a second.
const TYPE_PER_TICK = 3;

// ── State ─────────────────────────────────────────────────────────

// Which robot it is: the one Settings → Buddy picked, or the one this
// component was handed (the preview in that very panel).
const design = computed(() => props.design || store.buddyDesign || 'classic');

/**
 * The chosen design as a rig — body, eyes, mouth, lights and the lines a
 * shut eye leaves — or null for the classic robot, which acts by swapping
 * whole poses instead.
 */
const art = computed(() => {
  const rows = designById(design.value).rows;
  if (!rows) return null;
  const parts = splitSprite(pixels(rows));
  return { ...parts, shutEyes: eyeLines(parts.eyes) };
});

/** What that body is doing this tick — buddy-rig.js. */
const rig = computed(() => rigPose({
  state: props.state,
  frame: frame.value,
  action: actionFrame.value ? action.value?.name : null,
  actionFrame: actionFrame.value?.i || 0,
  motion: designById(design.value).motion,
}));

/**
 * A design's own palette, as the colour variables the px- classes read. Set
 * on the sprite's own group, so it wins over the theme's colours and the
 * state's tint for that design alone.
 */
const artPalette = computed(() => {
  const palette = designById(design.value).palette;
  if (!palette) return null;
  return Object.fromEntries(Object.entries(palette).map(([letter, colour]) => [`--px-${letter}`, colour]));
});

const artRef = ref(null);
const frame = ref(0);
const action = ref(null);          // { name, start, line }
const pointerGaze = ref(0);
const typed = ref(0);
let nextIdleAt = 0;
let timer = null;

const reduceMotion = computed(() =>
  store.reduceMotion || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function play(name) {
  if (reduceMotion.value) return;
  const def = ACTIONS[name];
  if (!def) return;
  action.value = { name, start: frame.value, line: def.line || '' };
}

// Where the current action is, or null once it has run out.
const actionFrame = computed(() => {
  const a = action.value;
  if (!a) return null;
  const def = ACTIONS[a.name];
  const i = frame.value - a.start;
  return i < def.frames.length ? { def, i } : null;
});

// Working, the robot acts out the kind of step: thinking, searching, or
// typing — see busyMode().
const mode = computed(() => (props.state === 'busy' ? busyMode(props.activity) : null));

// The state's own loop, when no action is playing over it.
function stateFrame() {
  const f = frame.value;
  switch (props.state) {
    case 'busy':
      if (mode.value === 'think') return ['down', 'chin', 0, 'hmm', f % 24 === 0 ? 'shut' : 'open'];
      if (mode.value === 'search') return ['down', 'up', 0, 'flat', 'lens'];
      // Typing: the hands take turns on the keys.
      return f % 2 ? ['key', 'down', 0, 'flat', 'open'] : ['down', 'key', 0, 'flat', 'open'];
    case 'waiting':
      // A hand up, waving for attention, with a little hop now and then.
      return ['down', f % 2 ? 'high' : 'up', f % 6 === 0 ? -1 : 0, 'worried', 'wide'];
    case 'stopped':
      return ['down', 'down', 0, 'sleep', 'shut'];
    default:
      return ['down', 'down', 0, 'smile', 'open'];
  }
}

const current = computed(() => {
  const af = actionFrame.value;
  return af ? af.def.frames[af.i] : stateFrame();
});

const pose = computed(() => [...L[current.value[0]], ...R[current.value[1]]]);
const lift = computed(() => current.value[2]);
const mouth = computed(() => MOUTHS[current.value[3]]);
const eyes = computed(() => EYES[current.value[4]]);

// What it is holding, or what is beside it.
const prop = computed(() => {
  if (art.value) return null;                // a rigged design holds nothing
  const af = actionFrame.value;
  if (af) return af.def.prop || null;
  if (mode.value === 'search') return 'magnifier';
  return null;
});

const marked = computed(() => {
  if (art.value) return rig.value.mark;
  const af = actionFrame.value;
  return !!af?.def.mark?.includes(af.i);
});

// Where the eyes point: a scripted action's gaze, a scan while searching or
// typing, off to the side while thinking; idle, the pointer — or, with the
// pointer still, a drone passing in front.
const gaze = computed(() => {
  const af = actionFrame.value;
  if (af?.def.gaze) return af.def.gaze[af.i] || 0;
  if (props.state === 'busy') {
    if (mode.value === 'think') return 1;
    if (mode.value === 'search') return [-1, -1, 0, 1, 1, 0][Math.floor(frame.value / 2) % 6];
    return [0, -1, 0, 1][Math.floor(frame.value / 3) % 4];
  }
  if (props.state === 'idle' && !af) return pointerGaze.value || droneGaze.value;
  return 0;
});

// Nothing while idle or asleep. Working, it says the step it is on; waiting,
// what it needs you for. "Done!" at the end of a turn is the last word of the
// work, and goes with the celebration that plays it.
const line = computed(() => {
  if (actionFrame.value && action.value?.line) return action.value.line;
  if (props.state === 'busy') return props.activity || 'Thinking';
  if (props.state === 'waiting') {
    if (props.activity === 'Asking you') return 'Got a question for you';
    return props.activity ? `Need your OK — ${props.activity.toLowerCase()}` : 'Need your OK!';
  }
  return '';
});

// Every new line is typed out from its first letter.
watch(line, (now, before) => { if (now !== before) typed.value = reduceMotion.value ? now.length : 0; });

// ── Context ───────────────────────────────────────────────────────

const gauge = computed(() => contextGauge(props.contextTokens));
const brain = computed(() => brainPixels(gauge.value.fill));
const contextTitle = computed(() => {
  const g = gauge.value;
  if (!g.known) return 'Context: not measured yet';
  const head = `Context: ${g.tokens.toLocaleString()} tokens — ${g.pct}% of ${CONTEXT_CAP / 1000}k`;
  return g.over ? `${head}\nPast 200k: time for a new conversation` : head;
});

// ── Drones ────────────────────────────────────────────────────────
//
// One flight per drone, kept outside Vue's reach — positions are worked out
// per frame from the clock, and only `now` and `version` are reactive.

/** id → { id, name, status, seed, pos, anchor, launchStart, leaveStart, leaveFrom } */
const flights = new Map();
const version = ref(0);
const now = ref(performance.now());
const mountedAt = performance.now();
let lastLaunch = 0;

// A new session takes off only once the app has settled: the first list of
// live sessions, or a whole account's worth arriving at once, is not a dozen
// launches — those drones are simply already up.
const SETTLE_MS = 2500;
const MAX_AT_ONCE = 2;

function seedOf(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 1000) / 1000;
}

function positionOf(f, t) {
  if (f.leaveStart != null) {
    const lp = leavePoint((t - f.leaveStart) / LEAVE_MS, f.leaveFrom);
    return { x: lp.x, y: lp.y, opacity: lp.opacity };
  }
  if (f.launchStart != null && t < f.launchStart + LAUNCH_MS) {
    if (t < f.launchStart) return null;          // queued behind another take-off
    const to = drift(f.anchor, t, f.seed);
    f.pos = to;                                  // where it will be flying on from
    const lp = launchPoint((t - f.launchStart) / LAUNCH_MS, LAUNCH_FROM, to);
    return { x: lp.x, y: lp.y, opacity: 1 };
  }
  return { x: f.pos.x, y: f.pos.y, opacity: 1 };
}

const STATUS_WORDS = { waiting: 'waiting for you', running: 'working', done: 'finished a turn', idle: 'idle' };

watch(() => props.sessions, (list) => {
  const t = performance.now();
  const next = new Set(list.map(d => d.id));
  const arriving = list.filter(d => !flights.has(d.id));
  const leaving = [...flights.values()].filter(f => f.leaveStart == null && !next.has(f.id));
  const settled = t - mountedAt > SETTLE_MS && !reduceMotion.value;

  for (const f of leaving) {
    if (settled && leaving.length <= MAX_AT_ONCE) {
      const at = positionOf(f, t) || LAUNCH_FROM;
      f.leaveStart = t;
      f.leaveFrom = { x: at.x, y: at.y };
      setTimeout(() => { flights.delete(f.id); version.value++; }, LEAVE_MS);
    } else {
      flights.delete(f.id);
    }
  }

  const launch = settled && arriving.length <= MAX_AT_ONCE;
  for (const d of arriving) {
    let launchStart = null;
    if (launch) {
      launchStart = Math.max(t, lastLaunch + 400);
      lastLaunch = launchStart;
    }
    flights.set(d.id, {
      id: d.id, seed: seedOf(d.id), anchor: ANCHORS[0],
      pos: { ...LAUNCH_FROM }, launchStart, leaveStart: null, leaveFrom: null,
    });
  }
  if (launch && arriving.length) play('launch');

  // A place each, in the list's order: the ones waiting on you keep the same
  // spots as the list reorders. A drone that has just arrived without a
  // take-off is already there rather than sliding in from the robot.
  list.forEach((d, i) => {
    const f = flights.get(d.id);
    f.name = d.name;
    f.status = d.status;
    f.anchor = anchorFor(i);
    if (arriving.includes(d) && f.launchStart == null) f.pos = drift(f.anchor, performance.now(), f.seed);
  });
  version.value++;
}, { immediate: true, deep: true });

const drones = computed(() => {
  if (!showDrones.value) return [];
  version.value;
  const t = now.value;
  const out = [];
  for (const f of flights.values()) {
    const at = positionOf(f, t);
    if (!at) continue;
    const period = f.status === 'running' ? 60 : f.status === 'waiting' ? 90 : 160;
    const rotor = Math.floor(t / period + f.seed * 7) % 2;
    out.push({
      id: f.id,
      status: f.leaveStart != null ? 'leaving' : f.status,
      title: `${f.name} — ${STATUS_WORDS[f.status] || f.status}`,
      // Whole screen pixels (a drone's pixel is three), so it stays crisp.
      x: Math.round((at.x - (DRONE_W * DETAIL) / 2) * 12) / 12,
      y: Math.round((at.y - (DRONE_H * DETAIL) / 2) * 12) / 12,
      opacity: at.opacity,
      pixels: [...DRONE_ROTORS[rotor], ...DRONE_BODY],
    });
  }
  return out;
});

// Idle, with the pointer still, the eyes follow the nearest drone.
const droneGaze = computed(() => {
  const mid = ROBOT_AT.x + 8;
  const near = drones.value.find(d => Math.abs(d.x - mid) > 5);
  return near ? Math.sign(near.x - mid) : 0;
});

// Each drone leans towards where it should be, so it weaves rather than
// tracks its path exactly — and slides over when the places are dealt again.
function step(dt, t) {
  const k = Math.min(1, dt / 450);
  for (const f of flights.values()) {
    if (f.leaveStart != null || f.launchStart != null) continue;
    const want = drift(f.anchor, t, f.seed);
    f.pos.x += (want.x - f.pos.x) * k;
    f.pos.y += (want.y - f.pos.y) * k;
  }
}

// Frames only while the Buddy tab is on screen — the sidebar stays mounted
// behind other tabs. About thirty a second is plenty for pixel art.
let raf = 0;
let lastFrame = 0;
function loop(t) {
  raf = requestAnimationFrame(loop);
  if (t - lastFrame < 33) return;
  step(lastFrame ? t - lastFrame : 0, t);
  lastFrame = t;
  now.value = t;
}
const animating = computed(() => !reduceMotion.value && store.activeTab === 'chat');
function startFrames() { if (!raf) { lastFrame = 0; raf = requestAnimationFrame(loop); } }
function stopFrames() { cancelAnimationFrame(raf); raf = 0; }
watch(animating, on => (on ? startFrames() : stopFrames()));

// ── Reactions ─────────────────────────────────────────────────────

// A turn that just ended is worth a little dance; one that just started gets
// straight to work, which the busy loop already does.
watch(() => props.state, (now, before) => {
  if (before === 'busy' && now === 'idle') play('celebrate');
  scheduleIdle();
});

function onHover() {
  if (props.state === 'idle' && !actionFrame.value) play('wave');
}

function onPoke() {
  play('poke');
}

function scheduleIdle() {
  nextIdleAt = Date.now() + 6000 + Math.random() * 8000;
}

// The pointer, anywhere in the window: Buddy looks towards it, and back ahead
// once it has been still for a while.
let lastPointer = null;
function onPointer(event) { lastPointer = { x: event.clientX, at: Date.now() }; }

function updatePointerGaze() {
  const art = artRef.value;
  if (!art || !lastPointer || Date.now() - lastPointer.at > 4000) { pointerGaze.value = 0; return; }
  const rect = art.getBoundingClientRect();
  if (!rect.width) return;                       // tab not showing
  // The robot stands in the middle of the stage.
  const dx = lastPointer.x - (rect.left + rect.width / 2);
  pointerGaze.value = Math.abs(dx) < 50 ? 0 : Math.sign(dx);
}

function onTick() {
  frame.value++;
  if (action.value && !actionFrame.value) action.value = null;
  if (typed.value < line.value.length) typed.value = Math.min(line.value.length, typed.value + TYPE_PER_TICK);
  if (reduceMotion.value) return;
  updatePointerGaze();
  if (props.state === 'idle' && !action.value && Date.now() >= nextIdleAt) {
    play(IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)]);
    scheduleIdle();
  }
}

onMounted(() => {
  scheduleIdle();
  timer = setInterval(onTick, TICK_MS);
  window.addEventListener('pointermove', onPointer, { passive: true });
  if (animating.value) startFrames();
});

onBeforeUnmount(() => {
  clearInterval(timer);
  stopFrames();
  window.removeEventListener('pointermove', onPointer);
});
</script>
