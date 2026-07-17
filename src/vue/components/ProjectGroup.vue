<template>
  <div class="project-group" :id="folderId">
    <!-- Project header -->
    <div class="project-header" :class="{ collapsed }" :id="'ph-' + folderId" @click.self="toggle">
      <span class="arrow" @click.stop="toggle">&#9660;</span>
      <span class="project-header-avatar" :style="{ background: avatar.color }" @click.stop="toggle">{{ avatar.initials }}</span>
      <span class="project-name" @click.stop="toggle">{{ shortName }}</span>
      <button class="project-settings-btn" data-tooltip="Project settings" @click.stop="$emit('settings', project.projectPath)" v-html="gearSvg"></button>
      <button class="project-archive-btn" data-tooltip="Archive all sessions" @click.stop="archiveAll" v-html="archiveSvg"></button>
      <button class="project-new-btn" data-tooltip="New session" @click.stop="$emit('new-session', project)" v-html="plusSvg"></button>
    </div>

    <!-- Flat session list (no slug sub-groups) -->
    <div class="project-sessions" :id="'sessions-' + folderId">
      <SessionItem
        v-for="item in visibleItems"
        :key="item.session.sessionId"
        :session="item.session"
        :is-active="activeSessionId === item.session.sessionId"
        :is-running="activePtyIds.has(item.session.sessionId)"
        :is-busy="sessionBusyState.get(item.session.sessionId) || false"
        :is-attention="attentionSessions.has(item.session.sessionId)"
        :is-response-ready="responseReadySessions.has(item.session.sessionId)"
        @open="$emit('open', item.session)"
        @stop="$emit('stop', item.session.sessionId)"
        @star="$emit('star', item.session.sessionId)"
        @archive="$emit('archive', item.session.sessionId)"
        @fork="$emit('fork', item.session.sessionId)"
        @jsonl="$emit('jsonl', item.session.sessionId)"
        @launch-config="$emit('launch-config', item.session.sessionId)"
        @rename="(id, name) => $emit('rename', id, name)"
      />

      <div
        v-if="olderItems.length > 0"
        class="sessions-more-toggle"
        :class="{ expanded: showOlder }"
        @click="showOlder = !showOlder"
      >
        {{ showOlder ? '- hide older' : `+ ${olderItems.length} older` }}
      </div>

      <template v-if="showOlder">
        <SessionItem
          v-for="item in olderItems"
          :key="item.session.sessionId"
          :session="item.session"
          :is-active="activeSessionId === item.session.sessionId"
          :is-running="activePtyIds.has(item.session.sessionId)"
          :is-busy="sessionBusyState.get(item.session.sessionId) || false"
          :is-attention="attentionSessions.has(item.session.sessionId)"
          :is-response-ready="responseReadySessions.has(item.session.sessionId)"
          @open="$emit('open', item.session)"
          @stop="$emit('stop', item.session.sessionId)"
          @star="$emit('star', item.session.sessionId)"
          @archive="$emit('archive', item.session.sessionId)"
          @fork="$emit('fork', item.session.sessionId)"
          @jsonl="$emit('jsonl', item.session.sessionId)"
          @launch-config="$emit('launch-config', item.session.sessionId)"
          @rename="(id, name) => $emit('rename', id, name)"
        />
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
        @stop="(id) => $emit('stop', id)"
        @star="(id) => $emit('star', id)"
        @archive="(id) => $emit('archive', id)"
        @fork="(id) => $emit('fork', id)"
        @jsonl="(id) => $emit('jsonl', id)"
        @launch-config="(id) => $emit('launch-config', id)"
        @rename="(id, name) => $emit('rename', id, name)"
        @new-session="(p) => $emit('new-session', p)"
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
  'open', 'stop', 'star', 'archive', 'fork', 'jsonl', 'launch-config', 'rename',
  'new-session', 'settings', 'archive-sessions', 'remove-project',
]);

const folderId = computed(() => 'project-' + props.project.projectPath.replace(/[^a-zA-Z0-9_-]/g, '_'));

const avatar = computed(() =>
  window.getProjectAvatar ? window.getProjectAvatar(props.project.projectPath) : { initials: '?', color: '#666' }
);

const shortName = computed(() =>
  props.project.projectPath.split('/').filter(Boolean).slice(-2).join('/')
);

const collapsed = ref(false);
function toggle() { collapsed.value = !collapsed.value; }

const showOlder = ref(false);

const allItems = computed(() => {
  let sessions = props.project.sessions || [];

  // Hide archived sessions unless explicitly showing them
  if (!props.showArchived && !props.searchMatchIds) {
    sessions = sessions.filter(s => !s.archived);
  }

  // Filters
  if (props.showStarredOnly) sessions = sessions.filter(s => s.starred);
  if (props.showRunningOnly) sessions = sessions.filter(s => props.activePtyIds.has(s.sessionId));
  if (props.showTodayOnly) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    sessions = sessions.filter(s => {
      if (!s.modified) return false;
      const d = new Date(s.modified);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr;
    });
  }
  if (props.searchMatchIds) {
    sessions = sessions.filter(s => props.searchMatchIds.has(s.sessionId));
  }

  // Sort: running+starred > running > starred > recency
  sessions = [...sessions].sort((a, b) => {
    const aR = props.activePtyIds.has(a.sessionId);
    const bR = props.activePtyIds.has(b.sessionId);
    const aPri = (a.starred && aR ? 3 : aR ? 2 : a.starred ? 1 : 0);
    const bPri = (b.starred && bR ? 3 : bR ? 2 : b.starred ? 1 : 0);
    if (aPri !== bPri) return bPri - aPri;
    return new Date(b.modified) - new Date(a.modified);
  });

  return sessions.map(s => ({
    session: s,
    sortTime: new Date(s.modified).getTime(),
    pinned: !!s.starred,
    running: props.activePtyIds.has(s.sessionId),
  }));
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
  const visIds = new Set(visibleItems.value.map(i => i.session.sessionId));
  return allItems.value.filter(i => !visIds.has(i.session.sessionId));
});

async function archiveAll() {
  emit('archive-sessions', props.project.sessions.filter(s => !s.archived));
}

const gearSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const archiveSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';
const plusSvg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>';
</script>
