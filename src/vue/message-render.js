// message-render.js — conversation blocks as DOM nodes.
//
// Lifted out of JsonlViewerApp.vue unchanged. It was the only place that knew
// how a thinking block, a tool call or a screenshot looks, and the SDK-backed
// session view needs exactly the same answers: same markup, same `jsonl-*`
// classes, same stylesheet. Two renderers would have drifted within a week.
//
// Everything here is pure — DOM in, DOM out, no component state — which is why
// it could move as-is. The transcript viewer reads these shapes out of a
// `.jsonl` on disk; an SDK session receives them live over `sdk-message`. They
// are the same shapes, so this is the same code.

import {
  truncateCommand, previewLine, findMentions, relativeTime, localCommandEnvelope,
} from './chat-text.js';
import { parseQuestions, questionTitle, NOTES_ONLY } from './ask-question.js';
import { LUCIDE } from './lucide-icons.js';

// ── Helpers ───────────────────────────────────────────────────────
function escHtml(str) {
  return window.escapeHtml ? window.escapeHtml(str) : str;
}

function renderJsonlText(text) {
  if (window.marked) {
    const escaped = text.replace(/<(\/?[a-zA-Z][a-zA-Z0-9_-]*(?:\s[^>]*)?\/?)\>/g, '&lt;$1&gt;');
    return window.marked.parse(escaped);
  }
  let html = escHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="jsonl-code-block"><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code class="jsonl-inline-code">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return html;
}

function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

function makeInlineContent(className, bodyContent) {
  const wrapper = document.createElement('div');
  wrapper.className = className;
  const body = document.createElement('pre');
  body.className = 'jsonl-tool-body';
  body.style.display = '';
  if (typeof bodyContent === 'string') {
    body.textContent = bodyContent;
  } else {
    try { body.textContent = JSON.stringify(bodyContent, null, 2); } catch { body.textContent = String(bodyContent); }
  }
  wrapper.appendChild(body);
  return wrapper;
}

// ── Fenced code, as a block worth looking at ──────────────────────
//
// A fence used to render as the browser's own `<pre>`: grey text on a grey
// slab, indistinguishable from the tool output above it and from the prose
// around it. It now gets a frame, the language it is in, colour from the
// language's own parser — see highlightCodeToHtml in codemirror-setup.js — and
// the one control anybody actually wants from a code block.
//
// Highlighting is best-effort: an unknown fence, an unparsable block or one
// too long to bother with renders plain inside the same frame.

const COPY_LABEL = 'Copy';
const COPIED_LABEL = 'Copied';

function copyCodeBlock(button) {
  const block = button.closest('.jsonl-code');
  const source = block?.querySelector('pre');
  if (!source) return;
  const label = button.querySelector('.jsonl-code__label') || button;
  navigator.clipboard?.writeText(source.textContent || '').then(() => {
    label.textContent = COPIED_LABEL;
    button.classList.add('is-done');
    clearTimeout(Number(button.dataset.copyTimer));
    button.dataset.copyTimer = String(setTimeout(() => {
      label.textContent = COPY_LABEL;
      button.classList.remove('is-done');
    }, 1400));
  }).catch(() => {
    label.textContent = 'Failed';
    setTimeout(() => { label.textContent = COPY_LABEL; }, 1400);
  });
}

