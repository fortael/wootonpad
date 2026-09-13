<template>
  <div ref="bodyRef" class="sbx-gridchat"></div>
</template>

<script setup>
// The transcript of an SDK-backed session, as a grid card.
//
// The grid wraps each open session in a card; for a PTY session the card holds
// the terminal itself, which is live and typeable. A chat has no terminal to
// wrap — the conversation is a Vue component bound to whichever session is in
// the header, and there is only ever one of it. So the grid drew empty cards
// for chats.
//
// This is the chat's transcript and nothing else: no composer, no model
// picker, no permission dialog. Six live chats on one screen would be six
// composers competing for the keyboard, and the grid is a place to watch from,
// not to work in. Scrolling reads back through what is loaded; anything else
// opens the session properly.
//
// Token-level streaming is deliberately absent. A card shows messages as they
// land, not as they are typed — which is all an overview needs, and it keeps a
// screen of them from repainting on every delta of every session.

import { ref, onMounted, onBeforeUnmount } from 'vue';
import { normalize } from '../message-normalizer.ts';
import { renderViewItems, renderJsonlEntry, mergeLocalCommandEntries } from '../message-render.js';

const props = defineProps({
  sessionId: { type: String, required: true },
});

const bodyRef = ref(null);

/** How much of the tail to paint. A card is a few hundred pixels tall. */
const HISTORY_LIMIT = 30;
/** Ceiling on what a long-running session may accumulate while on screen. */
const MAX_ENTRIES = 120;

let unsubscribe = null;
/** Results arrive after the call that produced them; this folds them together. */
let toolResults = new Map();

function atBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}

/** Keep the card from growing without bound while a session works for hours. */
function trim(el) {
  let extra = el.childElementCount - MAX_ENTRIES;
  while (extra-- > 0 && el.firstElementChild) el.firstElementChild.remove();
}

function append(nodes) {
  const el = bodyRef.value;
  if (!el || !nodes.childNodes.length) return;
  const stick = atBottom(el);
  el.appendChild(nodes);
  trim(el);
  if (stick) el.scrollTop = el.scrollHeight;
}

function handle(message) {
  if (!bodyRef.value) return;
  // A card reports messages, not keystrokes: the partial frames that make the
  // full view stream a token at a time carry nothing to show here.
  const items = normalize(message)
    .filter(item => item.kind !== 'delta' && item.kind !== 'turn_end' && item.kind !== 'silent');
  if (!items.length) return;

  for (const item of items) {
    if (item.kind === 'tool_result' && item.toolUseId) toolResults.set(item.toolUseId, item.content);
  }
  append(renderViewItems(items, toolResults, { foldTools: true }));
}

async function loadHistory() {
  const id = props.sessionId;
  const result = await window.api.readSessionTranscript?.(id, { limit: HISTORY_LIMIT })
    .catch(() => null);
  const el = bodyRef.value;
  if (!el || props.sessionId !== id || !result || result.error) return;

  const entries = mergeLocalCommandEntries(result.entries || []);
  const results = new Map();
  for (const entry of entries) {
    const blocks = entry.message?.content || entry.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        results.set(block.tool_use_id, block.content || block.output || '');
      }
    }
  }

  const frag = document.createDocumentFragment();
  for (const entry of entries) {
    const node = renderJsonlEntry(entry, results, { foldTools: true });
    if (node) frag.appendChild(node);
  }
  el.appendChild(frag);
  el.scrollTop = el.scrollHeight;

  // And again once the browser has settled. The card is sized by the grid,
  // which resolves after this runs, and the entries report an estimated height
  // until they are actually rendered — see content-visibility on .jsonl-entry.
  // Both mean the height this just scrolled to was not the final one.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const settled = bodyRef.value;
    if (settled) settled.scrollTop = settled.scrollHeight;
  }));
}

onMounted(() => {
  unsubscribe = window.api.onSdkMessage?.((id, message) => {
    if (id === props.sessionId) handle(message);
  });
  loadHistory();
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribe = null;
  toolResults = new Map();
});
</script>
