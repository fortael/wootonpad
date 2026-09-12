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

function makeCollapsible(className, headerText, bodyContent, startExpanded) {
  const wrapper = document.createElement('div');
  wrapper.className = className;
  const header = document.createElement('div');
  header.className = 'jsonl-toggle' + (startExpanded ? ' expanded' : '');
  header.textContent = headerText;
  const body = document.createElement('pre');
  body.className = 'jsonl-tool-body';
  body.style.display = startExpanded ? '' : 'none';
  if (typeof bodyContent === 'string') {
    body.textContent = bodyContent;
  } else {
    try { body.textContent = JSON.stringify(bodyContent, null, 2); } catch { body.textContent = String(bodyContent); }
  }
  header.onclick = () => {
    const showing = body.style.display !== 'none';
    body.style.display = showing ? 'none' : '';
    header.classList.toggle('expanded', !showing);
  };
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
  body.style.display = 'none';
  header.onclick = () => {
    const showing = body.style.display !== 'none';
    body.style.display = showing ? 'none' : '';
    el.classList.toggle('is-open', !showing);
  };
  return el;
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
 * Put a rule with a date on it before the first message of each day.
 *
 * Rebuilt rather than patched: paging earlier messages in prepends a whole
 * window above what is on screen, which can turn the day the old first message
 * started into a day it no longer starts. Rebuilding is O(children) of
 * attribute reads and mutates only where a marker is actually missing.
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
    last = key;
    container.insertBefore(makeDayline(ts, key), el);
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
  if (entry.children.length !== 1) return null;
  const only = entry.firstElementChild;
  return only?.classList.contains('jsonl-toolgroup') ? only : null;
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

const toolRenderers = {
  Read(input) {
    const path = input.file_path || '';
    let range = '';
    if (input.offset || input.limit) {
      const start = input.offset || 0;
      range = input.limit ? `:${start}-${start + input.limit}` : `:${start}`;
    }
    return toolBlock('#8888a0', 'Read', '<code>' + escHtml(shortPath(path) + range) + '</code>', null);
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
    return toolBlock('#e0a040', 'Edit', '<code>' + escHtml(shortPath(path)) + '</code>', content);
  },

  Write(input) {
    const path = input.file_path || '';
    const lines = (input.content || '').split('\n').length;
    const detail = '<code>' + escHtml(shortPath(path)) + '</code> <span class="jsonl-tool-detail">' + lines + ' lines</span>';
    let content = null;
    if (input.content) {
      content = makeCollapsible('jsonl-tool-result', 'Content', input.content, true);
    }
    return toolBlock('#60c060', 'Write', detail, content);
  },

  Bash(input) {
    const cmd = input.command || '';
    const pre = document.createElement('pre');
    pre.className = 'jsonl-tool-cmd-block';
    pre.textContent = cmd;
    // The header is all there is while the call is folded, and "Bash" alone
    // was the one row in the transcript you could not identify without opening
    // it — every other tool names its file or its pattern.
    const head = truncateCommand(cmd);
    return toolBlock('#80c0e0', 'Bash', head ? '<code>' + escHtml(head) + '</code>' : null, pre);
  },

  Grep(input) {
    const pattern = input.pattern || '';
    const path = input.path || '';
    const sp = path ? shortPath(path) : '';
    const summary = '<code>' + escHtml(pattern) + (sp ? ' in ' + escHtml(sp) : '') + '</code>';
    return toolBlock('#c090e0', 'Grep', summary, null);
  },

  Glob(input) {
    const pattern = input.pattern || '';
    return toolBlock('#c090e0', 'Glob', '<code>' + escHtml(pattern) + '</code>', null);
  },

  Agent(input) {
    const desc = input.description || '';
    const type = input.subagent_type || '';
    const summary = (type ? '<span class="jsonl-tool-detail">' + escHtml(type) + '</span> ' : '')
      + escHtml(desc);
    return toolBlock('#f0a050', 'Agent', summary, null);
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
  pre.className = 'jsonl-tool-cmd-block';
  pre.textContent = cmd;

  const head = truncateCommand(cmd);
  const el = toolBlock('#80c0e0', 'Bash',
    '<span class="jsonl-tool-detail">local</span>'
    + (head ? ' <code>' + escHtml(head) + '</code>' : ''), pre);

  if (output) {
    let contentEl = el.querySelector('.jsonl-tool-content');
    if (!contentEl) {
      contentEl = document.createElement('div');
      contentEl.className = 'jsonl-tool-content';
      el.appendChild(contentEl);
    }
    const resultPre = document.createElement('pre');
    resultPre.className = 'jsonl-tool-cmd-block';
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

function renderToolResult(resultData, container) {
  const images = extractImages(resultData);
  const textParts = extractResultText(resultData);
  if (textParts) {
    container.appendChild(makeInlineContent('jsonl-tool-result', textParts));
  }
  for (const img of images) {
    const imgEl = document.createElement('img');
    imgEl.className = 'jsonl-tool-screenshot';
    imgEl.src = img.src;
    if (img.alt) imgEl.alt = img.alt;
    imgEl.onclick = () => {
      const overlay = document.createElement('div');
      overlay.className = 'jsonl-screenshot-fullscreen';
      const fullImg = document.createElement('img');
      fullImg.src = img.src;
      overlay.appendChild(fullImg);
      overlay.onclick = () => overlay.remove();
      document.body.appendChild(overlay);
    };
    container.appendChild(imgEl);
  }
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
  renderToolResult,
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

function renderNotice(item) {
  const el = document.createElement('div');
  el.className = 'jsonl-entry jsonl-meta-entry jsonl-notice jsonl-notice--' + item.level;
  el.textContent = item.text;
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
        text.innerHTML = renderJsonlText(item.text.trim());
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
          renderToolResult(toolResults.get(item.id), toolContent(toolEl));
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
        el.appendChild(makeCollapsible('jsonl-tool-result', 'Tool Result', item.content, false));
        frag.appendChild(el);
        break;
      }
      case 'image': {
        const el = document.createElement('div');
        el.className = 'jsonl-entry jsonl-assistant';
        const img = document.createElement('img');
        img.className = 'jsonl-tool-screenshot jsonl-clickable-img';
        img.src = `data:${item.mediaType};base64,${item.data}`;
        el.appendChild(img);
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
        const imgEl = document.createElement('img');
        imgEl.className = 'jsonl-tool-screenshot jsonl-clickable-img';
        imgEl.src = 'file://' + imgMatch[1].trim();
        div.appendChild(imgEl);
        continue;
      }
      const textEl = document.createElement('div');
      textEl.className = 'jsonl-text';
      textEl.innerHTML = renderJsonlText(block.text.trim());
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
        renderToolResult(resultData, toolContent(toolEl));
      }
      // Read back off disk, a call's duration is the gap between the entry that
      // made it and the entry that carried the result — see renderWindow.
      const ended = block.id && opts?.toolTimes ? opts.toolTimes.get(block.id) : null;
      if (ended && ts) markToolDuration(toolEl, new Date(ended).getTime() - new Date(ts).getTime());
      intoGroup(opts?.foldTools ? collapseToolBlock(toolEl) : toolEl);
    } else if (block.type === 'tool_result') {
      if (block.tool_use_id && toolResultMap && !toolResultMap.has(block.tool_use_id)) continue;
      const resultContent = block.content || block.output || '';
      div.appendChild(makeCollapsible('jsonl-tool-result', 'Tool Result', resultContent, false));
    }
  }

  if (!div.children.length) return null;
  if (opts?.timestamps && ts) {
    const ms = new Date(ts).getTime();
    // Every entry records when it was, for the day separators; only prose shows
    // it — the turn a row of tool calls belongs to is already stamped, and
    // repeating it on every call is noise.
    if (Number.isFinite(ms)) div.dataset.ts = String(ms);
    if (div.querySelector('.jsonl-text')) appendWhen(div, ts);
  }
  return div;
}


export { renderJsonlEntry };

export { renderViewItems, renderUnknown, renderNotice };