/** Wrap every fenced block in `container`, colouring what can be coloured. */
function enhanceCodeBlocks(container) {
  if (!container) return container;
  for (const pre of container.querySelectorAll('pre')) {
    // Tool bodies are their own thing — the terminal, the diff — and they are
    // not markdown. Only what marked produced is touched.
    const code = pre.firstElementChild;
    if (!code || code.tagName !== 'CODE' || pre.parentElement?.classList.contains('jsonl-code')) continue;

    const declared = (code.className.match(/language-([\w+#.-]+)/) || [])[1] || '';
    const known = window.normalizeCodeLanguage?.(declared) || '';
    const html = window.highlightCodeToHtml?.(code.textContent, declared);
    if (html) code.innerHTML = html;

    const block = document.createElement('div');
    block.className = 'jsonl-code';
    const head = document.createElement('div');
    head.className = 'jsonl-code__head';
    head.innerHTML = '<span class="jsonl-code__lang">'
      + escHtml(known || declared || 'code')
      + '</span><button type="button" class="jsonl-code__copy" aria-label="Copy code">'
      + `<span class="jsonl-code__label">${COPY_LABEL}</span></button>`;

    pre.replaceWith(block);
    block.appendChild(head);
    block.appendChild(pre);
  }
  return container;
}

/** Markdown into an element, with its code blocks made into code blocks. */
function setRichText(el, text) {
  el.innerHTML = renderJsonlText(text);
  enhanceCodeBlocks(el);
  return el;
}

// ── Clicks, delegated ─────────────────────────────────────────────
//
// One listener for the whole renderer rather than a closure per node. Both of
// the things it handles sit inside a tool's body, and a folded body is kept as
// HTML and rebuilt when it is opened — see collapseToolBlock. A handler bound
// to the node itself does not survive that round trip; a rule matching on the
// class does.
function openLightbox(src) {
  if (!src) return;
  const overlay = document.createElement('div');
  overlay.className = 'jsonl-screenshot-fullscreen';
  const full = document.createElement('img');
  full.src = src;
  overlay.appendChild(full);
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

function onRendererClick(event) {
  const target = event.target;
  if (!target?.closest) return;

  const copy = target.closest('.jsonl-code__copy');
  if (copy) {
    copyCodeBlock(copy);
    return;
  }

  // makeCollapsible's own header: the body is its next sibling.
  const toggle = target.closest('.jsonl-toggle');
  if (toggle) {
    const body = toggle.nextElementSibling;
    if (body?.classList.contains('jsonl-tool-body')) {
      const showing = body.style.display !== 'none';
      body.style.display = showing ? 'none' : '';
      toggle.classList.toggle('expanded', !showing);
    }
    return;
  }

  const img = target.closest('.jsonl-clickable-img');
  if (img) openLightbox(img.getAttribute('src'));
}

if (typeof document !== 'undefined' && !document.__jsonlClickDelegate) {
  document.__jsonlClickDelegate = true;
  document.addEventListener('click', onRendererClick);
}

function makeCollapsible(className, headerText, bodyContent, startExpanded) {
  const wrapper = document.createElement('div');
  wrapper.className = className;
  const header = document.createElement('div');
  header.className = 'jsonl-toggle' + (startExpanded ? ' expanded' : '');
  header.textContent = headerText;
  const body = document.createElement('pre');
  body.className = 'jsonl-tool-body';
  // Inline, so the open/closed state is part of the markup and survives a
  // fold-and-rebuild.
  body.style.display = startExpanded ? '' : 'none';
  if (typeof bodyContent === 'string') {
    body.textContent = bodyContent;
  } else {
    try { body.textContent = JSON.stringify(bodyContent, null, 2); } catch { body.textContent = String(bodyContent); }
  }
  wrapper.appendChild(header);
  wrapper.appendChild(body);
  return wrapper;
}

function toolBlock(color, label, summary, content) {
  const el = document.createElement('div');
  el.className = 'jsonl-tool-block';
  const header = document.createElement('div');
  header.className = 'jsonl-tool-header';
  header.innerHTML = '<span class="jsonl-tool-bullet" style="color:' + color + '">●</span>'
    + '<span class="jsonl-tool-name">' + escHtml(label) + '</span>'
    + (summary ? '<span class="jsonl-tool-summary">' + summary + '</span>' : '');
  el.appendChild(header);
  if (content) {
    const body = document.createElement('div');
    body.className = 'jsonl-tool-content';
    if (typeof content === 'string') {
      body.innerHTML = content;
    } else {
      body.appendChild(content);
    }
    el.appendChild(body);
  }
  return el;
}

// ── Folding ───────────────────────────────────────────────────────
//
// A folded body is taken out of the document, not hidden inside it. `display:
// none` costs nothing to lay out, but the nodes and their text stay in the
// tree, and in a chat almost every tool call is folded: measured on one
// 418-message session, 60 folded blocks were holding 240 nodes and ~172 KB of
// text that nothing was going to look at. What is kept instead is the markup
// that produced them, as one string, and the body is built back from it when
// the row is opened.
//
// The cost is that handlers bound to nodes inside a body do not survive the
// round trip, which is why the two that exist are delegated — see
// onRendererClick. Anything new inside a tool body has to go the same way.
//
/** @type {WeakMap<HTMLElement, { html: string }>} the markup of a folded body */
const foldedBodies = new WeakMap();

function stashToolBody(el, body) {
  foldedBodies.set(el, { html: body.innerHTML });
  body.remove();
  el.classList.remove('is-open');
}

function unstashToolBody(el, folded) {
  const body = document.createElement('div');
  body.className = 'jsonl-tool-content';
  body.innerHTML = folded.html;
  el.appendChild(body);
  foldedBodies.delete(el);
  el.classList.add('is-open');
  return body;
}

/**
 * Fold a tool block's body away and make its header the toggle.
 *
 * The transcript viewer leaves calls open — it is a document you read top to
 * bottom. A chat is not: a turn that touched nine files would be nine screens
 * of diff between two sentences, so there the call is a line you can open.
 * Tools that render as a single line (Read, Glob) have no body and stay as
 * they are; folding a header with nothing behind it is a lie.
 */
function collapseToolBlock(el) {
  // A block that asked for it stays open — see the AskUserQuestion renderer.
  if (el.dataset?.keepOpen) return el;
  const header = el.querySelector('.jsonl-tool-header');
  const body = el.querySelector('.jsonl-tool-content');
  if (!header || !body || body.parentNode !== el) return el;

  el.classList.add('jsonl-tool-block--foldable');
  stashToolBody(el, body);
  header.onclick = () => {
    const folded = foldedBodies.get(el);
    if (folded) unstashToolBody(el, folded);
    else {
      const open = el.querySelector('.jsonl-tool-content');
      if (open) stashToolBody(el, open);
    }
  };
  return el;
}

/**
 * Write into a tool's body, open or folded.
 *
 * A result arrives seconds after its call and by then the row is folded, so
 * this is the normal path rather than the exception: the markup is parsed into
 * a scratch node, `fn` appends to that, and what comes out replaces the stash.
 * Synchronous on purpose — `fn` must be done appending when it returns.
 */
function withToolContent(toolEl, fn) {
  const folded = foldedBodies.get(toolEl);
  if (!folded) return fn(toolContent(toolEl));
  const scratch = document.createElement('div');
  scratch.innerHTML = folded.html;
  const out = fn(scratch);
  folded.html = scratch.innerHTML;
  return out;
}

function shortPath(p) {
  return (p || '').split('/').slice(-3).join('/');
}

/** SbIcon.vue's <svg>, built by hand — this renderer has no Vue to mount. */
function makeIcon(name, size = 13) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'sb-icon');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = LUCIDE[name] || '';
  return svg;
}

/**
 * A thinking block, with the first line of the reasoning in its header.
 *
 * Folded, because a turn's reasoning is longer than its answer — but not
 * anonymous. A row reading only "Thinking" is a row nobody opens, and the
 * reasoning is the half of a turn you most want while it is still running:
 * it is where you find out Claude has misread the task, early enough to stop it.
 */
function makeThinking(text, startExpanded) {
  const el = makeCollapsible('jsonl-thinking', 'Thinking', text, !!startExpanded);
  const header = el.querySelector('.jsonl-toggle');
  const preview = previewLine(text, 140);
  if (header) {
    header.innerHTML = '<span class="jsonl-thinking-label">Thinking</span>'
      + (preview ? '<span class="jsonl-thinking-preview">' + escHtml(preview) + '</span>' : '');
  }
  return el;
}

// ── AskUserQuestion, as a record ──────────────────────────────────
//
// The tool *is* the dialog — there is nothing to permit, the input carries the
// questions and the answers go back as `updatedInput` (see ask-question.js). So
// in the transcript it is drawn as the dialog too, with RequestDialog.vue's own
// markup and classes rather than a folded row with a JSON blob behind it: the
// one exchange in a session that was a conversation should not be the one that
// reads like plumbing.
//
// Read-only. Nothing here is a control: the options are what was on offer, and
// the interactive copy only exists while the session is actually stopped on the
// question.

/** The answer for one question, as the CLI records it: labels, or free text. */
function answerFor(input, question) {
  const answers = (input && typeof input.answers === 'object' && input.answers) || {};
  const annotations = (input && typeof input.annotations === 'object' && input.annotations) || {};
  const answer = typeof answers[question.id] === 'string' ? answers[question.id] : '';
  const notes = typeof annotations[question.id]?.notes === 'string' ? annotations[question.id].notes : '';
  return {
    // Multi-select joins its labels with a comma, which is the form the CLI
    // parses back apart — so picks are matched one label at a time.
    picked: new Set(answer === NOTES_ONLY ? [] : answer.split(',').map(s => s.trim()).filter(Boolean)),
    spoken: answer === NOTES_ONLY ? notes : [answer, notes].filter(Boolean).join(' — '),
  };
}

function renderAskRecord(input) {
  const questions = parseQuestions(input);
  if (!questions.length) return null;

  const el = document.createElement('div');
  el.className = 'sbx-req sbx-req--ask sbx-req--record is-wide';
  el.dataset.keepOpen = '1';

  const head = document.createElement('div');
  head.className = 'sbx-req__head';
  head.appendChild(makeIcon('message-square', 13));
  const heading = document.createElement('span');
  heading.className = 'sbx-req__q';
  heading.textContent = questionTitle(input) || 'Claude asked';
  head.appendChild(heading);
  if (questions.length > 1) {
    const count = document.createElement('span');
    count.className = 'sbx-req__count';
    count.textContent = `${questions.length} questions`;
    head.appendChild(count);
  }
  el.appendChild(head);

  const body = document.createElement('div');
  body.className = 'sbx-req__body';

  for (const question of questions) {
    const { picked, spoken } = answerFor(input, question);
    const block = document.createElement('div');
    block.className = 'sbx-req__record-q';

    const asked = document.createElement('div');
    asked.className = 'sbx-req__record-question';
    asked.textContent = question.question;
    block.appendChild(asked);

    if (question.description) {
      const desc = document.createElement('p');
      desc.className = 'sbx-req__desc';
      desc.textContent = question.description;
      block.appendChild(desc);
    }

    if (question.options.length) {
      const list = document.createElement('div');
      list.className = 'sbx-req__options';
      question.options.forEach((option, i) => {
        const row = document.createElement('div');
        row.className = 'sbx-req__option' + (picked.has(option.label) ? ' is-picked' : '');

        const key = document.createElement('kbd');
        key.className = 'sbx-req__key';
        key.textContent = String(i + 1);
        row.appendChild(key);

        const bodyEl = document.createElement('span');
        bodyEl.className = 'sbx-req__option-body';
        const label = document.createElement('span');
        label.className = 'sbx-req__option-label';
        label.textContent = option.label;
        bodyEl.appendChild(label);
        if (option.description) {
          const sub = document.createElement('span');
          sub.className = 'sbx-req__option-desc';
          sub.textContent = option.description;
          bodyEl.appendChild(sub);
        }
        row.appendChild(bodyEl);

        if (picked.has(option.label)) {
          const tick = makeIcon('check', 12);
          tick.classList.add('sbx-req__tick');
          row.appendChild(tick);
        }
        list.appendChild(row);
      });
      block.appendChild(list);
    }

    // What was actually said, quoted under the question it answers. A free-text
    // or number question has no option to mark, so this is all there is.
    if (spoken) {
      const quote = document.createElement('blockquote');
      quote.className = 'sbx-req__answer';
      quote.textContent = spoken;
      block.appendChild(quote);
    }

    body.appendChild(block);
  }

  el.appendChild(body);
  return el;
}

/** Did the recorded input already carry its answers? Then the result repeats them. */
function askIsAnswered(input) {
  const answers = input && typeof input === 'object' ? input.answers : null;
  return !!answers && typeof answers === 'object' && Object.keys(answers).length > 0;
}

// ── Mentions ──────────────────────────────────────────────────────

/** Inside these, a `/` or an `@` was quoted on purpose. */
const MENTION_SKIP = new Set(['CODE', 'PRE', 'A', 'SCRIPT', 'STYLE', 'BUTTON']);

function makeMentionChip(mention, raw) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'jsonl-mention jsonl-mention--' + mention.kind;
  el.textContent = raw;
  if (mention.kind === 'file') {
    el.dataset.mentionFile = mention.value;
    el.title = mention.value;
  } else {
    el.dataset.mentionCommand = mention.value;
    el.title = `/${mention.value}`;
  }
  return el;
}

/**
 * Turn `@path` and a leading `/command` in a message the user wrote into chips.
 *
 * Walks the text nodes of the already-rendered markdown rather than the source:
 * rewriting the HTML string would match inside tags and attributes, and a path
 * inside a code span is quoted deliberately. The click is not handled here —
 * the chips carry `data-mention-file` / `data-mention-command` and the view
 * that owns a session listens for them, because only it knows which project a
 * relative path is relative to.
 */
function decorateMentions(root) {
  if (!root) return root;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let p = node.parentNode; p && p !== root; p = p.parentNode) {
        if (MENTION_SKIP.has(p.nodeName)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const targets = [];
  while (walker.nextNode()) targets.push(walker.currentNode);

  for (const node of targets) {
    const text = node.nodeValue;
    const mentions = findMentions(text);
    if (!mentions.length) continue;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const mention of mentions) {
      if (mention.index < at) continue;               // overlapped a previous one
      if (mention.index > at) frag.appendChild(document.createTextNode(text.slice(at, mention.index)));
      at = mention.index + mention.length;
      frag.appendChild(makeMentionChip(mention, text.slice(mention.index, at)));
    }
    if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
    node.parentNode.replaceChild(frag, node);
  }
  return root;
}

// ── Timestamps ────────────────────────────────────────────────────

/**
 * "2 minutes ago", against the right edge of a message.
 *
 * The absolute time is in the tooltip. Scrolling back through a long session
 * looking for where yesterday ended is the thing this answers, and a wall of
 * `14:03` does not answer it.
 */
function makeWhen(timestamp) {
  const ms = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
  if (!Number.isFinite(ms)) return null;
  const el = document.createElement('time');
  el.className = 'jsonl-when';
  el.dataset.ts = String(ms);
  el.dateTime = new Date(ms).toISOString();
  el.title = new Date(ms).toLocaleString();
  el.textContent = relativeTime(ms);
  return el;
}

/** Re-read every timestamp already on screen. One pass, driven by one clock. */
function refreshWhen(root) {
  if (!root) return;
  const now = Date.now();
  for (const el of root.querySelectorAll('.jsonl-when[data-ts]')) {
    el.textContent = relativeTime(Number(el.dataset.ts), now);
  }
}

/** Append the stamp, if this render asked for one and the entry carries a time. */
function appendWhen(el, timestamp) {
  if (timestamp == null) return;
  const when = makeWhen(timestamp);
  if (when) el.appendChild(when);
}

// ── Day separators ────────────────────────────────────────────────
//
// "2 minutes ago" answers how long ago one message was; it does not answer
// where yesterday ended. A session left open for a week is one unbroken scroll
// without these, and the only way to find the morning's work is to hover every
// stamp.

/** Local calendar day, which is the day the reader was in — not UTC. */
function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dayLabel(ms) {
  const today = new Date();
  const key = dayKey(ms);
  if (key === dayKey(today.getTime())) return 'Today';
  if (key === dayKey(today.getTime() - 86400e3)) return 'Yesterday';
  const d = new Date(ms);
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString([], sameYear
    ? { weekday: 'short', month: 'long', day: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric' });
}

function makeDayline(ms, key) {
  const el = document.createElement('div');
  el.className = 'sbx-dayline';
  el.dataset.day = key;
  const label = document.createElement('span');
  label.className = 'sbx-dayline__label';
  label.textContent = dayLabel(ms);
  el.appendChild(label);
  return el;
}

/**
 * Put a rule with a date on it where the day changes.
 *
 * Not before the first message: a separator separates, and at the top of the
 * transcript there is nothing above it to be separated from. "TODAY" as the
 * opening line of a chat you have just opened states the obvious and reads as
 * the conversation having been divided when it has not.
 *
 * Rebuilt rather than patched: paging earlier messages in prepends a whole
 * window above what is on screen, which can turn the day the old first message
 * started into a day it no longer starts — and turn the marker this skipped
 * into one that is now worth drawing. Rebuilding is O(children) of attribute
 * reads and mutates only where a marker is actually missing.
 *
 * @returns {string} the last day key seen, so a caller can tell when the day
 *          has turned over without walking the transcript again.
 */
function refreshDayMarkers(container) {
  if (!container) return '';
  for (const stale of container.querySelectorAll(':scope > .sbx-dayline')) stale.remove();
  let last = '';
  for (const el of Array.from(container.children)) {
    const ts = Number(el.dataset?.ts);
    if (!Number.isFinite(ts) || !ts) continue;
    const key = dayKey(ts);
    if (key === last) continue;
    // The first day seen is the day the loaded transcript opens on, which is
    // not a change. Every later one is.
    if (last) container.insertBefore(makeDayline(ts, key), el);
    last = key;
  }
  return last;
}

// ── Tool groups ───────────────────────────────────────────────────
//
// A turn's tool calls arrive as a run: read, read, read, edit, edit. Drawn as
// N loose rows they are N things between two sentences; drawn as one framed
// block they are one step, which is how they were meant.

/** The block's result pane, created on demand. */
function toolContent(toolEl) {
  let content = toolEl.querySelector('.jsonl-tool-content');
  if (!content) {
    content = document.createElement('div');
    content.className = 'jsonl-tool-content';
    toolEl.appendChild(content);
  }
  return content;
}

/** The group an entry consists of, if a group is all it consists of. */
function groupOfEntry(entry) {
  if (!entry || !entry.classList?.contains('jsonl-entry')) return null;
  const first = entry.firstElementChild;
  if (!first?.classList.contains('jsonl-toolgroup')) return null;
  // A stamp is allowed to follow it and nothing else is. refreshStamps appends
  // one to every group the moment it is drawn, so a check for a single child
  // said "not a group" to every group that had been on screen for a frame —
  // which is why a turn's calls merged when read off disk and never live.
  for (let el = first.nextElementSibling; el; el = el.nextElementSibling) {
    if (!el.classList.contains('jsonl-when')) return null;
  }
  return first;
}

/** The group at the end of `container`, if the last entry is nothing else. */
function soleToolGroup(container) {
  return groupOfEntry(container?.lastElementChild);
}

/** The group to add the next call to — reused if the last entry already is one. */
function openToolGroup(container) {
  const open = soleToolGroup(container);
  if (open) return open;
  const entry = document.createElement('div');
  entry.className = 'jsonl-entry jsonl-assistant';
  const group = document.createElement('div');
  group.className = 'jsonl-toolgroup';
  entry.appendChild(group);
  container.appendChild(entry);
  return group;
}

/**
 * Fold a fragment's leading run of calls into the group `lastEntry` already is.
 *
 * The calls of one turn do not arrive together — each is its own message — so
 * without this every call would open its own frame and the grouping would only
 * ever apply to history read back off disk.
 */
function mergeToolGroups(lastEntry, frag) {
  const target = groupOfEntry(lastEntry);
  if (!target) return;
  let head = frag.firstElementChild;
  while (head) {
    const group = groupOfEntry(head);
    if (!group) break;
    while (group.firstChild) target.appendChild(group.firstChild);
    // A block is dated by its last call — see refreshStamps. More calls, later
    // block, so the merge carries the newer time over.
    if (head.dataset.ts) lastEntry.dataset.ts = head.dataset.ts;
    frag.removeChild(head);
    head = frag.firstElementChild;
  }
}

/**
 * Move a message's timestamp onto the block of calls it led to.
 *
 * A sentence followed immediately by the calls it announced is one act, not
 * two: "now the tests" and the three commands that run them happen at the same
 * moment and read as one thing. Stamping both says the same time twice — and
 * stamping the sentence puts the time at the top of a block whose *end* is what
 * anyone reading back wants to know. So the block carries it, dated by its last
 * call, and the sentence above gives its stamp up.
 */
function refreshStamps(container) {
  if (!container) return;
  for (const el of Array.from(container.children)) {
    if (!el.classList?.contains('jsonl-entry')) continue;
    const group = groupOfEntry(el);
    const next = el.nextElementSibling;
    // A day separator in between means they are not the same moment after all.
    const absorbed = !group
      && next?.classList?.contains('jsonl-entry')
      && !!groupOfEntry(next);

    if (absorbed) {
      el.querySelector(':scope > .jsonl-when')?.remove();
      continue;
    }
    if (!group) continue;

    const ts = Number(el.dataset.ts);
    const when = el.querySelector(':scope > .jsonl-when');
    if (!Number.isFinite(ts) || !ts) { when?.remove(); continue; }
    if (!when) appendWhen(el, ts);
    else if (Number(when.dataset.ts) !== ts) when.replaceWith(makeWhen(ts));
  }
}

/**
 * How long the call took, written into its header.
 *
 * Folded, a call says what it did but not what it cost. A 40-second test run
 * and a 40-millisecond file read look identical until the turn is over, and
 * the difference is usually the thing being looked for.
 */
function markToolDuration(toolEl, ms) {
  const header = toolEl?.querySelector?.('.jsonl-tool-header');
  if (!header || !Number.isFinite(ms) || ms < 0) return;
  let took = header.querySelector('.jsonl-tool-took');
  if (!took) {
    took = document.createElement('span');
    took.className = 'jsonl-tool-took';
    header.appendChild(took);
  }
  took.textContent = formatDuration(ms);
}

/** WebSearch, WebFetch and ToolSearch: one colour, because they are one act. */
const WEB_COLOR = '#5fc9d0';

const toolRenderers = {
  Read(input) {
    const path = input.file_path || '';
    let range = '';
    if (input.offset || input.limit) {
      const start = input.offset || 0;
      range = input.limit ? `:${start}-${start + input.limit}` : `:${start}`;
    }
    return toolBlock(TOOL_COLOR.Read, 'Read', '<code>' + escHtml(shortPath(path) + range) + '</code>', null);
  },

  Edit(input) {
    const path = input.file_path || '';
    let content = null;
    if (input.old_string != null && input.new_string != null) {
      const diff = document.createElement('pre');
      diff.className = 'jsonl-tool-diff';
      let html = '';
      for (const line of input.old_string.split('\n')) {
        html += '<span class="jsonl-diff-del">- ' + escHtml(line) + '</span>\n';
      }
      for (const line of input.new_string.split('\n')) {
        html += '<span class="jsonl-diff-add">+ ' + escHtml(line) + '</span>\n';
      }
      diff.innerHTML = html;
      content = diff;
    }
    return toolBlock(TOOL_COLOR.Edit, 'Edit', '<code>' + escHtml(shortPath(path)) + '</code>', content);
  },

  Write(input) {
    const path = input.file_path || '';
    const lines = (input.content || '').split('\n').length;
    const detail = '<code>' + escHtml(shortPath(path)) + '</code> <span class="jsonl-tool-detail">' + lines + ' lines</span>';
    let content = null;
    if (input.content) {
      content = makeCollapsible('jsonl-tool-result', 'Content', input.content, true);
    }
    return toolBlock(TOOL_COLOR.Write, 'Write', detail, content);
  },

  Bash(input) {
    const cmd = input.command || '';
    const pre = document.createElement('pre');
    // Opened, a shell call is a terminal: the line that was typed, and what
    // came back under it. The two panes are drawn off these classes — the
    // answer is appended into the same body later, by applyToolResult, so the
    // block is marked here and the stylesheet does the rest.
    pre.className = 'jsonl-tool-cmd-block jsonl-term__in';
    pre.textContent = cmd;
    // The header is all there is while the call is folded, and "Bash" alone
    // was the one row in the transcript you could not identify without opening
    // it — every other tool names its file or its pattern.
    const head = truncateCommand(cmd);
    const el = toolBlock(TOOL_COLOR.Bash, 'Bash', head ? '<code>' + escHtml(head) + '</code>' : null, pre);
    el.classList.add('jsonl-tool-block--bash');
    return el;
  },

  Grep(input) {
    const pattern = input.pattern || '';
    const path = input.path || '';
    const sp = path ? shortPath(path) : '';
    const summary = '<code>' + escHtml(pattern) + (sp ? ' in ' + escHtml(sp) : '') + '</code>';
    return toolBlock(TOOL_COLOR.Grep, 'Grep', summary, null);
  },

  Glob(input) {
    const pattern = input.pattern || '';
    return toolBlock(TOOL_COLOR.Glob, 'Glob', '<code>' + escHtml(pattern) + '</code>', null);
  },

  Agent(input) {
    const desc = input.description || '';
    const type = input.subagent_type || '';
    const summary = (type ? '<span class="jsonl-tool-detail">' + escHtml(type) + '</span> ' : '')
      + escHtml(desc);
    return toolBlock(TOOL_COLOR.Agent, 'Agent', summary, null);
  },

  // ── The three that leave the machine ────────────────────────────
  //
  // Drawn as their own family, in one colour, because they are the one kind of
  // call whose answer did not come from this computer. What they went looking
  // for is the whole summary — a search you cannot read the query of is a row
  // that says only that some searching happened.

  WebSearch(input) {
    const query = input.query || '';
    const domains = input.allowed_domains || [];
    const summary = '<code>' + escHtml(query) + '</code>'
      + (domains.length
        ? ' <span class="jsonl-tool-detail">in ' + escHtml(domains.join(', ')) + '</span>'
        : '');
    return toolBlock(WEB_COLOR, 'Search', summary, null);
  },

  WebFetch(input) {
    const url = input.url || '';
    // The host is what says where this went; the path is usually longer than
    // the row and says less.
    let host = url;
    try { host = new URL(url).host; } catch { /* not a URL the browser parses */ }
    const summary = '<code>' + escHtml(host) + '</code>'
      + (input.prompt ? ' <span class="jsonl-tool-detail">' + escHtml(truncateCommand(input.prompt)) + '</span>' : '');
    const content = url ? makeInlineContent('jsonl-tool-result', url) : null;
    return toolBlock(WEB_COLOR, 'Fetch', summary, content);
  },

  // Not a web call, but the same gesture: go and find out what is available
  // before using it. `select:` queries name the tools outright and read better
  // without the prefix.
  ToolSearch(input) {
    const query = String(input.query || '');
    const select = query.startsWith('select:');
    const summary = '<code>' + escHtml(select ? query.slice(7) : query) + '</code>'
      + (select ? ' <span class="jsonl-tool-detail">by name</span>' : '');
    return toolBlock(WEB_COLOR, 'Tools', summary, null);
  },
};

function renderMcpAction(name, input) {
  const action = input.action;
  const shortName = name.replace(/^mcp__/, '').split('__').pop();
  const actionLabels = {
    type: 'Type', screenshot: 'Screenshot', click: 'Click', scroll: 'Scroll',
    hover: 'Hover', drag: 'Drag', key: 'Key', wait: 'Wait',
    javascript_exec: 'JS Exec', navigate: 'Navigate',
  };
  const label = actionLabels[action] || action;
  let summary = '<span class="jsonl-tool-detail">' + escHtml(shortName) + '</span>';
  let content = null;

  if (action === 'type' && input.text) {
    summary += ' <code>' + escHtml(input.text.length > 80 ? input.text.slice(0, 80) + '...' : input.text) + '</code>';
  } else if (action === 'click' && (input.x != null || input.selector)) {
    const target = input.selector || `(${input.x}, ${input.y})`;
    summary += ' <code>' + escHtml(target) + '</code>';
  } else if (action === 'key' && input.key) {
    summary += ' <code>' + escHtml(input.key) + '</code>';
  } else if (action === 'navigate' && input.url) {
    summary += ' <code>' + escHtml(input.url.length > 80 ? input.url.slice(0, 80) + '...' : input.url) + '</code>';
  } else if (action === 'scroll') {
    const dir = input.direction || (input.deltaY > 0 ? 'down' : 'up');
    summary += ' <span class="jsonl-tool-detail">' + escHtml(dir) + '</span>';
  } else if (action === 'javascript_exec' && input.text) {
    const pre = document.createElement('pre');
    pre.className = 'jsonl-tool-cmd-block';
    pre.textContent = input.text;
    content = pre;
  }

  return toolBlock('#c090e0', label, summary, content);
}

function renderToolUse(block) {
  const name = block.name || 'unknown';
  const input = block.input || {};
  const renderer = toolRenderers[name];
  if (renderer) {
    // A renderer may decline — a malformed payload it cannot draw — and the
    // generic block below is the honest answer when it does.
    try {
      const el = renderer(input, block);
      if (el) return el;
    } catch {}
  }
  if (input.action) {
    try { return renderMcpAction(name, input, block); } catch {}
  }
  return toolBlock('#8888a0', name, '', makeCollapsible('jsonl-tool-result', 'Input', input, true));
}

function renderLocalCommand({ cmd, output }) {
  const pre = document.createElement('pre');
  pre.className = 'jsonl-tool-cmd-block jsonl-term__in';
  pre.textContent = cmd;

  const head = truncateCommand(cmd);
  const el = toolBlock(TOOL_COLOR.Bash, 'Bash',
    '<span class="jsonl-tool-detail">local</span>'
    + (head ? ' <code>' + escHtml(head) + '</code>' : ''), pre);
  // A command the user typed is the same two panes as one the model ran.
  el.classList.add('jsonl-tool-block--bash');

  if (output) {
    let contentEl = el.querySelector('.jsonl-tool-content');
    if (!contentEl) {
      contentEl = document.createElement('div');
      contentEl.className = 'jsonl-tool-content';
      el.appendChild(contentEl);
    }
    const resultPre = document.createElement('pre');
    resultPre.className = 'jsonl-tool-cmd-block jsonl-term__out';
    resultPre.textContent = output;
    contentEl.appendChild(resultPre);
  }

  return el;
}

// ── Local slash commands ──────────────────────────────────────────

/**
 * `/usage` and what it printed, as one block.
 *
 * The CLI records a slash command as three envelopes of XML addressed to the
 * model — a caveat telling it not to answer, the invocation, and the output.
 * Rendered as prose they were three bubbles of tags where the user ran one
 * command; this is the command.
 */
function renderSlashCall(call) {
  const el = document.createElement('div');
  el.className = 'jsonl-slash';
  el.dataset.slash = call.name;

  const head = document.createElement('div');
  head.className = 'jsonl-slash__head';
  const sigil = document.createElement('span');
  sigil.className = 'jsonl-slash__sigil';
  sigil.textContent = '/';
  const name = document.createElement('span');
  name.className = 'jsonl-slash__name';
  name.textContent = call.name;
  head.append(sigil, name);
  if (call.args) {
    const args = document.createElement('span');
    args.className = 'jsonl-slash__args';
    args.textContent = call.args;
    head.appendChild(args);
  }
  el.appendChild(head);
  return el;
}

function makeSlashOutput(text, isError) {
  const pre = document.createElement('pre');
  pre.className = 'jsonl-slash__out' + (isError ? ' is-error' : '');
  pre.textContent = text;
  return pre;
}

/** Wrap a block as its own transcript entry. */
function asEntry(node) {
  const el = document.createElement('div');
  el.className = 'jsonl-entry jsonl-assistant';
  el.appendChild(node);
  return el;
}

/**
 * Fold a command's output into the invocation above it.
 *
 * Live, the two arrive as separate messages — the CLI prints after it runs —
 * so without this the output is an orphan block under a command that looks
 * like it did nothing.
 */
function mergeSlashOutput(lastEntry, frag) {
  const call = lastEntry?.firstElementChild;
  // An invocation takes an output; an output-only block — which is what a
  // window starting mid-command produces — has no head and takes nothing.
  if (!call?.classList?.contains('jsonl-slash')
      || !call.querySelector(':scope > .jsonl-slash__head')) return;

  let head = frag.firstElementChild;
  let merged = false;
  while (head) {
    const block = head.firstElementChild;
    if (!block?.classList?.contains('jsonl-slash')
        || block.querySelector(':scope > .jsonl-slash__head')) break;
    for (const out of Array.from(block.children)) call.appendChild(out);
    if (head.dataset.ts) lastEntry.dataset.ts = head.dataset.ts;
    frag.removeChild(head);
    head = frag.firstElementChild;
    merged = true;
  }

  // The command and its output are one act, so the stamp is the output's —
  // the same rule a block of tool calls follows.
  if (!merged) return;
  const when = lastEntry.querySelector(':scope > .jsonl-when');
  const ts = Number(lastEntry.dataset.ts);
  if (when && Number.isFinite(ts) && ts) when.replaceWith(makeWhen(ts));
}

function getEntryText(entry) {
  if (!entry) return null;
  const content = entry.message?.content || entry.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  }
  return null;
}

function mergeLocalCommandEntries(entries) {
  const result = [];
  let i = 0;
  while (i < entries.length) {
    const entry = entries[i];
    const text = getEntryText(entry);
    // A slash command's own records: the caveat, the invocation and the output,
    // as three consecutive entries. Handled before the `!`-bash case below,
    // which shares the caveat and would otherwise swallow them and give up.
    const envelope = text && !/<bash-input>/.test(text) ? localCommandEnvelope(text) : null;

    if (envelope?.kind === 'caveat') {
      // An instruction to the model about what follows. Never a message.
      i++;
      continue;
    }

    if (envelope?.kind === 'call') {
      const call = { name: envelope.name, args: envelope.args, output: '', isError: false };
      i++;
      // The output is a later entry, and a command can print nothing at all.
      while (i < entries.length) {
        const next = localCommandEnvelope(getEntryText(entries[i]));
        if (next?.kind !== 'output') break;
        call.output = call.output ? `${call.output}\n${next.text}` : next.text;
        call.isError = call.isError || next.isError;
        i++;
      }
      result.push({ type: 'local-slash', _localSlash: call, timestamp: entry.timestamp });
      continue;
    }

    if (envelope?.kind === 'output') {
      // Output whose invocation is not in this window — paging back lands here.
      result.push({
        type: 'local-slash',
        _localSlash: { name: '', args: '', output: envelope.text, isError: envelope.isError },
        timestamp: entry.timestamp,
      });
      i++;
      continue;
    }

    if (text && (/<local-command-caveat>/.test(text) || /<bash-input>/.test(text))) {
      let combined = '';
      const start = i;
      while (i < entries.length) {
        const t = getEntryText(entries[i]);
        if (!t) break;
        if (i > start && !/<bash-input>|<bash-stdout>|<bash-stderr>|<local-command-caveat>/.test(t)) break;
        combined += t + '\n';
        i++;
        if (/<\/bash-stdout>|<\/bash-stderr>/.test(t)) break;
      }

      const inputMatch = combined.match(/<bash-input>([\s\S]*?)<\/bash-input>/);
      if (inputMatch) {
        const cmd = inputMatch[1].trim();
        const stdoutMatch = combined.match(/<bash-stdout>([\s\S]*?)<\/bash-stdout>/);
        const stderrMatch = combined.match(/<bash-stderr>([\s\S]*?)<\/bash-stderr>/);
        const stdout = stdoutMatch ? stdoutMatch[1].trim() : '';
        const stderr = stderrMatch ? stderrMatch[1].trim() : '';
        const output = [stdout, stderr].filter(Boolean).join('\n');
        result.push({ _localCmd: { cmd, output }, type: 'local-command' });
      } else {
        for (let j = start; j < i; j++) result.push(entries[j]);
      }
    } else {
      result.push(entry);
      i++;
    }
  }
  return result;
}

function mergeLocalCommandBlocks(blocks) {
  const hasLocalCmd = blocks.some(b => b.type === 'text' && b.text && /<bash-input>/.test(b.text));
  if (!hasLocalCmd) return blocks;

  let combined = '';
  for (const b of blocks) {
    if (b.type === 'text' && b.text) combined += b.text + '\n';
  }

  const inputMatch = combined.match(/<bash-input>([\s\S]*?)<\/bash-input>/);
  if (!inputMatch) return blocks;

  const cmd = inputMatch[1].trim();
  const stdoutMatch = combined.match(/<bash-stdout>([\s\S]*?)<\/bash-stdout>/);
  const stderrMatch = combined.match(/<bash-stderr>([\s\S]*?)<\/bash-stderr>/);
  const stdout = stdoutMatch ? stdoutMatch[1].trim() : '';
  const stderr = stderrMatch ? stderrMatch[1].trim() : '';
  const output = [stdout, stderr].filter(Boolean).join('\n');

  const merged = { type: 'text', text: combined, _localCmd: { cmd, output } };
  const result = [];
  let replacedText = false;
  for (const b of blocks) {
    if (b.type === 'text') {
      if (!replacedText) { result.push(merged); replacedText = true; }
    } else {
      result.push(b);
    }
  }
  return result;
}

function extractImages(data) {
  const images = [];
  if (!data) return images;
  if (typeof data === 'string') {
    const imgMatches = data.matchAll(/\{"type"\s*:\s*"image"\s*,\s*"source"\s*:\s*\{[^}]*"data"\s*:\s*"([^"]+)"[^}]*\}/g);
    for (const m of imgMatches) {
      const base64 = m[1];
      const mediaMatch = m[0].match(/"media_type"\s*:\s*"([^"]+)"/);
      const mediaType = mediaMatch ? mediaMatch[1] : 'image/jpeg';
      images.push({ src: `data:${mediaType};base64,${base64}` });
    }
    return images;
  }
  if (Array.isArray(data)) {
    for (const block of data) {
      if (block.type === 'image' && block.source?.data) {
        const mediaType = block.source.media_type || 'image/jpeg';
        images.push({ src: `data:${mediaType};base64,${block.source.data}` });
      }
    }
  }
  return images;
}

function extractResultText(data) {
  if (!data) return null;
  if (typeof data === 'string') {
    const cleaned = data.replace(/\{"type"\s*:\s*"image"\s*,\s*"source"\s*:\s*\{[^}]*\}\s*\}/g, '').trim();
    return cleaned || null;
  }
  if (Array.isArray(data)) {
    const texts = data.filter(b => b.type === 'text' || b.text).map(b => b.text || JSON.stringify(b));
    return texts.length ? texts.join('\n') : null;
  }
  return JSON.stringify(data, null, 2);
}

/**
 * An image in the transcript, at whatever size the row can spare, opening full
 * screen on click.
 *
 * One helper for all four sources — a screenshot a tool returned, one Claude
 * sent, one the user pasted, and the `[Image: source:]` line an older CLI
 * wrote — because they are the same object to the reader, and the click was
 * previously re-implemented per source.
 *
 * @param {string} src   a `data:` or `file:` URL
 * @param {string} [extra] one more class, for the callers that style it
 */
// Opening it full size is handled by the delegate above, off the class.
function makeChatImage(src, extra) {
  const img = document.createElement('img');
  img.className = 'jsonl-tool-screenshot jsonl-clickable-img' + (extra ? ` ${extra}` : '');
  img.src = src;
  return img;
}

function renderToolResult(resultData, container) {
  const images = extractImages(resultData);
  const textParts = extractResultText(resultData);
  if (textParts) {
    container.appendChild(makeInlineContent('jsonl-tool-result', textParts));
  }
  for (const img of images) {
    const imgEl = makeChatImage(img.src);
    if (img.alt) imgEl.alt = img.alt;
    container.appendChild(imgEl);
  }
}

// ── A call that failed ────────────────────────────────────────────
//
// The CLI marks it on the result block — `is_error: true` — and for a shell
// command writes the status into the first line of the output. Folded, that
// line is behind a click, so the row itself said nothing: a turn where one
// command in nine came back non-zero looked exactly like a turn where none did.

/** `Exit code 127\n(eval):1: command not found: timeout` */
const EXIT_CODE = /^\s*Exit code (\d+)\b/;

/**
 * Say on the row that this one came back failed, and with what status.
 *
 * The bullet is recoloured rather than overridden in CSS: the renderers set it
 * inline, per tool, and a stylesheet rule would have to out-shout them.
 */
function markToolFailed(toolEl, content) {
  if (!toolEl || toolEl.classList.contains('jsonl-tool-block--failed')) return;
  toolEl.classList.add('jsonl-tool-block--failed');
  const bullet = toolEl.querySelector('.jsonl-tool-bullet');
  if (bullet) bullet.style.color = 'var(--red-500)';

  const header = toolEl.querySelector('.jsonl-tool-header');
  if (!header) return;
  const text = typeof content === 'string' ? content : (extractResultText(content) || '');
  const code = EXIT_CODE.exec(text);
  const chip = document.createElement('span');
  chip.className = 'jsonl-tool-failed';
  chip.textContent = code ? `exit ${code[1]}` : 'failed';
  // Before the duration, which is pinned to the right edge of the row.
  const took = header.querySelector('.jsonl-tool-took');
  if (took) header.insertBefore(chip, took);
  else header.appendChild(chip);
}

/**
 * A stored result, which may or may not have been kept with its error flag.
 *
 * The maps that hold results between a call and its answer predate the flag and
 * some still hold the bare content, so both shapes are read here rather than at
 * six call sites. The wrapper is recognised by carrying `isError` — a real
 * payload with a `content` field (a Write result, say) does not.
 */
function unwrapResult(data) {
  const wrapped = data && typeof data === 'object' && !Array.isArray(data)
    && 'content' in data && 'isError' in data;
  return wrapped
    ? { content: data.content, isError: !!data.isError }
    : { content: data, isError: false };
}

// ── What a shell call cost the context ────────────────────────────
//
// A command's output goes into the conversation whole, and the ones that eat a
// window are not the ones that look expensive: `git log` is four lines, one
// `go test ./...` is four thousand. Folded, nothing on the row said so.
//
// No token count is written down anywhere — a Bash result carries stdout,
// stderr and a return code and nothing else — so this is an estimate from the
// output's length at four characters to the token, and it says `~` because of
// that.
//
// The bands are calibrated, not guessed: across 3537 shell results in the eight
// largest transcripts on this machine the median call was ~97 tokens and the
// 75th percentile ~292. 400 / 1200 / 3000 puts 82% of calls in the quiet grey,
// 16% in amber, 2% in orange and 0.2% in red — so the colour means "unusual"
// rather than "large", which is the only way it is worth looking at.
const CHARS_PER_TOKEN = 4;
const WEIGHT_BANDS = [
  { from: 3000, cls: ' is-red' },
  { from: 1200, cls: ' is-orange' },
  { from: 400, cls: ' is-amber' },
];

function markToolWeight(toolEl, content) {
  // Bash only. The bands are the shape of *shell* output; a Read of a long file
  // is legitimately thousands of tokens and would sit permanently in red.
  if (!toolEl?.classList?.contains('jsonl-tool-block--bash')) return;
  const header = toolEl.querySelector('.jsonl-tool-header');
  if (!header) return;

  const text = typeof content === 'string' ? content : (extractResultText(content) || '');
  const tokens = Math.round(text.length / CHARS_PER_TOKEN);
  if (!tokens) return;

  let chip = header.querySelector('.jsonl-tool-weight');
  if (!chip) {
    chip = document.createElement('span');
    // Before the duration, which stays pinned to the right edge of the row.
    header.insertBefore(chip, header.querySelector('.jsonl-tool-took'));
  }
  chip.className = 'jsonl-tool-weight' + (WEIGHT_BANDS.find(b => tokens >= b.from)?.cls || '');
  chip.textContent = '~' + shortTokenCount(tokens);
  chip.title = `${text.length.toLocaleString()} characters of output`
    + ` — roughly ${tokens.toLocaleString()} tokens of context`;
}

/** The tool's answer, into the call it belongs to, marked if it failed. */
function applyToolResult(toolEl, data) {
  const { content, isError } = unwrapResult(data);
  withToolContent(toolEl, (body) => renderToolResult(content, body));
  if (isError) markToolFailed(toolEl, content);
  markToolWeight(toolEl, content);
  return isError;
}

// ── An answer whose call is not on screen ─────────────────────────
//
// A window of the transcript can start in the middle of a turn, and then the
// results of calls made in the page above arrive with nothing to fold into.
// They used to render as a bare "Tool Result": no tool, no reason for being
// there, no cost. Three things nobody could recover without opening it and
// guessing from the output.

/** Every tool that draws its own row, and the colour it draws it in. */
const TOOL_COLOR = {
  Read: '#8888a0',
  Edit: '#e0a040',
  Write: '#60c060',
  Bash: '#80c0e0',
  Grep: '#c090e0',
  Glob: '#c090e0',
  Agent: '#f0a050',
  WebSearch: WEB_COLOR,
  WebFetch: WEB_COLOR,
  ToolSearch: WEB_COLOR,
};

/**
 * Which tool produced this, read off the shape of what it produced.
 *
 * The `toolUseResult` the CLI writes beside a result is a different object per
 * tool, and that is enough to name it without the call — which is the whole
 * point, since the call is what is missing.
 */
function toolFromResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  if ('stdout' in result || 'stderr' in result) return 'Bash';
  if ('total_deferred_tools' in result) return 'ToolSearch';
  if ('searchCount' in result || ('query' in result && Array.isArray(result.results))) return 'WebSearch';
  if ('codeText' in result && 'bytes' in result) return 'WebFetch';
  if ('oldString' in result && 'structuredPatch' in result) return 'Edit';
  if (result.type === 'create' && result.filePath) return 'Write';
  if (result.type === 'text' && result.file) return 'Read';
  if ('filenames' in result || 'numFiles' in result) return 'Glob';
  return null;
}

