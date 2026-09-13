<template>
  <div :class="isWorktree ? 'worktree-group' : 'project-group'" :id="folderId">

    <!-- Worktree header -->
    <div v-if="isWorktree" class="worktree-header" :class="{ collapsed }" :id="'ph-' + folderId" @click.self="toggle">
      <span class="worktree-branch-icon" @click.stop="toggle"><SbIcon name="git-branch" :size="13" tone="muted" /></span>
      <span class="worktree-name" @click.stop="toggle">{{ worktreeName }}</span>
      <button class="worktree-hide-btn" data-tooltip="Hide worktree" @click.stop="$emit('remove-project', project.projectPath)"><SbIcon name="x" :size="12" tone="muted" /></button>
      <button class="project-new-btn worktree-new-btn" data-tooltip="New session in worktree" @click.stop="$emit('new-session', project, $event.currentTarget)"><SbIcon name="plus" :size="12" tone="muted" /></button>
    </div>

    <!-- Project header -->
    <div v-else class="project-header" :class="{ collapsed, 'has-active-session': hasActiveSession }" :id="'ph-' + folderId" @click.self="toggle">
      <span class="arrow" @click.stop="toggle">&#9660;</span>
      <ProjectAvatar class="project-header-avatar" :project-path="project.projectPath" @click.stop="toggle" />
      <span class="project-name" @click.stop="toggle">{{ shortName }}</span>
      <!-- Jumps to the project view. Lives on the group header, not on the
           session rows: the target is the same for every row in the group,
           and this is where the other project-scoped controls already are.
           Goes through the global bridge so no callback prop has to be
           threaded down from App.vue. -->
      <button
        type="button"
        class="project-open-btn"
        data-tooltip="Open project"
        aria-label="Open project"
        @click.stop="openProject"
      >
        <SbIcon name="square-arrow-out-up-right" :size="13" tone="muted" />
      </button>
      <button class="project-settings-btn" data-tooltip="Project settings" @click.stop="$emit('settings', project.projectPath)"><SbIcon name="settings" :size="13" tone="muted" /></button>
      <button class="project-archive-btn" data-tooltip="Archive all sessions" @click.stop="archiveAll"><SbIcon name="archive" :size="13" tone="muted" /></button>
      <button class="project-new-btn" data-tooltip="New session" @click.stop="$emit('new-session', project, $event.currentTarget)"><SbIcon name="plus" :size="13" tone="muted" /></button>
    </div>

    <!-- Sessions list -->
    <div :class="isWorktree ? 'worktree-sessions' : 'project-sessions'" :id="'sessions-' + folderId">

      <template v-for="item in visibleItems" :key="item.type === 'slug' ? 'slug-' + item.slug : item.session.sessionId">
        <SlugGroup
          v-if="item.type === 'slug'"
          :slug="item.slug"
          :sessions="item.sessions"
          :active-pty-ids="activePtyIds"
          :active-session-id="activeSessionId"
          :session-busy-state="sessionBusyState"
          :attention-sessions="attentionSessions"
          :response-ready-sessions="responseReadySessions"
          @open="(s) => $emit('open', s)"
          @archive-all="(sessions) => $emit('archive-sessions', sessions)"
        />
        <SessionItem
          v-else
          :session="item.session"
          :is-active="activeSessionId === item.session.sessionId"
          :is-running="activePtyIds.has(item.session.sessionId)"
          :is-busy="sessionBusyState.get(item.session.sessionId) || false"
          :is-attention="attentionSessions.has(item.session.sessionId)"
          :is-response-ready="responseReadySessions.has(item.session.sessionId)"
          @open="$emit('open', item.session)"
        />
      </template>

      <div
        v-if="olderItems.length > 0"
        class="sessions-more-toggle"
        :class="{ expanded: showOlder }"
        @click="showOlder = !showOlder"
      >
        {{ showOlder ? '- hide older' : `+ ${olderItems.length} older` }}
      </div>

      <template v-if="showOlder">
        <template v-for="item in olderItems" :key="item.type === 'slug' ? 'slug-' + item.slug : item.session.sessionId">
          <SlugGroup
            v-if="item.type === 'slug'"
            :slug="item.slug"
            :sessions="item.sessions"
            :active-pty-ids="activePtyIds"
            :active-session-id="activeSessionId"
            :session-busy-state="sessionBusyState"
            :attention-sessions="attentionSessions"
            :response-ready-sessions="responseReadySessions"
            @open="(s) => $emit('open', s)"
            @archive-all="(sessions) => $emit('archive-sessions', sessions)"
          />
          <SessionItem
            v-else
            :session="item.session"
            :is-active="activeSessionId === item.session.sessionId"
            :is-running="activePtyIds.has(item.session.sessionId)"
            :is-busy="sessionBusyState.get(item.session.sessionId) || false"
            :is-attention="attentionSessions.has(item.session.sessionId)"
            :is-response-ready="responseReadySessions.has(item.session.sessionId)"
            @open="$emit('open', item.session)"
          />
        </template>
      </template>

      <!-- Nested worktree sub-groups -->
      <ProjectGroup
        v-for="wt in worktrees"
        :key="wt.projectPath"
        :project="wt"
        :is-worktree="true"
        :active-pty-ids="activePtyIds"
        :active-session-id="activeSessionId"
        :session-busy-state="sessionBusyState"
        :attention-sessions="attentionSessions"
        :response-ready-sessions="responseReadySessions"
        :search-match-ids="searchMatchIds"
        :show-archived="showArchived"
        :show-starred-only="showStarredOnly"
        :show-running-only="showRunningOnly"
        :show-today-only="showTodayOnly"
        :visible-session-count="visibleSessionCount"
        :session-max-age-days="sessionMaxAgeDays"
        @open="(s) => $emit('open', s)"
        @new-session="(p, btn) => $emit('new-session', p, btn)"
        @settings="(path) => $emit('settings', path)"
        @archive-sessions="(sessions) => $emit('archive-sessions', sessions)"
        @remove-project="(path) => $emit('remove-project', path)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import SessionItem from './SessionItem.vue';
