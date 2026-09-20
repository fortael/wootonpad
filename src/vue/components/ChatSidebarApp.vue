<template>
  <!-- Buddy's sidebar: what its last answer was about, as the rows those
       things are everywhere else — sessions as sidebar rows, projects with
       their avatars, TODO notes with what is left in them. Bookmarks and
       milestones will join them; the mascot sits at the foot and says what
       Buddy is doing while it works. -->
  <div class="sbx-blockpanel">
    <section class="sbx-block sbx-block--fill sbx-chatside__block">
      <div class="sbx-block__body sbx-block__body--scroll sbx-chatside">
        <template v-if="!anything">
          <div class="sbx-chatside__label">From the last answer</div>
          <div class="sbx-chatside__stub">
            Sessions, projects and TODOs Buddy mentions show up here, ready to open.
          </div>
        </template>

        <template v-if="sessions.length">
          <div class="sbx-chatside__label">
            Sessions <span class="sbx-chatside__count">{{ sessions.length }}</span>
          </div>
          <div class="sbx-chatside__sessions">
            <SessionItem
              v-for="s in sessions"
              :key="s.sessionId"
              :session="s"
              :is-active="store.activeSessionId === s.sessionId"
              :is-running="store.activePtyIds.has(s.sessionId)"
              :is-busy="store.sessionBusyState.get(s.sessionId) || false"
              :is-attention="store.attentionSessions.has(s.sessionId)"
              :is-response-ready="store.responseReadySessions.has(s.sessionId)"
              @open="openSession"
            />
          </div>
        </template>

        <template v-if="projects.length">
          <div class="sbx-chatside__label">
            Projects <span class="sbx-chatside__count">{{ projects.length }}</span>
          </div>
          <button
            v-for="p in projects"
            :key="p.projectPath"
            type="button"
            class="sbx-chatside__row"
            :title="p.projectPath"
            @click="openProject(p.projectPath)"
          >
            <ProjectAvatar class="sbx-chatside__avatar" :project-path="p.projectPath" />
            <span class="sbx-chatside__row-main">
              <span class="sbx-chatside__row-title">{{ p.name }}</span>
              <span class="sbx-chatside__row-sub">{{ p.sub }}</span>
            </span>
            <span v-if="p.unpushedCount" class="sbx-chatside__badge is-unpushed">{{ p.unpushedCount }}↑</span>
            <span v-if="p.changedCount" class="sbx-chatside__badge">{{ p.changedCount }}</span>
          </button>
        </template>

        <template v-if="todos.length">
          <div class="sbx-chatside__label">
            TODOs <span class="sbx-chatside__count">{{ todos.length }}</span>
          </div>
          <button
            v-for="note in todos"
            :key="note.filename"
            type="button"
            class="sbx-chatside__row sbx-chatside__row--todo"
            @click="openNote(note)"
          >
            <SbIcon name="list-todo" :size="14" class="sbx-chatside__todoicon" />
            <span class="sbx-chatside__row-main">
              <span class="sbx-chatside__row-head">
                <span class="sbx-chatside__row-title">{{ note.title }}</span>
                <DueChip v-if="note.nextDue" :due="note.nextDue" :hint="nextDueHint(note)" />
              </span>
              <TodoProgress :done="note.done" :total="note.total" :overdue="overdueCount(note, today)" />
              <span v-for="item in openItems(note)" :key="item.index" class="sbx-chatside__todoitem">
                <span class="sbx-chatside__todotext">☐ {{ item.text }}</span>
                <DueChip v-if="item.due" :due="item.due" />
              </span>
            </span>
            <span v-if="note.total" class="sbx-chatside__badge" :class="{ 'is-done': note.done === note.total }">
              {{ note.done }}/{{ note.total }}
            </span>
          </button>
        </template>
      </div>
    </section>

    <!-- The mascot, in a block of its own that folds away like the Projects
         tab's Archived block — some people want the corner back. Remembered
         across restarts. Folded, it stops animating: nothing ticks for a
         robot nobody can see. -->
    <section class="sbx-block sbx-block--fit sbx-chatside__buddyblock">
      <header
        class="sbx-block__head sbx-block__head--toggle"
        role="button"
        tabindex="0"
        :aria-expanded="!buddyCollapsed"
        @click="toggleBuddy"
        @keydown.enter.prevent="toggleBuddy"
        @keydown.space.prevent="toggleBuddy"
      >
        <SbIcon
          name="chevron-down"
          :size="12"
          tone="muted"
          class="sbx-block__chevron"
          :class="{ 'is-collapsed': buddyCollapsed }"
        />
        <span class="sbx-block__title">Buddy</span>
        <span class="sbx-block__count">{{ buddyStateLabel }}</span>
      </header>
      <div v-if="!buddyCollapsed" class="sbx-chatside__foot">
        <PixelBuddy
          :state="buddyState"
          :activity="activity"
          :sessions="fleet.drones"
          :extra-drones="fleet.extra"
          :context-tokens="contextTokens"
          @open-session="id => openSession({ sessionId: id })"
        />
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { store } from '../store.js';
import SbIcon from './SbIcon.vue';
import PixelBuddy from './PixelBuddy.vue';
import SessionItem from './SessionItem.vue';
import ProjectAvatar from './ProjectAvatar.vue';
import DueChip from './DueChip.vue';
import TodoProgress from './TodoProgress.vue';
import { useToday, overdueCount, nextDueHint } from '../todo-dates.js';
import { assistantText, lastAnswerText, mentionsIn } from '../buddy-mentions.js';
import { activityFor } from '../buddy-activity.js';
import { pickDrones } from '../buddy-scene.js';
import { activeSessions, stateFromStore } from '../session-column.js';
import { sessionTitle } from '../session-title.js';