/** 12400 → "12.4k" — a count that has to fit on a row beside three others. */
function shortTokenCount(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1) + 'k';
  return String(n);
}

/**
 * What the call cost, when the result says so.
 *
 * Most do not — a shell command's answer carries its output and nothing else,
 * and the duration for those is reconstructed from the entry timestamps by the
 * caller. This reports only what is actually written down.
 */
function resultCost(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return '';
  const parts = [];

  const ms = Number.isFinite(result.totalDurationMs) ? result.totalDurationMs
    : Number.isFinite(result.durationSeconds) ? result.durationSeconds * 1000
    : null;
  if (ms != null) parts.push(formatDuration(ms));

  const usage = result.usage || {};
  const tokens = Number.isFinite(result.totalTokens)
    ? result.totalTokens
    : (usage.input_tokens || 0) + (usage.output_tokens || 0)
      + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const short = shortTokenCount(tokens);
  if (short) parts.push(short + ' tokens');

  if (Number.isFinite(result.bytes) && result.bytes > 0) {
    parts.push(result.bytes >= 1024 ? Math.round(result.bytes / 1024) + ' KB' : result.bytes + ' B');
  }
  if (Number.isFinite(result.searchCount) && result.searchCount > 0) {
    parts.push(result.searchCount + (result.searchCount === 1 ? ' search' : ' searches'));
  }
  return parts.join(' · ');
}

