<template>
  <!-- Teleported so the dimmed backdrop covers the whole window rather than
       whatever box the sidebar happens to be inside. The landing overrides the
       target to its own demo window — dimming a marketing page around a demo
       is not the same gesture at all.

       The Teleport itself is conditional, not just its content: the target is
       resolved when the Teleport mounts, and the landing's demo window does
       not exist yet while its own subtree is still being built. Mounting it
       only when the palette opens means the target is always there by then. -->
  <Teleport v-if="store.spotlightOpen" :to="to">
    <div class="sbx-spotlight" @mousedown.self="close">
      <div class="sbx-spotlight__panel" @keydown="onKeyDown">
        <div class="sbx-spotlight__field">
          <SbIcon name="search" :size="18" tone="muted" />
          <input
            ref="inputRef"
            v-model="query"
            class="sbx-spotlight__input"
            type="text"
            spellcheck="false"
            :placeholder="placeholder"
          >
          <kbd class="sbx-spotlight__kbd">esc</kbd>
        </div>

        <div ref="listRef" class="sbx-spotlight__list">
          <template v-for="(row, i) in rows" :key="row.key">
            <div v-if="row.section" class="sbx-spotlight__section">{{ row.section }}</div>

            <div
              class="sbx-spotlight__row"
              :class="{ 'is-active': i === cursor, 'is-archived': row.archived }"
              :data-index="i"
              @mousemove="cursor = i"
              @click="activate(row)"
            >
              <ProjectAvatar
                v-if="row.kind !== 'plan'"
                class="sbx-spotlight__avatar"
                :project-path="row.projectPath"
              />
              <span v-else class="sbx-spotlight__avatar sbx-spotlight__avatar--plan">
                <SbIcon name="book-open" :size="14" tone="muted" />
              </span>

              <div class="sbx-spotlight__text">
                <div class="sbx-spotlight__title">
                  <span
                    v-for="(part, pi) in row.titleParts"
                    :key="pi"
                    :class="{ 'sbx-spotlight__hit': part.hit }"
                  >{{ part.text }}</span>
                </div>
                <div class="sbx-spotlight__sub">
                  <span
                    v-for="(part, pi) in highlight(row.subtitle)"
                    :key="pi"
                    :class="{ 'sbx-spotlight__hit': part.hit }"
                  >{{ part.text }}</span>
                </div>
              </div>

              <span
                v-if="row.kind === 'session'"
                class="sbx-spotlight__dot"
                :class="row.statusClass"
              ></span>
              <span v-if="row.meta" class="sbx-spotlight__meta">{{ row.meta }}</span>

              <!-- The row's second verb, spelled out. Enter goes to the thing;
                   this starts work in it, and is here so that is discoverable
                   with a mouse rather than only from the footer legend. -->
              <button
                v-if="row.kind === 'project'"
                type="button"
                class="sbx-spotlight__action"
                data-tooltip="New session (⇧↵)"
                aria-label="New session in this project"
                @click.stop="activate(row, 'create')"
              >
                <SbIcon name="plus" :size="13" />
              </button>

              <kbd v-if="i === cursor" class="sbx-spotlight__kbd">↵</kbd>
            </div>
          </template>

          <!-- The archive has not been looked in yet, so "nothing matches" is
               not the answer — it is the answer to half the question. -->
          <div v-if="!rows.length" class="sbx-spotlight__empty">
            <template v-if="archivePending">Nothing open matches “{{ query.trim() }}” — still looking through the archive…</template>
            <template v-else>Nothing matches “{{ query.trim() }}”.</template>
          </div>
        </div>

        <div class="sbx-spotlight__footer">
          <span class="sbx-spotlight__hint"><kbd class="sbx-spotlight__kbd">↑</kbd><kbd class="sbx-spotlight__kbd">↓</kbd> navigate</span>
          <span class="sbx-spotlight__hint"><kbd class="sbx-spotlight__kbd">↵</kbd> open</span>
          <span class="sbx-spotlight__hint"><kbd class="sbx-spotlight__kbd">⇧↵</kbd> new session</span>
          <span class="sbx-spotlight__hint"><kbd class="sbx-spotlight__kbd">{{ modKey }}</kbd><kbd class="sbx-spotlight__kbd">K</kbd> toggle</span>
          <span class="sbx-spotlight__spacer"></span>
          <span>{{ liveProjects.length }} projects</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * ⌘K / Ctrl+K palette: the one place that answers "take me to the thing I am
 * thinking of", whatever kind of thing it is.
 *
 * Projects come first and always — with an empty field this is a list of every
 * project you can start work in, which is what the + beside the search box now
 * opens. Sessions follow under a separator, then plans. Enter on a project
 * starts a session in it; Enter on a session or a plan opens it.
 *
 * Matching happens here, over the project tree the renderer already holds,
 * rather than through the FTS index: the whole tree is in memory, substring
 * matching it is instant, and the index's trigram tokenizer answers nothing at
 * all for the first two characters typed — which is exactly when a palette has
 * to feel alive. It also means the browser demo, which has no index behind it,
 * runs the real component.
 *
 * Archived sessions come last, under their own heading, and only once the
 * typing has stopped for a couple of seconds. They are the things you have
 * explicitly put away — mixing them into the live results is undoing that, and
 * never answering for them at all means the one place that finds anything
 * cannot find half of what you have. The delay is what keeps the two apart:
 * while a query is being typed it is matched against the live set alone, and
 * the larger set is only walked for a query you have settled on.
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { store } from '../store.js';
import { projectName } from '../project-search.js';
import { spotlightResults, livingProjects, archivedSessions } from '../spotlight-results.js';
import { sessionTitle } from '../session-title.js';
import { highlightParts, matches } from '../fuzzy-match.js';
import ProjectAvatar from './ProjectAvatar.vue';
import SbIcon from './SbIcon.vue';

