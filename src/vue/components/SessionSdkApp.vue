<template>
  <div class="sbx-sdk" :class="{ 'is-asking': !!request }">
    <!-- The shape of a long session is mostly where its context was thrown
         away, and that is the one thing a scrollbar cannot show: the records
         above a compact are not loaded and have no height to scroll through.
         So the rail measures the file, not the viewport. -->
    <div v-if="compactMarks.length" class="sbx-timeline">
      <div class="sbx-timeline__window" :style="loadedBand"></div>
      <button
        v-for="mark in compactMarks"
        :key="mark.index"
        type="button"
        class="sbx-timeline__notch"
        :style="{ top: mark.at }"
        :data-tooltip="mark.label"
        :aria-label="mark.label"
        @click="loadEarlier(mark.index)"
      ></button>
    </div>

    <div ref="bodyRef" class="sbx-sdk__body"></div>
    <div v-if="loadingHistory" class="sbx-sdk__loading">Loading history…</div>

    <div v-if="unknownCount" class="sbx-sdk__drift">
      {{ unknownCount }} message{{ unknownCount > 1 ? 's' : '' }} this build does not recognise — expand them above and report what they are.
    </div>

    <div class="sbx-sdk__composer">
    <!-- Claude is blocked on this. The turn is genuinely stopped until it is
         answered, which is why it sits above the composer rather than
         somewhere you could miss — and why it takes the keyboard. -->
    <RequestDialog
      v-if="request"
      :key="request.requestId"
      :request="request"
      @respond="respond"
    />

      <!-- The session's own commands, not a list this build shipped with.
           A CLI that gains a command, a plugin that adds one, a project with
           its own — all of them appear here without WootonPad knowing. -->
      <div v-if="menuItems.length" ref="menuRef" class="sbx-sdk__commands">
        <button
          v-for="(item, i) in menuItems"
          :key="item.key"
          type="button"
          class="sbx-sdk__command"
          :class="[{ 'is-active': i === commandIndex }, item.scope ? `is-${item.scope}` : '']"
          @mousedown.prevent="pick(item)"
        >
          <span class="sbx-sdk__command-head">
            <span class="sbx-sdk__command-name">{{ item.label }}</span>
            <span v-if="item.hint" class="sbx-sdk__command-hint">{{ item.hint }}</span>
            <span v-if="item.tag" class="sbx-sdk__command-tag">{{ item.tag }}</span>
          </span>
          <span v-if="item.description" class="sbx-sdk__command-desc">{{ item.description }}</span>
        </button>
      </div>

      <div class="sbx-sdk__field">
        <textarea
          ref="inputRef"
          v-model="draft"
          class="sbx-sdk__input"
          rows="1"
          :placeholder="busy ? 'Claude is working — your message will go next' : 'Message Claude…'"
          @keydown="onKey"
          @input="autoGrow"
        ></textarea>
        <!-- Enter sends; nothing else needs saying. The glyph is an
             affordance, not an instruction, and it is the only thing in the
             corner so Interrupt reads as the exception it is. -->
        <button
          v-if="busy"
          type="button"
          class="sbx-sdk__stop"
          data-tooltip="Interrupt"
          aria-label="Interrupt"
          @click="interrupt"
        >
          <SbIcon name="square" :size="12" />
        </button>
        <span v-else class="sbx-sdk__enter" aria-hidden="true">&#8629;</span>
      </div>

      <!-- Everything that changes how the next turn runs, on one line under
           the field: what Claude may do on the left, what it runs as on the
           right, and how full the window is at the end. -->
      <!-- All three are locked while a turn runs. Changing them mid-turn was
           observed to wedge the session — the prompt never landed and the
           conversation was gone on reopen — and none of them can affect a turn
           that has already started anyway. -->
      <div class="sbx-sdk__controls" :class="{ 'is-locked': busy }">
        <select
          class="sbx-sdk__select" :value="permissionMode" :disabled="busy"
          :title="busy ? LOCKED_HINT : ''" @change="onPermissionMode"
        >
          <option v-for="m in PERMISSION_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>

        <span class="sbx-sdk__spacer"></span>

        <select
          class="sbx-sdk__select sbx-sdk__select--model" :value="model" :disabled="busy"
          :title="busy ? LOCKED_HINT : modelTitle" @change="onModel"
        >
          <option v-for="m in models" :key="m.value" :value="m.value">{{ modelLabel(m) }}</option>
        </select>

        <select
          v-if="effortLevels.length"
          class="sbx-sdk__select" :value="effort" :disabled="busy"
          :title="busy ? LOCKED_HINT : ''" @change="onEffort"
        >
          <option v-for="e in effortLevels" :key="e" :value="e">{{ e }}</option>
        </select>

        <span
          v-if="context"
          ref="contextChipRef"
          class="sbx-sdk__context"
          :title="breakdownOpen ? null : `${context.totalTokens.toLocaleString()} of ${context.maxTokens.toLocaleString()} tokens`"
          @mouseenter="openBreakdown"
          @mouseleave="closeBreakdown"
        >
          <UsageRing :value="context.percentage" :size="14" />
          {{ Math.round(context.percentage) }}%
        </span>

        <span v-if="init" class="sbx-sdk__about" :title="aboutTitle">v{{ init.claude_code_version }}</span>
      </div>
    </div>

    <!-- Hover breakdown for the ring above. Teleported: the control bar clips
         its overflow, and this is taller than the bar by design. -->
    <Teleport to="body">
      <div
        v-if="breakdownOpen && context"
        class="sbx-ctxpop__anchor"
        :style="breakdownPos"
        @mouseenter="holdBreakdown"
        @mouseleave="closeBreakdown"
      >
        <ContextBreakdown :usage="context" />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, markRaw, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { store } from '../store.js';
import SbIcon from './SbIcon.vue';
import UsageRing from './UsageRing.vue';
import ContextBreakdown from './ContextBreakdown.vue';
import { placePopover } from '../context-breakdown.js';
import RequestDialog from './RequestDialog.vue';
import { normalize } from '../message-normalizer.ts';
import { modelLabels, defaultModelValue } from '../model-name.js';
import { controlsFromTranscript } from '../session-controls.js';
import {
  renderViewItems, renderJsonlEntry, renderJsonlText, mergeLocalCommandEntries,
  refreshWhen, toolContent, mergeToolGroups, groupOfEntry, markToolDuration,
  renderToolResult, collapseToolBlock, refreshDayMarkers, refreshStamps, dayKey,
  mergeSlashOutput,
} from '../message-render.js';
import { isExternalPathToken, relativeTime } from '../chat-text.js';
import { openSidePanelFile } from '../side-panel-tabs.js';

const bodyRef = ref(null);
const inputRef = ref(null);
const menuRef = ref(null);
const draft = ref('');
const busy = ref(false);
const unknownCount = ref(0);

// Whatever the session is currently blocked on: a tool permission, a set of
// questions, or an MCP server asking for input. One slot, because the session
// can only be stopped on one thing at a time.
const request = ref(null);

