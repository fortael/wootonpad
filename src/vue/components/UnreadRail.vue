<template>
  <!-- Always rendered, empty or not. It was hidden when it had nothing, so the
       sidebar's whole top shifted every time the last turn was read — and an
       empty rail is itself the answer to "is anything waiting for me". -->
  <div class="sbx-unread">
    <div class="sbx-unread__header">
      <span class="sbx-unread__dot" :class="{ 'is-quiet': !rows.length }"></span>
      <span class="sbx-unread__label">Unread</span>
      <div class="sbx-unread__spacer"></div>
      <span class="sbx-unread__count">{{ rows.length }}</span>
    </div>

    <div v-if="rows.length" class="sbx-unread__rail">
      <button
        v-for="row in rows"
        :key="row.sessionId"
        type="button"
        class="sbx-unread__avatar"
        :class="[
          `sbx-unread__avatar--${row.status}`,
          { 'sbx-unread__avatar--open': row.sessionId === activeSessionId },
        ]"
        :title="row.title"
        @click="$emit('select', row.session)"
      >
        <ProjectAvatar class="sbx-unread__monogram" :project-path="row.projectPath" />
        <!-- The session, not its project: a rail of four avatars from the same
             project is otherwise four identical labels. The project is still
             the avatar, and the full pair is in the tooltip. -->
        <span class="sbx-unread__meta">
          <span class="sbx-unread__name">{{ row.name }}</span>
        </span>
      </button>
    </div>

    <div v-else class="sbx-unread__empty">Nothing unread</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import ProjectAvatar from './ProjectAvatar.vue';

// Only the two states that want something. Anything else is not unread — see
// unreadSessions() in session-column.js, which is also what the dock counts.
const STATUSES = ['waiting', 'done'];
const REASONS = { waiting: 'needs input', done: 'response ready' };

const props = defineProps({
  // [{ sessionId, projectPath, project, status, session }] — unreadSessions()
  items: { type: Array, default: () => [] },
  activeSessionId: { type: String, default: '' },
});

defineEmits(['select']);

function sessionName(session, fallback) {
  const raw = session?.name || session?.aiTitle || session?.summary || '';
  const clean = window.cleanDisplayName ? window.cleanDisplayName(raw) : raw;
  return clean || fallback;
}

const rows = computed(() => (props.items || []).map((item) => {
  const name = sessionName(item.session, item.project || item.sessionId);
  const status = STATUSES.includes(item.status) ? item.status : 'done';
  return {
    sessionId: item.sessionId,
    projectPath: item.projectPath || '',
    session: item.session,
    status,
    name,
    // The hover label is short by design, so the tooltip carries what it left
    // out: which project, and why the session is on the rail at all.
    title: `${item.project ? item.project + ' — ' : ''}${name} — ${REASONS[status]}`,
  };
}));
</script>
