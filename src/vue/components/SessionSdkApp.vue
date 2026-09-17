<template>
  <!-- A file dropped anywhere on the chat is meant for the next prompt; the
       composer is a thin strip at the bottom and aiming at it is work. -->
  <div
    class="sbx-sdk"
    :class="{ 'is-asking': !!request, 'is-dropping': dropActive }"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- The shape of a long session is the four things a scrollbar cannot show:
         where its context was thrown away, where a turn ended, where something
         failed, and where the calendar turned over. The records above a compact
         are not even loaded and have no height to scroll through — so the rail
         measures the file, not the viewport, and it is there for the whole of
         a session rather than only for one that has been compacted. -->
    <div v-if="railVisible" class="sbx-timeline">
      <div class="sbx-timeline__thumb" :style="viewBand"></div>
      <button
        v-for="mark in timelineMarks"
        :key="mark.key"
        type="button"
        class="sbx-timeline__notch"
        :class="`is-${mark.kind}`"
        :style="{ top: mark.at }"
        :data-tooltip="mark.label"
        :aria-label="mark.label"
        @click="revealRecord(mark.index)"
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

      <!-- What will ride along with the next prompt. Images go as image blocks;
           everything else goes as the `@path` mention shown on the chip. -->
      <div v-if="attachments.length" class="sbx-sdk__chips">
        <div
          v-for="item in attachments"
          :key="item.id"
          class="sbx-chip"
          :title="item.mention || item.path || item.name"
        >
          <img v-if="item.kind === 'image'" class="sbx-chip__thumb" :src="item.url" alt="" />
          <SbIcon v-else name="file" :size="13" class="sbx-chip__icon" />
          <span class="sbx-chip__name">{{ item.name }}</span>
          <span v-if="item.bytes" class="sbx-chip__size">{{ shortBytes(item.bytes) }}</span>
          <button
            type="button"
            class="sbx-chip__drop"
            :aria-label="`Remove ${item.name}`"
            @click="removeAttachment(item.id)"
          >
            <SbIcon name="x" :size="11" />
          </button>
        </div>
      </div>

      <div class="sbx-sdk__field">
        <!-- The keyboard path is paste and drop; this is for the times the file
             is neither on the clipboard nor draggable from where it lives. -->
        <button
          type="button"
          class="sbx-sdk__attach"
          data-tooltip="Attach a file"
          aria-label="Attach a file"
          @click="pickFiles"
        >
          <SbIcon name="paperclip" :size="13" />
        </button>
        <input
          ref="fileInputRef"
          type="file"
          multiple
          class="sbx-sdk__filepick"
          @change="onFilePicked"
        />
        <textarea
          ref="inputRef"
          v-model="draft"
          class="sbx-sdk__input"
          rows="1"
          :placeholder="busy ? 'Claude is working — your message will go next' : 'Message Claude…'"
          @keydown="onKey"
          @input="autoGrow"
          @paste="onPaste"
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
          <option v-for="m in modeOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
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
  refreshWhen, mergeToolGroups, groupOfEntry, markToolDuration,
  applyToolResult, collapseToolBlock, refreshDayMarkers, refreshStamps, dayKey,
  adoptOrphanResults,
  mergeSlashOutput, renderUserPrompt,
} from '../message-render.js';
import {
  isImageType, mentionFor, baseName, shortBytes,
  promptText, promptContent, MAX_IMAGE_BYTES,
} from '../composer-attachments.js';
import { prepareImage } from '../composer-image.js';
import { railBand, viewSpanOf, isPainted } from '../transcript-rail.js';
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
// and `dontAsk` are deliberately absent: neither is something to reach for from
// a dropdown mid-conversation.
const PERMISSION_MODES = [
  { value: 'auto', label: 'Auto' },
  { value: 'default', label: 'Manual' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'plan', label: 'Plan' },
];

// …but a session already running on one of them must not read as Manual, so
// the mode in force is always an option — it just stops being offered once the
// session is off it.
const OTHER_MODES = {
  dontAsk: "Don't ask",
  bypassPermissions: 'Bypass',
};
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

const modeOptions = computed(() => {
  const extra = OTHER_MODES[permissionMode.value];
  return extra
    ? [...PERMISSION_MODES, { value: permissionMode.value, label: extra }]
    : PERMISSION_MODES;
});

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

// tool_use_id → the tool's name, for every call this view has ever seen.
// Ids, not nodes, so it survives the blocks being released from the DOM — a
// result whose call has scrolled out of the window is what needs it. Kept for
// the life of the view: it is two short strings per call.
let toolNames = new Map();

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

/**
 * The viewport as fractions of the painted transcript — top edge and bottom
 * edge. The rail's thumb is placed off this; see transcript-rail.js.
 *
 * Reactive where `pinned` is not, because it drives something on screen. It is
 * still only written from the scroll handler, which is the same free read: the
 * three numbers are taken together, after layout has already happened.
 */
const viewSpan = ref({ start: 0, end: 1 });