/**
 * A loose result, drawn as the answer it is.
 *
 * @param {unknown} content  what the result block carried
 * @param {{ toolUseResult?: unknown, toolName?: string|null, isError?: boolean }} [opts]
 */
function renderOrphanResult(content, opts = {}) {
  const raw = opts.toolUseResult;
  const name = opts.toolName
    || toolFromResult(raw)
    || (EXIT_CODE.test(typeof content === 'string' ? content : '') ? 'Bash' : null);
  const cost = resultCost(raw);

  // The reason it is here at all: the call is real and it is in the part of the
  // session above this window. Saying so beats leaving it unexplained.
  const why = name ? 'answer to a call above' : 'answer to a call above — tool unknown';
  const summary = '<span class="jsonl-tool-detail">'
    + escHtml([why, cost].filter(Boolean).join(' · '))
    + '</span>';

  const body = document.createElement('div');
  renderToolResult(content, body);

  const el = toolBlock(
    (name && TOOL_COLOR[name]) || '#8888a0',
    name ? `${name} result` : 'Tool result',
    summary,
    body.children.length ? body : null,
  );
  el.classList.add('jsonl-tool-block--orphan');
  // Output with no command above it is still shell output. One pane instead of
  // two, which is the honest shape: the line that was typed is not here.
  if (name === 'Bash') el.classList.add('jsonl-tool-block--bash');
  // So it can stop being an orphan. Pages load upward, so the call this
  // answers may well arrive after it — see adoptOrphanResults.
  if (opts.toolUseId) el.dataset.orphanFor = opts.toolUseId;
  if (opts.isError) {
    el.dataset.orphanError = '1';
    markToolFailed(el, content);
  }
  return collapseToolBlock(el);
}

