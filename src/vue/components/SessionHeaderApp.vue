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
          <!-- Still being named. The same wait the sidebar row shows, in the
               same place the name will land — see titlePending. -->
          <span
            v-if="pending"
            class="sbx-sesshead__title sbx-sesshead__title--wait session-title-wait"
            role="status"
            aria-label="Naming this session"
          ></span>
          <span
            v-else
            :key="sessionName"
            class="sbx-sesshead__title session-title-in"
            :title="sessionName"
          >{{ sessionName }}</span>

          <span class="sbx-sesshead__sep">·</span>

          <span class="sbx-sesshead__project" :title="session.projectPath">{{ projectShortPath }}</span>
        </div>

        <span v-if="subtitle" class="sbx-sesshead__ai" :title="subtitle">{{ subtitle }}</span>
      </div>
    </div>

    <div class="sbx-sesshead__controls">
      <span v-if="messageCount || timeStr" class="sbx-sesshead__meta">
        <span v-if="messageCount">{{ messageCount }} msgs</span>
        <span v-if="messageCount && timeStr" class="sbx-sesshead__meta-sep">·</span>
        <span v-if="timeStr">{{ timeStr }}</span>
      </span>

      <!-- What the four words actually mean. "Active" and "Stopped" are the
           pair worth explaining: they are about whether a Claude process
           exists, not about whether the conversation is finished, and nothing
           else on screen says so. -->
      <span
        class="sbx-sesshead__badge"
        :class="statusClass"
        :data-tooltip="statusHint"
      >
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
import { sessionTitle, sessionSubtitle, sessionFirstPrompt, titlePending } from '../session-title.js';
import { tick, fastTick } from '../time-tick.js';

const session = computed(() => store.headerSession);
const sessionId = computed(() => session.value?.sessionId);

const projectShortPath = computed(() => {
  const p = session.value?.projectPath || '';
  return p.split('/').filter(Boolean).slice(-2).join('/');
});

// The top line is what the session is about; the one under it is how it
// opened. See session-title.js.
const sessionName = computed(() => (session.value ? sessionTitle(session.value) : ''));
// Subscribed to the fast clock only while actually waiting — see SessionItem
// for why round that way, and time-tick.js for what the two clocks are.
const pending = computed(() => {
  if (!titlePending(session.value, isBusy.value)) { tick.value; return false; }
  fastTick.value;
  return titlePending(session.value, isBusy.value);
});
const subtitle = computed(() => (pending.value
  ? sessionFirstPrompt(session.value)
  : sessionSubtitle(session.value)));

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

// The distinction the label alone does not carry: this is about the process,
// not about the conversation. A session with a hundred messages in it can be
// Stopped, and an empty one that was just opened is Active.
const statusHint = computed(() => {
  if (isAttention.value) {
    return 'Claude has stopped to ask you something and will not go on until it is answered.';
  }
  if (isBusy.value) {
    return 'Claude is running and answering right now.';
  }
  if (isRunning.value) {
    return 'A live Claude process is running for this session, idle and waiting for your next message. '
      + 'Closing this view leaves it running; Stop ends it.';
  }
  return 'No Claude process is running. The conversation is saved on disk — sending a message '
    + 'starts one again and carries on where it left off.';
});

const messageCount = computed(() => session.value?.messageCount || null);

const timeStr = computed(() => {
  const s = session.value;
  if (!s) return '';
  const t = window.lastActivityTime?.get(s.sessionId) || new Date(s.modified);
  return window.formatDate ? window.formatDate(t) : '';
});

</script>