// The CLI's own permission modes, in the order they escalate. `bypassPermissions`
// is deliberately absent: turning off every check is not a dropdown item.
const PERMISSION_MODES = [
  { value: 'auto', label: 'Auto' },
  { value: 'default', label: 'Manual' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'plan', label: 'Plan' },
];
const LOCKED_HINT = 'Wait for the turn to finish — this cannot change mid-answer';
const permissionMode = ref('default');
const model = ref('');
// Set once the user picks a row by hand. Until then the picker is only ever
// showing a guess, and every later report of what is running may correct it.
let modelPinned = false;
const effort = ref('high');
const models = ref([]);
const context = ref(null);
// What the CLI reports it is actually running, from system/init at the head of
// each turn. "Default" is a row that resolves to something; this is that
// something, and it is the only honest answer to "which model is this".
const liveModel = ref('');

// The whole `system/init` payload. It arrives at the head of every turn and
// lists what this session can actually do — its commands, skills, agents,
// tools and MCP servers. Reading the UI off it rather than off a list compiled
// into WootonPad is what keeps the two from drifting apart.
const init = ref(null);

/** `claude-opus-5[1m]` → `claude-opus-5`; the suffix is already in the name. */
const wireId = (m) => String(m?.resolvedModel || m?.value || '').replace(/\[1m\]$/, '');

// "Opus 5", "Haiku 4.5" — the names the CLI's own picker uses. See
// model-name.js for why the wire id is what they are derived from.
const labels = computed(() => modelLabels(models.value));
const modelLabel = (m) => labels.value.get(m.value) || m.displayName;

const selectedModel = computed(() =>
  models.value.find(m => m.value === model.value) || models.value[0] || null);

// Effort is per model — Haiku offers none at all, and the picker should not
// promise a setting the model will ignore.
const effortLevels = computed(() => selectedModel.value?.supportedEffortLevels || []);

const modelTitle = computed(() => {
  const m = selectedModel.value;
  if (!m) return '';
  const running = liveModel.value ? `\nRunning: ${liveModel.value}` : '';
  return `${m.description || m.displayName}${running}`;
});

const sessionId = computed(() => store.headerSession?.sessionId || '');

// Tool results arrive as their own message, after the call that produced them.
// Holding them here lets renderViewItems fold a result into the call it belongs
// to, exactly as the transcript viewer does when it reads a finished .jsonl.
let toolResults = new Map();

// tool_use_id → the block already on screen, for the turn currently running.
// Cleared at the end of every turn, so it holds one turn's calls and not a
// session's worth of detached DOM.
let toolNodes = new Map();

// ── Rendering ─────────────────────────────────────────────────────
//
// Whether the view is following the bottom is tracked from the scroll event
// rather than measured when something is about to be written. Reading
// `scrollHeight` forces the browser to lay out the whole transcript first, and
// the streaming path used to do it twice per token: on a real transcript that
// single measurement costs tens of milliseconds, which is more than a frame.
// A scroll handler reads the same numbers after layout has already happened,
// so it costs nothing.

/** Is the view parked at the bottom, i.e. should new output be chased? */
let pinned = true;

function readPinned() {
  const el = bodyRef.value;
  if (!el) return;
  pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
}

function stickBottom() {
  const el = bodyRef.value;
  if (pinned && el) el.scrollTop = el.scrollHeight;
}

// The working indicator and the two paragraphs being streamed all live at the
// end of the transcript, in this order, so finished messages have to go in
// front of them rather than after.
function tailOrder() {
  return [thinkEl, liveEl, workingEl];
}

/** The first tail element still in the transcript — where finished work ends. */
function tail() {
  const el = bodyRef.value;
  return tailOrder().find(node => node && node.parentNode === el) || null;
}

/** Put a tail element back in its own slot, in front of the ones after it. */
function insertTail(node, index) {
  const el = bodyRef.value;
  if (!el) return;
  const order = tailOrder();
  for (let i = index + 1; i < order.length; i++) {
    const next = order[i];
    if (next && next.parentNode === el) { el.insertBefore(node, next); return; }
  }
  el.appendChild(node);
}

/** The calendar day the last separator on screen was for. */
let shownDay = '';

function append(nodes) {
  const el = bodyRef.value;
  if (!el || !nodes.childNodes.length) return;
  const before = tail();
  // A turn's calls arrive one message at a time; without this each would open
  // its own frame and the grouping would only ever apply to history.
  const last = before ? before.previousElementSibling : el.lastElementChild;
  mergeToolGroups(last, nodes);
  // A command prints after it runs, so its output is a later message than the
  // invocation — without this it lands as an orphan under a command that looks
  // like it did nothing.
  mergeSlashOutput(last, nodes);
  if (!nodes.childNodes.length) { stickBottom(); return; }
  if (before && before.parentNode === el) el.insertBefore(nodes, before);
  else el.appendChild(nodes);
  // Live messages are always today's, so the separators only have to be redrawn
  // when the day turns over — or on the first message after history that ended
  // on an earlier one. Anything else would rebuild them per message.
  const today = dayKey(Date.now());
  if (today !== shownDay) shownDay = refreshDayMarkers(el);
  // Whether a message is followed by the calls it led to changes with every
  // message, so this is re-read rather than gated: it is attribute reads over
  // the transcript's own children, and it writes only where the answer moved.
  refreshStamps(el);
  // Only chase the bottom if the user was already there — otherwise reading
  // back through a long turn would be yanked away on every message.
  stickBottom();
}

// ── Streaming ─────────────────────────────────────────────────────
//
// `includePartialMessages` gives the answer a token at a time. Those tokens go
// into a throwaway paragraph at the end of the transcript; when the turn's
// finished `assistant` message arrives — the same text, properly blocked —
// the throwaway is dropped and the real one takes its place. Rendering both
// would print the answer twice.

/** @type {HTMLElement|null} the paragraph currently being written into */
let liveEl = null;
let liveText = '';
/** @type {HTMLElement|null} the reasoning being written, above the answer */
let thinkEl = null;
let thinkText = '';
/** @type {HTMLElement|null} the "working" row, last child while a turn runs */
let workingEl = null;

// Painting is throttled, not done per token.
//
// A delta carries a few characters, and the paragraph is re-rendered from the
// whole accumulated answer each time — so painting per delta is quadratic in
// the length of the answer, and measurably so: the same paint costs 2.7ms at
// 3k characters and 6.8ms at 23k. At the rate the SDK emits partial messages
// that is more than a core, and it gets worse the longer Claude talks.
//
// A leading paint keeps the first token instant; everything after it lands on
// a fixed cadence, which is well under the rate anyone reads at.
const LIVE_PAINT_MS = 80;
let livePaintTimer = 0;
let livePending = false;

function schedulePaint() {
  livePending = true;
  if (livePaintTimer) return;
  paintLive();
  livePaintTimer = setTimeout(() => {
    livePaintTimer = 0;
    // Re-arm only while tokens are still arriving, so a finished turn stops
    // the timer rather than leaving it ticking for the life of the session.
    if (livePending) schedulePaint();
  }, LIVE_PAINT_MS);
}