/**
 * Give every loose result back to its call, once the call is on screen.
 *
 * History is paged in upward, so the two halves of a pair arrive in the wrong
 * order: the window holding the result is painted first, and the window holding
 * the call is prepended above it one scroll later. At that moment the loose
 * block stops being loose — the thing it is an answer to is right there — and
 * leaving it at the bottom of the turn is the same anonymous row it was before.
 *
 * Run after anything that inserts into the transcript. Costs one selector over
 * the loose blocks, of which a page has none or one.
 */
function adoptOrphanResults(container) {
  if (!container) return;
  for (const orphan of container.querySelectorAll('[data-orphan-for]')) {
    const id = orphan.dataset.orphanFor;
    const call = container.querySelector(`[data-tool-use-id="${CSS.escape(id)}"]`);
    if (!call || !call.classList.contains('jsonl-tool-block')) continue;

    // The call may already be folded, in which case its body is a string and
    // the move goes through a scratch node — see withToolContent.
    const text = withToolContent(call, (target) => {
      for (const node of Array.from(orphan.querySelector('.jsonl-tool-content')?.childNodes || [])) {
        target.appendChild(node);
      }
      return target.textContent || '';
    });
    if (orphan.dataset.orphanError) markToolFailed(call, text);
    if (!call.classList.contains('jsonl-tool-block--foldable')) collapseToolBlock(call);

    // The block was wrapped in an entry of its own; an entry with nothing left
    // in it is a blank line in the transcript.
    const entry = orphan.parentElement;
    orphan.remove();
    if (entry?.classList.contains('jsonl-entry') && !entry.children.length) entry.remove();
  }
}