// ── The last answer ───────────────────────────────────────────────
//
// Read from the transcript when the view comes up, then kept current from the
// live stream: `system/init` opens every turn (sdk-session.js), so it is where
// the previous answer stops counting, and every assistant message after it is
// part of the new one.

const answer = ref('');
const notes = ref([]);
const today = useToday();
const chatId = computed(() => store.chatSession?.sessionId || '');

async function loadAnswer() {
  const id = chatId.value;
  if (!id) { answer.value = ''; return; }
  const res = await window.api.readSessionTranscript(id, { limit: 80 }).catch(() => null);
  if (chatId.value !== id) return;
  answer.value = res?.entries ? lastAnswerText(res.entries) : '';
}

async function loadNotes() {
  notes.value = (await window.api.getNotes().catch(() => [])) || [];
}

// The step the assistant is on, for the mascot's bubble — see
// buddy-activity.js. Kept from message to message; only a new step replaces it.
const activity = ref('');

let turnFresh = false;
const unsubscribe = window.api.onSdkMessage?.((id, message) => {
  if (!id || id !== chatId.value) return;
  const step = activityFor(message);
  if (step) activity.value = step;
  if (message?.type === 'system' && message.subtype === 'init') {
    turnFresh = true;
    return;
  }
  const text = assistantText(message);
  if (!text) return;
  // The first words of a new answer replace the old one; the rest add to it.
  answer.value = turnFresh ? text : `${answer.value}\n${text}`;
  turnFresh = false;
});

watch(chatId, () => { turnFresh = false; activity.value = ''; loadAnswer(); });
watch(() => store.notesRevision, loadNotes);
onMounted(() => { loadAnswer(); loadNotes(); });
onBeforeUnmount(() => { if (typeof unsubscribe === 'function') unsubscribe(); });

const mentions = computed(() => mentionsIn(answer.value, notes.value, {
  resolveShortSession: (prefix) => window.sbSessionByPrefix?.(prefix) || null,
}));

// ── As rows ───────────────────────────────────────────────────────

// Every session and project the app knows, by id and path. A mention the app
// cannot resolve — deleted, another account's — is left out rather than drawn
// as a row that opens nothing.
const index = computed(() => {
  const sessions = new Map();
  const projects = new Map();
  for (const list of [store.allProjects, store.projects]) {
    for (const p of list || []) {
      if (!p.isGroupContainer && !projects.has(p.projectPath)) projects.set(p.projectPath, p);
      for (const s of p.sessions || []) {
        const key = String(s.sessionId).toLowerCase();
        if (!sessions.has(key)) sessions.set(key, s);
      }
    }
  }
  return { sessions, projects };
});

// Newest first, whatever order the answer named them in — the same way every
// other list of sessions in the app reads.
const sessions = computed(() => mentions.value.sessions
  .map(id => index.value.sessions.get(id))
  .filter(Boolean)
  .sort((a, b) => new Date(b.modified) - new Date(a.modified)));

const projects = computed(() => mentions.value.projects
  .map(path => index.value.projects.get(path))
  .filter(Boolean)
  .map(p => ({
    projectPath: p.projectPath,
    name: p.projectPath.split('/').filter(Boolean).pop(),
    sub: p.projectPath.split('/').filter(Boolean).slice(-3, -1).join('/'),
    unpushedCount: p.unpushedCount || 0,
    changedCount: p.changedCount || 0,
  })));

const todos = computed(() => mentions.value.todos
  .map(filename => notes.value.find(n => n.filename === filename))
  .filter(Boolean));

const anything = computed(() => sessions.value.length || projects.value.length || todos.value.length);

// What is left, soonest due first — the item's own date or the list's — then
// the undated ones in the order the note has them.
function openItems(note) {
  return (note.todos || [])
    .filter(t => !t.done)
    .map(t => ({ ...t, due: t.due || note.due || null }))
    .sort((a, b) => (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : a.index - b.index))
    .slice(0, 3);
}

function openSession(session) { window.__sb?.openSessionById?.(session.sessionId); }
function openProject(path) { window.__sb?.openProjectByPath?.(path); }
function openNote(note) { window.openNote?.(note); }

// ── Buddy ─────────────────────────────────────────────────────────

const COLLAPSE_KEY = 'buddyMascotCollapsed';
const buddyCollapsed = ref(localStorage.getItem(COLLAPSE_KEY) === '1');

function toggleBuddy() {
  buddyCollapsed.value = !buddyCollapsed.value;
  localStorage.setItem(COLLAPSE_KEY, buddyCollapsed.value ? '1' : '0');
}

// Folded, the header still says what Buddy is up to, in one word.
const buddyStateLabel = computed(() => ({
  idle: 'idle', busy: 'working', waiting: 'needs you', stopped: 'asleep',
}[buddyState.value] || ''));

// Every live session is a drone round the mascot, in the Active rail's order
// so the ones waiting on you are always among those shown.
const fleet = computed(() => pickDrones(
  activeSessions(store.projects, stateFromStore(store), store.activePtyIds),
  id => store.activePtyIds.has(id) && id !== chatId.value,
  s => sessionTitle(s),
));

// What Buddy's context holds, as the composer's ring last read it.
const contextTokens = computed(() => store.contextUsage.get(chatId.value)?.totalTokens ?? null);

// The same reading the chat header's badge makes of the assistant's session.
const buddyState = computed(() => {
  const id = chatId.value;
  if (!id || !store.activePtyIds.has(id)) return 'stopped';
  if (store.attentionSessions.has(id)) return 'waiting';
  if (store.sessionBusyState.get(id)) return 'busy';
  return 'idle';
});

</script>
