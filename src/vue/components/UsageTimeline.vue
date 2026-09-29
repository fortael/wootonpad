<template>
  <div ref="rootRef" class="ut" @mouseleave="hover = null">
    <svg
      v-if="width > 0"
      class="ut__svg"
      :width="width"
      :height="HEIGHT"
      :viewBox="`0 0 ${width} ${HEIGHT}`"
      @mousemove="onMove"
      @click="onClick"
    >
      <!-- grid -->
      <g class="ut__grid">
        <template v-for="v in [0, 25, 50, 75, 100]" :key="v">
          <line :x1="PAD_L" :x2="width - PAD_R" :y1="y(v)" :y2="y(v)" />
          <text class="ut__ylabel" :x="PAD_L - 8" :y="y(v) + 3">{{ v }}%</text>
        </template>
        <text
          v-for="t in xTicks"
          :key="t.ts"
          class="ut__xlabel"
          :x="x(t.ts)"
          :y="HEIGHT - 6"
        >{{ t.label }}</text>
      </g>

      <!-- the account's meter -->
      <path class="ut__line" :class="{ 'ut__line--muted': projectKey }" :d="linePath(accountY)" />
      <circle
        v-for="(p, i) in points"
        :key="'a' + p.ts"
        class="ut__dot"
        :class="{ 'ut__dot--muted': projectKey }"
        :cx="x(p.ts)"
        :cy="y(accountY[i])"
        r="4.5"
      />

      <!-- one project's running share of each window -->
      <!-- Only where it has any: a window the project spent nothing of would
           otherwise lay a row of dots along the zero line. -->
      <template v-if="projectKey">
        <path class="ut__line ut__line--project" :style="{ stroke: projectColor }" :d="linePath(projectY, true)" />
        <template v-for="(p, i) in points" :key="'p' + p.ts">
          <circle
            v-if="projectY[i] > 0"
            class="ut__dot ut__dot--project"
            :style="{ fill: projectColor }"
            :cx="x(p.ts)"
            :cy="y(projectY[i])"
            r="3.5"
          />
        </template>
      </template>

      <!-- selection and hover -->
      <template v-if="selectedIndex >= 0">
        <line class="ut__guide ut__guide--selected" :x1="x(points[selectedIndex].ts)" :x2="x(points[selectedIndex].ts)" :y1="PAD_T" :y2="HEIGHT - PAD_B" />
        <circle class="ut__ring" :cx="x(points[selectedIndex].ts)" :cy="y(focusY(selectedIndex))" r="7" />
      </template>
      <template v-if="hover !== null">
        <line class="ut__guide" :x1="x(points[hover].ts)" :x2="x(points[hover].ts)" :y1="PAD_T" :y2="HEIGHT - PAD_B" />
        <circle class="ut__ring ut__ring--hover" :cx="x(points[hover].ts)" :cy="y(focusY(hover))" r="7" />
      </template>
    </svg>

    <div
      v-if="hover !== null"
      class="ut__tip"
      :style="tipStyle"
    >
      <div class="ut__tip-time">{{ dateTime(points[hover].ts) }}</div>
      <div><b>{{ pct(points[hover].utilization) }}</b> used on the account</div>
      <div v-if="points[hover].delta > 0">+{{ pct(points[hover].delta) }} since {{ timeOfDay(points[hover].from) }}</div>
      <div v-if="projectKey">
        <span class="ut__tip-dot" :style="{ background: projectColor }"></span>
        {{ projectLabel }}: ≈{{ pct(projectY[hover]) }} of this window
      </div>
      <div v-if="points[hover].resetsAt" class="ut__tip-muted">resets {{ dateTime(points[hover].resetsAt) }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { pct, timeOfDay, dateTime, dayLabel } from '../usage-format.js';

const props = defineProps({
  points: { type: Array, required: true },
  from: { type: Number, required: true },
  to: { type: Number, required: true },
  projectKey: { type: String, default: '' },
  projectLabel: { type: String, default: '' },
  projectColor: { type: String, default: 'var(--indigo-400)' },
  selectedTs: { type: Number, default: 0 },
});
const emit = defineEmits(['select']);

const HEIGHT = 220;
const PAD_L = 44;
const PAD_R = 14;
const PAD_T = 10;
const PAD_B = 24;

const rootRef = ref(null);
const width = ref(0);
const hover = ref(null);
let observer = null;

onMounted(() => {
  const el = rootRef.value;
  if (!el) return;
  width.value = el.clientWidth;
  observer = new ResizeObserver(() => { width.value = el.clientWidth; });
  observer.observe(el);
});
onBeforeUnmount(() => observer?.disconnect());

function x(ts) {
  const span = Math.max(1, props.to - props.from);
  return PAD_L + ((ts - props.from) / span) * (width.value - PAD_L - PAD_R);
}
function y(v) {
  const clamped = Math.max(0, Math.min(100, v || 0));
  return PAD_T + (1 - clamped / 100) * (HEIGHT - PAD_T - PAD_B);
}

const accountY = computed(() => props.points.map(p => p.utilization));
const projectY = computed(() => props.points.map(p => (props.projectKey ? p.cum?.[props.projectKey] || 0 : 0)));
const focusY = (i) => (props.projectKey ? projectY.value[i] : accountY.value[i]);

// Joined only inside one window and across no gap — `joinPrev` says so.
// `positiveOnly` skips the stretches still at zero, for the project line.
function linePath(values, positiveOnly = false) {
  let d = '';
  for (let i = 1; i < props.points.length; i++) {
    if (!props.points[i].joinPrev) continue;
    if (positiveOnly && !(values[i] > 0)) continue;
    d += `M${x(props.points[i - 1].ts).toFixed(1)},${y(values[i - 1]).toFixed(1)}`
      + `L${x(props.points[i].ts).toFixed(1)},${y(values[i]).toFixed(1)}`;
  }
  return d;
}

const selectedIndex = computed(() => (props.selectedTs ? props.points.findIndex(p => p.ts === props.selectedTs) : -1));

// Hours for a day, days for anything longer; as many as fit.
const xTicks = computed(() => {
  const span = props.to - props.from;
  if (!width.value || span <= 0) return [];
  const room = Math.max(2, Math.floor((width.value - PAD_L - PAD_R) / 70));
  const out = [];
  if (span <= 36 * 3600000) {
    const stepH = [1, 2, 3, 4, 6, 12].find(h => span / (h * 3600000) <= room) || 12;
    const d = new Date(props.from);
    d.setMinutes(0, 0, 0);
    d.setHours(Math.ceil(d.getHours() / stepH) * stepH);
    for (let t = d.getTime(); t <= props.to; t += stepH * 3600000) {
      if (t >= props.from) out.push({ ts: t, label: timeOfDay(t) });
    }
  } else {
    const days = Math.ceil(span / 86400000);
    const stepD = Math.max(1, Math.ceil(days / room));
    const d = new Date(props.from);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < props.from) d.setDate(d.getDate() + 1);
    for (let i = 0; d.getTime() <= props.to; i++, d.setDate(d.getDate() + 1)) {
      if (i % stepD === 0) out.push({ ts: d.getTime(), label: dayLabel(d.getTime()) });
    }
  }
  return out;
});

// Nearest point by time — the points are sorted, so a binary search.
function nearest(px) {
  const pts = props.points;
  if (!pts.length) return null;
  const span = Math.max(1, props.to - props.from);
  const ts = props.from + ((px - PAD_L) / Math.max(1, width.value - PAD_L - PAD_R)) * span;
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].ts < ts) lo = mid + 1;
    else hi = mid;
  }
  let best = lo;
  if (lo > 0 && Math.abs(pts[lo - 1].ts - ts) < Math.abs(pts[lo].ts - ts)) best = lo - 1;
  return Math.abs(x(pts[best].ts) - px) <= 24 ? best : null;
}

function onMove(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  hover.value = nearest(e.clientX - rect.left);
}

function onClick(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const i = nearest(e.clientX - rect.left);
  if (i !== null) emit('select', props.points[i]);
}

const tipStyle = computed(() => {
  if (hover.value === null) return {};
  const px = x(props.points[hover.value].ts);
  const left = px > width.value - 240 ? px - 232 : px + 12;
  return { left: Math.max(4, left) + 'px', top: '8px' };
});
</script>