/**
 * The prompt just sent, echoed into the transcript.
 *
 * One entry, images above the sentence — the shape `renderJsonlEntry` builds
 * for the same message once the CLI has written it to disk. Without this the
 * echo was one bubble per block, so a prompt with a screenshot in it looked
 * like two messages until the chat was reopened and then like one.
 *
 * @param {{ text: string, images?: Array<{ mediaType: string, data: string }>, at?: number }} prompt
 */
function renderUserPrompt(prompt) {
  const frag = document.createDocumentFragment();
  const el = document.createElement('div');
  el.className = 'jsonl-entry jsonl-user';

  for (const image of prompt.images || []) {
    el.appendChild(makeChatImage(`data:${image.mediaType};base64,${image.data}`, 'jsonl-msgimage'));
  }
  const text = String(prompt.text || '').trim();
  if (text) {
    const body = document.createElement('div');
    body.className = 'jsonl-text';
    setRichText(body, text);
    decorateMentions(body);
    el.appendChild(body);
  }

  appendWhen(el, prompt.at);
  // Every entry records when it was, whether or not it shows it — the day
  // separators are placed off this.
  if (prompt.at != null) el.dataset.ts = String(prompt.at);
  frag.appendChild(el);
  return frag;
}

export {
  escHtml,
  renderJsonlText,
  formatDuration,
  makeInlineContent,
  makeCollapsible,
  toolBlock,
  collapseToolBlock,
  shortPath,
  renderMcpAction,
  renderToolUse,
  renderLocalCommand,
  mergeLocalCommandBlocks,
  extractImages,
  extractResultText,
  makeChatImage,
  renderToolResult,
  applyToolResult,
  markToolFailed,
  renderOrphanResult,
  adoptOrphanResults,
  // Exported for their own tests: they are the only part of the orphan block
  // that is a decision rather than markup.
  toolFromResult,
  resultCost,
  unwrapResult,
  renderUserPrompt,
  getEntryText,
  mergeLocalCommandEntries,
  makeThinking,
  decorateMentions,
  makeWhen,
  refreshWhen,
  dayKey,
  refreshDayMarkers,
  renderAskRecord,
  toolContent,
  groupOfEntry,
  mergeToolGroups,
  mergeSlashOutput,
  refreshStamps,
  markToolDuration,
};