function readScroll() {
  const el = bodyRef.value;
  if (!el) return;
  pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  const next = viewSpanOf(el);
  // The rail is a few hundred pixels tall, so a change it cannot draw is not a
  // change. Without this the thumb's style was patched on every scroll event —
  // and, while a turn streams, on every frame that grew the transcript by a
  // line, because a fresh object is always a fresh identity.
  const now = viewSpan.value;
  maybePageUp();
  if (Math.abs(next.start - now.start) < 0.001 && Math.abs(next.end - now.end) < 0.001) return;
  viewSpan.value = next;
}

/**
 * Past the end, which the browser clamps to the end.
 *
 * `el.scrollTop = el.scrollHeight` reads a layout-dependent property before
 * writing one, so it forces the document to be laid out synchronously *twice*.
 * A number no transcript can reach does the same job with the read removed —
 * and this runs on every painted frame of every streamed answer.
 */
const BOTTOM = 1e9;

function stickBottom() {
  const el = bodyRef.value;
  if (pinned && el) el.scrollTop = BOTTOM;
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
  // A call drawn in this batch may be the one a loose result above was waiting
  // for — the CLI can report the answer before the record of the call.
  adoptOrphanResults(el);
  const today = dayKey(Date.now());
  if (today !== shownDay) shownDay = refreshDayMarkers(el);
  // Whether a message is followed by the calls it led to changes with every
  // message, so this is re-read rather than gated: it is attribute reads over
  // the transcript's own children, and it writes only where the answer moved.
  refreshStamps(el);
  // Only chase the bottom if the user was already there — otherwise reading
  // back through a long turn would be yanked away on every message.
  stickBottom();
  // A turn that runs for an hour appends without limit, so the ceiling cannot
  // wait for the turn to end. Returns immediately unless there is something to
  // let go of.
  releaseOldMessages();
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

// Painting is throttled, and the throttle widens as the answer grows.
//
// A delta carries a few characters, and the paragraph is re-rendered from the
// whole accumulated answer each time — so painting per delta is quadratic in
// the length of the answer, and measurably so: the same paint costs 2.7ms at
// 3k characters and 6.8ms at 23k. A fixed cadence bounds how often that is
// paid but not what it costs, so a long answer still ends up spending a
// growing fraction of a core on re-rendering text nobody can read that fast:
// twelve paints a second of a 23k answer is 85ms of work per second, and it
// keeps climbing for as long as Claude keeps talking.
//
// So the interval is derived from the length. Prose arrives at a few hundred
// characters a second and is read at about a thousand; at the ceiling the
// paragraph still refreshes twice a second, which is well inside that.
//
// A leading paint keeps the first token instant.
const LIVE_PAINT_MIN_MS = 80;
const LIVE_PAINT_MAX_MS = 500;
let livePaintTimer = 0;
let livePending = false;

/** How long to wait before repainting an answer this long. */
function paintInterval() {
  const size = liveText.length + thinkText.length;
  return Math.min(LIVE_PAINT_MAX_MS, Math.max(LIVE_PAINT_MIN_MS, Math.round(size / 60)));
}

function schedulePaint() {
  livePending = true;
  if (livePaintTimer) return;
  paintLive();
  livePaintTimer = setTimeout(() => {
    livePaintTimer = 0;
    // Re-arm only while tokens are still arriving, so a finished turn stops
    // the timer rather than leaving it ticking for the life of the session.
    if (livePending) schedulePaint();
  }, paintInterval());
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
    body.scrollTop = BOTTOM;
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

/**
 * What the turn has cost, in one number that survives being read quickly.
 *
 * The written count, not the billed total. A turn is one request per tool round
 * trip and each re-sends the whole prompt — at an 800k context that is 800k of
 * input per trip, nearly all of it re-read from cache. Summed, it reached
 * fifteen million beside a context window reading 812k, which is a number that
 * grows with round trips rather than with work and reads as a bug even when the
 * arithmetic is right. What was actually produced is the honest headline; the
 * rest is in the tooltip for when the question really is what it cost.
 */
/**
 * The three parts of the row, held rather than looked up.
 *
 * `paintWorking` runs once a second for the length of a turn and again on every
 * token of usage; re-querying the row each time is three selector walks for
 * three elements that cannot move.
 */
let workingParts = null;

function paintWorking() {
  if (!workingEl || !workingParts) return;
  const { input, cached, output } = turnTokens.value;
  workingParts.meta.textContent = [
    turnStartedAt ? elapsedLabel(Date.now() - turnStartedAt) : '',
    output ? `${shortCount(output)} written` : '',
  ].filter(Boolean).join(' · ');
  // What it is doing goes *under* the row rather than in place of the word on
  // it. Swapping "Working" out for "Running Bash" and back several times a turn
  // made the one fixed thing on screen the twitchiest: the eye tracked a label
  // that was really a status feed, and the row's own state — is this turn still
  // alive — was the thing it stopped saying.
  const doing = activity.value;
  if (workingParts.doing.textContent !== doing) workingParts.doing.textContent = doing;
  workingEl.classList.toggle('has-activity', !!doing);
  const sent = input + cached;
  workingEl.title = output || sent
    ? [
      `${output.toLocaleString()} tokens written`,
      sent && `${sent.toLocaleString()} sent — ${cached.toLocaleString()} cached, ${input.toLocaleString()} new`,
    ].filter(Boolean).join('\n')
    : '';
}

function setWorking(on) {
  const el = bodyRef.value;
  if (!on) {
    clearInterval(workingTimer);
    workingTimer = 0;
    workingEl?.remove();
    workingEl = null;
    workingParts = null;
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
  // The same ring the sidebar spins on a busy row, so "this session is working"
  // looks like one thing whichever of the two you happen to be looking at.
  workingEl.innerHTML = '<div class="sbx-working__row">'
    + '<span class="sbx-working__spinner"></span>'
    + '<span class="sbx-working__label">Working</span>'
    + '<span class="sbx-working__meta"></span>'
    + '</div>'
    + '<div class="sbx-working__doing"></div>';
  workingParts = {
    meta: workingEl.querySelector('.sbx-working__meta'),
    doing: workingEl.querySelector('.sbx-working__doing'),
  };
  el.appendChild(workingEl);
  paintWorking();
  // One second, because the elapsed count is in seconds. Cleared the moment the
  // turn ends, so an idle session ticks nothing.
  workingTimer = setInterval(paintWorking, 1000);
  stickBottom();
}

watch(busy, setWorking);
// What it is doing changes a handful of times a turn and is worth showing the
// moment it does. The token counts are not on this watcher: `message_delta`
// reports them on every frame of the stream, which had the row rewriting three
// nodes and building a two-line tooltip through `toLocaleString` dozens of
// times a second — for a figure whose own clock ticks once a second anyway.
watch(activity, paintWorking);

// ── Tokens spent on the current turn ──────────────────────────────
//
// One turn is several API requests — one per tool round trip — and each bills
// its own prompt. So finished requests are added up, and the one in flight is
// replaced on every frame, because `message_delta` reports the answer so far
// rather than an increment.
const ZERO_TOKENS = { input: 0, cached: 0, output: 0 };
let tokensDone = { ...ZERO_TOKENS };
let tokensNow = { ...ZERO_TOKENS };

function resetTokens() {
  tokensDone = { ...ZERO_TOKENS };
  tokensNow = { ...ZERO_TOKENS };
  turnTokens.value = { ...ZERO_TOKENS };
}

function noteUsage(item) {
  if (item.phase === 'start') {
    tokensDone = {
      input: tokensDone.input + tokensNow.input,
      cached: tokensDone.cached + tokensNow.cached,
      output: tokensDone.output + tokensNow.output,
    };
    tokensNow = { input: item.inputTokens, cached: item.cachedTokens, output: item.outputTokens };
  } else {
    tokensNow = {
      input: Math.max(tokensNow.input, item.inputTokens),
      cached: Math.max(tokensNow.cached, item.cachedTokens),
      output: Math.max(tokensNow.output, item.outputTokens),
    };
  }
  turnTokens.value = {
    input: tokensDone.input + tokensNow.input,
    cached: tokensDone.cached + tokensNow.cached,
    output: tokensDone.output + tokensNow.output,
  };
}

/** `mcp__browser__navigate` → `navigate`; the prefix is plumbing. */
function shortToolName(name) {
  return String(name || 'tool').replace(/^mcp__/, '').split('__').pop();
}

/**
 * The block for a call, wherever it is — this turn's, or one read off disk.
 *
 * `toolNodes` holds only the calls this view drew live, and it is emptied at
 * the end of every turn. That left two ordinary situations with no block to
 * find: a chat opened while a turn was already running, whose calls came from
 * the file, and a result that arrived after its turn closed. Both ended up as
 * a loose result below a call that was sitting right there on screen.
 *
 * The id is on the element, so the document is the index.
 */
function findToolNode(id) {
  if (!id) return null;
  const known = toolNodes.get(id);
  if (known?.isConnected) return known;
  const found = bodyRef.value?.querySelector(`[data-tool-use-id="${CSS.escape(id)}"]`);
  return found?.classList.contains('jsonl-tool-block') ? found : null;
}

/**
 * A call already on screen, answered.
 *
 * The result arrives as its own message, usually seconds after the call. Folded
 * into the block it belongs to it is one row that can be opened; rendered on
 * its own — which is what used to happen — it is an anonymous "Tool Result"
 * some distance below the call it answers.
 */
function settleTool(id, data) {
  const node = findToolNode(id);
  if (!node) return false;
  toolNodes.delete(id);
  // Folds the answer in and, when it came back non-zero, says so on the row —
  // see applyToolResult.
  applyToolResult(node, data);
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
    if (item.kind === 'tool_use' && item.id) toolNames.set(item.id, item.name);
    if (item.kind === 'tool_result' && item.toolUseId) {
      activity.value = '';
      // Carried as a pair: whether the call failed is as much a part of the
      // answer as the text of it, and the row has to be able to say so
      // whichever path renders it.
      const answer = { content: item.content, isError: item.isError };
      if (!settleTool(item.toolUseId, answer)) {
        toolResults.set(item.toolUseId, answer);
      }
    }
    if (item.kind === 'turn_end') {
      endStream();
      noteTurnActivity();
      busy.value = false;
      toolNodes.clear();
      refreshContext();
      // The turn just added marks to the rail — at the very least its own end,
      // and possibly a compact. The rail is drawn from the file.
      loadLandmarks();
      // A finished turn is the one moment the file is certainly flush with what
      // is on screen, so it is the moment to let go of what has scrolled away.
      releaseOldMessages();
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

  const frag = renderViewItems(items, toolResults, { foldTools: true, at: Date.now(), toolNames });
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

/**
 * The prompt as it will look in the transcript once the CLI has written it.
 *
 * With an image it is one entry — blocks above the sentence — because that is
 * the record the `.jsonl` will hold, and the echo is replaced by nothing: it
 * has to be right the first time or the same message reads two ways before and
 * after the chat is reopened.
 */
function echoFragment(text, list, at) {
  const images = list.filter(item => item.kind === 'image');
  if (images.length) return renderUserPrompt({ text, images, at });
  return renderViewItems([echoOf(text)], null, { at });
}

async function send() {
  const list = attachments.value;
  const text = promptText(draft.value, list);
  if ((!text && !list.length) || !sessionId.value) return;
  const content = promptContent(draft.value, list);

  // Echoed locally: the CLI does not send the prompt back, and a message that
  // vanishes on submit reads as a dropped one.
  append(echoFragment(text, list, Date.now()));
  draft.value = '';
  attachments.value = [];
  busy.value = true;
  turnGraceUntil = Date.now() + TURN_GRACE_MS;
  startTurnWatchdog();
  nextTick(() => { autoGrow(); inputRef.value?.focus(); });

  // A stopped session has no process to take this. Stopping one is how you put
  // a conversation down, and typing into it is how you pick it back up — so
  // the prompt starts the session rather than bouncing off it with "the
  // session is gone", which is what it used to do.
  if (!store.activePtyIds?.has(sessionId.value)) {
    activity.value = 'Resuming';
    const back = await window.__sb?.resumeSession?.(sessionId.value);
    if (!back) {
      busy.value = false;
      append(renderViewItems([{
        kind: 'notice', level: 'error',
        text: 'This session could not be started again, so that prompt was not sent.',
      }], null, { at: Date.now() }));
      return;
    }
  }

  const res = await window.api.sdkSendPrompt(sessionId.value, content);
  // The echo is already on screen, so a refusal has to say so out loud rather
  // than leave a message sitting there that nothing will ever answer.
  if (res?.ok) return;
  noteTurnActivity();
  busy.value = false;
  append(renderViewItems([{
    kind: 'notice', level: 'error',
    text: `That prompt was not accepted: ${res?.error || 'the session is gone'}.`,
  }], null, { at: Date.now() }));
}

// ── Attachments ───────────────────────────────────────────────────
//
// What the CLI's own composer accepts: an image on the clipboard, and a file.
// They leave by different doors — see composer-attachments.js — and both are
// held as chips until the prompt is sent, so a paste can be taken back.

/** @type {import('vue').Ref<Array<object>>} images and files for the next prompt */
const attachments = ref([]);
const fileInputRef = ref(null);
const dropActive = ref(false);
let attachmentSeq = 0;

function removeAttachment(id) {
  attachments.value = attachments.value.filter(item => item.id !== id);
  nextTick(() => inputRef.value?.focus());
}

/** Why a file could not be attached, in the transcript rather than a swallowed log. */
function refuseAttachment(text) {
  append(renderViewItems([{ kind: 'notice', level: 'warn', text }], null, { at: Date.now() }));
}

async function attachFiles(files) {
  for (const file of files) {
    if (!file) continue;

    if (isImageType(file.type)) {
      const image = await prepareImage(file).catch(() => null);
      if (!image) {
        refuseAttachment(`${file.name || 'That image'} is still over ${shortBytes(MAX_IMAGE_BYTES)} after resizing — it cannot be sent.`);
        continue;
      }
      attachments.value = [...attachments.value, {
        id: `a${++attachmentSeq}`,
        kind: 'image',
        name: file.name || 'pasted image',
        ...image,
      }];
      continue;
    }

    // Not an image, so it goes as a reference — which needs somewhere to point.
    // A blob pasted out of a web page has no path and nothing to fall back on:
    // the API takes images, not arbitrary bytes.
    const path = window.api.getPathForFile?.(file) || '';
    if (!path) {
      refuseAttachment(`${file.name || 'That file'} is not a file on disk — save it somewhere first, then attach it.`);
      continue;
    }
    const mention = mentionFor(path, store.headerSession?.projectPath || '');
    if (attachments.value.some(item => item.path === path)) continue;
    attachments.value = [...attachments.value, {
      id: `a${++attachmentSeq}`,
      kind: 'file',
      name: baseName(path),
      path,
      mention,
      bytes: file.size,
    }];
  }
  nextTick(() => { autoGrow(); inputRef.value?.focus(); });
}

function onPaste(event) {
  const files = [...(event.clipboardData?.files || [])];
  if (!files.length) return;           // ordinary text paste, nothing to do
  event.preventDefault();
  attachFiles(files);
}

function pickFiles() {
  fileInputRef.value?.click();
}

function onFilePicked(event) {
  const files = [...(event.target.files || [])];
  // Cleared so picking the same file twice in a row still fires `change`.
  event.target.value = '';
  if (files.length) attachFiles(files);
}

// Dragging text inside the composer is a selection, not an attachment; only a
// drag carrying files gets the highlight and the drop.
const carriesFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files');

// `dragleave` fires on every child the pointer crosses, so the highlight is
// held by a depth count rather than by the last event to arrive.
let dragDepth = 0;

function onDragEnter(event) {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  dragDepth++;
  dropActive.value = true;
}

function onDragOver(event) {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropActive.value = false;
}

function onDrop(event) {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  dropActive.value = false;
  attachFiles([...(event.dataTransfer.files || [])]);
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
//
// A session with nothing to read back — a new one, which is every session at
// its first turn — falls through to the settings it was launched with. Those
// are the project's, then the global ones behind them, resolved by main.js;
// see resolveDefaultSessionOptions in public/dialogs.js for the other half.

/** What main.js started this session on: `{ permissionMode, effort }`. */
async function launchDefaults() {
  const projectPath = store.headerSession?.projectPath || '';
  if (!projectPath) return {};
  try {
    const effective = await window.api.getEffectiveSettings(projectPath) || {};
    return {
      permissionMode: effective.dangerouslySkipPermissions
        ? 'bypassPermissions'
        : (effective.permissionMode || null),
      effort: effective.effort || null,
    };
  } catch {
    return {};
  }
}

/** A mode the picker can show — anything else is not worth guessing at. */
const isKnownMode = (mode) =>
  !!mode && (PERMISSION_MODES.some(m => m.value === mode) || mode in OTHER_MODES);

async function applyStoredControls(entries) {
  const id = sessionId.value;
  const found = controlsFromTranscript(entries);
  if (!id) return;

  const defaults = await launchDefaults();
  if (sessionId.value !== id) return;             // switched away mid-read

  // The transcript is asked for, because it can disagree with the settings: it
  // records what the session was last actually running, which may be a mode
  // changed by hand three turns ago. The launch defaults are only shown — the
  // session is already on them, and a control request before its first turn
  // opens would fail and leave the picker back on its own hardcoded guess.
  if (isKnownMode(found.permissionMode)) {
    const res = await window.api.sdkSetPermissionMode(id, found.permissionMode);
    if (res?.ok && sessionId.value === id) permissionMode.value = found.permissionMode;
  } else if (isKnownMode(defaults.permissionMode)) {
    permissionMode.value = defaults.permissionMode;
  }
  if (found.effort) {
    const res = await window.api.sdkSetEffort(id, found.effort);
    if (res?.ok && sessionId.value === id) effort.value = found.effort;
  } else if (defaults.effort) {
    effort.value = defaults.effort;
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

// ── The timeline rail ─────────────────────────────────────────────
//
// The session's own shape, down the left edge: compacts, turn ends, failures
// and day changes. None of the four is something a scrollbar can show — the
// records above a compact are not loaded and have no height to scroll through
// at all — so the rail is measured against the file's record count rather than
// against the DOM. See readSessionLandmarks for where the marks come from.

/** Every mark in the file — `{ kind, index, timestamp, ... }`. */
const landmarks = ref([]);
/** Records in the file. */
const historyTotal = ref(0);
/**
 * The runs of records currently painted, oldest first.
 *
 * Usually one — the tail of the file. Stepping over a compact adds a second,
 * with everything the compact dropped in between, and the two scroll as one
 * column: that gap is why the thumb is placed by walking these rather than by
 * interpolating between the oldest and newest record on screen.
 */
const paintedRuns = ref([]);

/** What a notch says when you hover it. One line, kind first. */
function markLabel(mark) {
  const when = mark.timestamp ? relativeTime(mark.timestamp) : '';
  if (mark.kind === 'compact') {
    return [
      mark.trigger === 'auto' ? 'Auto-compacted' : 'Compacted',
      when,
      mark.preTokens ? `${shortTokens(mark.preTokens)} → ${shortTokens(mark.postTokens)} tokens` : '',
    ].filter(Boolean).join(' · ');
  }
  if (mark.kind === 'day') {
    const d = mark.timestamp ? new Date(mark.timestamp) : null;
    return d && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString([], { weekday: 'short', month: 'long', day: 'numeric' })
      : 'A new day';
  }
  return ['Something failed', when].filter(Boolean).join(' · ');
}

/**
 * Below this many messages there is no shape to show.
 *
 * A rail is a map, and a conversation you can scroll through in one flick does
 * not need one — it was drawing a two-notch strip down the side of an exchange
 * you could see all of at once.
 */
const RAIL_MIN_MESSAGES = 10;

const railVisible = computed(() => {
  if (!historyTotal.value) return false;
  // The cache's own count, which is what the sidebar row shows. A record is not
  // a message — attachments, titles and mode changes are records too — so the
  // file's length is only the fallback, for a session too new to be indexed.
  const counted = store.headerSession?.messageCount;
  const messages = Number.isFinite(counted) && counted > 0 ? counted : historyTotal.value;
  return messages >= RAIL_MIN_MESSAGES;
});

const timelineMarks = computed(() => {
  const total = historyTotal.value;
  if (!total) return [];
  return landmarks.value.map(mark => ({
    key: `${mark.kind}:${mark.index}`,
    kind: mark.kind,
    index: mark.index,
    // Clamped off both ends: a notch flush with the edge reads as the rail's
    // own cap rather than as a mark on it.
    at: `${Math.min(97, Math.max(3, (mark.index / total) * 100))}%`,
    label: markLabel(mark),
  }));
});

/**
 * Where the reader is in the session — the thumb, in the rail's own file
 * coordinates so it reads against the notches rather than beside them.
 *
 * It moves both ways. The band used to show how much of the file was painted,
 * which grew as you scrolled up into history and then never moved again: it
 * answered "how much have I loaded", and the question a rail beside a
 * conversation is asked is "where am I".
 */
const viewBand = computed(() => {
  const band = railBand(paintedRuns.value, historyTotal.value, viewSpan.value);
  if (!band) return { display: 'none' };
  return { top: `${band.top}%`, height: `${band.height}%` };
});

/**
 * Fold new records at the end of the file into the newest painted run.
 *
 * Live messages are appended to the transcript and to the file at the same
 * time, and nothing is ever paged downward — so the painted tail always reaches
 * the end. Without this the thumb stopped a little short of the bottom in a
 * session that was still talking.
 */
function growToTotal(total) {
  if (!total) return;
  historyTotal.value = total;
  const runs = paintedRuns.value;
  const last = runs[runs.length - 1];
  if (!last || last.to >= total) return;
  paintedRuns.value = [...runs.slice(0, -1), { from: last.from, to: total }];
}

async function loadLandmarks() {
  const id = sessionId.value;
  if (!id) return;
  const res = await window.api.sessionLandmarks?.(id).catch(() => null);
  if (!res?.ok || sessionId.value !== id) return;
  landmarks.value = res.marks || [];
  growToTotal(res.total);
}

/** Record index of the oldest entry on screen — where the next page ends. */
let historyFrom = null;
/** Is there anything above what is loaded, including a compact marker? */
let historyHasMore = false;
/** The `/compact` boundary directly above the loaded range, if the page hit one. */
let historyCompact = null;
let loadingEarlier = false;
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
  topEl?.remove();
  topEl = null;
  if (!historyHasMore) return;

  topEl = historyCompact ? makeCompactMarker(historyCompact) : makeTopSentinel();
  body.insertBefore(topEl, body.firstChild);
}

// ── Paging upward ─────────────────────────────────────────────────
//
// One page per gesture, and a gesture is input: a wheel, a drag, an arrow key.
//
// This was an IntersectionObserver on the sentinel, and it was wrong twice
// over. A sentinel that stays in view after a page lands — which is what "at
// the top" means — is not a *change* in intersection, so the observer never
// fired again and paging stopped dead after one page. And when the scroll
// anchoring drifted (see holdInPlace), the sentinel came back into view on its
// own and the observer paged over and over with nobody asking: a six-thousand
// record session read itself into the document in a couple of seconds.
//
// Reading the scroll position answers both. It is only acted on while armed,
// and only input arms it, so a scroll this component performed itself — chasing
// the bottom of a stream, holding a page in place — can never load anything.

/** How close to the top counts as asking for the page above. */
const PAGE_UP_MARGIN = 400;

/** Has the reader asked for more since the last page arrived? */
let autoPageArmed = true;

function maybePageUp() {
  const body = bodyRef.value;
  if (!autoPageArmed || !historyHasMore || loadingEarlier || !body) return;
  // A compact marker is answered by hand: what is above it is a segment the
  // model itself threw away, and loading it is a decision rather than a scroll.
  if (historyCompact) return;
  if (body.scrollTop > PAGE_UP_MARGIN) return;
  autoPageArmed = false;
  loadEarlier(historyFrom);
}

function armAutoPage() {
  autoPageArmed = true;
  // Tried straight away as well as on the scroll that follows: at the very top
  // there is nothing left to scroll, so the wheel event is the only signal.
  maybePageUp();
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
      // Names are remembered for the whole view, not just this window: the next
      // page up can carry the answer to a call this page already showed.
      if (block.type === 'tool_use' && block.id) toolNames.set(block.id, block.name);
      if (block.type === 'tool_result' && block.tool_use_id) {
        results.set(block.tool_use_id, {
          content: block.content || block.output || '',
          isError: block.is_error === true,
        });
        if (entry.timestamp) toolTimes.set(block.tool_use_id, entry.timestamp);
      }
    }
  }
  const frag = document.createDocumentFragment();
  const opts = { foldTools: true, timestamps: true, toolTimes, toolNames };
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
  // The controls are set from whatever the read turns up, and a read that
  // turns up nothing — a new session, whose .jsonl does not exist yet — still
  // has to set them from the launch settings. Tracked, so the paths that
  // return early below still go through applyStoredControls once.
  let controlsApplied = false;
  const applyControls = (entries) => {
    if (controlsApplied || sessionId.value !== id) return;
    controlsApplied = true;
    applyStoredControls(entries);
  };
  try {
    const result = await window.api.readSessionTranscript(id, { limit: HISTORY_PAGE });
    if (sessionId.value !== id) return;          // switched away mid-read
    if (result?.error) return;

    historyFrom = result.from;
    historyHasMore = !!result.hasMore;
    historyCompact = result.compact || null;
    historyTotal.value = result.total || 0;
    paintedRuns.value = result.to > result.from ? [{ from: result.from, to: result.to }] : [];

    // The same entries carry what the session was last running as.
    applyControls(result.entries || []);

    const body = bodyRef.value;
    if (!body) return;
    const frag = renderWindow(result.entries);
    if (frag.childNodes.length) body.appendChild(frag);
    adoptOrphanResults(body);
    refreshTopAffordance();
    shownDay = refreshDayMarkers(body);
    refreshStamps(body);
    // Over the next few frames, not once: every entry carries
    // `content-visibility: auto`, so the transcript's height right after the
    // first paint is an estimate that is about to be replaced by the real one.
    // Landing short of the bottom left the top sentinel in view, and from there
    // the session read itself into the document a page at a time.
    let settle = 3;
    const toBottom = () => {
      body.scrollTop = BOTTOM;
      if (--settle > 0) requestAnimationFrame(toBottom);
      else readScroll();
    };
    toBottom();
  } catch {
    /* A session with no transcript yet is the normal case for a new one. */
  } finally {
    loadingHistory.value = false;
    applyControls([]);
  }
}

/**
 * Hold one element still in the viewport while the page above it settles.
 *
 * Correcting the scroll by "how much taller the transcript got" is right only
 * if the transcript's height is known at that moment, and it is not: every
 * entry carries `content-visibility: auto`, so a run of freshly inserted nodes
 * reports an estimate until the browser has actually laid it out. The
 * correction was therefore applied against a made-up number, the viewport drift
 * upward by the difference, and the top sentinel stayed in view — which loaded
 * another page, which drifted again. Opening a long session pulled nine hundred
 * entries into the document instead of fifty.
 *
 * So the anchor is an element rather than a total, and it is re-applied over
 * the next few frames as the estimates are replaced by real heights.
 */
function holdInPlace(body, anchor) {
  if (!body || !anchor) return;
  const offset = anchor.offsetTop - body.scrollTop;
  let left = 3;
  const settle = () => {
    if (!anchor.isConnected || anchor.parentNode !== body) return;
    body.scrollTop = anchor.offsetTop - offset;
    if (--left > 0) requestAnimationFrame(settle);
  };
  settle();
}

/**
 * Prepend the page ending at `before`, holding the reading position still.
 *
 * Inserting above the viewport moves everything under it down by the height of
 * what was inserted, so the reading position is pinned to the entry that was
 * already under the cursor — see holdInPlace.
 */
/** Where the next page up ends: the loaded top, or the compact just above it. */
function nextPageStart() {
  if (historyFrom === null || historyFrom <= 0) return null;
  // Sitting on a boundary, a window ending at it holds nothing — the floor and
  // the ceiling are the same record. Step over it instead.
  if (historyCompact && historyCompact.index === historyFrom - 1) return historyCompact.index;
  return historyFrom;
}

/** Pages to walk for one notch click. "Show me the whole session" is not what
 *  a click on a 2px mark is asking for. */
const REVEAL_MAX_PAGES = 12;

/**
 * Walk the transcript up until `index` is on screen, then go there.
 *
 * A notch names a compact anywhere in the file, and loading its segment
 * directly would paint records a thousand apart as neighbours with nothing
 * between them to say so. So it is walked a page at a time — the same path an
 * upward scroll takes — and each step is the one `loadEarlier` would have taken
 * on its own.
 */
async function revealRecord(index) {
  for (let page = 0; page < REVEAL_MAX_PAGES; page++) {
    if (historyFrom === null || historyFrom <= index) break;
    const start = nextPageStart();
    if (start === null) break;
    const wasAt = historyFrom;
    // eslint-disable-next-line no-await-in-loop -- each page's floor is where the next one starts
    await loadEarlier(start);
    if (historyFrom === wasAt) break;       // nothing moved; stop rather than spin
  }
  bodyRef.value?.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadEarlier(before) {
  const id = sessionId.value;
  if (loadingEarlier || !id || before === null || before <= 0) return;
  // Already on screen — see isPainted. This is what a notch clicked twice hits.
  if (isPainted(paintedRuns.value, before)) return;
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
    // Kept as its own run. It touches the one below it when the page was an
    // ordinary scroll upward — railBand merges those — and does not when it was
    // a step over a compact, which is the case the thumb has to walk.
    if (result.to > result.from) {
      paintedRuns.value = [{ from: result.from, to: result.to }, ...paintedRuns.value];
    }

    const frag = renderWindow(result.entries);

    // What the reader is looking at: the first entry that was already here,
    // which the new page is going above. It keeps its place on screen no matter
    // what the inserted run turns out to measure.
    const marker = topEl;
    const held = marker?.nextElementSibling || body.firstElementChild;

    // The marker goes first so the new entries land under it, then the
    // affordance for whatever is above *this* page replaces it.
    if (frag.childNodes.length) {
      if (marker && marker.parentNode === body) body.insertBefore(frag, marker.nextSibling);
      else body.insertBefore(frag, body.firstChild);
    }
    marker?.remove();
    topEl = null;
    // The page just prepended holds the calls that the results already on
    // screen are answers to. This is the moment they stop being loose.
    adoptOrphanResults(body);
    refreshTopAffordance();
    // A prepended window can turn the day the old first message started into a
    // day it no longer starts, so the separators are rebuilt rather than added to.
    shownDay = refreshDayMarkers(body);
    refreshStamps(body);

    holdInPlace(body, held);
    readScroll();
  } catch {
    /* A read that fails leaves the affordance in place to try again. */
  } finally {
    loadingEarlier = false;
  }
}

// ── Letting go of what has scrolled away ──────────────────────────
//
// History is paged in from the top and never paged back out, so a session left
// open all day ends up holding every message it has produced — the transcript
// starts at fifty nodes and grows without a ceiling for as long as the turn
// runs. That is the memory, and it is also the layout: every node in the
// document is a node the next scroll and the next streamed token are measured
// against.
//
// So the transcript is trimmed from the top, and only while the reader is
// parked at the bottom — the one position from which nothing above is being
// looked at. What was dropped is not lost: it is in the file, and scrolling up
// pages it straight back in, exactly as it does for history that was never
// loaded in the first place.

/** Nodes that trigger a trim, and how many are kept when one happens. */
const MAX_PAINTED = 260;
const KEEP_PAINTED = 140;

/**
 * How far back of the anchor to resolve the file index.
 *
 * The anchor is the timestamp a surviving node was *drawn* with, and for a live
 * message that is a moment or two after the CLI wrote the record. Resolving the
 * exact time would then land one record too late and leave a gap — a message
 * that is neither on screen nor reachable by scrolling. Biasing the anchor
 * backwards trades that for at most a message or two drawn twice at the seam,
 * which is the right way round: a duplicate is visible, a gap is not.
 */
const ANCHOR_GUARD_MS = 2000;

/** Whether a trim is already in flight — it takes one round trip to the file. */
let releasing = false;

/** Top-level messages, oldest first. Not the rail marker, not the live tail. */
function paintedEntries(body) {
  const tailNodes = tailOrder().filter(Boolean);
  const out = [];
  for (const el of body.children) {
    if (el === topEl || tailNodes.includes(el)) continue;
    // Day separators are rebuilt from whatever survives, so they are not
    // counted and not anchored to.
    if (!el.classList.contains('jsonl-entry')) continue;
    out.push(el);
  }
  return out;
}

async function releaseOldMessages() {
  const body = bodyRef.value;
  const id = sessionId.value;
  // Not while the reader is up in the history: that is the one case where the
  // nodes above the viewport are the ones being read.
  if (!body || !id || releasing || !pinned) return;
  // Cheap gate first — this is called on every appended message.
  if (body.children.length <= MAX_PAINTED) return;

  const entries = paintedEntries(body);
  if (entries.length <= MAX_PAINTED) return;

  const keep = entries[entries.length - KEEP_PAINTED];
  const anchorTs = Number(keep?.dataset?.ts);
  if (!keep || !Number.isFinite(anchorTs) || !anchorTs) return;

  releasing = true;
  try {
    const res = await window.api.sessionRecordAt?.(id, anchorTs - ANCHOR_GUARD_MS).catch(() => null);
    const still = bodyRef.value;
    if (!res?.ok || sessionId.value !== id || !still || keep.parentNode !== still) return;

    topEl?.remove();
    topEl = null;
    for (const el of [...still.children]) {
      if (el === keep) break;
      el.remove();
    }

    historyFrom = res.index;
    historyHasMore = res.index > 0;
    // Whatever compact was flooring the old top is above the new one now, and
    // the window that finds it again is the one the sentinel will ask for.
    historyCompact = null;
    if (res.total) historyTotal.value = res.total;
    paintedRuns.value = [{ from: res.index, to: Math.max(res.index + 1, historyTotal.value) }];

    refreshTopAffordance();
    shownDay = refreshDayMarkers(still);
    refreshStamps(still);
    still.scrollTop = still.scrollHeight;
    readScroll();
  } finally {
    releasing = false;
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

  bodyRef.value?.addEventListener('scroll', readScroll, { passive: true });
  bodyRef.value?.addEventListener('click', onBodyClick);
  // The three ways a reader asks for more of the history. A scroll this
  // component performed itself is deliberately not one of them.
  for (const kind of ['wheel', 'touchmove', 'keydown']) {
    bodyRef.value?.addEventListener(kind, armAutoPage, { passive: true });
  }

  // "2 minutes ago" has to become "3 minutes ago" on its own. One clock for the
  // whole transcript, at the resolution the coarsest unit needs.
  whenTimer = setInterval(() => refreshWhen(bodyRef.value), 30000);

  loadHistory();
  loadLandmarks();
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
  topEl = null;
  bodyRef.value?.removeEventListener('scroll', readScroll);
  bodyRef.value?.removeEventListener('click', onBodyClick);
  for (const kind of ['wheel', 'touchmove', 'keydown']) {
    bodyRef.value?.removeEventListener(kind, armAutoPage);
  }
  toolResults = new Map();
  toolNodes = new Map();
  toolNames = new Map();
  liveEl = null;
  workingEl = null;
  workingParts = null;
  thinkEl = null;
  liveText = '';
  thinkText = '';
});

defineExpose({ handle });
</script>
