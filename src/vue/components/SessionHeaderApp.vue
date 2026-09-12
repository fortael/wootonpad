<template>
  <div v-if="store.headerSession" class="sbx-sesshead">
    <!-- Two lines, not one row of everything: the name and where it lives on
         top, the model's own title for the session underneath it. They were
         competing for the same line, and the second one sat past the project
         path where it read as another piece of metadata rather than as what
         this session is about. -->
    <div class="sbx-sesshead__identity">
      <ProjectAvatar class="sbx-sesshead__avatar" :project-path="session.projectPath" />

      <div class="sbx-sesshead__text">
        <div class="sbx-sesshead__titlerow">
          <span class="sbx-sesshead__title" :title="sessionName">{{ sessionName }}</span>

          <span class="sbx-sesshead__sep">·</span>

          <span class="sbx-sesshead__project" :title="session.projectPath">{{ projectShortPath }}</span>
        </div>

        <span v-if="aiTitle" class="sbx-sesshead__ai" :title="aiTitle">{{ aiTitle }}</span>
      </div>
    </div>

    <div class="sbx-sesshead__controls">
      <span v-if="messageCount || timeStr" class="sbx-sesshead__meta">
        <span v-if="messageCount">{{ messageCount }} msgs</span>
        <span v-if="messageCount && timeStr" class="sbx-sesshead__meta-sep">·</span>
        <span v-if="timeStr">{{ timeStr }}</span>
      </span>

      <span class="sbx-sesshead__badge" :class="statusClass">
        <span class="sbx-sesshead__dot"></span>
        <span class="sbx-sesshead__badge-label">{{ statusLabel }}</span>
      </span>

      <span
        v-if="store.headerAccount"
        class="sbx-sesshead__chip"
        :title="store.headerAccount"
      >{{ store.headerAccount }}</span>

      <span
        v-if="store.headerShellProfile"
        class="sbx-sesshead__chip sbx-sesshead__chip--mono"
        :title="store.headerShellProfile"
      >{{ store.headerShellProfile }}</span>

      <span
        v-if="store.headerPtyTitle"
        class="sbx-sesshead__chip sbx-sesshead__chip--mono sbx-sesshead__chip--pty"
        :title="store.headerPtyTitle"
      >{{ store.headerPtyTitle }}</span>

      <!-- The same menu the list rows and the board cards carry, on the open
           session itself: rename, fork, archive, delete and the session's
           facts were all a trip back to the sidebar. The session id went with
           it — nothing here needed eight hex digits, and the menu's own copy
           button hands over the whole thing. -->
      <SessionMenu :session="session" :is-running="isRunning" />

      <!-- The panel toggles and Stop used to live here. They are all on
           SessionPanelRail now, overlaid on the terminal: this header is
           hidden in the board's bottom split, and those controls have to
           reach that view too. -->
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { store } from '../store.js';
import ProjectAvatar from './ProjectAvatar.vue';
import SessionMenu from './SessionMenu.vue';

const session = computed(() => store.headerSession);
const sessionId = computed(() => session.value?.sessionId);

const projectShortPath = computed(() => {
  const p = session.value?.projectPath || '';
  return p.split('/').filter(Boolean).slice(-2).join('/');
});

const sessionName = computed(() => {
  const s = session.value;
  if (!s) return '';
  const name = s.name || s.summary || 'Session';
  return window.cleanDisplayName ? window.cleanDisplayName(name) : name;
});

const aiTitle = computed(() => {
  const s = session.value;
  if (!s?.aiTitle) return null;
  const cleaned = window.cleanDisplayName ? window.cleanDisplayName(s.aiTitle) : s.aiTitle;
  return cleaned !== sessionName.value ? cleaned : null;
});

const isRunning = computed(() => store.activePtyIds?.has(sessionId.value));
const isBusy = computed(() => store.sessionBusyState?.get(sessionId.value) || false);
const isAttention = computed(() => store.attentionSessions?.has(sessionId.value));

const statusClass = computed(() => ({
  'is-running': isRunning.value,
  'is-busy': isBusy.value,
  'is-attention': isAttention.value,
}));

const statusLabel = computed(() => {
  if (isAttention.value) return 'Needs attention';
  if (isBusy.value) return 'Working…';
  if (isRunning.value) return 'Active';
  return 'Stopped';
});

const messageCount = computed(() => session.value?.messageCount || null);

const timeStr = computed(() => {
  const s = session.value;
  if (!s) return '';
  const t = window.lastActivityTime?.get(s.sessionId) || new Date(s.modified);
  return window.formatDate ? window.formatDate(t) : '';
});

</script>
