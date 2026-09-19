<template>
  <!-- Above a note open in an editor: the list's deadline, how far through it
       is, and the projects it is about — set here rather than by editing the
       frontmatter by hand. Each change writes the file; the editor under the
       bar re-reads it. -->
  <div v-if="note" class="sbx-notemeta">
    <div class="sbx-notemeta__group">
      <span class="sbx-notemeta__label">Deadline</span>
      <DueChip
        :due="note.due"
        :done="allDone"
        subject="list"
        icon="flag"
        editable
        placeholder="Set deadline"
        @set="setDue"
      />
      <DueChip v-if="note.nextDue && note.nextDue !== note.due" :due="note.nextDue" :hint="nextDueHint(note)" />
    </div>

    <div v-if="note.total" class="sbx-notemeta__group sbx-notemeta__group--progress">
      <TodoProgress :done="note.done" :total="note.total" :overdue="overdue" />
      <span class="sbx-notemeta__count" :class="{ 'is-done': allDone }">{{ note.done }}/{{ note.total }}</span>
    </div>

    <div class="sbx-notemeta__group sbx-notemeta__group--projects">
      <span class="sbx-notemeta__label">Projects</span>
      <span v-for="p in note.projects" :key="p" class="note-project-chip" :title="p">
        {{ projectName(p) }}
        <button
          type="button"
          class="note-project-chip__x"
          :aria-label="'Remove ' + projectName(p)"
          @click="setProjects(note.projects.filter(x => x !== p))"
        >×</button>
      </span>
      <select
        class="note-project sbx-notemeta__add"
        value=""
        :title="note.projects.length ? 'Relate to another project' : 'Relate to a project'"
        @change="setProjects([...note.projects, $event.target.value]); $event.target.value = ''"
      >
        <option value="">{{ note.projects.length ? '+ Add' : 'None — add…' }}</option>
        <option v-for="o in projectOptions" :key="o.path" :value="o.path">{{ o.label }}</option>
      </select>
    </div>

    <span v-if="note.archived" class="sbx-notemeta__archived">Archived</span>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { store } from '../store.js';
import { projectName } from '../project-search.js';
import DueChip from './DueChip.vue';
import TodoProgress from './TodoProgress.vue';
import { useToday, overdueCount, nextDueHint } from '../todo-dates.js';

const props = defineProps({
  filename: { type: String, required: true },
  // Runs before anything is written — the editor saves unsaved text first, so
  // the change here does not land under a stale copy of the file. Returns
  // false to call the change off.
  beforeChange: { type: Function, default: null },
});
const emit = defineEmits(['changed']);

const today = useToday();
const note = ref(null);

async function load() {
  const list = await window.api.getNotes().catch(() => []);
  note.value = (list || []).find(n => n.filename === props.filename) || null;
}

onMounted(load);
watch(() => props.filename, load);
watch(() => store.notesRevision, load);

const allDone = computed(() => !!note.value?.total && note.value.done === note.value.total);
const overdue = computed(() => (note.value ? overdueCount(note.value, today.value) : 0));

const projectOptions = computed(() => {
  const all = store.allProjects?.length ? store.allProjects : store.projects;
  const have = new Set(note.value?.projects || []);
  return (all || [])
    .filter(p => !p.isGroupContainer && !have.has(p.projectPath))
    .map(p => ({ path: p.projectPath, label: projectName(p.projectPath) }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

async function change(write) {
  if (props.beforeChange && (await props.beforeChange()) === false) return;
  const res = await write();
  if (res?.ok === false) return;
  await load();
  window.vuePlans?.refreshNotes?.();
  emit('changed');
}

function setDue(date) {
  return change(() => window.api.setNoteDue(props.filename, date));
}

function setProjects(list) {
  const clean = [...new Set(list.filter(Boolean))];
  return change(() => window.api.setNoteProjects(props.filename, clean));
}
</script>
