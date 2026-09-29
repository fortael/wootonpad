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
    <div class="sbx-board__cardtitle">
      <!-- A group session's fingerprint, as on its sidebar row: every card in
           the Grouped sessions column shares one header, so this is what tells
           which group each one is. -->
      <GroupAvatar
        v-if="session.groupProjects?.length"
        class="sbx-board__groupavatar"
        :project-paths="session.groupProjects"
        :size="16"
      />
      <!-- Buddy started this one — as on its sidebar row. -->
      <span
        v-if="session.startedBy === 'buddy'"
        class="buddy-badge"
        data-tooltip="Started by Buddy"
      ><SbIcon name="sparkles" :size="11" /></span>
      <span
        v-if="pending"
        class="session-title-wait sbx-board__cardtitle--wait"
        role="status"
        aria-label="Naming this session"
      ></span>
      <span v-else :key="title" class="session-title-in">{{ title }}</span>
    </div>
    <!-- How the conversation opened, under whatever it ended up being called.
         The list and the session header both carry it; a card that did not was
         the one place you could see a session's name without being able to see
         what it was actually asked. -->
    <div v-if="subtitle" class="sbx-board__cardsub">{{ subtitle }}</div>
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
      <!-- The sidebar row's unread number, with the same two tones: grey while
           the session is still working, the accent once there is a reply to
           read. See unread.js. -->
      <span
        v-if="unread"
        class="session-unread sbx-board__unread"
        :class="{ 'session-unread--working': unreadComing }"
        :data-tooltip="`${unread} new message${unread > 1 ? 's' : ''}${unreadComing ? ' — still working' : ''}`"
      >{{ formatUnread(unread) }}</span>
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
import GroupAvatar from './GroupAvatar.vue';
import { focusLevel } from '../board-focus.js';
import { contextPercent, formatContextLabel } from '../context-window.js';
import { freshnessOpacity } from '../freshness.js';
import { sessionChurn } from '../session-churn.js';
import { sessionTitle, sessionSubtitle, sessionFirstPrompt, titlePending } from '../session-title.js';
import { tick, fastTick } from '../time-tick.js';
import { unreadFor, formatUnread, unreadStillComing } from '../unread.js';

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
const isBusy = computed(() => store.sessionBusyState.get(id.value) || false);
const unread = computed(() => unreadFor(props.session));
const unreadComing = computed(() => unreadStillComing(id.value));

// app.js writes into window.lastActivityTime outside Vue; tick is what makes a
// card re-read it. See src/vue/time-tick.js.
const time = computed(() => {
  tick.value; // eslint-disable-line no-unused-expressions -- re-read timeago
  return window.lastActivityTime?.get(id.value) || new Date(props.session.modified);
});

const title = computed(() => sessionTitle(props.session, id.value));
// Subscribed to the fast clock only while actually waiting — see SessionItem.
const pending = computed(() => {
  if (!titlePending(props.session, isBusy.value)) { tick.value; return false; }
  fastTick.value;
  return titlePending(props.session, isBusy.value);
});
const subtitle = computed(() => (pending.value
  ? sessionFirstPrompt(props.session)
  : sessionSubtitle(props.session)));

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
