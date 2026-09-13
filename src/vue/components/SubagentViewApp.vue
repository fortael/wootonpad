<template>
  <div class="sbx-agentview">
    <!-- A sub-agent is a conversation inside another conversation, so the bar
         says where you are and how to get back out. Without it this view is a
         transcript with no owner — the agent has no row in the sidebar and no
         card on the board to return to. -->
    <header class="sbx-agentview__bar">
      <button type="button" class="sbx-agentview__back" @click="back">
        <SbIcon name="chevron-down" :size="13" class="sbx-agentview__backchev" />
        Back to session
      </button>
      <span class="sbx-agentview__sep">·</span>
      <SbIcon name="bot" :size="13" tone="muted" />
      <span class="sbx-agentview__type">{{ agent?.agentType || 'agent' }}</span>
      <span class="sbx-agentview__desc" :title="agent?.description">{{ agent?.description }}</span>
      <span class="sbx-agentview__spacer"></span>
      <span class="sbx-agentview__state" :class="{ 'is-running': agent?.running }">
        {{ agent?.running ? 'running' : 'finished' }}
      </span>
      <button
        type="button"
        class="sbx-agentview__iconbtn"
        :class="{ 'is-busy': loading }"
        data-tooltip="Reload transcript"
        aria-label="Reload transcript"
        @click="reload"
      >
        <SbIcon name="refresh-cw" :size="12" />
      </button>

      <!-- The same menu shape the session rows use, with the actions that are
           real for an agent. There is no "stop this agent": it runs inside its
           parent's process, and the only thing that ends it is stopping that
           session — so that is what the item says. -->
      <button
        ref="triggerRef"
        type="button"
        class="sbx-smenu__trigger"
        :class="{ 'is-open': menuOpen }"
        aria-label="Task menu"
        :aria-expanded="menuOpen"
        @click.stop="toggleMenu"
      >
        <SbIcon name="ellipsis" :size="14" tone="muted" />
      </button>
    </header>

    <Teleport to="body">
      <div v-if="menuOpen" ref="menuRef" class="sbx-smenu" :style="menuPos" role="menu" @click.stop>
        <div class="sbx-smenu__actions">
          <button type="button" class="sbx-smenu__item" role="menuitem" @click="run(back)">
            <SbIcon name="square-arrow-out-up-right" :size="13" tone="muted" />
            <span>Back to session</span>
          </button>
          <button
            v-if="parentRunning"
            type="button"
            class="sbx-smenu__item"
            role="menuitem"
            @click="run(stopParent)"
          >
            <SbIcon name="square-stop" :size="13" tone="muted" />
            <span>Stop parent session</span>
          </button>
          <button type="button" class="sbx-smenu__item" role="menuitem" @click="run(copyPath)">
            <SbIcon name="copy" :size="13" tone="muted" />
            <span>{{ copied ? 'Copied' : 'Copy transcript path' }}</span>
          </button>
          <button type="button" class="sbx-smenu__item" role="menuitem" @click="run(reload)">
            <SbIcon name="refresh-cw" :size="13" tone="muted" />
            <span>Reload transcript</span>
          </button>
        </div>
      </div>
    </Teleport>

    <!-- The chat's own body class, so the messages look exactly as they do in
         a session — one renderer, one stylesheet, see message-render.js. -->
    <div class="sbx-sdk sbx-agentview__chat">
      <div ref="bodyRef" class="sbx-sdk__body"></div>
      <div v-if="loading" class="sbx-sdk__loading">Loading transcript…</div>
      <div v-else-if="error" class="sbx-sdk__loading">{{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount, nextTick } from 'vue';
import { store } from '../store.js';
import SbIcon from './SbIcon.vue';
import { mergeLocalCommandEntries, renderJsonlEntry } from '../message-render.js';

const REFRESH_MS = 6000;

const agent = ref(null);
const parentSessionId = ref('');
const filePath = ref('');
const loading = ref(false);
const error = ref('');
const bodyRef = ref(null);
const menuOpen = ref(false);
const menuPos = ref({});
const triggerRef = ref(null);
const menuRef = ref(null);
const copied = ref(false);
let entryCount = 0;
let timer = null;

const parentRunning = computed(() => store.sessionBusyState.get(parentSessionId.value)
  || store.activePtyIds.has(parentSessionId.value)
  || store.sdkSessionIds.has(parentSessionId.value));

// Same fold-and-timestamp options the session chat renders history with, so a
// tool call in an agent's transcript reads the way it does in its parent's.
function paint(entries) {
  const body = bodyRef.value;
  if (!body) return;
  const merged = mergeLocalCommandEntries(entries || []);
  const results = new Map();
  const toolTimes = new Map();
  for (const entry of merged) {
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
  for (const entry of merged) {
    const el = renderJsonlEntry(entry, results, opts);
    if (el) frag.appendChild(el);
  }
  body.replaceChildren(frag);
  body.scrollTop = body.scrollHeight;
}

async function fetchEntries({ silent = false } = {}) {
  const id = parentSessionId.value;
  const agentId = agent.value?.agentId;
  if (!id || !agentId) return;
  if (!silent) loading.value = true;
  try {
    const result = await window.api.readSubagentJsonl(id, agentId);
    if (parentSessionId.value !== id || agent.value?.agentId !== agentId) return;
    if (result?.error) {
      error.value = result.error;
      return;
    }
    error.value = '';
    filePath.value = result.filePath || '';
    const entries = result.entries || [];
    // A silent refresh that found nothing new must not throw the reader back
    // to the bottom of a transcript they were reading.
    if (silent && entries.length === entryCount) return;
    entryCount = entries.length;
    await nextTick();
    paint(entries);
  } finally {
    if (!silent) loading.value = false;
  }
}

function startPolling() {
  stopPolling();
  if (agent.value?.running) timer = setInterval(() => fetchEntries({ silent: true }), REFRESH_MS);
}

function stopPolling() {
  if (timer) { clearInterval(timer); timer = null; }
}

async function open(sessionId, agentRow) {
  parentSessionId.value = sessionId;
  agent.value = agentRow;
  entryCount = 0;
  error.value = '';
  menuOpen.value = false;
  await nextTick();
  if (bodyRef.value) bodyRef.value.replaceChildren();
  await fetchEntries();
  startPolling();
}

function reload() {
  entryCount = 0;
  return fetchEntries();
}

function back() {
  stopPolling();
  store.subagentViewOpen = false;
  window.__sb?.openSessionById?.(parentSessionId.value);
}

function stopParent() {
  if (parentSessionId.value) window.confirmAndStopSession?.(parentSessionId.value);
}

async function copyPath() {
  try {
    await navigator.clipboard.writeText(filePath.value || '');
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1500);
  } catch {}
}

function run(action) {
  menuOpen.value = false;
  action();
}

// Positioned like SessionMenu's: under the trigger, right-aligned, and fixed
// so nothing above it can clip the menu.
function placeMenu() {
  const rect = triggerRef.value?.getBoundingClientRect();
  if (!rect) return;
  menuPos.value = { top: `${rect.bottom + 4}px`, right: `${window.innerWidth - rect.right}px` };
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) placeMenu();
}

function onDocClick(event) {
  if (!menuOpen.value) return;
  if (menuRef.value?.contains(event.target) || triggerRef.value?.contains(event.target)) return;
  menuOpen.value = false;
}

document.addEventListener('click', onDocClick);
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  stopPolling();
});

defineExpose({
  open,
  close() { stopPolling(); },
});
</script>
