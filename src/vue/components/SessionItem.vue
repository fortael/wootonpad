<template>
  <div
    class="session-item"
    :class="itemClasses"
    :id="'si-' + session.sessionId"
    :data-session-id="session.sessionId"
    @click="$emit('open', session)"
  >
    <div class="session-row">
      <span class="session-status-dot" :class="{ running: isRunning }"></span>

      <div class="session-info">
        <div class="session-summary">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span v-if="session.type === 'terminal'" class="terminal-badge"><SbIcon name="terminal" :size="13" /></span>
          {{ displayName }}
        </div>
        <div v-if="session.aiTitle" class="session-subtitle">{{ cleanName(session.aiTitle) }}</div>
        <div class="session-meta">
          <UsageRing
            v-if="contextPct !== null"
            class="session-context-ring"
            :value="contextPct"
            :size="11"
            :label="contextLabel"
          />
          <!-- app.js's 30s timeago tick writes into this span by class. It must
               stay a separate element: textContent on .session-meta would wipe
               the ring beside it. -->
          <span class="session-meta-text">{{ timeStr }}{{ msgSuffix }}</span>
          <!-- What this session changed, the same numbers the board's cards
               show. A separate element for the same reason as the ring. -->
          <span v-if="churn" class="session-churn">
            <span class="session-churn__added">+{{ churn.added }}</span>
            <span class="session-churn__removed">&minus;{{ churn.removed }}</span>
          </span>
          <!-- Sub-agents this session has out working. They have no rows of
               their own anywhere, so their only trace in the list is here. -->
          <span
            v-if="runningAgents"
            class="session-agents"
            :data-tooltip="`${runningAgents} background task${runningAgents > 1 ? 's' : ''} running`"
          >
            <SbIcon name="bot" :size="11" />{{ runningAgents }}
          </span>
        </div>
      </div>

      <!-- One menu instead of the five hover buttons this row used to carry —
           the same menu the board's cards open, so an action is in one place
           whichever view you are looking at. Renaming is in there too: the
           board has no row to double-click. -->
      <div class="session-actions">
        <SessionMenu :session="session" :is-running="isRunning" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SbIcon from './SbIcon.vue';
import UsageRing from './UsageRing.vue';
import SessionMenu from './SessionMenu.vue';
import { contextPercent, formatContextLabel } from '../context-window.js';
import { sessionChurn } from '../session-churn.js';
import { store } from '../store.js';

const props = defineProps({
  session: { type: Object, required: true },
  isActive: Boolean,
  isRunning: Boolean,
  isBusy: Boolean,
  isAttention: Boolean,
  isResponseReady: Boolean,
});

// Everything else a row can do lives in SessionMenu, which calls the app.js
// bridge directly rather than emitting up through the list.
defineEmits(['open']);

// Kept in the store by App.vue's poller — see store.subagentCounts.
const runningAgents = computed(() => store.subagentCounts.get(props.session.sessionId) || 0);

const contextPct = computed(() => contextPercent(props.session.contextTokens, props.session));
const contextLabel = computed(() => formatContextLabel(props.session.contextTokens, props.session));

const displayName = computed(() => {
  const name = props.session.name || props.session.summary;
  return window.cleanDisplayName ? window.cleanDisplayName(name) : name;
});

const cleanName = (n) => window.cleanDisplayName ? window.cleanDisplayName(n) : n;

const timeStr = computed(() => {
  const t = window.lastActivityTime?.get(props.session.sessionId) || new Date(props.session.modified);
  return window.formatDate ? window.formatDate(t) : '';
});

const msgSuffix = computed(() =>
  props.session.messageCount ? ` · ${props.session.messageCount} msgs` : ''
);

// Shared with the board's cards — see session-churn.js.
const churn = computed(() => sessionChurn(props.session));

const itemClasses = computed(() => ({
  active: props.isActive,
  'has-running-pty': props.isRunning,
  'cli-busy': props.isBusy,
  'needs-attention': props.isAttention,
  'response-ready': props.isResponseReady,
  'is-pinned': !!props.session.starred,
  'archived-item': !!props.session.archived,
  'is-terminal': props.session.type === 'terminal',
}));

</script>
