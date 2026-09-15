<template>
  <div id="jsonl-viewer-header">
    <span id="jsonl-viewer-title">{{ title }}</span>
    <span id="jsonl-viewer-session-id">{{ sessionId }}</span>
  </div>
  <div id="jsonl-viewer-body" ref="bodyRef"></div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { store } from '../store.js';
import { sessionTitle } from '../session-title.js';
// How a thinking block, a tool call or a screenshot looks now lives in one
// place, shared with the SDK-backed session view — see message-render.js.
import {
  escHtml, renderJsonlText, formatDuration, makeCollapsible, renderToolUse,
  renderLocalCommand, mergeLocalCommandBlocks, mergeLocalCommandEntries,
  renderToolResult, renderJsonlEntry,
} from '../message-render.js';

const title = ref('Message History');
const sessionId = ref('');
const bodyRef = ref(null);

// A closed viewer keeps its markup, and a transcript is tens of thousands of
// nodes; leaving it in the document makes every later layout in the app pay for
// a view nobody is looking at. The component stays mounted — `v-show` is right
// here, rebuilding the subtree on every open would be worse — but its contents
// go. Watched rather than cleared by each caller: `showJsonl` is turned off from
// half a dozen places in App.vue, and this is the one that has to be right.
watch(() => store.showJsonl, (showing) => {
  if (showing || !bodyRef.value) return;
  bodyRef.value.replaceChildren();
  sessionId.value = '';
});

// ── Public API ────────────────────────────────────────────────────
async function open(session) {
  const result = await window.api.readSessionJsonl(session.sessionId);
  const displayName = sessionTitle(session, session.sessionId);
  await render(result, displayName, session.sessionId);
}

// A sub-agent's transcript is the same shape as a session's, written to its
// own file — so it renders through the same path rather than a second, poorer
// viewer. See subagent-tasks.js.
async function openSubagent(parentSessionId, agent) {
  const result = await window.api.readSubagentJsonl(parentSessionId, agent.agentId);
  const displayName = `${agent.agentType || 'agent'} — ${agent.description || agent.agentId}`;
  await render(result, displayName, `${parentSessionId} · agent-${agent.agentId}`);
}

async function render(result, displayName, idLabel) {
  title.value = displayName;
  sessionId.value = idLabel;

  // Wait for the DOM to update before writing into bodyRef
  await new Promise(resolve => setTimeout(resolve, 0));

  const body = bodyRef.value;
  if (!body) return;
  body.innerHTML = '';

  if (result.error) {
    body.innerHTML = '<div class="plans-empty">Error loading messages: ' + escHtml(result.error) + '</div>';
    return;
  }

  const rawEntries = result.entries || [];
  const entries = mergeLocalCommandEntries(rawEntries);

  const toolResultMap = new Map();
  for (const entry of entries) {
    const blocks = entry.message?.content || entry.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        toolResultMap.set(block.tool_use_id, block.content || block.output || '');
      }
    }
  }

  let rendered = 0;
  for (const entry of entries) {
    const el = renderJsonlEntry(entry, toolResultMap);
    if (el) {
      body.appendChild(el);
      rendered++;
    }
  }

  if (rendered === 0) {
    body.innerHTML = '<div class="plans-empty">No messages found in this session.</div>';
  }

  // Click-to-fullscreen for inline images
  body.querySelectorAll('.jsonl-clickable-img').forEach(img => {
    img.onclick = () => {
      const overlay = document.createElement('div');
      overlay.className = 'jsonl-screenshot-fullscreen';
      const fullImg = document.createElement('img');
      fullImg.src = img.src;
      overlay.appendChild(fullImg);
      overlay.onclick = () => overlay.remove();
      document.body.appendChild(overlay);
    };
  });

  body.scrollTop = body.scrollHeight;
}

defineExpose({ open, openSubagent });
</script>