// ── ViewItem bridge ───────────────────────────────────────────────
// message-normalizer.ts turns one stream message into a list of ViewItems;
// this turns those into the same nodes the transcript viewer builds by hand.
// The normalizer decides *what* a message is — including that it is something
// this build has never seen — and this decides what it looks like.

/** An unrecognised message, rendered so it cannot be missed. */
function renderUnknown(item) {
  const el = document.createElement('div');
  el.className = 'jsonl-entry jsonl-assistant';
  let raw;
  try { raw = JSON.stringify(item.raw, null, 2); } catch { raw = String(item.raw); }
  const box = makeCollapsible('jsonl-unknown', `Unknown message · ${item.label}`, raw, false);
  el.appendChild(box);
  return el;
}

/**
 * What the memory supervisor pulled into the turn.
 *
 * The one thing in a transcript that shaped the answer without appearing in the
 * conversation: without this the reply just knows something, and there is
 * nothing on screen saying where from. A file-backed memory arrives as a path
 * with no body — the CLI expects the renderer to lazy-load it — so the path is
 * a chip that opens the file in the side panel, which is the same gesture as
 * any other file in the transcript.
 */
function renderMemory(item) {
  const el = document.createElement('div');
  el.className = 'jsonl-entry jsonl-assistant';

  const box = document.createElement('div');
  box.className = 'jsonl-memory';

  const head = document.createElement('div');
  head.className = 'jsonl-memory__head';
  head.appendChild(makeIcon('brain', 12));
  const label = document.createElement('span');
  label.textContent = item.mode === 'synthesize'
    ? 'Recalled from memory, summarised'
    : `Recalled from memory · ${item.memories.length}`;
  head.appendChild(label);
  box.appendChild(head);

  for (const memory of item.memories) {
    const row = document.createElement('div');
    row.className = 'jsonl-memory__item';

    if (memory.scope) {
      const scope = document.createElement('span');
      scope.className = 'jsonl-memory__scope';
      scope.textContent = memory.scope;
      row.appendChild(scope);
    }

    // A synthesis has no file behind it — the sentinel path is bookkeeping, not
    // somewhere to go — so only a real one becomes a chip.
    const synthetic = memory.path.startsWith('<synthesis:');
    if (synthetic) {
      const name = document.createElement('span');
      name.className = 'jsonl-memory__name';
      name.textContent = 'synthesised';
      row.appendChild(name);
    } else {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'jsonl-mention jsonl-mention--file';
      chip.dataset.mentionFile = memory.path;
      chip.title = memory.path;
      chip.textContent = memory.path.split('/').pop() || memory.path;
      row.appendChild(chip);
    }

    if (memory.content) {
      row.appendChild(makeCollapsible('jsonl-memory__body', 'Show', memory.content, false));
    }
    box.appendChild(row);
  }

  el.appendChild(box);
  return el;
}

/**
 * An aside from the session about itself.
 *
 * `info` and `warn` stay one quiet line — they are asides. An error is not: a
 * CLI that would not launch or a turn that could not run is the most important
 * thing in the transcript, and it was being drawn smaller than the sentence
 * above it. So that one gets a box and an icon, and says what it is.
 */
function renderNotice(item) {
  const el = document.createElement('div');
  el.className = 'jsonl-entry jsonl-meta-entry jsonl-notice jsonl-notice--' + item.level;
  if (item.level !== 'error') {
    el.textContent = item.text;
    return el;
  }

  const head = document.createElement('div');
  head.className = 'jsonl-notice__head';
  head.appendChild(makeIcon('triangle-alert', 13));
  const label = document.createElement('span');
  label.textContent = 'Session error';
  head.appendChild(label);

  const body = document.createElement('div');
  body.className = 'jsonl-notice__body';
  body.textContent = item.text;

  el.append(head, body);
  return el;
}

/**
 * @param {Array} items      ViewItems from normalize()
 * @param {Map}   [toolResults] tool_use_id → result, so a call and its result
 *                            render as one block the way the transcript does
 * @param {{ foldTools?: boolean, at?: number }} [opts] `at` is the time these
 *                            items arrived; passing it stamps the messages.
 * @returns {DocumentFragment}
 */
function renderViewItems(items, toolResults, opts) {
  const fold = !!opts?.foldTools;
  const at = opts?.at;
  const frag = document.createDocumentFragment();
  for (const item of items) {
    switch (item.kind) {
      case 'text': {
        // Live, a slash command arrives as its envelopes — the caveat, the
        // invocation, then the output, each its own message. The same three
        // records mergeLocalCommandEntries folds together when read off disk.
        const envelope = localCommandEnvelope(item.text);
        if (envelope) {
          if (envelope.kind === 'caveat') break;     // plumbing, not a message
          const block = envelope.kind === 'call'
            ? renderSlashCall(envelope)
            : Object.assign(document.createElement('div'), { className: 'jsonl-slash' });
          if (envelope.kind === 'output') {
            block.appendChild(makeSlashOutput(envelope.text, envelope.isError));
          }
          const entry = asEntry(block);
          appendWhen(entry, at);
          frag.appendChild(entry);
          break;
        }
        const el = document.createElement('div');
        el.className = 'jsonl-entry ' + (item.role === 'user' ? 'jsonl-user' : 'jsonl-assistant');
        const text = document.createElement('div');
        text.className = 'jsonl-text';
        setRichText(text, item.text.trim());
        // Only what the user wrote: a path Claude mentions in prose is already
        // a tool call two rows down, and the sentence is not the way to it.
        if (item.role === 'user') decorateMentions(text);
        el.appendChild(text);
        appendWhen(el, at);
        frag.appendChild(el);
        break;
      }
      case 'thinking': {
        const el = document.createElement('div');
        el.className = 'jsonl-entry jsonl-assistant';
        el.appendChild(makeThinking(item.text, false));
        frag.appendChild(el);
        break;
      }
      case 'tool_use': {
        // A question is not a step in the work, it is the work stopping to ask
        // — so it breaks the run of calls rather than joining it.
        const ask = item.name === 'AskUserQuestion' ? renderAskRecord(item.input) : null;
        if (ask) {
          const el = document.createElement('div');
          el.className = 'jsonl-entry jsonl-assistant';
          if (item.id) {
            ask.dataset.toolUseId = item.id;
            // The answer is already written into the record when the input
            // carries it; folding the result in as well would say it twice.
            if (askIsAnswered(item.input)) toolResults?.delete(item.id);
          }
          el.appendChild(ask);
          appendWhen(el, at);
          frag.appendChild(el);
          break;
        }
        const toolEl = renderToolUse({ name: item.name, input: item.input, id: item.id });
        if (item.id) toolEl.dataset.toolUseId = item.id;
        if (item.id && toolResults && toolResults.has(item.id)) {
          applyToolResult(toolEl, toolResults.get(item.id));
          toolResults.delete(item.id);
        }
        // A run of calls is one operation — "read three files, then edit them"
        // — so it is drawn as one framed block rather than as N loose rows
        // scattered between two sentences.
        openToolGroup(frag).appendChild(fold ? collapseToolBlock(toolEl) : toolEl);
        break;
      }
      case 'tool_result': {
        // Already folded into its call above when the pair was seen together.
        if (item.toolUseId && toolResults && !toolResults.has(item.toolUseId)) break;
        const el = document.createElement('div');
        el.className = 'jsonl-entry jsonl-assistant';
        el.appendChild(renderOrphanResult(item.content, {
          toolUseId: item.toolUseId,
          toolName: opts?.toolNames?.get(item.toolUseId) || null,
          isError: item.isError,
        }));
        frag.appendChild(el);
        break;
      }
      case 'image': {
        const el = document.createElement('div');
        // A pasted screenshot belongs on the user's side of the transcript; one
        // Claude sent belongs on its own.
        el.className = 'jsonl-entry ' + (item.role === 'user' ? 'jsonl-user' : 'jsonl-assistant');
        el.appendChild(makeChatImage(`data:${item.mediaType};base64,${item.data}`, 'jsonl-msgimage'));
        appendWhen(el, at);
        frag.appendChild(el);
        break;
      }
      // The invocation, echoed locally the moment it is sent. Synthesised by
      // the view, not by the normalizer: the CLI writes the `<command-name>`
      // envelope to the transcript but never streams it, so live this is the
      // only record that the command was run — and without it the history and
      // the live view drew the same command two different ways.
      case 'command_call': {
        const entry = asEntry(renderSlashCall(item));
        appendWhen(entry, at);
        frag.appendChild(entry);
        break;
      }
      case 'command_output': {
        const block = document.createElement('div');
        block.className = 'jsonl-slash';
        block.appendChild(makeSlashOutput(item.text, item.isError));
        const entry = asEntry(block);
        appendWhen(entry, at);
        frag.appendChild(entry);
        break;
      }
      case 'memory':
        frag.appendChild(renderMemory(item));
        break;
      case 'notice':
        frag.appendChild(renderNotice(item));
        break;
      case 'unknown':
        frag.appendChild(renderUnknown(item));
        break;
      // 'delta', 'usage', 'silent' and 'turn_end' change the view's state
      // rather than adding to the transcript; the caller handles them.
      default:
        break;
    }
  }
  // Every entry carries when it arrived, not only the ones showing a stamp:
  // the day separators are placed off this, and a run of tool calls between two
  // midnights still belongs to a day.
  if (at != null) {
    for (const el of frag.children) if (!el.dataset.ts) el.dataset.ts = String(at);
  }
  return frag;
}