function paintLive() {
  livePending = false;
  const el = bodyRef.value;
  if (!el) return;

  // Reasoning first, because that is the order it is written in — and it is
  // the half of a turn worth watching: it is where you find out Claude has
  // misread the task, early enough to stop it.
  if (thinkText) {
    if (!thinkEl || thinkEl.parentNode !== el) {
      thinkEl = document.createElement('div');
      thinkEl.className = 'jsonl-entry jsonl-assistant sbx-think';
      thinkEl.innerHTML = '<div class="sbx-think__head">'
        + '<span class="sbx-think__spark"></span>Thinking</div>'
        + '<div class="sbx-think__text"></div>';
      insertTail(thinkEl, 0);
    }
    const body = thinkEl.lastElementChild;
    body.textContent = thinkText;
    // The box is capped, so the tail of the reasoning is what should show.
    body.scrollTop = body.scrollHeight;
  }

  if (liveText) {
    if (!liveEl || liveEl.parentNode !== el) {
      liveEl = document.createElement('div');
      liveEl.className = 'jsonl-entry jsonl-assistant sbx-streaming';
      const body = document.createElement('div');
      body.className = 'jsonl-text';
      liveEl.appendChild(body);
      insertTail(liveEl, 1);
    }
    liveEl.firstChild.innerHTML = renderJsonlText(liveText);
  }
  stickBottom();
}

function streamDelta(text) {
  if (!text || !bodyRef.value) return;
  // A paragraph that is no longer in the transcript belonged to a turn that has
  // ended, so the next delta starts a new answer rather than continuing its text.
  if (!liveEl || liveEl.parentNode !== bodyRef.value) liveText = '';
  liveText += text;
  schedulePaint();
}

function streamThinking(text) {
  if (!text || !bodyRef.value) return;
  if (!thinkEl || thinkEl.parentNode !== bodyRef.value) thinkText = '';
  thinkText += text;
  schedulePaint();
}

function endStream() {
  clearTimeout(livePaintTimer);
  livePaintTimer = 0;
  livePending = false;
  liveEl?.remove();
  liveEl = null;
  liveText = '';
  // The finished `assistant` message carries the same reasoning as a block that
  // can be folded; leaving this up as well would print it twice.
  thinkEl?.remove();
  thinkEl = null;
  thinkText = '';
}

// ── The working row ───────────────────────────────────────────────
//
// Present from before the first token to the end of the turn, including every
// silent stretch — a tool running, a long think. Those are exactly the moments
// that look like nothing is happening, so the row answers the three questions
// asked during one: how long has this been going, what is it doing, what has it
// cost so far.

/** When the current turn started, for the elapsed count. */
let turnStartedAt = 0;
let workingTimer = 0;
/** What Claude is doing right now — the last tool called and not yet answered. */
const activity = ref('');
/** Tokens this turn, as the stream reports them. Reset when a turn opens. */
const turnTokens = ref({ input: 0, output: 0 });

function shortCount(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1) + 'k';
  return String(n);
}