defineProps({
  /** Teleport target. The app wants the window; the landing wants its demo. */
  to: { type: String, default: 'body' },
});

const query = ref('');
const cursor = ref(0);
const inputRef = ref(null);
const listRef = ref(null);

// path → { archived } from the project_meta table. Read once per open: it is a
// single DB round trip and the flags change only when the user archives a
// project, which closes the palette on its way there.
const projectMeta = ref({});
const plans = ref([]);

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? '⌘' : 'Ctrl';

const placeholder = 'Jump to a project, session or plan…';

// ── Sources ───────────────────────────────────────────────────────
//
// allProjects rather than projects: the sidebar's filter tab decides what the
// list shows, and the palette is not downstream of it.
const liveProjects = computed(() => {
  const all = store.allProjects?.length ? store.allProjects : store.projects;
  return livingProjects(all, projectMeta.value);
});

/** Subtitles are marked at render time — they are the same string for every
 *  row kind and do not need a second field on the row. */
function highlight(text) { return highlightParts(text, query.value); }

const displayName = (session) => sessionTitle(session);

function timeAgo(session) {
  const t = window.lastActivityTime?.get(session.sessionId) || new Date(session.modified);
  return window.formatDate ? window.formatDate(t) : '';
}

function statusClass(session) {
  if (store.attentionSessions?.has(session.sessionId)) return 'is-attention';
  if (store.sessionBusyState?.get(session.sessionId)) return 'is-busy';
  if (store.activePtyIds?.has(session.sessionId)) return 'is-running';
  return '';
}

// ── Rows ──────────────────────────────────────────────────────────
//
// One flat list: the cursor walks rows, and a row carries the section heading
// that precedes it rather than the list being a tree of groups. What goes in
// it — and in what order — is spotlight-results.js.
const results = computed(() => spotlightResults({
  projects: liveProjects.value,
  plans: plans.value,
  query: query.value,
}));

// ── The archive, on its own clock ─────────────────────────────────
//
// `settled` trails `query` by ARCHIVE_DELAY_MS. Everything above re-runs on
// every keystroke against the projects in memory; this re-runs only once the
// typing has stopped, over the whole set including what has been put away.
const ARCHIVE_DELAY_MS = 2000;
const settled = ref('');
let settleTimer = 0;

watch(query, (text) => {
  clearTimeout(settleTimer);
  // Cleared immediately rather than left behind: rows answering the query from
  // two letters ago are worse than no rows at all.
  settled.value = '';
  if (!text.trim()) return;
  settleTimer = setTimeout(() => { settled.value = text; }, ARCHIVE_DELAY_MS);
});

onUnmounted(() => clearTimeout(settleTimer));

/** Is there a query the archive has not been asked about yet? */
const archivePending = computed(() => !!query.value.trim() && settled.value !== query.value);

const archived = computed(() => {
  if (!settled.value || settled.value !== query.value) return [];
  // allProjects, not liveProjects: an archived project's sessions are archived
  // by implication, and they are exactly what this section is for.
  const all = store.allProjects?.length ? store.allProjects : store.projects;
  return archivedSessions({
    projects: all,
    query: settled.value,
    projectMeta: projectMeta.value,
  });
});