import SlugGroup from './SlugGroup.vue';
import ProjectAvatar from './ProjectAvatar.vue';
import SbIcon from './SbIcon.vue';
import { filterSessions } from '../session-filter.js';

const props = defineProps({
  project: { type: Object, required: true },
  isWorktree: { type: Boolean, default: false },
  activePtyIds: { type: Set, required: true },
  activeSessionId: { type: String, default: null },
  sessionBusyState: { type: Map, required: true },
  attentionSessions: { type: Set, required: true },
  responseReadySessions: { type: Set, required: true },
  searchMatchIds: { type: Set, default: null },
  showArchived: Boolean,
  showStarredOnly: Boolean,
  showRunningOnly: Boolean,
  showTodayOnly: Boolean,
  visibleSessionCount: { type: Number, default: 10 },
  sessionMaxAgeDays: { type: Number, default: 3 },
  worktrees: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'open', 'new-session', 'settings', 'archive-sessions', 'remove-project',
]);

const folderId = computed(() => 'project-' + props.project.projectPath.replace(/[^a-zA-Z0-9_-]/g, '_'));

const avatar = computed(() =>
  window.getProjectAvatar ? window.getProjectAvatar(props.project.projectPath) : { initials: '?', color: '#666' }
);

const shortName = computed(() =>
  props.project.projectPath.split('/').filter(Boolean).slice(-2).join('/')
);

const hasActiveSession = computed(() =>
  !!props.activeSessionId && (props.project.sessions || []).some(s => s.sessionId === props.activeSessionId)
);

const worktreeName = computed(() => {
  const match = props.project.projectPath.match(/\/\.claude\/worktrees\/([^/]+)\/?$/);
  return match?.[1] || props.project.projectPath.split('/').pop();
});

// Initial collapse state: auto-collapse stale or project-name-only matches.
// This used to be `ref(() => {...})`, which stored the function itself — always
// truthy, so every group mounted collapsed and the heuristic never ran.
function initialCollapsed() {
  if (props.project._projectMatchedOnly) return true;
  // A name match with session hits inside it arrives with searchMatchIds null
  // — the list already picked the sessions (SidebarApp) — so the flag, not the
  // match set, is what says "this group is a search result, open it".
  if (props.project._projectMatched) return false;
  if (props.searchMatchIds || props.showStarredOnly || props.showRunningOnly) return false;
  const sessions = props.project.sessions || [];
  if (sessions.length === 0) return false;
  const mostRecent = sessions.reduce((a, b) => new Date(b.modified) > new Date(a.modified) ? b : a);
  return (Date.now() - new Date(mostRecent.modified)) > props.sessionMaxAgeDays * 86400000;
}

