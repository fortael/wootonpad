<template>
  <!-- Buddy: the Chat tab's mascot, a small pixel robot at the foot of the
       sidebar that acts out what the assistant is doing. Decorative — the
       header's status badge is the real signal — but it reacts: it types while
       the assistant works, waves for attention when a dialog is waiting on you,
       celebrates a finished turn, sleeps when stopped, fidgets when idle, and
       follows the pointer with its eyes. Everything is the robot itself — no
       particles. It talks only while it works: the bubble types out what it is
       doing right now, step by step, and is gone once it is idle again. -->
  <div
    class="sbx-buddy"
    :class="[`is-${state}`, action ? `act-${action.name}` : '']"
    @mouseenter="onHover"
    @click="onPoke"
  >
    <!-- Typed out a few letters a tick, like the robot is typing it; the dots
         run once the line is out and it is still at it. The bubble stays put
         between lines — only its text changes — so a run of quick tool calls
         reads as one train of thought, not a blinking label. -->
    <div class="sbx-buddy__speech">
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
        viewBox="0 0 16 16"
        shape-rendering="crispEdges"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
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
                 transform on each, so they do not fight over one property. -->
            <g :transform="`translate(${gaze} 0)`">
              <g class="sbx-buddy__eyes">
                <rect
                  v-for="(px, i) in eyes"
                  :key="'e' + i"
                  :x="px[0]" :y="px[1]" width="1" height="1"
                  class="px-e"
                />
              </g>
            </g>
          </g>
        </g>
      </svg>

    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { store } from '../store.js';

const props = defineProps({
  // 'idle' | 'busy' | 'waiting' | 'stopped' — see ChatSidebarApp.vue.
  state: { type: String, default: 'idle' },
  // What the assistant is doing this moment, from its live messages —
  // buddy-activity.js. Only said while it is busy or waiting.
  activity: { type: String, default: '' },
});

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
};

const MOUTHS = {
  smile: [[6, 8], [9, 8], [7, 9], [8, 9]],
  open: [[7, 8], [8, 8], [7, 9], [8, 9]],
  flat: [[6, 9], [7, 9], [8, 9], [9, 9]],
  worried: [[7, 8], [8, 8], [6, 9], [9, 9]],
  sleep: [[7, 9], [8, 9]],
};

const EYES = {
  open: [[5, 5], [5, 6], [10, 5], [10, 6]],
  wide: [[4, 5], [5, 5], [4, 6], [5, 6], [10, 5], [11, 5], [10, 6], [11, 6]],
  happy: [[4, 6], [5, 5], [6, 6], [9, 6], [10, 5], [11, 6]],
  shut: [[4, 6], [5, 6], [10, 6], [11, 6]],
};

// ── Actions ───────────────────────────────────────────────────────
//
// A short scripted animation that plays over the state's own loop. Each frame
// is [left arm, right arm, lift, mouth, eyes]; a frame lasts one tick.
const TICK_MS = 150;

function repeat(frames, times) {
  const out = [];
  for (let i = 0; i < times; i++) out.push(...frames);
  return out;
}

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
    // Eyes only — the gaze is scripted alongside.
    frames: repeat([['down', 'down', 0, 'smile', 'open']], 12),
    gaze: [-1, -1, -1, -1, 0, 0, 1, 1, 1, 1, 0, 0],
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

// Look twice as often as anything else: it is the least distracting.
const IDLE_ACTIONS = ['wave', 'stretch', 'hop', 'look', 'look'];

// Letters typed per tick — a short line is out in about half a second.
const TYPE_PER_TICK = 3;

// ── State ─────────────────────────────────────────────────────────

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

// The state's own loop, when no action is playing over it.
function stateFrame() {
  const f = frame.value;
  switch (props.state) {
    case 'busy':
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

// Busy scans, a scripted look follows its script, idle follows the pointer.
const gaze = computed(() => {
  const af = actionFrame.value;
  if (af?.def.gaze) return af.def.gaze[af.i] || 0;
  if (props.state === 'busy') return [0, -1, 0, 1][Math.floor(frame.value / 3) % 4];
  if (props.state === 'idle' && !af) return pointerGaze.value;
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

// ── Reactions ─────────────────────────────────────────────────────

// A turn that just ended is worth a little dance; one that just started gets
// straight to typing, which the busy loop already does.
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
});

onBeforeUnmount(() => {
  clearInterval(timer);
  window.removeEventListener('pointermove', onPointer);
});
</script>
