<template>
  <div class="ub" @mouseleave="hover = -1">
    <div class="ub__plot">
      <div class="ub__max">{{ format(max) }}</div>
      <div
        v-for="(b, i) in buckets"
        :key="b.key"
        class="ub__col"
        :class="{ 'is-selected': i === selectedIndex, 'is-dim': selectedIndex >= 0 && i !== selectedIndex }"
        @mouseenter="hover = i"
        @click="$emit('select', i === selectedIndex ? -1 : i)"
      >
        <div class="ub__stack" :style="{ height: colHeight(i) + '%' }">
          <div
            v-for="s in stackAt(i)"
            :key="s.key"
            class="ub__seg"
            :style="{ height: s.share + '%', background: s.color }"
          ></div>
        </div>
        <div v-if="showLabel(i)" class="ub__label">{{ label(b) }}</div>
      </div>
    </div>

    <div v-if="hover >= 0" class="ub__tip" :style="tipStyle">
      <div class="ub__tip-time">{{ longLabel(buckets[hover]) }}</div>
      <div v-for="row in tipRows" :key="row.key" class="ub__tip-row">
        <span class="ub__tip-dot" :style="{ background: row.color }"></span>
        <span class="ub__tip-name">{{ row.label }}</span>
        <span class="ub__tip-val">{{ format(row.value) }}</span>
      </div>
      <div v-if="tipRows.length > 1" class="ub__tip-row ub__tip-total">
        <span class="ub__tip-name">Total</span>
        <span class="ub__tip-val">{{ format(totals[hover]) }}</span>
      </div>
      <div v-if="!tipRows.length" class="ub__tip-muted">Nothing</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { dayLabel, timeOfDay } from '../usage-format.js';

const props = defineProps({
  buckets: { type: Array, required: true },
  bucket: { type: String, default: 'day' },
  // [{ key, label, color, values: number[] }], drawn bottom to top
  series: { type: Array, required: true },
  format: { type: Function, required: true },
  selectedIndex: { type: Number, default: -1 },
});
defineEmits(['select']);

const hover = ref(-1);

const totals = computed(() => props.buckets.map((_, i) => props.series.reduce((sum, s) => sum + (s.values[i] || 0), 0)));
const max = computed(() => Math.max(0, ...totals.value));

function colHeight(i) {
  if (!max.value || !totals.value[i]) return 0;
  // A sliver, not nothing, for a bucket that has anything at all.
  return Math.max(2, (totals.value[i] / max.value) * 100);
}

function stackAt(i) {
  const total = totals.value[i];
  if (!total) return [];
  return props.series
    .filter(s => s.values[i] > 0)
    .map(s => ({ key: s.key, color: s.color, share: (s.values[i] / total) * 100 }));
}

const tipRows = computed(() => {
  const i = hover.value;
  if (i < 0) return [];
  return props.series
    .filter(s => s.values[i] > 0)
    .map(s => ({ key: s.key, label: s.label, color: s.color, value: s.values[i] }))
    .sort((a, b) => b.value - a.value);
});

function label(b) {
  const d = new Date(b.start);
  return props.bucket === 'hour' ? String(d.getHours()) : String(d.getDate());
}
function longLabel(b) {
  if (!b) return '';
  return props.bucket === 'hour' ? `${dayLabel(b.start)}, ${timeOfDay(b.start)}` : new Date(b.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
// Every label while they fit, every other one past 16 columns, every third past 32.
function showLabel(i) {
  const n = props.buckets.length;
  const step = n > 32 ? 3 : n > 16 ? 2 : 1;
  return (n - 1 - i) % step === 0;
}

const tipStyle = computed(() => {
  const n = props.buckets.length || 1;
  const at = (hover.value + 0.5) / n;
  return at > 0.6 ? { right: `${(1 - at) * 100 + 2}%` } : { left: `${at * 100 + 2}%` };
});
</script>
