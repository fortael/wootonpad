<template>
  <!-- How far through a checklist is, as a bar under its title. Green when
       every box is ticked; red while anything open in it is past its date. -->
  <div
    v-if="total"
    class="sbx-progress"
    :class="{ 'is-done': done >= total, 'is-overdue': overdue > 0 && done < total }"
    role="progressbar"
    :aria-valuenow="done"
    :aria-valuemin="0"
    :aria-valuemax="total"
    :aria-label="`${done} of ${total} done`"
  >
    <div class="sbx-progress__fill" :style="{ width: `${percent}%` }"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  done: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  overdue: { type: Number, default: 0 },
});

const percent = computed(() => (props.total ? Math.round((props.done / props.total) * 100) : 0));
</script>
