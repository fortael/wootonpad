<template>
  <!-- Always rendered, empty or not. It was hidden when it had nothing, so the
       sidebar's whole top shifted every time the last turn was read — and an
       empty rail is itself the answer to "is anything running". -->
  <div class="sbx-unread">
    <div class="sbx-unread__header">
      <span class="sbx-unread__dot" :class="{ 'is-quiet': !unreadCount }"></span>
      <span class="sbx-unread__label">Active</span>
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
          {
            'sbx-unread__avatar--open': row.sessionId === activeSessionId,
            'is-read': !row.unread,
          },
        ]"
        :title="row.title"
        @click="$emit('select', row.session)"
      >
        <!-- The avatar and its two marks move together: the wrapper is what
             bounces, so the pip and the badge stay stuck to the corners of the
             thing that is jumping. -->
        <span class="sbx-unread__stack">
          <ProjectAvatar class="sbx-unread__monogram" :project-path="row.projectPath" />
          <!-- The session's own status mark, repeated small in the corner — the
               spinning arc, the orange dot and the blue one the sidebar row
               already draws. Idle is the only lane without one: it is making
               no claim. The mark matters most on hover, where the expanding
               pill takes the count away and this is all that is left. -->
          <span
            v-if="row.status !== 'idle'"
            class="sbx-unread__pip"
            :class="`sbx-unread__pip--${row.status}`"
          ></span>
          <span v-if="row.unread" class="sbx-unread__badge">1</span>
        </span>
        <!-- The session, not its project: a rail of four avatars from the same
             project is otherwise four identical labels. The project is still
             the avatar, and the full pair is in the tooltip. -->
        <span class="sbx-unread__meta">
          <span class="sbx-unread__name">{{ row.name }}</span>
        </span>
      </button>
    </div>

    <div v-else class="sbx-unread__empty">Nothing running</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import ProjectAvatar from './ProjectAvatar.vue';
import { sessionTitle } from '../session-title.js';

// Four lanes now, not two — see activeSessions() in session-column.js. The
// reason is the half of the answer the row cannot draw: why it is on the rail.
const STATUSES = ['waiting', 'running', 'done', 'idle'];
const REASONS = {
  waiting: 'needs input',
  running: 'working',
  done: 'response ready',
  idle: 'running, idle',
};
// A finished turn you have already opened is not "response ready" — that is
// the thing the dimming says, and the tooltip should not contradict it.
const READ_REASONS = { done: 'answered' };

const props = defineProps({
  // [{ sessionId, projectPath, project, status, unread, session }] —
  // activeSessions()
  items: { type: Array, default: () => [] },
  activeSessionId: { type: String, default: '' },
});

defineEmits(['select']);

const sessionName = (session, fallback) => sessionTitle(session, fallback);

const rows = computed(() => (props.items || []).map((item) => {
  const name = sessionName(item.session, item.project || item.sessionId);
  const status = STATUSES.includes(item.status) ? item.status : 'done';
  // The landing page's mock rail still feeds the older unread-only shape, where
  // being on the rail was itself the claim that it was unread.
  const unread = item.unread === undefined
    ? (status === 'waiting' || status === 'done')
    : !!item.unread;
  return {
    sessionId: item.sessionId,
    projectPath: item.projectPath || '',
    session: item.session,
    status,
    unread,
    name,
    // The hover label is short by design, so the tooltip carries what it left
    // out: which project, and why the session is on the rail at all.
    title: `${item.project ? item.project + ' — ' : ''}${name} — `
      + ((!unread && READ_REASONS[status]) || REASONS[status])
      + (unread ? ' — unread' : ''),
  };
}));

// Only the unread half lights the header's dot. The rail being full of working
// sessions is not something to deal with.
const unreadCount = computed(() => rows.value.filter((row) => row.unread).length);
</script>
