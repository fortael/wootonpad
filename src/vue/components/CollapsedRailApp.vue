<template>
  <!-- The sidebar folded to one column of avatars. Not a second navigation:
       the tabs stay in the top bar whether the sidebar is open or shut, and
       this shows the *contents* of whichever one is active — the sessions, the
       board's projects, the plans, the projects, the accounts. Collapsing used
       to swap the sidebar for a tab strip, which left the accounts tab with no
       way to pick an account. -->
  <div class="sbx-rail">
    <button
      class="sbx-rail__btn"
      :data-tooltip="`${tabLabel} — expand sidebar`"
      :aria-label="`${tabLabel} — expand sidebar`"
      @click="emit('expand')"
    >
      <SbIcon :name="tabIcon" :size="17" tone="accent" />
    </button>
    <div class="sbx-rail__divider"></div>

    <div class="sbx-rail__items">
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        class="sbx-rail__item"
        :class="{ 'is-active': item.active }"
        :data-tooltip="item.label"
        :aria-label="item.label"
        @click="pick(item)"
      >
        <ProjectAvatar
          v-if="item.projectPath"
          class="sbx-rail__avatar"
          :project-path="item.projectPath"
        />
        <span
          v-else
          class="sbx-rail__avatar sbx-rail__avatar--mono"
          :style="{ background: item.color }"
        >
          <SbIcon v-if="item.icon" :name="item.icon" :size="14" />
          <template v-else>{{ item.initials }}</template>
        </span>

        <!-- The same mark the sidebar row and the board card carry. Idle makes
             no claim, so it gets none. -->
        <span
          v-if="item.status && item.status !== 'idle'"
          class="sbx-rail__dot"
          :style="{ background: statusColor(item.status) }"
        ></span>
        <span v-if="item.count > 1" class="sbx-rail__count">{{ item.count }}</span>
      </button>

      <p v-if="!items.length" class="sbx-rail__empty">{{ emptyLabel }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { store } from '../store.js';
import SbIcon from './SbIcon.vue';
import ProjectAvatar from './ProjectAvatar.vue';
import { filterSessions } from '../session-filter.js';
import { boardProjectRows } from '../board-projects.js';
import { columnOf, stateFromStore } from '../session-column.js';
import { sessionTitle } from '../session-title.js';

const props = defineProps({
  // [{ id, icon, label }] — the same tab list the top bar draws, used here only
  // to name and badge the rail with whichever one is active.
  tabs: { type: Array, default: () => [] },
  activeId: { type: String, default: '' },
});

const emit = defineEmits([
  'expand',
  'open-session',
  'open-plan',
  'open-project',
  'open-account',
]);

const STATUS_COLOR = {
  running: 'var(--status-running)',
  waiting: 'var(--amber-500)',
  done: 'var(--blue-500)',
  idle: 'var(--gray-500)',
};

function statusColor(status) {
  return STATUS_COLOR[status] || STATUS_COLOR.idle;
}

const activeTab = computed(() =>
  props.tabs.find(t => t.id === props.activeId) || { icon: 'panel-left-open', label: 'Sidebar' });
const tabIcon = computed(() => activeTab.value.icon);
const tabLabel = computed(() => activeTab.value.label);

/** A name with no folder behind it still needs a square: utils.js' palette. */
function monogram(name) {
  return window.getProjectAvatar
    ? window.getProjectAvatar(name || '')
    : { initials: (name || '?').slice(0, 2).toUpperCase(), color: '#666' };
}

const shortPath = (p) => p.split('/').filter(Boolean).pop() || p;

// ── Sessions ──────────────────────────────────────────────────────
// The sessions tab's own list, under the filter tab that is selected and the
// search that is typed — the rail is that list, not a different one. Flattened
// and newest first: the project grouping is what the avatar itself says.
const sessionItems = computed(() => {
  const state = stateFromStore(store);
  const filters = {
    showArchived: store.showArchived,
    showStarredOnly: store.showStarredOnly,
    showRunningOnly: store.showRunningOnly,
    showTodayOnly: store.showTodayOnly,
    activePtyIds: store.activePtyIds,
  };
  const out = [];
  for (const project of store.projects) {
    // A project the query named keeps all of its sessions, exactly as in
    // SidebarApp — the query named the project, so the project is the result.
    const matchedByName = !!store.searchMatchProjectPaths?.has(project.projectPath);
    const sessions = filterSessions(project.sessions, {
      ...filters,
      searchMatchIds: matchedByName ? null : store.searchMatchIds,
    });
    for (const session of sessions) {
      out.push({
        key: session.sessionId,
        projectPath: project.projectPath,
        label: `${shortPath(project.projectPath)} — ${sessionTitle(session, session.sessionId)}`,
        status: columnOf(session.sessionId, state),
        active: session.sessionId === store.activeSessionId,
        sortTime: new Date(session.modified || 0).getTime() || 0,
        payload: session,
      });
    }
  }
  return out.sort((a, b) => b.sortTime - a.sortTime);
});

// ── Board ─────────────────────────────────────────────────────────
// The board's project filter, which is the only control its sidebar has that
// the board itself does not. Same rows, same counts — see board-projects.js.
const boardItems = computed(() => [
  {
    key: '__all__',
    icon: 'list',
    color: 'var(--surface-card-hover)',
    label: 'All projects',
    active: !store.boardProjectFilter,
    payload: null,
  },
  ...boardProjectRows(store).map(row => ({
    key: row.projectPath,
    projectPath: row.projectPath,
    label: `${row.name} — ${row.count} session${row.count === 1 ? '' : 's'}`,
    count: row.count,
    active: row.projectPath === store.boardProjectFilter,
    payload: row.projectPath,
  })),
]);

// ── Plans ─────────────────────────────────────────────────────────
const planItems = computed(() => (store.plans || []).map((plan) => {
  const title = plan.title || plan.filename;
  return {
    key: plan.filename,
    ...monogram(title),
    label: title,
    payload: plan,
  };
}));

// ── Projects ──────────────────────────────────────────────────────
// store.allProjects, not store.projects: which projects exist is not a question
// the sessions filter tab gets to answer. Worktrees are folded into their
// parent on the tab itself and are not rows of their own here either.
const WORKTREE_RE = /\/\.claude\/worktrees\/[^/]+\/?$/;

const projectItems = computed(() => {
  const all = store.allProjects?.length ? store.allProjects : store.projects;
  return (all || [])
    .filter(p => !WORKTREE_RE.test(p.projectPath))
    .map(p => ({
      key: p.projectPath,
      projectPath: p.projectPath,
      label: `${shortPath(p.projectPath)} — ${p.projectPath}`,
      payload: p,
    }))
    .sort((a, b) => shortPath(a.projectPath).localeCompare(shortPath(b.projectPath)));
});

// ── Accounts ──────────────────────────────────────────────────────
const accountItems = computed(() => (store.accounts || []).map(acc => ({
  key: acc.id,
  ...monogram(acc.name),
  label: acc.id === store.activeAccountId ? `${acc.name} — active` : acc.name,
  // The rail marks the account whose panel is open, and the green pip marks the
  // one Claude is actually running as — the two are not the same question.
  active: acc.id === store.accountViewerId,
  status: acc.id === store.activeAccountId ? 'running' : null,
  payload: acc,
})));

const items = computed(() => {
  switch (props.activeId) {
    case 'board': return boardItems.value;
    case 'plans': return planItems.value;
    case 'projects': return projectItems.value;
    case 'accounts': return accountItems.value;
    default: return sessionItems.value;
  }
});

const EMPTY = {
  sessions: 'No sessions',
  board: 'No projects',
  plans: 'No plans',
  projects: 'No projects',
  accounts: 'No accounts',
};

const emptyLabel = computed(() => EMPTY[props.activeId] || '');

function pick(item) {
  switch (props.activeId) {
    // Set here rather than emitted: the board's own sidebar sets it directly
    // too, and the two controls have to mean the same thing.
    case 'board':
      store.boardProjectFilter = store.boardProjectFilter === item.payload ? null : item.payload;
      break;
    case 'plans': emit('open-plan', item.payload); break;
    case 'projects': emit('open-project', item.payload); break;
    case 'accounts': emit('open-account', item.payload); break;
    default: emit('open-session', item.payload);
  }
}
</script>
