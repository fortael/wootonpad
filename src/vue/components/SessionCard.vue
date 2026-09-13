<template>
  <article
    class="sbx-board__card"
    :class="[{ 'is-selected': selected, 'is-active': isActive }, focus ? `is-focus-${focus}` : null]"
    :data-session-id="session.sessionId"
    :style="dim"
    @click="$emit('preview', session)"
    @dblclick="$emit('open', session)"
  >
    <span class="sbx-board__edge"></span>
    <!-- Same menu the session list opens, so Pin / Rename / Fork / Archive /
         Delete mean one thing across every view. -->
    <div class="sbx-board__cardmenu">
      <SessionMenu :session="session" :is-running="isRunning" />
    </div>
    <div class="sbx-board__cardtitle">{{ title }}</div>
    <div class="sbx-board__cardmeta">
      <!-- Where the last Summarize said to look next. Ahead of the meta text
           rather than over the title: the title is what the card *is*, and the
           flag is a claim about it that only survives until the next run. -->
      <!-- The glyph alone: a card is as wide as a board column is narrow, and
           the label would take the row the timestamp needs. It is in the
           tooltip, next to what the level means. -->
      <span
        v-if="level"
        class="sbx-focusflag sbx-focusflag--glyph"
        :class="`sbx-focusflag--${focus}`"
        :data-tooltip="`${level.label} — ${level.hint}`"
      >
        <SbIcon name="flag" :size="10" />
      </span>
      <UsageRing
        v-if="contextPct !== null"
        class="sbx-board__ring"
        :value="contextPct"
        :size="11"
        :label="contextLabel"
      />
      <span class="sbx-board__metatext">{{ meta }}</span>
      <!-- Sub-agents this card's session has out working. Same count as the
           sidebar row's — see store.subagentCounts. -->
      <span
        v-if="runningAgents"
        class="sbx-board__agents"
        :data-tooltip="`${runningAgents} background task${runningAgents > 1 ? 's' : ''} running`"
      >
        <SbIcon name="bot" :size="10" />{{ runningAgents }}
      </span>
    </div>
    <div v-if="churn" class="sbx-board__churn">
      <span class="sbx-board__added">+{{ churn.added }}</span>
      <span class="sbx-board__removed">−{{ churn.removed }}</span>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import { store } from '../store.js';
import SbIcon from './SbIcon.vue';
import UsageRing from './UsageRing.vue';
import SessionMenu from './SessionMenu.vue';
import { focusLevel } from '../board-focus.js';
import { contextPercent, formatContextLabel } from '../context-window.js';
import { freshnessOpacity } from '../freshness.js';
import { sessionChurn } from '../session-churn.js';
import { tick } from '../time-tick.js';

const props = defineProps({
  session: { type: Object, required: true },
  // Fade by age. The board makes this a toggle; a project's Sessions tab has
  // it on from the start, where the list is a history rather than a worklist.
  highlightFresh: { type: Boolean, default: false },
  // Shown in the pane below the board.
  selected: { type: Boolean, default: false },
});

defineEmits(['preview', 'open']);

const id = computed(() => props.session.sessionId);
const isRunning = computed(() => store.activePtyIds.has(id.value));
const isActive = computed(() => store.activeSessionId === id.value);

// app.js writes into window.lastActivityTime outside Vue; tick is what makes a
// card re-read it. See src/vue/time-tick.js.
const time = computed(() => {
  tick.value; // eslint-disable-line no-unused-expressions -- re-read timeago
  return window.lastActivityTime?.get(id.value) || new Date(props.session.modified);
});

const title = computed(() => {
  const name = props.session.name || props.session.summary;
  return (window.cleanDisplayName ? window.cleanDisplayName(name) : name) || id.value;
});

const meta = computed(() => {
  const msgs = props.session.messageCount ? ` · ${props.session.messageCount} msgs` : '';
  // Counted from this session's transcript, so a worktree shows its own work.
  const files = props.session.changedFiles ? ` · ${props.session.changedFiles} files` : '';
  return (window.formatDate ? window.formatDate(time.value) : '') + msgs + files;
});

// Shared with the sidebar's rows — see session-churn.js.
const churn = computed(() => sessionChurn(props.session));

const runningAgents = computed(() => store.subagentCounts.get(props.session.sessionId) || 0);

const dim = computed(() =>
  props.highlightFresh ? { opacity: freshnessOpacity(time.value) } : null
);

// From the last Summarize run — see board-focus.js. Nothing is flagged until
// one has been asked for, and a new run replaces the whole map.
const focus = computed(() => store.boardFocus.get(id.value) || 0);
const level = computed(() => focusLevel(focus.value));

const contextPct = computed(() => contextPercent(props.session.contextTokens, props.session));
const contextLabel = computed(() => formatContextLabel(props.session.contextTokens, props.session));
</script>
