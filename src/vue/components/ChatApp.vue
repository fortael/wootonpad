<template>
  <!-- The Chat tab's main area. Built from the same parts as an open session —
       the session header's markup, the floating panel rail, the side panel and
       the chat view — so it reads as a session, because it is one. Only the
       panes on offer differ: the assistant has TODOs and sub-agents, and no
       working tree to show changes, containers or a shell for. -->
  <div
    class="sbx-chatview"
    :class="{ 'has-side-panel': panelOpen }"
    :style="{ '--sbx-sidepanel-w': store.sidePanelWidth + 'px' }"
  >
    <div class="sbx-sesshead">
      <div class="sbx-sesshead__identity">
        <div class="sbx-sesshead__text">
          <div class="sbx-sesshead__titlerow">
            <span class="sbx-sesshead__title">Buddy</span>
            <span class="sbx-sesshead__sep">·</span>
            <span class="sbx-sesshead__project">workspace</span>
          </div>
          <span class="sbx-sesshead__ai">Starts, steers and tidies your sessions — assigns the work, does none itself</span>
        </div>
      </div>

      <div class="sbx-sesshead__controls">
        <!-- How full Buddy's head is, and what the conversation has cost. No
             Active/Stopped badge: Buddy is always one message away from
             running, so the word says nothing; the mascot in the sidebar
             shows what it is doing. -->
        <span
          v-if="gauge.known || spend.cost"
          class="sbx-chatview__spend"
          :data-tooltip="spendTooltip"
        >
          <!-- The context now — the same number as the composer's ring, out of
               the 200k the mascot's brain fills to. Not the tokens processed
               over the conversation: every step re-reads the whole context,
               so that sum runs into millions and says nothing about how full
               it is. It is in the tooltip. The cost is an estimate at list
               price, so it comes second, quieter, with a tilde. -->
          <span v-if="gauge.known" class="sbx-chatview__tokens" :class="`is-${gauge.level}`">
            <SbIcon name="brain" :size="12" />
            {{ gauge.label }}<span class="sbx-chatview__cap"> / {{ CONTEXT_CAP / 1000 }}k</span>
          </span>
          <span v-if="spend.cost" class="sbx-chatview__cost">~{{ formatCost(spend.cost) }}</span>
        </span>
        <button
          type="button"
          class="sbx-chatview__btn"
          :disabled="store.chatStarting"
          data-tooltip="Start a new conversation — the old one stays on disk"
          @click="reset"
        >
          <SbIcon name="plus" :size="13" />
          New conversation
        </button>
      </div>
    </div>

    <div v-if="store.chatError" class="sbx-chatview__error">
      {{ store.chatError }}
      <button type="button" class="sbx-chatview__btn" @click="ensure">Try again</button>
    </div>
    <div v-else-if="!store.chatSession" class="sbx-chatview__empty">Starting the assistant…</div>

    <template v-if="store.chatSession">
      <SessionPanelRail scope="chat" :session="store.chatSession" />
      <SessionSidePanelApp v-if="panelOpen" scope="chat" :session="store.chatSession" />
      <!-- A new conversation: what Buddy can be asked, instead of an empty
           page. Gone as soon as the conversation starts. -->
      <div v-if="fresh" class="sbx-buddyhello">
        <div class="sbx-buddyhello__title">Hi, I'm Buddy 👋</div>
        <div class="sbx-buddyhello__sub">
          I keep track of your sessions, projects and TODOs, and hand work to sessions. Ask me, for example:
        </div>
        <div class="sbx-buddyhello__groups">
          <div v-for="g in SUGGESTION_GROUPS" :key="g.id" class="sbx-buddyhello__group">
            <div class="sbx-buddyhello__grouptitle">{{ g.emoji }} {{ g.title }}</div>
            <button
              v-for="q in g.items"
              :key="q"
              type="button"
              class="sbx-buddyhello__q"
              @click="insertIntoBuddyComposer(q)"
            >{{ q }}</button>
          </div>
        </div>
      </div>
      <SessionSdkApp
        :key="store.chatSession.sessionId"
        :session="store.chatSession"
        :resume="resume"
        lock-permission-mode="default"
        :local-commands="LOCAL_COMMANDS"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { store } from '../store.js';
import SbIcon from './SbIcon.vue';
import SessionSdkApp from './SessionSdkApp.vue';
import SessionPanelRail from './SessionPanelRail.vue';
import SessionSidePanelApp from './SessionSidePanelApp.vue';
import { SUGGESTION_GROUPS, insertIntoBuddyComposer } from '../buddy-suggestions.js';
import { contextGauge, CONTEXT_CAP } from '../buddy-scene.js';

const panelOpen = computed(() => !!store.chatSidePanelTab && !!store.chatSession);

const chatId = computed(() => store.chatSession?.sessionId || '');

// ── A conversation with nothing in it yet ────────────────────────
// main.js says whether the session has a transcript when it starts it (isNew);
// the first thing the stream says for it — the turn opening — means it has
// begun, and the suggestions step aside.
const fresh = ref(false);

