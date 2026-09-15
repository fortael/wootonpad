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
          <!-- The name is still being decided — see titlePending. The bar is
               the honest shape of "a title is coming", and the sentence that
               opened the conversation is already on the line below. -->
          <span
            v-if="pending"
            class="session-title-wait"
            role="status"
            aria-label="Naming this session"
          ></span>
          <!-- Keyed by the name itself, so the element is replaced when the
               title resolves and the fade runs exactly once — on the change,
               not on every re-render. -->
          <span v-else :key="displayName" class="session-title-in">{{ displayName }}</span>
        </div>
        <div v-if="subtitle" class="session-subtitle">{{ subtitle }}</div>
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
import { tick, fastTick } from '../time-tick.js';
import {
  sessionTitle, sessionSubtitle, sessionFirstPrompt, titlePending,
} from '../session-title.js';
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

// The model's title leads and the first prompt goes under it — see
// session-title.js for why round that way.
const displayName = computed(() => sessionTitle(props.session, props.session.sessionId));
// The wait has to be able to expire on screen rather than only when something
// else happens to re-render the row. A row that is *not* waiting subscribes to
// the slow clock and nothing else; one that is subscribes to the fast one, so
// the bar comes down within a few seconds of the wait being over rather than at
// the next half-minute. See time-tick.js.
const pending = computed(() => {
  if (!titlePending(props.session, props.isBusy)) { tick.value; return false; }
  fastTick.value;
  return titlePending(props.session, props.isBusy);
});
// While the title is being decided the row would otherwise show the opening
// sentence twice — once as the placeholder's stand-in and once beneath it. The
// line below is the one that keeps it.
const subtitle = computed(() => (pending.value
  ? sessionFirstPrompt(props.session)
  : sessionSubtitle(props.session)));


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