const rows = computed(() => {
  const out = [];

  results.value.projects.forEach((project, i) => {
    const open = (project.sessions || []).filter(s => !s.archived).length;
    out.push({
      key: 'p:' + project.projectPath,
      kind: 'project',
      section: i === 0 ? 'Projects' : null,
      project,
      projectPath: project.projectPath,
      title: projectName(project.projectPath),
      titleParts: highlightParts(projectName(project.projectPath), query.value),
      subtitle: project.projectPath,
      meta: open ? `${open} session${open === 1 ? '' : 's'}` : 'empty',
    });
  });

  const sessionRow = (project, session, section) => {
    const title = displayName(session);
    // A row whose visible title does not contain the query looks like a wrong
    // answer. When it was the opening prompt that matched, put that on the row
    // rather than leaving the reader to guess why it is here.
    const first = session.summary && displayName({ summary: session.summary });
    const explained = first && !matches(title, query.value) && matches(first, query.value);
    return {
      key: 's:' + session.sessionId,
      kind: 'session',
      section,
      session,
      projectPath: project.projectPath,
      title,
      titleParts: highlightParts(title, query.value),
      subtitle: explained
        ? `${projectName(project.projectPath)} · ${first}`
        : projectName(project.projectPath),
      meta: timeAgo(session),
      statusClass: statusClass(session),
    };
  };

  results.value.sessions.forEach(({ project, session }, i) => {
    out.push(sessionRow(project, session, i === 0 ? 'Sessions' : null));
  });

  results.value.plans.forEach((plan, i) => {
    out.push({
      key: 'l:' + plan.filename,
      kind: 'plan',
      section: i === 0 ? 'Plans' : null,
      plan,
      title: plan.title || plan.filename,
      titleParts: highlightParts(plan.title || plan.filename, query.value),
      subtitle: plan.filename,
      meta: plan.modified && window.formatDate ? window.formatDate(new Date(plan.modified)) : '',
    });
  });

  // Last, and only for a query that has stopped changing.
  archived.value.forEach(({ project, session }, i) => {
    const row = sessionRow(project, session, i === 0 ? 'Archived' : null);
    row.key = 'a:' + session.sessionId;
    row.archived = true;
    out.push(row);
  });

  return out;
});

watch(rows, () => {
  if (cursor.value > rows.value.length - 1) cursor.value = Math.max(0, rows.value.length - 1);
});
watch(query, () => { cursor.value = 0; });

// ── Open / close ──────────────────────────────────────────────────
watch(() => store.spotlightOpen, (open) => {
  if (!open) return;
  query.value = '';
  cursor.value = 0;
  loadContext();
  nextTick(() => inputRef.value?.focus());
});

async function loadContext() {
  try {
    const meta = await window.api?.getProjectMeta?.();
    projectMeta.value = meta && typeof meta === 'object' ? meta : {};
  } catch {
    projectMeta.value = {};
  }
  try {
    const list = await window.api?.getPlans?.();
    plans.value = Array.isArray(list) ? list : [];
  } catch {
    plans.value = [];
  }
}

function close() { store.spotlightOpen = false; }

// ── Keyboard ──────────────────────────────────────────────────────
function move(delta) {
  const n = rows.value.length;
  if (!n) return;
  cursor.value = (cursor.value + delta + n) % n;
  nextTick(scrollCursorIntoView);
}

function scrollCursorIntoView() {
  listRef.value?.querySelector(`[data-index="${cursor.value}"]`)?.scrollIntoView({ block: 'nearest' });
}

function onKeyDown(e) {
  const row = rows.value[cursor.value];
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); activate(row, e.shiftKey ? 'create' : 'primary'); }
  // → is the same gesture as ⇧↵, but only from the end of the query: the
  // cursor key has to keep moving the caret while there is still text to its
  // right, or fixing a typo mid-word would start a session instead.
  else if (e.key === 'ArrowRight' && atEndOfQuery()) {
    if (row?.kind !== 'project') return;
    e.preventDefault();
    activate(row, 'create');
  }
}

function atEndOfQuery() {
  const el = inputRef.value;
  if (!el) return false;
  return el.selectionStart === el.selectionEnd && el.selectionStart === el.value.length;
}

// The palette is a window-level gesture: it has to answer while the focus is
// inside a terminal, which is most of the time. Capture phase, and the event
// stops here — xterm's helper textarea is downstream of this, and on
// Windows/Linux Ctrl+K is a control character the shell would otherwise get.
function onGlobalKey(e) {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (!mod || e.altKey || e.shiftKey) return;
  if (e.key !== 'k' && e.key !== 'K') return;
  e.preventDefault();
  e.stopPropagation();
  store.spotlightOpen = !store.spotlightOpen;
}

onMounted(() => document.addEventListener('keydown', onGlobalKey, true));
onUnmounted(() => document.removeEventListener('keydown', onGlobalKey, true));

// ── Activation ────────────────────────────────────────────────────
//
// Two verbs, the same two everywhere: Enter goes to the thing under the
// cursor, ⇧↵ (or → , or the + on the row) starts work in it. Only a project
// has something to start, so 'create' is a no-op on the other kinds rather
// than a second meaning for the same key.
function activate(row, action = 'primary') {
  if (!row) return;
  if (action === 'create') {
    if (row.kind !== 'project') return;
    close();
    window.__sb?.quickNewSession?.(row.project);
    return;
  }
  close();
  if (row.kind === 'project') {
    // Enter on a project is navigation, like Enter on everything else here:
    // it opens the project's own page — git state, changed files, its
    // sessions. Starting a session is the row's second verb, above.
    window.__sb?.openProject?.(row.project);
  } else if (row.kind === 'session') {
    window.vueApp?.setTab?.('sessions');
    window.__sb?.openSession?.(row.session);
  } else if (row.kind === 'plan') {
    window.vueApp?.setTab?.('plans');
    window.__sb?.openPlan?.(row.plan);
  }
}
</script>