window.api.onSdkMessage?.((id, message) => {
  if (fresh.value && id && id === chatId.value && message?.type) fresh.value = false;
});

// ── Spend ─────────────────────────────────────────────────────────
// main.js keeps the conversation's running total across restarts and says
// when a turn moves it (buddy-spend-changed). The chip leads with the tokens,
// which are counted; the cost is an estimate at list price and follows, with
// a tilde. The tooltip carries the breakdown.
const raw = ref(null);

const spend = computed(() => {
  const s = raw.value;
  if (!s || s.sessionId !== chatId.value) return { cost: 0, tokens: 0 };
  return { ...s, tokens: (s.input || 0) + (s.output || 0) + (s.cacheRead || 0) + (s.cacheWrite || 0) };
});

// The context, as the composer's ring last read it — see buddy-scene.js.
const gauge = computed(() => contextGauge(store.contextUsage.get(chatId.value)?.totalTokens));

const spendTooltip = computed(() => {
  const s = spend.value;
  const g = gauge.value;
  return [
    g.known ? `Context now: ${fmt(g.tokens)} tokens — ${g.pct}% of ${CONTEXT_CAP / 1000}k` : 'Context: not measured yet',
    `This conversation: ~${formatCost(s.cost)} (an estimate at list price)`,
    `Processed over the conversation: ${formatTokens(s.tokens)} tokens — every step re-reads the context, so this grows much faster than it`,
    `Input ${fmt(s.input)} · Output ${fmt(s.output)}`,
    `Cache read ${fmt(s.cacheRead)} · Cache write ${fmt(s.cacheWrite)}`,
  ].join('\n');
});

const fmt = (n) => (n || 0).toLocaleString();

function formatCost(usd) {
  const n = Number(usd) || 0;
  if (n > 0 && n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

function formatTokens(n) {
  if (!n) return '0';
  if (n < 1000) return String(n);
  if (n < 1e6) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}

async function loadSpend() {
  raw.value = await window.api.buddySpend?.().catch(() => null) || null;
}

window.api.onBuddySpendChanged?.((s) => { raw.value = s; });
watch(chatId, loadSpend, { immediate: true });

function asChatSession(res) {
  return {
    sessionId: res.sessionId,
    projectPath: res.projectPath,
    name: 'Buddy',
    isManagerChat: true,
  };
}

/**
 * Bring the assistant up and point the view at it.
 *
 * The session's id is added to the SDK set by hand: this view never goes
 * through open-terminal, which is where every other chat-mode session gets
 * marked, and the running dot the composer checks is refreshed right after
 * rather than waiting out the next three-second poll.
 */
async function ensure() {
  if (store.chatStarting) return false;
  store.chatStarting = true;
  store.chatError = '';
  try {
    const res = await window.api.managerChatEnsure();
    if (!res?.ok) {
      store.chatError = `The assistant could not start: ${res?.error || 'unknown error'}`;
      return false;
    }
    store.sdkSessionIds.add(res.sessionId);
    if (store.chatSession?.sessionId !== res.sessionId) store.chatSession = asChatSession(res);
    fresh.value = !!res.isNew;
    await window.__sb?.pollActive?.();
    return true;
  } catch (err) {
    store.chatError = `The assistant could not start: ${err?.message || err}`;
    return false;
  } finally {
    store.chatStarting = false;
  }
}

// The composer's way back in when the session has stopped: the sessions tab
// resumes through the sidebar row, which this session does not have.
async function resume() {
  return ensure();
}

async function reset() {
  store.chatStarting = true;
  store.chatError = '';
  try {
    const res = await window.api.managerChatReset();
    if (!res?.ok) { store.chatError = `Could not start a new conversation: ${res?.error || 'unknown error'}`; return; }
    store.sdkSessionIds.add(res.sessionId);
    // A new conversation starts with an empty head: what the old one filled
    // is not this one's context, and a resumed id can come back the same.
    store.contextUsage.delete(chatId.value);
    store.contextUsage.delete(res.sessionId);
    store.chatSession = asChatSession(res);
    fresh.value = true;
    await window.__sb?.pollActive?.();
  } finally {
    store.chatStarting = false;
  }
}

// The CLI can re-key a resumed session (sdk-session.js → onSessionId).
// chat-agent.js remembers the new id for the next launch; this view has to
// follow it now, or everything keyed by the id — the permission dialog, the
// status Buddy acts out — is addressed to a session it is no longer showing.
window.api.onSessionForked?.((oldId, newId) => {
  if (!newId || store.chatSession?.sessionId !== oldId) return;
  store.sdkSessionIds.add(newId);
  store.chatSession = { ...store.chatSession, sessionId: newId };
});

// `/clear` in Buddy is New conversation: a fresh session and a blank screen.
// The CLI's own /clear would empty the context but leave the old transcript
// on screen, which reads as the command not having worked.
const LOCAL_COMMANDS = { clear: () => reset(), new: () => reset() };

defineExpose({ ensure });
</script>