const collapsed = ref(initialCollapsed());

function toggle() { collapsed.value = !collapsed.value; }

const showOlder = ref(false);

// Build mixed items list: individual sessions + slug groups
const allItems = computed(() => {
  // Shared with the board — see src/vue/session-filter.js.
  const sessions = filterSessions(props.project.sessions, {
    showArchived: props.showArchived,
    showStarredOnly: props.showStarredOnly,
    showRunningOnly: props.showRunningOnly,
    showTodayOnly: props.showTodayOnly,
    searchMatchIds: props.searchMatchIds,
    activePtyIds: props.activePtyIds,
  });

  // Group by slug
  const slugMap = new Map();
  const ungrouped = [];
  for (const s of sessions) {
    if (s.slug) {
      if (!slugMap.has(s.slug)) slugMap.set(s.slug, []);
      slugMap.get(s.slug).push(s);
    } else {
      ungrouped.push(s);
    }
  }

  const items = [];

  for (const s of ungrouped) {
    const running = props.activePtyIds.has(s.sessionId);
    const sortName = (s.name || s.summary || s.sessionId).toLowerCase();
    const sortTime = new Date(s.modified).getTime();
    items.push({ type: 'session', session: s, sortName, sortTime, pinned: !!s.starred, running });
  }

  for (const [slug, slugSessions] of slugMap) {
    if (slugSessions.length === 1) {
      const s = slugSessions[0];
      const sortName = (s.name || s.summary || s.sessionId).toLowerCase();
      const sortTime = new Date(s.modified).getTime();
      items.push({ type: 'session', session: s, sortName, sortTime, pinned: !!s.starred, running: props.activePtyIds.has(s.sessionId) });
    } else {
      const hasRunning = slugSessions.some(s => props.activePtyIds.has(s.sessionId));
      const hasPinned = slugSessions.some(s => s.starred);
      const mostRecentTime = Math.max(...slugSessions.map(s => new Date(s.modified).getTime()));
      items.push({ type: 'slug', slug, sessions: slugSessions, sortName: slug.toLowerCase(), sortTime: mostRecentTime, pinned: hasPinned, running: hasRunning });
    }
  }

  // Sort: running+pinned > running > pinned > alphabetical (stable, no reordering during active sessions)
  items.sort((a, b) => {
    const aPri = (a.pinned && a.running ? 3 : a.running ? 2 : a.pinned ? 1 : 0);
    const bPri = (b.pinned && b.running ? 3 : b.running ? 2 : b.pinned ? 1 : 0);
    if (aPri !== bPri) return bPri - aPri;
    return a.sortName.localeCompare(b.sortName);
  });

  return items;
});

const visibleItems = computed(() => {
  const anyFilter = props.showStarredOnly || props.showRunningOnly || props.showTodayOnly || props.searchMatchIds;
  if (anyFilter) return allItems.value;
  const ageCutoff = Date.now() - props.sessionMaxAgeDays * 86400000;
  let count = 0;
  return allItems.value.filter(item => {
    if (item.running || item.pinned || (count < props.visibleSessionCount && item.sortTime >= ageCutoff)) {
      count++;
      return true;
    }
    return false;
  });
});

const olderItems = computed(() => {
  const visIds = new Set(visibleItems.value.map(i => i.type === 'slug' ? 'slug-' + i.slug : i.session.sessionId));
  return allItems.value.filter(i => !visIds.has(i.type === 'slug' ? 'slug-' + i.slug : i.session.sessionId));
});

async function archiveAll() {
  emit('archive-sessions', props.project.sessions.filter(s => !s.archived));
}

// ProjectsApp.vue reaches the project viewer the same way.
function openProject() {
  window.__sb?.openProject?.(props.project);
}

// SVG icons
</script>