function elapsedLabel(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  if (mins < 60) return `${mins}m ${total % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function paintWorking() {
  if (!workingEl) return;
  const { input, output } = turnTokens.value;
  const tokens = input + output;
  workingEl.querySelector('.sbx-working__label').textContent = activity.value || 'Working';
  workingEl.querySelector('.sbx-working__meta').textContent = [
    turnStartedAt ? elapsedLabel(Date.now() - turnStartedAt) : '',
    tokens ? `${shortCount(tokens)} tokens` : '',
  ].filter(Boolean).join(' · ');
}

function setWorking(on) {
  const el = bodyRef.value;
  if (!on) {
    clearInterval(workingTimer);
    workingTimer = 0;
    workingEl?.remove();
    workingEl = null;
    activity.value = '';
    turnStartedAt = 0;
    return;
  }
  if (!el) return;
  if (workingEl && workingEl.parentNode === el) return;
  // A turn opening is the only moment the count means anything: it is what this
  // run has cost, not what the session has.
  if (!turnStartedAt) { turnStartedAt = Date.now(); resetTokens(); }
  workingEl = document.createElement('div');
  workingEl.className = 'jsonl-entry jsonl-assistant sbx-working';
  workingEl.innerHTML = '<span class="sbx-working__orb"></span>'
    + '<span class="sbx-working__label">Working</span>'
    + '<span class="sbx-working__meta"></span>';
  el.appendChild(workingEl);
  paintWorking();
  // One second, because the elapsed count is in seconds. Cleared the moment the
  // turn ends, so an idle session ticks nothing.
  workingTimer = setInterval(paintWorking, 1000);
  stickBottom();
}

watch(busy, setWorking);
watch([activity, turnTokens], paintWorking);

// ── Tokens spent on the current turn ──────────────────────────────
//
// One turn is several API requests — one per tool round trip — and each bills
// its own prompt. So finished requests are added up, and the one in flight is
// replaced on every frame, because `message_delta` reports the answer so far
// rather than an increment.
let tokensDone = { input: 0, output: 0 };
let tokensNow = { input: 0, output: 0 };

function resetTokens() {
  tokensDone = { input: 0, output: 0 };
  tokensNow = { input: 0, output: 0 };
  turnTokens.value = { input: 0, output: 0 };
}

function noteUsage(item) {
  if (item.phase === 'start') {
    tokensDone = {
      input: tokensDone.input + tokensNow.input,
      output: tokensDone.output + tokensNow.output,
    };
    tokensNow = { input: item.inputTokens, output: item.outputTokens };
  } else {
    tokensNow = {
      input: Math.max(tokensNow.input, item.inputTokens),
      output: Math.max(tokensNow.output, item.outputTokens),
    };
  }
  turnTokens.value = {
    input: tokensDone.input + tokensNow.input,
    output: tokensDone.output + tokensNow.output,
  };
}

/** `mcp__browser__navigate` → `navigate`; the prefix is plumbing. */
function shortToolName(name) {
  return String(name || 'tool').replace(/^mcp__/, '').split('__').pop();
}

/**
 * A call already on screen, answered.
 *
 * The result arrives as its own message, usually seconds after the call. Folded
 * into the block it belongs to it is one row that can be opened; rendered on
 * its own — which is what used to happen — it is an anonymous "Tool Result"
 * some distance below the call it answers.
 */
function settleTool(id, content) {
  const node = toolNodes.get(id);
  if (!node) return false;
  toolNodes.delete(id);
  renderToolResult(content, toolContent(node));
  // A call with nothing to show was not foldable when it was drawn; now it has
  // a result, it is.
  if (!node.classList.contains('jsonl-tool-block--foldable')) collapseToolBlock(node);
  const started = Number(node.dataset.startedAt);
  if (Number.isFinite(started)) markToolDuration(node, Date.now() - started);
  return true;
}

function handle(message) {
  if (message?.type === 'system' && message.subtype === 'init') {
    init.value = message;
    if (message.model) liveModel.value = message.model;
  }
  // Nothing below this writes anywhere but the transcript, and building the
  // nodes is the expensive half — so a view with no transcript to write into
  // stops here rather than after the work is already done.
  if (!bodyRef.value) return;
  const items = normalize(message);

  for (const item of items) {
    if (item.kind === 'unknown') unknownCount.value++;
    if (item.kind === 'usage') { noteUsage(item); continue; }
    // Remember results before rendering, so a call in the same batch can claim
    // one. A result for a call already drawn folds straight into it.
    if (item.kind === 'tool_result' && item.toolUseId) {
      activity.value = '';
      if (!settleTool(item.toolUseId, item.content)) {
        toolResults.set(item.toolUseId, item.content);
      }
    }
    if (item.kind === 'turn_end') {
      endStream();
      noteTurnActivity();
      busy.value = false;
      toolNodes.clear();
      refreshContext();
      // A turn can have compacted the context; the rail is drawn from the file.
      loadCompacts();
    } else if (item.kind === 'delta') {
      noteTurnActivity();
      // Any frame at all means the turn is alive — including one carrying no
      // text, which is what a long thinking block looks like from here. That
      // also covers a session driven from somewhere else: nothing was typed
      // into this composer, so nothing set busy.
      busy.value = true;
      if (item.target === 'text') { activity.value = 'Responding'; streamDelta(item.text); }
      if (item.target === 'thinking') { activity.value = 'Thinking'; streamThinking(item.text); }
    } else if (item.kind !== 'silent') {
      // A real message closes the streamed draft: either it is the finished
      // version of it, or the model has moved on to a tool call.
      endStream();
      if (item.kind === 'tool_use') activity.value = `Running ${shortToolName(item.name)}`;
      if (item.kind === 'text' || item.kind === 'tool_use' || item.kind === 'thinking') {
        busy.value = true;
      }
    }
  }

  const frag = renderViewItems(items, toolResults, { foldTools: true, at: Date.now() });
  // Held so a result arriving later folds into its call rather than landing as
  // a loose block, and so the call can be told how long it took.
  const startedAt = String(Date.now());
  for (const node of frag.querySelectorAll('[data-tool-use-id]')) {
    node.dataset.startedAt = startedAt;
    toolNodes.set(node.dataset.toolUseId, node);
  }
  append(frag);
}

// ── Input ─────────────────────────────────────────────────────────

// ── Whether a turn is running ─────────────────────────────────────
//
// `busy` starts as this view's own optimism: something was sent, so a turn is
// presumably about to run. That is a guess, and when it is wrong — a prompt
// that never reached the CLI — the chat said "Working" for the rest of the
// session while the board, which reads the status tracker, correctly said
// idle. The two must not be able to disagree indefinitely.
//
// So the tracker in the main process is the authority, with one concession:
// for a few seconds after sending it has not heard about the prompt yet, and
// its `idle` is stale rather than wrong.

const TURN_GRACE_MS = 20000;
/** While set, an `idle` from the tracker is too early to believe. */
let turnGraceUntil = 0;
let turnWatchdog = null;

function noteTurnActivity() {
  turnGraceUntil = 0;
  if (turnWatchdog) { clearTimeout(turnWatchdog); turnWatchdog = null; }
}

/** Nothing came back at all — say so rather than spin forever. */
function startTurnWatchdog() {
  if (turnWatchdog) clearTimeout(turnWatchdog);
  turnWatchdog = setTimeout(() => {
    turnWatchdog = null;
    turnGraceUntil = 0;
    if (!busy.value) return;
    busy.value = false;
    append(renderViewItems([{
      kind: 'notice', level: 'warn',
      text: 'That prompt never started a turn. Send it again.',
    }]));
  }, TURN_GRACE_MS);
}

/**
 * What the echo of a prompt looks like.
 *
 * A slash command is not a message, and the transcript already knows that: read
 * back off disk it is a framed block with its output inside it. Live, the CLI
 * writes the `<command-name>` envelope to the file but never streams it, so
 * this echo is the only record the command was run — and echoing it as a chat
 * bubble is what made the same command look like two different things before
 * and after reopening the chat.
 *
 * Checked against the session's own command list rather than the shape alone:
 * "/usr/local is wrong" is a sentence, not an invocation.
 */
function echoOf(text) {
  const slash = /^\/([a-zA-Z][\w:.-]*)(?:\s+([\s\S]*))?$/.exec(text);
  if (slash && availableCommands.value.includes(slash[1])) {
    return { kind: 'command_call', name: slash[1], args: (slash[2] || '').trim() };
  }
  return { kind: 'text', role: 'user', text };
}

function send() {
  const text = draft.value.trim();
  if (!text || !sessionId.value) return;
  // Echoed locally: the CLI does not send the prompt back, and a message that
  // vanishes on submit reads as a dropped one.
  append(renderViewItems([echoOf(text)], null, { at: Date.now() }));
  window.api.sendInput(sessionId.value, text);
  draft.value = '';
  busy.value = true;
  turnGraceUntil = Date.now() + TURN_GRACE_MS;
  startTurnWatchdog();
  nextTick(() => { autoGrow(); inputRef.value?.focus(); });
}

// One row until there is more to show. Reset to auto first so the box can
// shrink again when text is deleted, then take the content's own height up to
// a ceiling — past that it scrolls rather than eating the transcript.
const MAX_INPUT_HEIGHT = 220;
function autoGrow() {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT) + 'px';
}

function onKey(event) {
  const menu = menuItems.value;
  if (menu.length) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      commandIndex.value = (commandIndex.value + 1) % menu.length;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      commandIndex.value = (commandIndex.value - 1 + menu.length) % menu.length;
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      // Dismiss the menu, not the sentence: a file mention is usually typed
      // in the middle of one already worth keeping.
      draft.value = draft.value.startsWith('/') ? '' : `${draft.value} `;
      return;
    }
    // Enter completes rather than sending a half-typed command or path.
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      pick(menu[commandIndex.value]);
      return;
    }
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    send();
  }
}

// The dialog decides what the answer is; this only knows where to send it.
// Elicitation and permission are separate control channels in the CLI and
// stay separate here.
function respond(decision) {
  const pending = request.value;
  if (!pending) return;
  request.value = null;
  // Flattened to plain JSON on the way out. The answer carries the tool input
  // back, and IPC serialises it with the structured-clone algorithm, which
  // refuses a Proxy outright — one reactive object that slipped in throws
  // *after* the dialog has closed, leaving the session blocked with nothing on
  // screen to answer. The payload is JSON on both sides of this call anyway.
  const plain = JSON.parse(JSON.stringify(decision));
  if (pending.kind === 'elicitation') window.api.sdkElicitationResponse(pending.requestId, plain);
  else if (pending.kind === 'dialog') window.api.sdkDialogResponse(pending.requestId, plain);
  else window.api.sdkPermissionResponse(pending.requestId, plain);
  // Answering hands the turn back, so the composer should be ready for the
  // next thing to say rather than leaving focus on a dialog that is gone.
  nextTick(() => inputRef.value?.focus());
}

// ── Session controls ──────────────────────────────────────────────

async function onPermissionMode(event) {
  // The select is disabled while busy; this is the same rule for anything
  // that reaches the handler another way.
  if (busy.value) { event.target.value = permissionMode.value; return; }
  const value = event.target.value;
  const res = await window.api.sdkSetPermissionMode(sessionId.value, value);
  if (!res?.ok) return;
  permissionMode.value = value;
}

async function onModel(event) {
  // The select is disabled while busy; this is the same rule for anything
  // that reaches the handler another way.
  if (busy.value) { event.target.value = model.value; return; }
  const value = event.target.value;
  const res = await window.api.sdkSetModel(sessionId.value, value);
  if (!res?.ok) return;
  model.value = value;
  modelPinned = true;
  // The new model may not offer the level the old one was on.
  const levels = effortLevels.value;
  if (levels.length && !levels.includes(effort.value)) {
    effort.value = levels.includes('high') ? 'high' : levels[levels.length - 1];
    window.api.sdkSetEffort(sessionId.value, effort.value);
  }
}

async function onEffort(event) {
  // The select is disabled while busy; this is the same rule for anything
  // that reaches the handler another way.
  if (busy.value) { event.target.value = effort.value; return; }
  const value = event.target.value;
  const res = await window.api.sdkSetEffort(sessionId.value, value);
  if (!res?.ok) return;
  effort.value = value;
}

// ── Remembered controls ───────────────────────────────────────────
//
// Read back out of the session's own transcript rather than stored separately
// — the CLI already records all three (see session-controls.js). Applied after
// the session is up, so the picker and the live session agree.

async function applyStoredControls(entries) {
  const id = sessionId.value;
  const found = controlsFromTranscript(entries);
  if (!id) return;

  if (found.permissionMode && PERMISSION_MODES.some(m => m.value === found.permissionMode)) {
    const res = await window.api.sdkSetPermissionMode(id, found.permissionMode);
    if (res?.ok && sessionId.value === id) permissionMode.value = found.permissionMode;
  }
  if (found.effort) {
    const res = await window.api.sdkSetEffort(id, found.effort);
    if (res?.ok && sessionId.value === id) effort.value = found.effort;
  }
  // The model is matched by wire id against the picker's rows, the same way a
  // live `system/init` is — the transcript names the model, not the alias row.
  if (found.model && !modelPinned) {
    liveModel.value = found.model;
    syncSelectedModel();
  }
}

// ── Context breakdown popover ─────────────────────────────────────
//
// Hover, not click: it answers "what is in there" while you are already
// looking at the ring, and nothing in it is actionable. It stays open while
// the pointer is inside it, so the lists can be read.
const contextChipRef = ref(null);
const breakdownOpen = ref(false);
const breakdownPos = ref({});
let breakdownTimer = null;

function openBreakdown() {
  clearTimeout(breakdownTimer);
  const rect = contextChipRef.value?.getBoundingClientRect();
  if (!rect) return;
  breakdownPos.value = placePopover(rect, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  breakdownOpen.value = true;
  // Resizing moves the chip out from under a panel placed against the old
  // viewport; re-placing on every frame of a drag is not worth it.
  window.addEventListener('resize', hideBreakdown, { once: true });
}

function hideBreakdown() {
  clearTimeout(breakdownTimer);
  breakdownOpen.value = false;
}

function holdBreakdown() { clearTimeout(breakdownTimer); }

function closeBreakdown() {
  clearTimeout(breakdownTimer);
  // Long enough to cross the gap between the chip and the panel.
  breakdownTimer = setTimeout(() => { breakdownOpen.value = false; }, 160);
}

onBeforeUnmount(() => {
  clearTimeout(breakdownTimer);
  window.removeEventListener('resize', hideBreakdown);
});

// Read after a turn ends rather than on a timer: the number only moves when
// the conversation does, and this is a control request the session has to
// answer.
async function refreshContext() {
  if (!sessionId.value) return;
  const res = await window.api.sdkContextUsage(sessionId.value);
  if (res?.ok && res.value) context.value = res.value;
}

async function loadModels() {
  const res = await window.api.sdkModels(sessionId.value);
  if (!res?.ok || !Array.isArray(res.value)) return;
  models.value = res.value;
  syncSelectedModel();
}

// The list can only be fetched once the session is up, and on a chat opened
// before that it comes back empty — leaving the picker blank for the rest of
// the session. `system/init` is the first thing that proves the CLI is
// answering, so it is also the moment to ask again.
watch(init, () => {
  if (!models.value.length) loadModels();
  if (!commandInfo.value.length) loadCommands();
});

/**
 * Point the picker at the row the session is actually running, matched by the
 * wire id rather than the alias — several rows resolve to the same model, and
 * the alias alone cannot say which.
 *
 * Runs on both sides of a race: the model list is fetched on mount, but the
 * CLI only says what it is running when the first turn opens, and either can
 * land first.
 */
function syncSelectedModel() {
  // A choice the user made outranks anything reported afterwards.
  if (modelPinned || !models.value.length) return;

  if (liveModel.value) {
    const running = liveModel.value.replace(/\[1m\]$/, '');
    const match = models.value.find(m => wireId(m) === running);
    if (match) { model.value = match.value; return; }
  }
  // Nothing has run yet, so there is nothing to report — but the session still
  // has a model, and a picker showing an empty box reads as broken rather than
  // as "not chosen". Show the row it will actually use until init says
  // otherwise.
  if (!model.value) model.value = defaultModelValue(models.value);
}

watch(liveModel, syncSelectedModel);

// ── Completion menus ──────────────────────────────────────────────
//
// Two menus share one strip above the field, because they are the same
// gesture: type a sigil, narrow a list, pick. `/` offers what this session can
// run — with the descriptions the CLI itself writes — and `@` offers the
// files of the project it is running in.

const commandIndex = ref(0);
const commandInfo = ref([]);   // SlashCommand[] from the session
const files = ref([]);         // relative paths, flattened from the file tree

// Commands the CLI tags as bound to a terminal — exit, doctor, colour pickers.
// The SDK's own docs say remote surfaces should hide them, and a chat has no
// terminal for them to act on.
const availableCommands = computed(() => {
  // `supportedCommands()` answers as soon as the session is up; the list on
  // `system/init` only arrives with the first turn. Reading init first meant a
  // chat you had just opened — the one place you are most likely to reach for
  // a command — offered none at all.
  const named = commandInfo.value.map(c => c?.name).filter(Boolean);
  const all = named.length ? named : (init.value?.slash_commands || []);
  const terminalOnly = new Set(init.value?.terminal_slash_commands || []);
  return all.filter(c => !terminalOnly.has(c));
});

/** name → the CLI's own description and argument hint, when it gave one. */
const commandDetail = computed(() => {
  const map = new Map();
  for (const c of commandInfo.value) if (c?.name) map.set(c.name, c);
  return map;
});

// Which commands are skills rather than plain commands. `system/init` lists
// them separately — the same SlashCommand shape, so the name is what joins the
// two lists.
const skillNames = computed(() =>
  new Set((init.value?.skills || []).map(s => s?.name).filter(Boolean)));

/**
 * Where a command comes from, and the description without it.
 *
 * `SlashCommand` has no scope field; the CLI writes it into the tail of the
 * description as "(project)" or "(user)", which is the only place it exists.
 * Parsing it out means it can be a chip instead of five characters of prose at
 * the end of a line that is already being clamped.
 */
function splitScope(description) {
  const text = String(description || '').trim();
  const match = /\(([a-z][a-z -]*)\)\s*$/i.exec(text);
  if (!match) return { scope: '', description: text };
  return { scope: match[1].toLowerCase(), description: text.slice(0, match.index).trim() };
}

const commandMatches = computed(() => {
  const text = draft.value;
  // Only while typing the command itself: a slash inside a sentence, or a
  // command already followed by its argument, is not a menu.
  if (!text.startsWith('/') || text.includes(' ') || text.includes('\n')) return [];
  const prefix = text.slice(1).toLowerCase();
  // Uncapped. A menu that showed the first eight of forty-nine answered "which
  // commands start with what I have typed" but never "what can this session
  // do", which is the question a bare `/` is asking — and the one nothing else
  // in the app answers. The strip scrolls; the arrows walk it.
  return availableCommands.value
    .filter(c => c.toLowerCase().startsWith(prefix))
    .map((name) => {
      const detail = commandDetail.value.get(name);
      const { scope, description } = splitScope(detail?.description);
      return {
        key: `cmd:${name}`,
        kind: 'command',
        value: name,
        label: `/${name}`,
        hint: detail?.argumentHint || '',
        description,
        scope,
        // "project skill" rather than two chips: it is one fact about where
        // this command came from and what kind of thing it is.
        tag: [scope, skillNames.value.has(name) ? 'skill' : ''].filter(Boolean).join(' '),
      };
    });
});

// `@` completes a path, so the token is whatever follows the last `@` that is
// still being typed — mid-sentence included, which is where file mentions
// actually appear.
const fileToken = computed(() => {
  const text = draft.value;
  const at = text.lastIndexOf('@');
  if (at === -1) return null;
  const token = text.slice(at + 1);
  if (/[\s\n]/.test(token)) return null;      // the mention is finished
  return { at, token };
});

// ── Paths outside the project ─────────────────────────────────────
//
// The flattened project tree answers everything typed as a bare name, and it
// answers instantly. It cannot answer `@../other-checkout/` — and the CLI's own
// composer can, which is where a sibling repository or a file in ~ gets
// referenced from. Those tokens are read off the disk instead, one directory at
// a time, which is also how they have to be walked.

/** Entries for the directory the current `@../`-style token names. */
const pathEntries = ref([]);

const externalToken = computed(() => {
  const found = fileToken.value;
  return found && isExternalPathToken(found.token) ? found.token : null;
});

watch(externalToken, async (token) => {
  pathEntries.value = [];
  const projectPath = store.headerSession?.projectPath;
  if (!token || !projectPath) return;
  const res = await window.api.listPathCompletions?.(projectPath, token).catch(() => null);
  // The token may have moved on while the read was in flight; a menu for a
  // directory that is no longer being typed is worse than none.
  if (res?.ok && externalToken.value === token) pathEntries.value = res.entries;
});

const fileMatches = computed(() => {
  const found = fileToken.value;
  if (!found) return [];

  if (externalToken.value) {
    return pathEntries.value.map(entry => ({
      key: `path:${entry.value}`,
      kind: 'file',
      value: entry.value,
      isDir: entry.isDir,
      label: entry.name + (entry.isDir ? '/' : ''),
      hint: '',
      description: entry.value,
    }));
  }

  if (!files.value.length) return [];
  const needle = found.token.toLowerCase();
  const scored = [];
  for (const path of files.value) {
    const lower = path.toLowerCase();
    const index = lower.indexOf(needle);
    if (needle && index === -1) continue;
    // A match on the file's own name beats one buried in a directory: typing
    // "app" means app.js far more often than it means src/app/thing.ts.
    const base = lower.split('/').pop();
    const rank = !needle ? 2 : base.startsWith(needle) ? 0 : lower.startsWith(needle) ? 1 : 2;
    scored.push({ path, rank, index });
    if (scored.length > 400) break;
  }
  scored.sort((a, b) => a.rank - b.rank || a.index - b.index || a.path.length - b.path.length);
  return scored.slice(0, 60).map(({ path }) => ({
    key: `file:${path}`,
    kind: 'file',
    value: path,
    isDir: false,
    label: path.split('/').pop(),
    hint: '',
    description: path,
  }));
});

// One strip, one keyboard: a slash command being typed wins, otherwise a file.
const menuItems = computed(() =>
  commandMatches.value.length ? commandMatches.value : fileMatches.value);

watch(menuItems, () => { commandIndex.value = 0; });

// The strip scrolls now that it is uncapped, so walking past its edge has to
// bring the row with it — otherwise the arrows move a selection nobody can see.
watch(commandIndex, () => nextTick(() => {
  menuRef.value?.children[commandIndex.value]?.scrollIntoView({ block: 'nearest' });
}));

function pick(item) {
  if (!item) return;
  if (item.kind === 'command') {
    draft.value = `/${item.value} `;
  } else {
    const found = fileToken.value;
    if (!found) return;
    // A directory is a step, not an answer: no trailing space, so the menu
    // stays up and lists what is inside it.
    draft.value = `${draft.value.slice(0, found.at)}@${item.value}${item.isDir ? '' : ' '}`;
  }
  nextTick(() => { autoGrow(); inputRef.value?.focus(); });
}

async function loadCommands() {
  const res = await window.api.sdkCommands(sessionId.value);
  if (res?.ok && Array.isArray(res.value)) commandInfo.value = res.value;
}

// Flattened once per session. The tree is already pruned in the main process
// (no .git, no node_modules, five levels deep), so this is a list of the paths
// a person would actually reference.
async function loadFiles() {
  const projectPath = store.headerSession?.projectPath;
  if (!projectPath) return;
  const res = await window.api.getFileTree(projectPath).catch(() => null);
  if (!res?.ok) return;
  const flat = [];
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (node.isDir) walk(node.children);
      else flat.push(node.path);
    }
  };
  walk(res.tree);
  files.value = flat;
}

const aboutTitle = computed(() => {
  const i = init.value;
  if (!i) return '';
  return [
    `Claude Code ${i.claude_code_version}`,
    `${(i.tools || []).length} tools · ${(i.skills || []).length} skills · ${(i.agents || []).length} agents`,
    `${availableCommands.value.length} commands`,
    (i.mcp_servers || []).length ? `MCP: ${i.mcp_servers.map(m => m.name).join(', ')}` : '',
    `Output style: ${i.output_style}`,
  ].filter(Boolean).join('\n');
});

// A dialog is a message, and a reload loses messages — but not the CLI's
// patience, which is still parked on the promise behind it. Ask what this
// session is stopped on rather than leaving it stopped with a blank composer.
async function loadPending() {
  if (!sessionId.value) return;
  const list = await window.api.sdkPendingRequests?.(sessionId.value).catch(() => null);
  if (!Array.isArray(list) || !list.length || request.value) return;
  request.value = markRaw(list[0]);
}

async function interrupt() {
  if (!sessionId.value) return;
  await window.api.sdkInterrupt(sessionId.value);
}

// ── Mentions in the transcript ────────────────────────────────────
//
// message-render.js marks `@path` and a leading `/command` in the messages the
// user wrote; it cannot act on them, because only this view knows which project
// a relative path is relative to. One delegated listener rather than a handler
// per chip: a long transcript has hundreds.

/** `../a/b` against the project, `~` against the home directory, `/a` as-is. */
function resolveMention(value) {
  const projectPath = store.headerSession?.projectPath || '';
  if (value.startsWith('/') || value.startsWith('~')) return value;
  if (!projectPath) return value;
  return `${projectPath.replace(/\/$/, '')}/${value}`;
}

function onBodyClick(event) {
  const chip = event.target?.closest?.('.jsonl-mention');
  if (!chip) return;
  event.preventDefault();
  if (chip.dataset.mentionCommand) {
    // Put it back in the composer rather than running it: re-running a command
    // is a decision, and a stray click on the transcript is not one.
    draft.value = `/${chip.dataset.mentionCommand} `;
    nextTick(() => { autoGrow(); inputRef.value?.focus(); });
    return;
  }
  const file = chip.dataset.mentionFile;
  // The side panel, not the MCP file panel: this is a reference while you read
  // the conversation, so it belongs in the island beside it — same place the
  // uncommitted-changes diff and the scratch shell open.
  if (file) openSidePanelFile(resolveMention(file));
}

// ── Wiring ────────────────────────────────────────────────────────

/** @type {Array<(() => void)|undefined>} one disposer per IPC subscription */
const subscriptions = [];

/** The clock that re-reads the relative timestamps already on screen. */
let whenTimer = 0;

// A session opened in this view did not necessarily start in it. The transcript
// on disk is the same file either way, so the history is read back and painted
// with the same renderer the transcript viewer uses — a session started in a
// terminal months ago opens here as a chat, and carries on as one.
//
// It is read a page at a time rather than whole. A long session's transcript is
// tens of megabytes and paints tens of thousands of nodes, and a document that
// size costs ~39ms per layout against ~0.7ms empty — which is more than a frame
// for every scroll, every spinner tick and every streamed token, in this view
// and in every other one sharing the document. Fifty messages is what fits on
// screen; the rest arrives by scrolling up.
const loadingHistory = ref(true);
const HISTORY_PAGE = 50;

// ── The compact rail ──────────────────────────────────────────────
//
// Where this session's context was thrown away, down the left edge. A compact
// is the one event in a session's history that a scrollbar cannot show: the
// records above one are not loaded and have no height to scroll through, so
// the rail is measured against the file's record count rather than the DOM.

/** Every compact boundary in the file — see readCompactBoundaries. */
const compacts = ref([]);
/** Records in the file, and the slice of them currently painted. */
const historyTotal = ref(0);
const loadedFrom = ref(0);
const loadedTo = ref(0);

const compactMarks = computed(() => {
  const total = historyTotal.value;
  if (!total || !compacts.value.length) return [];
  return compacts.value.map(c => ({
    index: c.index,
    // Clamped off both ends: a notch flush with the edge reads as the rail's
    // own cap rather than as a mark on it.
    at: `${Math.min(97, Math.max(3, (c.index / total) * 100))}%`,
    label: [
      c.trigger === 'auto' ? 'Auto-compacted' : 'Compacted',
      c.timestamp ? relativeTime(c.timestamp) : '',
      c.preTokens ? `${shortTokens(c.preTokens)} → ${shortTokens(c.postTokens)} tokens` : '',
    ].filter(Boolean).join(' · '),
  }));
});

/** The band of the file currently on screen. */
const loadedBand = computed(() => {
  const total = historyTotal.value;
  if (!total) return { display: 'none' };
  const top = (loadedFrom.value / total) * 100;
  const height = Math.max(2, ((loadedTo.value - loadedFrom.value) / total) * 100);
  return { top: `${top}%`, height: `${Math.min(height, 100 - top)}%` };
});

async function loadCompacts() {
  const id = sessionId.value;
  if (!id) return;
  const res = await window.api.sessionCompacts?.(id).catch(() => null);
  if (!res?.ok || sessionId.value !== id) return;
  compacts.value = res.compacts || [];
  if (res.total) historyTotal.value = res.total;
}

/** Record index of the oldest entry on screen — where the next page ends. */
let historyFrom = null;
/** Is there anything above what is loaded, including a compact marker? */
let historyHasMore = false;
/** The `/compact` boundary directly above the loaded range, if the page hit one. */
let historyCompact = null;
let loadingEarlier = false;
/** @type {IntersectionObserver|null} watches the top sentinel for an upward scroll */
let topObserver = null;
/** @type {HTMLElement|null} the marker or sentinel currently at the top */
let topEl = null;

/** 936783 → "937k". The exact figure is noise at this scale. */
function shortTokens(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(n);
}

function compactWhen(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * The line across the transcript where the context was compacted.
 *
 * Everything above it was dropped from the model's own context, so it is drawn
 * as a boundary rather than as more messages — and crossing it is a click, not
 * something an upward scroll does on its own. The earlier segment is usually
 * the larger half of the file, and loading it is the thing this view exists to
 * avoid doing by default.
 */
function makeCompactMarker(compact) {
  const el = document.createElement('div');
  el.className = 'sbx-compact';

  const label = document.createElement('div');
  label.className = 'sbx-compact__label';
  label.textContent = compact.trigger === 'auto'
    ? 'Context automatically compacted'
    : 'Conversation compacted';

  const meta = document.createElement('div');
  meta.className = 'sbx-compact__meta';
  const when = compactWhen(compact.timestamp);
  const tokens = compact.preTokens
    ? `${shortTokens(compact.preTokens)} → ${shortTokens(compact.postTokens)} tokens`
    : '';
  meta.textContent = [when, tokens].filter(Boolean).join(' · ');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sbx-compact__more';
  button.textContent = 'Load earlier messages';
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Loading…';
    // `compact.index` is the marker's own record, so asking for everything
    // before it steps over the boundary and lands in the previous segment.
    loadEarlier(compact.index);
  });

  const text = document.createElement('div');
  text.className = 'sbx-compact__text';
  text.append(label, meta);
  el.append(text, button);
  return el;
}

/** Plain "there is more above" marker — the observer loads it on approach. */
function makeTopSentinel() {
  const el = document.createElement('div');
  el.className = 'sbx-history-top';
  el.innerHTML = '<span class="sbx-history-top__dots"><i></i><i></i><i></i></span>';
  return el;
}

/** Put the right thing at the top of the transcript for the current range. */
function refreshTopAffordance() {
  const body = bodyRef.value;
  if (!body) return;
  topObserver?.disconnect();
  topEl?.remove();
  topEl = null;
  if (!historyHasMore) return;

  topEl = historyCompact ? makeCompactMarker(historyCompact) : makeTopSentinel();
  body.insertBefore(topEl, body.firstChild);

  // A compact marker is answered by hand; only the plain sentinel auto-loads.
  if (historyCompact) return;
  topObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) loadEarlier(historyFrom);
  }, { root: body, rootMargin: '400px 0px 0px 0px' });
  topObserver.observe(topEl);
}

/** Render one window into a fragment, newest last. Returns null if empty. */
function renderWindow(rawEntries) {
  const entries = mergeLocalCommandEntries(rawEntries || []);
  // A tool's result lands in a later entry than its call. Collect them first
  // so each call renders with its own result folded in, as the transcript
  // viewer does — and with it the entry's own timestamp, which is the only
  // record of how long the call took once the session is over.
  const results = new Map();
  const toolTimes = new Map();
  for (const entry of entries) {
    const blocks = entry.message?.content || entry.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        results.set(block.tool_use_id, block.content || block.output || '');
        if (entry.timestamp) toolTimes.set(block.tool_use_id, entry.timestamp);
      }
    }
  }
  const frag = document.createDocumentFragment();
  const opts = { foldTools: true, timestamps: true, toolTimes };
  for (const entry of entries) {
    const el = renderJsonlEntry(entry, results, opts);
    if (!el) continue;
    // Calls from consecutive entries are still one run of calls.
    const incoming = groupOfEntry(el);
    const open = groupOfEntry(frag.lastElementChild);
    if (incoming && open) {
      while (incoming.firstChild) open.appendChild(incoming.firstChild);
      // The block is dated by its last call, so folding one in moves its time.
      if (el.dataset.ts) frag.lastElementChild.dataset.ts = el.dataset.ts;
      continue;
    }
    frag.appendChild(el);
  }
  return frag;
}

async function loadHistory() {
  const id = sessionId.value;
  if (!id) { loadingHistory.value = false; return; }
  try {
    const result = await window.api.readSessionTranscript(id, { limit: HISTORY_PAGE });
    if (sessionId.value !== id) return;          // switched away mid-read
    if (result?.error) return;

    historyFrom = result.from;
    historyHasMore = !!result.hasMore;
    historyCompact = result.compact || null;
    historyTotal.value = result.total || 0;
    loadedFrom.value = result.from || 0;
    loadedTo.value = result.to || 0;

    // The same entries carry what the session was last running as.
    applyStoredControls(result.entries || []);

    const body = bodyRef.value;
    if (!body) return;
    const frag = renderWindow(result.entries);
    if (frag.childNodes.length) body.appendChild(frag);
    refreshTopAffordance();
    shownDay = refreshDayMarkers(body);
    refreshStamps(body);
    body.scrollTop = body.scrollHeight;
    pinned = true;
  } catch {
    /* A session with no transcript yet is the normal case for a new one. */
  } finally {
    loadingHistory.value = false;
  }
}

/**
 * Prepend the page ending at `before`, holding the reading position still.
 *
 * Inserting above the viewport moves everything under it down by the height of
 * what was inserted, so the scroll offset is corrected by exactly that much —
 * otherwise loading a page would throw the reader back to where they had
 * already been.
 */
async function loadEarlier(before) {
  const id = sessionId.value;
  if (loadingEarlier || !id || before === null || before <= 0) return;
  loadingEarlier = true;
  try {
    const result = await window.api.readSessionTranscript(id, { before, limit: HISTORY_PAGE });
    if (sessionId.value !== id || result?.error) return;

    const body = bodyRef.value;
    if (!body) return;

    historyFrom = result.from;
    historyHasMore = !!result.hasMore;
    historyCompact = result.compact || null;
    if (result.total) historyTotal.value = result.total;
    // The band spans everything painted, oldest record to newest. Stepping over
    // a compact makes that two disjoint segments; one band over both is still
    // the honest answer to "how much of this file am I looking at".
    loadedFrom.value = result.from || 0;
    loadedTo.value = Math.max(loadedTo.value, result.to || 0);

    const heightBefore = body.scrollHeight;
    const scrollBefore = body.scrollTop;
    const frag = renderWindow(result.entries);

    // The marker goes first so the new entries land under it, then the
    // affordance for whatever is above *this* page replaces it.
    topObserver?.disconnect();
    const anchor = topEl;
    if (frag.childNodes.length) {
      if (anchor && anchor.parentNode === body) body.insertBefore(frag, anchor.nextSibling);
      else body.insertBefore(frag, body.firstChild);
    }
    anchor?.remove();
    topEl = null;
    refreshTopAffordance();
    // A prepended window can turn the day the old first message started into a
    // day it no longer starts, so the separators are rebuilt rather than added to.
    shownDay = refreshDayMarkers(body);
    refreshStamps(body);

    body.scrollTop = scrollBefore + (body.scrollHeight - heightBefore);
    readPinned();
  } catch {
    /* A read that fails leaves the affordance in place to try again. */
  } finally {
    loadingEarlier = false;
  }
}

onMounted(() => {
  // This view is keyed by session id, so it is torn down and rebuilt on every
  // switch. Each subscription's disposer is kept and called on unmount: a stale
  // listener is not harmless here, because the id it guards on is read off the
  // shared store and therefore always matches the *current* session — every
  // past mount would go on rendering every message, invisibly.
  subscriptions.push(
    window.api.onSdkMessage((id, message) => {
      if (id !== sessionId.value) return;
      handle(message);
    }),

    // The same status the board draws from — see applySessionStatus in app.js.
    window.api.onSessionStatus?.((id, status) => {
      if (id !== sessionId.value || !status) return;
      if (status.state === 'running') { noteTurnActivity(); busy.value = true; return; }
      if (status.state !== 'idle' && status.state !== 'exited') return;
      if (turnGraceUntil && Date.now() < turnGraceUntil) return;   // too early to believe
      noteTurnActivity();
      busy.value = false;
    }),

    // markRaw, because the request is read and never edited — and because the
    // answer carries the tool input straight back over IPC. A reactive proxy
    // cannot be structured-cloned, so making it reactive would break the reply.
    window.api.onSdkPermissionRequest((id, incoming) => {
      if (id !== sessionId.value) return;
      request.value = markRaw(incoming);
    }),
    window.api.onSdkElicitationRequest?.((id, incoming) => {
      if (id !== sessionId.value) return;
      request.value = markRaw({ ...incoming, kind: 'elicitation' });
    }),
    window.api.onSdkDialogRequest?.((id, incoming) => {
      if (id !== sessionId.value) return;
      request.value = markRaw({ ...incoming, kind: 'dialog' });
    }),
    // The CLI can withdraw the question — an interrupted turn. Take the dialog
    // down rather than leave a button that answers nothing.
    window.api.onSdkPermissionCancelled((id, requestId) => {
      if (request.value?.requestId === requestId) request.value = null;
    }),
  );

  bodyRef.value?.addEventListener('scroll', readPinned, { passive: true });
  bodyRef.value?.addEventListener('click', onBodyClick);

  // "2 minutes ago" has to become "3 minutes ago" on its own. One clock for the
  // whole transcript, at the resolution the coarsest unit needs.
  whenTimer = setInterval(() => refreshWhen(bodyRef.value), 30000);

  loadHistory();
  loadCompacts();
  loadPending();
  loadModels();
  loadCommands();
  loadFiles();
  refreshContext();
  nextTick(() => inputRef.value?.focus());
});

onBeforeUnmount(() => {
  if (turnWatchdog) clearTimeout(turnWatchdog);
  clearTimeout(livePaintTimer);
  livePaintTimer = 0;
  livePending = false;
  clearInterval(workingTimer);
  workingTimer = 0;
  clearInterval(whenTimer);
  whenTimer = 0;
  for (const off of subscriptions) off?.();
  subscriptions.length = 0;
  topObserver?.disconnect();
  topObserver = null;
  topEl = null;
  bodyRef.value?.removeEventListener('scroll', readPinned);
  bodyRef.value?.removeEventListener('click', onBodyClick);
  toolResults = new Map();
  toolNodes = new Map();
  liveEl = null;
  workingEl = null;
  thinkEl = null;
  liveText = '';
  thinkText = '';
});

defineExpose({ handle });
</script>
