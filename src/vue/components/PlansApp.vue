<template>
  <div class="sbx-blockpanel">
    <!-- Plans follow the active account, so name the directory that was
         actually searched instead of the default ~/.claude one. -->
    <div v-if="plans.length === 0" class="plans-empty">
      <div>No plans for <strong>{{ plansDir.accountName || 'this account' }}</strong>.</div>
      <button
        v-if="plansDir.dir"
        type="button"
        class="plans-empty-path"
        :data-tooltip="plansDir.exists ? 'Copy path' : 'Directory does not exist yet — copy path'"
        @click="copyPlansDir"
      >{{ copied ? 'Copied' : plansDir.dir }}</button>
    </div>

    <!-- The shared sidebar block — css/sidebar-blocks.css. The header that used
         to be a .project-header pretending Plans was a project is now the
         block's own title, the same one the board and the projects tab use. -->
    <section v-else class="sbx-block sbx-block--fill">
      <header class="sbx-block__head">
        <SbIcon name="notebook-pen" :size="13" tone="muted" />
        <span class="sbx-block__title">Plans</span>
        <span class="sbx-block__count">{{ plans.length }}</span>
      </header>
      <div class="sbx-block__body sbx-block__body--scroll">
        <ListItem
          v-for="plan in plans"
          :key="plan.filename"
          :title="plan.title || plan.filename"
          :subtitle="plan.filename"
          :meta="fmtDate(plan.modified)"
          :active="activePlan === plan.filename"
          :classes="['plan-item']"
          @click="openPlan(plan)"
        >
          <template #leading>
            <span class="memory-brain-icon" v-html="planSvg"></span>
          </template>
        </ListItem>
      </div>
    </section>

    <!-- ── Notes & TODO ───────────────────────────────────────────────
         Free-form notes that belong to the account rather than to a project,
         so they survive switching repositories and still say which repository
         they are about. Stored as Markdown in the account's Claude home. -->
    <section class="sbx-block sbx-block--fill notes-block">
      <header class="sbx-block__head">
        <SbIcon name="list-todo" :size="13" tone="muted" />
        <span class="sbx-block__title">Notes &amp; TODO</span>
        <span class="notes-head__spacer"></span>
        <button
          class="notes-head__btn"
          :data-tooltip="creating ? 'Cancel' : 'New note'"
          :aria-label="creating ? 'Cancel new note' : 'New note'"
          @click="toggleCreate"
        ><SbIcon :name="creating ? 'x' : 'plus'" :size="13" tone="muted" /></button>
        <span class="sbx-block__count">{{ notes.length }}</span>
      </header>

      <div class="sbx-block__body sbx-block__body--scroll">
        <div v-if="creating" class="note-create">
          <input
            ref="createInput"
            v-model="newTitle"
            class="note-input"
            placeholder="Note title"
            @keydown.enter.prevent="createNote"
            @keydown.escape="toggleCreate"
          />
          <div v-if="newProjects.length" class="note-projects">
            <span v-for="p in newProjects" :key="p" class="note-project-chip" :title="p">
              {{ shortProject(p) }}
              <button class="note-project-chip__x" :aria-label="'Remove ' + shortProject(p)" @click="newProjects = newProjects.filter(x => x !== p)">×</button>
            </span>
          </div>
          <select
            class="note-input note-input--select"
            value=""
            @change="addNewProject($event.target.value); $event.target.value = ''"
          >
            <option value="">{{ newProjects.length ? 'Add another project…' : 'Related project (optional)' }}</option>
            <option
              v-for="p in projectOptions.filter(o => !newProjects.includes(o.path))"
              :key="p.path"
              :value="p.path"
            >{{ p.label }}</option>
          </select>
          <button class="btn-green" :disabled="saving" @click="createNote">
            {{ saving ? 'Creating…' : 'Create note' }}
          </button>
        </div>

        <div v-if="!notes.length" class="projects-empty-hint">
          No notes yet. They live in this account's Claude home, not in a project.
        </div>

        <div
          v-for="note in notes"
          :key="note.filename"
          class="session-item note-item"
          :class="{ active: activeNote === note.filename }"
        >
          <div class="session-row">
            <div class="note-item__head" @click="openNote(note)">
              <span class="note-item__title">{{ note.title }}</span>
              <span v-if="note.total" class="note-item__progress" :class="{ 'is-done': note.done === note.total }">
                {{ note.done }}/{{ note.total }}
              </span>
              <button
                class="note-item__del"
                data-tooltip="Delete note"
                aria-label="Delete note"
                @click.stop="removeNote(note)"
              ><SbIcon name="trash-2" :size="12" tone="muted" /></button>
            </div>

            <ul v-if="note.todos.length" class="note-todos">
              <li
                v-for="todo in note.todos.slice(0, TODO_PREVIEW)"
                :key="todo.index"
                class="note-todo"
                :class="{ 'is-done': todo.done }"
                @click.stop="toggleTodo(note, todo)"
              >
                <SbIcon :name="todo.done ? 'square-check-big' : 'square'" :size="12" tone="muted" />
                <span class="note-todo__text">{{ todo.text || '(empty)' }}</span>
              </li>
              <li v-if="note.todos.length > TODO_PREVIEW" class="note-todos__more" @click="openNote(note)">
                +{{ note.todos.length - TODO_PREVIEW }} more
              </li>
            </ul>
            <div v-else-if="note.preview" class="note-item__preview">{{ note.preview }}</div>

            <!-- Which projects a note relates to is editable here: retagging
                 is a one-click thought, not a reason to open the file. A note
                 can name several — one refactor across three services is one
                 note, not three. -->
            <div v-if="note.projects.length" class="note-projects">
              <span v-for="p in note.projects" :key="p" class="note-project-chip" :title="p">
                {{ shortProject(p) }}
                <button
                  class="note-project-chip__x"
                  :aria-label="'Remove ' + shortProject(p)"
                  @click.stop="removeProject(note, p)"
                >×</button>
              </span>
            </div>

            <div class="note-item__foot">
              <select
                class="note-project"
                value=""
                :title="note.projects.length ? 'Relate to another project' : 'Relate to a project'"
                @click.stop
                @change="addProject(note, $event.target.value); $event.target.value = ''"
              >
                <option value="">{{ note.projects.length ? 'Add project…' : 'No project' }}</option>
                <option v-for="p in optionsFor(note)" :key="p.path" :value="p.path">{{ p.label }}</option>
              </select>
              <span class="note-item__date">{{ fmtDate(note.modified) }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue';
import ListItem from './ListItem.vue';
import SbIcon from './SbIcon.vue';
import { store } from '../store.js';
import { projectName } from '../project-search.js';

const props = defineProps({
  callbacks: { type: Object, required: true },
});

const plans = ref([]);
const activePlan = ref(null);
const plansDir = ref({ dir: '', exists: false, accountName: '' });
const copied = ref(false);

// ── Notes & TODO ──────────────────────────────────────────────────
// How many checkboxes a row shows before it stops being a sidebar row and
// starts being the document; the rest are one click away in the editor.
const TODO_PREVIEW = 4;

const notes = ref([]);
const activeNote = ref(null);
const creating = ref(false);
const saving = ref(false);
const newTitle = ref('');
const newProjects = ref([]);
const createInput = ref(null);

// store.allProjects, not store.projects: which projects exist is not a
// question the sidebar's filter tab gets to answer.
const projectOptions = computed(() => {
  const all = store.allProjects?.length ? store.allProjects : store.projects;
  return (all || [])
    .map(p => ({ path: p.projectPath, label: projectName(p.projectPath) }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

// Only what the note is not already related to — the menu adds, it does not
// replace, so an entry already on the note would be a no-op.
function optionsFor(note) {
  return projectOptions.value.filter(o => !note.projects.includes(o.path));
}

function shortProject(path) {
  return projectName(path);
}

// The one place the notes are re-read. Every note mutation in the app ends
// here — the ones in this component directly, the ones in the session side
// panel and the Markdown editor through `window.vuePlans.refreshNotes` — so it
// is also the one place that can tell anything else the notes have moved.
// See store.notesRevision: the side panel's rail shows a count derived from
// these and has no other way to learn the count has changed.
async function refreshNotes() {
  try {
    notes.value = (await window.api?.getNotes?.()) || [];
  } catch {
    notes.value = [];
  }
  store.notesRevision++;
}

async function toggleCreate() {
  creating.value = !creating.value;
  if (!creating.value) return;
  newTitle.value = '';
  await nextTick();
  createInput.value?.focus();
}

function addNewProject(projectPath) {
  if (projectPath && !newProjects.value.includes(projectPath)) newProjects.value.push(projectPath);
}

async function createNote() {
  if (saving.value) return;
  saving.value = true;
  try {
    const res = await window.api.createNote({ title: newTitle.value.trim(), projects: newProjects.value });
    if (!res?.ok) return;
    creating.value = false;
    newTitle.value = '';
    newProjects.value = [];
    await refreshNotes();
    const created = notes.value.find(n => n.filename === res.filename);
    if (created) openNote(created);
  } finally {
    saving.value = false;
  }
}

function openNote(note) {
  activeNote.value = note.filename;
  activePlan.value = null;
  props.callbacks.openNote?.(note);
}

async function toggleTodo(note, todo) {
  const res = await window.api.toggleNoteTodo(note.filename, todo.index);
  if (res?.ok) await refreshNotes();
}

async function addProject(note, projectPath) {
  if (!projectPath || note.projects.includes(projectPath)) return;
  await window.api.setNoteProjects(note.filename, [...note.projects, projectPath]);
  await refreshNotes();
}

async function removeProject(note, projectPath) {
  await window.api.setNoteProjects(note.filename, note.projects.filter(p => p !== projectPath));
  await refreshNotes();
}

async function removeNote(note) {
  if (!confirm(`Delete note "${note.title}"?`)) return;
  await window.api.deleteNote(note.filename);
  if (activeNote.value === note.filename) activeNote.value = null;
  await refreshNotes();
}

onMounted(refreshNotes);

async function refreshPlansDir() {
  plansDir.value = (await window.api?.getPlansDir?.().catch(() => null)) || plansDir.value;
}

// Only needed while the list is empty, and the account may have changed since
// the last look.
watch(plans, (list) => { if (!list.length) refreshPlansDir(); }, { immediate: true });

async function copyPlansDir() {
  try {
    await navigator.clipboard.writeText(plansDir.value.dir);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1200);
  } catch {}
}

function fmtDate(d) {
  return window.formatDate ? window.formatDate(new Date(d)) : d;
}

function openPlan(plan) {
  activePlan.value = plan.filename;
  activeNote.value = null;
  props.callbacks.openPlan?.(plan);
}

// Bridge API
defineExpose({
  // Plans are reloaded whenever the tab is opened or the account changes, and
  // notes are scoped to the same account — so they refresh on the same beat.
  setPlans(list) { plans.value = list; refreshNotes(); },
  setActive(filename) { activePlan.value = filename; activeNote.value = null; },
  clearActive() { activePlan.value = null; activeNote.value = null; },
  refreshNotes,
});

const planSvg = '<svg width="15" height="15" viewBox="0 0 17 17" fill="currentColor" stroke="currentColor" stroke-width="0"><path d="M14 2v-2h-13v17h13v-2h2v-13h-2zM2 16v-15h2v15h-2zM13 16h-8v-15h8v15zM15 14h-1v-3h1v3zM15 10h-1v-3h1v3zM14 6v-3h1v3h-1zM6 4h5v1h-5v-1zM6 6h4v1h-4v-1z"/></svg>';
</script>
