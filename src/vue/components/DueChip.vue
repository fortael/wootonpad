<template>
  <!-- A due date, said relative to today and coloured by how pressing it is.
       Editable ones open the system date picker on click (its own Clear button
       removes the date); without a date, an editable chip is a calendar icon
       that only shows while the row is hovered — see group-session.css. -->
  <span
    class="sbx-due"
    :class="[`is-${status}`, { 'is-empty': !due, 'has-placeholder': !due && !!placeholder, 'is-editable': editable }]"
    :data-tooltip="tooltip"
    :role="editable ? 'button' : undefined"
    :tabindex="editable ? 0 : undefined"
    :aria-label="editable ? tooltip : undefined"
    @click="pick"
    @keydown.enter.prevent="pick"
    @keydown.space.prevent="pick"
  >
    <SbIcon :name="icon" :size="10" />
    <span v-if="due" class="sbx-due__label">{{ label }}</span>
    <span v-else-if="placeholder" class="sbx-due__label">{{ placeholder }}</span>
    <button
      v-if="editable && due"
      type="button"
      class="sbx-due__clear"
      tabindex="-1"
      aria-label="Clear due date"
      @click.stop="$emit('set', null)"
    >×</button>
    <input
      v-if="editable"
      ref="input"
      type="date"
      class="sbx-due__input"
      tabindex="-1"
      aria-hidden="true"
      :value="due || ''"
      @click.stop
      @change="onChange"
    />
  </span>
</template>

<script setup>
import { computed, ref } from 'vue';
import SbIcon from './SbIcon.vue';
import { useToday, dueStatus, dueLabel, dueShortDate, isDueDate } from '../todo-dates.js';

const props = defineProps({
  due: { type: String, default: null },
  done: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
  // What the date is the deadline of, for the tooltip: "item" or "list".
  subject: { type: String, default: 'item' },
  // A list's deadline wears a flag, an item's date a calendar.
  icon: { type: String, default: 'calendar-days' },
  // Overrides the tooltip — for a chip that is a summary, not a date to set.
  hint: { type: String, default: '' },
  // Said where the date would be, when there is none — and then the chip is
  // always shown rather than waiting for the row to be hovered.
  placeholder: { type: String, default: '' },
});
const emit = defineEmits(['set']);

const today = useToday();
const input = ref(null);

const status = computed(() => (props.due ? dueStatus(props.due, today.value, props.done) : 'none'));
// Done, it is only the day it was due: "4d overdue" on a finished item is
// history dressed up as a warning.
const label = computed(() => (props.done
  ? dueShortDate(props.due, today.value)
  : dueLabel(props.due, today.value)));

const tooltip = computed(() => {
  if (props.hint) return props.hint;
  const what = props.subject === 'list' ? 'List deadline' : 'Due';
  if (!props.due) return props.subject === 'list' ? 'Set a deadline for the whole list' : 'Set a due date';
  return props.editable ? `${what} ${props.due} — click to change` : `${what} ${props.due}`;
});

function pick(event) {
  if (!props.editable) return;
  // The row under the chip toggles its checkbox on click; a chip is not that.
  event?.stopPropagation();
  const el = input.value;
  if (!el) return;
  try { el.showPicker(); } catch { el.focus(); el.click(); }
}

function onChange(event) {
  const value = event.target.value;
  emit('set', isDueDate(value) ? value : null);
}
</script>