// ── Transcript entries ────────────────────────────────────────────
// One line of a `.jsonl` as it sits on disk. The chat view uses this to paint
// a session's history before it starts receiving live messages, so a session
// opened in the new view reads back exactly as it does in the old one.

function renderJsonlEntry(entry, toolResultMap, opts) {
  if (entry._localCmd) {
    return renderLocalCommand(entry._localCmd);
  }

  if (entry._localSlash) {
    const call = entry._localSlash;
    // A window that starts mid-command has the output and not the invocation.
    let block;
    if (call.name) {
      block = renderSlashCall(call);
    } else {
      block = document.createElement('div');
      block.className = 'jsonl-slash';
    }
    if (call.output) block.appendChild(makeSlashOutput(call.output, call.isError));
    const el = asEntry(block);
    if (opts?.timestamps && entry.timestamp) {
      const ms = new Date(entry.timestamp).getTime();
      if (Number.isFinite(ms)) el.dataset.ts = String(ms);
      appendWhen(el, entry.timestamp);
    }
    return el;
  }

  const ts = entry.timestamp;
  const timeStr = ts ? new Date(ts).toLocaleTimeString() : '';

  if (entry.type === 'custom-title') {
    const div = document.createElement('div');
    div.className = 'jsonl-entry jsonl-meta-entry';
    div.innerHTML = '<span class="jsonl-meta-icon">T</span> Title set: <strong>' + escHtml(entry.customTitle || '') + '</strong>';
    return div;
  }

  if (entry.type === 'system') {
    const div = document.createElement('div');
    div.className = 'jsonl-entry jsonl-meta-entry';
    if (entry.subtype === 'turn_duration') {
      div.innerHTML = '<span class="jsonl-meta-icon">&#9201;</span> Turn duration: <strong>' + formatDuration(entry.durationMs) + '</strong>'
        + (timeStr ? ' <span class="jsonl-ts">' + timeStr + '</span>' : '');
    } else if (entry.subtype === 'local_command') {
      // Reached only when the entries were not merged first — the raw
      // transcript viewer. The envelope still has to come off, or the row
      // reads "Command: <local-command-stdout>…" with the whole output in it.
      const envelope = localCommandEnvelope(entry.content);
      if (envelope?.kind === 'output') {
        const block = document.createElement('div');
        block.className = 'jsonl-slash';
        block.appendChild(makeSlashOutput(envelope.text, envelope.isError));
        return asEntry(block);
      }
      const cmd = envelope?.kind === 'call' ? `/${envelope.name}` : entry.content || 'unknown';
      div.innerHTML = '<span class="jsonl-meta-icon">$</span> Command: <code class="jsonl-inline-code">' + escHtml(cmd) + '</code>'
        + (timeStr ? ' <span class="jsonl-ts">' + timeStr + '</span>' : '');
    } else {
      return null;
    }
    return div;
  }

  if (entry.type === 'progress') {
    const data = entry.data;
    if (!data || typeof data !== 'object') return null;
    if (data.type === 'bash_progress') {
      const div = document.createElement('div');
      div.className = 'jsonl-entry jsonl-meta-entry';
      const elapsed = data.elapsedTimeSeconds ? ` (${data.elapsedTimeSeconds}s, ${data.totalLines || 0} lines)` : '';
      div.innerHTML = '<span class="jsonl-meta-icon">&#9658;</span> Bash output' + escHtml(elapsed);
      if (data.output || data.fullOutput) {
        const output = data.fullOutput || data.output || '';
        div.appendChild(makeCollapsible('jsonl-tool-result', 'Output', output, true));
      }
      return div;
    }
    return null;
  }

  let role = null;
  let contentBlocks = null;

  if (entry.type === 'user' || (entry.type === 'message' && entry.role === 'user')) {
    role = 'user';
    contentBlocks = entry.message?.content || entry.content;
  } else if (entry.type === 'assistant' || (entry.type === 'message' && entry.role === 'assistant')) {
    role = 'assistant';
    contentBlocks = entry.message?.content || entry.content;
  } else {
    return null;
  }

  if (!contentBlocks) return null;
  if (typeof contentBlocks === 'string') {
    contentBlocks = [{ type: 'text', text: contentBlocks }];
  }
  if (!Array.isArray(contentBlocks)) return null;

  contentBlocks = mergeLocalCommandBlocks(contentBlocks);

  const isToolResultOnly = role === 'user' && Array.isArray(contentBlocks) &&
    contentBlocks.every(b => b.type === 'tool_result');
  const visualRole = isToolResultOnly ? 'assistant' : role;

  const div = document.createElement('div');
  div.className = 'jsonl-entry ' + (visualRole === 'user' ? 'jsonl-user' : 'jsonl-assistant');

  // A run of calls inside one message is one framed block, exactly as it is in
  // the live view — `group` is the one currently open, reset by anything that
  // is not a call.
  let group = null;
  const intoGroup = (node) => {
    if (!group) {
      group = document.createElement('div');
      group.className = 'jsonl-toolgroup';
      div.appendChild(group);
    }
    group.appendChild(node);
  };

  for (const block of contentBlocks) {
    if (block.type !== 'tool_use') group = null;
    if (block.type === 'thinking' && block.thinking) {
      div.appendChild(makeThinking(block.thinking, false));
    } else if (block.type === 'text' && block.text && block.text.trim()) {
      if (block._localCmd) {
        div.appendChild(renderLocalCommand(block._localCmd));
        continue;
      }
      const imgMatch = block.text.trim().match(/^\[Image:\s*source:\s*([^\]]+)\]$/);
      if (imgMatch) {
        div.appendChild(makeChatImage('file://' + imgMatch[1].trim(), 'jsonl-msgimage'));
        continue;
      }
      const textEl = document.createElement('div');
      textEl.className = 'jsonl-text';
      setRichText(textEl, block.text.trim());
      if (visualRole === 'user') decorateMentions(textEl);
      div.appendChild(textEl);
    } else if (block.type === 'tool_use') {
      // A question is drawn as the dialog it was, not as a call — see
      // renderAskRecord. It also breaks the run of calls around it.
      const ask = block.name === 'AskUserQuestion' ? renderAskRecord(block.input) : null;
      if (ask) {
        group = null;
        if (block.id) ask.dataset.toolUseId = block.id;
        if (block.id && toolResultMap?.has(block.id)) {
          const answered = askIsAnswered(block.input);
          const result = toolResultMap.get(block.id);
          toolResultMap.delete(block.id);
          // The answer is already written into the record when the input
          // carries it; folding the result in too would say it twice. When it
          // does not, the result is the only record of what was answered.
          if (!answered) renderToolResult(result, toolContent(ask));
        }
        div.appendChild(ask);
        continue;
      }
      const toolEl = renderToolUse(block);
      if (block.id) toolEl.dataset.toolUseId = block.id;
      if (block.id && toolResultMap && toolResultMap.has(block.id)) {
        const resultData = toolResultMap.get(block.id);
        toolResultMap.delete(block.id);
        applyToolResult(toolEl, resultData);
      }
      // Read back off disk, a call's duration is the gap between the entry that
      // made it and the entry that carried the result — see renderWindow.
      const ended = block.id && opts?.toolTimes ? opts.toolTimes.get(block.id) : null;
      if (ended && ts) markToolDuration(toolEl, new Date(ended).getTime() - new Date(ts).getTime());
      intoGroup(opts?.foldTools ? collapseToolBlock(toolEl) : toolEl);
    } else if (block.type === 'image' && block.source?.data) {
      // A screenshot the user pasted into the prompt. It sits in the same
      // record as the sentence it came with — see the CLI's own transcript —
      // so it renders inside this entry rather than as one of its own.
      const mediaType = block.source.media_type || 'image/png';
      div.appendChild(makeChatImage(`data:${mediaType};base64,${block.source.data}`, 'jsonl-msgimage'));
    } else if (block.type === 'tool_result') {
      if (block.tool_use_id && toolResultMap && !toolResultMap.has(block.tool_use_id)) continue;
      // The call is in the page above this window. `toolUseResult` sits on the
      // entry rather than on the block, and its shape is what names the tool.
      div.appendChild(renderOrphanResult(block.content || block.output || '', {
        toolUseId: block.tool_use_id,
        toolUseResult: entry.toolUseResult,
        toolName: opts?.toolNames?.get(block.tool_use_id) || null,
        isError: block.is_error === true,
      }));
    }
  }

  if (!div.children.length) return null;
  if (opts?.timestamps && ts) {
    const ms = new Date(ts).getTime();
    // Every entry records when it was, for the day separators; only prose shows
    // it — the turn a row of tool calls belongs to is already stamped, and
    // repeating it on every call is noise. An image with no sentence is still a
    // message someone sent, so it is stamped too.
    if (Number.isFinite(ms)) div.dataset.ts = String(ms);
    if (div.querySelector('.jsonl-text, .jsonl-msgimage')) appendWhen(div, ts);
  }
  return div;
}


export { renderJsonlEntry };

export { renderViewItems, renderUnknown, renderNotice };
