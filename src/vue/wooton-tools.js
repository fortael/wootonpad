// wooton-tools.js — what a call to WootonPad's own tools did, without a DOM.
//
// The Chat tab's assistant acts on the workspace through the in-process MCP
// server in wooton-mcp.js, so its calls arrive in the transcript as ordinary
// `mcp__wooton__<tool>` tool_use blocks with a JSON input, and their results as
// the line-oriented text that server writes. Drawn as a generic tool row they
// are a name and a JSON blob — the one kind of call in the app whose subject is
// the app itself read as plumbing. The card in message-render.js draws them as
// what they are: an act on your behalf, on these projects and these sessions.
//
// This file answers the questions that card asks — what to call the act, how
// dangerous it was, which projects and sessions it touched — as plain strings
// and arrays, so they can be tested. The DOM half lives in message-render.js.

import { findMentions, previewLine } from './chat-text.js';

const PREFIX = 'mcp__wooton__';

/** Is this one of WootonPad's own tools? */
export function isWootonTool(name) {
  return typeof name === 'string' && name.startsWith(PREFIX);
}

/** `mcp__wooton__list_sessions` → `list_sessions`. */
export function wootonToolName(name) {
  return isWootonTool(name) ? name.slice(PREFIX.length) : String(name || '');
}

// ── Inputs ────────────────────────────────────────────────────────

/** The canonical 8-4-4-4-12 form — the same rule `@session:` mentions follow. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POSIX, a drive letter, or a UNC share. Project paths are POSIX-canonical
 * (CLAUDE.md, WSL rule 1), but a native Windows account has drive paths, and a
 * relative path is half a path — a chip for it would open nothing.
 */
const ABSOLUTE_RE = /^(\/|[A-Za-z]:[\\/]|\\\\)/;

function pushUnique(list, seen, value, key = value) {
  if (seen.has(key)) return;
  seen.add(key);
  list.push(value);
}

function projectsOf(input) {
  const out = [];
  const seen = new Set();
  const candidates = [input.projectPath, ...(Array.isArray(input.projects) ? input.projects : [])];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const path = value.trim();
    if (ABSOLUTE_RE.test(path)) pushUnique(out, seen, path);
  }
  return out;
}

function sessionsOf(input) {
  const id = typeof input.sessionId === 'string' ? input.sessionId.trim() : '';
  // Anything looser than a UUID is not a session this app can open, so it is
  // not a subject — the error the call comes back with says why.
  return UUID_RE.test(id) ? [id] : [];
}

/** “like this”, flattened and cut to fit a header. */
function quoted(text, max = 72) {
  const flat = previewLine(text, max);
  return flat ? `“${flat}”` : '';
}

/** 600 → "10 min". Rounded to the unit a person would say. */
function spanLabel(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

const SCOPE_LABEL = {
  recent: 'recent',
  active: 'active',
  archived: 'archived',
  groups: 'group sessions',
};

const joinDetail = (...parts) => parts.filter(Boolean).join(' · ');

/** The last segment of a path — what a person calls the file. */
const baseName = (p) => String(p || '').split('/').filter(Boolean).pop() || '';

/** A new session's name and first prompt — what it was started to do. */
function startDetail(input) {
  return joinDetail(
    quoted(input.name, 48),
    typeof input.prompt === 'string' && input.prompt.trim() ? previewLine(input.prompt, 80) : '',
  ) || 'no prompt';
}

// ── The tools ─────────────────────────────────────────────────────
//
// One row per tool in wooton-mcp.js's SPECS. `verb` is the act, said as done —
// the card is a record of it, and the status pip beside it says whether it has
// actually finished. `kind` is how much the act changed: `read` changed nothing,
// `write` changed something recoverable, `danger` cannot be undone.
//
// Icons must exist in lucide-icons.js — only those glyphs are bundled.

const TOOLS = {
  // ── Read ──
  list_projects: {
    verb: 'Listed projects', icon: 'folder', kind: 'read',
    detail: (input) => (input.search ? `matching ${quoted(input.search, 40)}` : ''),
  },
  list_sessions: {
    verb: 'Listed sessions', icon: 'list', kind: 'read',
    detail: (input) => joinDetail(
      SCOPE_LABEL[input.scope] || '',
      Number(input.activeWithinSeconds) > 0 ? `last ${spanLabel(input.activeWithinSeconds)}` : '',
      Number(input.limit) > 0 ? `up to ${Math.round(Number(input.limit))}` : '',
    ),
  },
  read_session: {
    verb: 'Read session', icon: 'messages-square', kind: 'read',
    detail: (input) => (Number(input.limit) > 0 ? `last ${Math.round(Number(input.limit))} messages` : ''),
  },
  peek_active_sessions: {
    verb: 'Checked running sessions', icon: 'layout-grid', kind: 'read',
    detail: (input) => (Number(input.messagesPerSession) > 0
      ? `${Math.round(Number(input.messagesPerSession))} messages each`
      : ''),
  },
  search_sessions: {
    verb: 'Searched sessions', icon: 'search', kind: 'read',
    detail: (input) => joinDetail(quoted(input.query), input.titleOnly === false ? 'full text' : ''),
  },
  list_groups: { verb: 'Listed groups', icon: 'layers', kind: 'read' },
  git_status: { verb: 'Checked git', icon: 'git-branch', kind: 'read' },
  unpushed_work: { verb: 'Checked unpushed work', icon: 'git-fork', kind: 'read' },
  account_limits: { verb: 'Checked usage limits', icon: 'chart-no-axes-column', kind: 'read' },
  list_todos: { verb: 'Listed TODOs', icon: 'list-todo', kind: 'read' },
  todo_agenda: {
    verb: 'Checked what is due', icon: 'calendar-days', kind: 'read',
    detail: (input) => (Number.isInteger(input.withinDays) ? `next ${input.withinDays} days` : ''),
  },
  list_project_files: {
    verb: 'Listed files', icon: 'folder-open', kind: 'read',
    detail: (input) => (input.dir ? `${String(input.dir).replace(/\/+$/, '')}/` : 'project root'),
  },
  list_containers: {
    verb: 'Checked containers', icon: 'container', kind: 'read',
    detail: (input) => (input.all ? 'running and stopped' : 'running'),
  },
  read_project_file: {
    verb: 'Read file', icon: 'file', kind: 'read',
    detail: (input) => (input.path ? String(input.path) : ''),
  },

  // ── Write ──
  create_session: {
    verb: 'Started session', icon: 'play', kind: 'write',
    detail: startDetail,
  },
  create_group_session: {
    verb: 'Started group session', icon: 'layers', kind: 'write',
    detail: startDetail,
  },
  send_to_session: {
    verb: 'Sent to session', icon: 'message-square', kind: 'write',
    detail: (input) => quoted(input.text, 96),
  },
  stop_session: { verb: 'Stopped session', icon: 'square-stop', kind: 'write' },
  archive_session: {
    // `archived: false` is the same tool run backwards.
    verb: (input) => (input.archived === false ? 'Unarchived session' : 'Archived session'),
    icon: 'archive', kind: 'write',
  },
  delete_session: { verb: 'Deleted session', icon: 'trash-2', kind: 'danger' },
  stop_containers: {
    verb: (input) => (input.mode === 'purge' ? 'Purged containers'
      : input.mode === 'down' ? 'Took containers down' : 'Stopped containers'),
    icon: 'container', kind: (input) => (input.mode === 'purge' ? 'danger' : 'write'),
    detail: (input) => baseName(input.projectPath),
  },
  // The four that act on the desktop rather than inside the app.
  open_url: {
    verb: 'Opened link', icon: 'square-arrow-out-up-right', kind: 'write',
    detail: (input) => String(input.url || ''),
  },
  open_in_app: {
    verb: (input) => (input.app ? `Opened in ${input.app}` : 'Opened file'),
    icon: 'file', kind: 'write',
    detail: (input) => joinDetail(baseName(input.path), input.line ? `line ${input.line}` : ''),
  },
  open_folder: {
    verb: 'Opened folder', icon: 'folder-open', kind: 'write',
    detail: (input) => baseName(input.path),
  },
  open_terminal: {
    verb: 'Opened a terminal', icon: 'terminal', kind: 'write',
    detail: (input) => baseName(input.path),
  },
  set_group_projects: {
    verb: 'Changed group projects', icon: 'layers', kind: 'write',
    detail: (input) => (input.groupId ? `group ${input.groupId}` : ''),
  },
  create_todo: {
    verb: 'Added TODO', icon: 'notebook-pen', kind: 'write',
    detail: (input) => joinDetail(quoted(input.title, 64), input.due ? `due ${input.due}` : ''),
  },
  archive_todo: {
    verb: (input) => (input.archived === false ? 'Unarchived TODO' : 'Archived TODO'),
    icon: 'archive', kind: 'write',
    detail: (input) => (typeof input.filename === 'string' ? input.filename : ''),
  },
  set_todo_due: {
    verb: (input) => (/^(none|clear|null)?$/i.test(String(input.due ?? '').trim()) ? 'Cleared due date' : 'Set due date'),
    icon: 'calendar-days', kind: 'write',
    detail: (input) => joinDetail(
      Number.isInteger(input.index) ? `item ${input.index}` : 'whole list',
      typeof input.filename === 'string' ? input.filename : '',
      input.due && !/^(none|clear|null)$/i.test(String(input.due)) ? `→ ${input.due}` : '',
    ),
  },
  toggle_todo: {
    verb: 'Toggled TODO item', icon: 'square-check-big', kind: 'write',
    detail: (input) => joinDetail(
      Number.isInteger(input.index) ? `item ${input.index}` : '',
      typeof input.filename === 'string' ? input.filename : '',
    ),
  },
};

/** `frobnicate_widgets` → "Frobnicate widgets" — for a tool this build has not met. */
function humanize(tool) {
  const words = String(tool || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase());
  if (!words.length) return 'WootonPad action';
  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return words.join(' ');
}

/**
 * What a call to one of WootonPad's tools does, in the card's terms.
 *
 * @param {string} name   the tool_use name, `mcp__wooton__<tool>`
 * @param {object} [input]
 * @returns {{ tool: string, verb: string, icon: string, kind: 'read'|'write'|'danger',
 *             projects: string[], sessions: string[], detail: string }}
 */
export function describeWootonCall(name, input) {
  const tool = wootonToolName(name);
  const args = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const spec = Object.prototype.hasOwnProperty.call(TOOLS, tool) ? TOOLS[tool] : null;

  let detail = '';
  try { detail = spec?.detail ? spec.detail(args) : ''; } catch { detail = ''; }

  return {
    tool,
    verb: spec ? (typeof spec.verb === 'function' ? spec.verb(args) : spec.verb) : humanize(tool),
    icon: spec?.icon || 'bot',
    // A tool nobody has classified is drawn neutral rather than alarming: the
    // server's own instructions are what keep the destructive ones in check.
    // A few tools are only dangerous in one of their modes, so this reads the
    // arguments the same way the verb does.
    kind: (typeof spec?.kind === 'function' ? spec.kind(args) : spec?.kind) || 'read',
    projects: projectsOf(args),
    sessions: sessionsOf(args),
    detail,
  };
}

// ── Results ───────────────────────────────────────────────────────

/**
 * A tool result's text, whichever shape it arrived in.
 *
 * The SDK streams an MCP result as content blocks, the transcript viewer's maps
 * hold whatever the `.jsonl` had, and a few callers keep a `{ content, isError }`
 * pair — so all three are read here rather than at every call site.
 */
export function wootonResultText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(block => (typeof block === 'string' ? block : (typeof block?.text === 'string' ? block.text : '')))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if ('content' in content) return wootonResultText(content.content);
  }
  return '';
}

/** wooton-mcp.js turns every failure into `Error: <reason>` — see guarded(). */
const ERROR_PREFIX = /^Error:\s*/;

/** `@session:<uuid> — "title" · …` — the row every session list writes. */
const SESSION_TITLE_RE = /@session:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}) — "(.*?)"(?= · |\s*$)/i;

/**
 * What came back, reduced to what the card shows at a glance.
 *
 * The refs are the point: a list call names nothing in its input, and it is the
 * `@session:` / `@project:` markup in the answer that says which projects and
 * sessions it actually touched.
 *
 * @param {unknown} text     the result's text (or content blocks)
 * @param {boolean} [isError] the result block's own flag, when it was kept
 * @returns {{ lines: number, sessions: string[], projects: string[], headline: string,
 *             titles: Record<string, string>, isError: boolean }}
 *          `lines` counts rows with something on them; `titles` maps a session
 *          id to the title its row quoted; `isError` is the flag, or the
 *          server's own `Error:` prefix where a caller lost the flag.
 */
export function summarizeWootonResult(text, isError) {
  const source = wootonResultText(text);
  const rows = source.split('\n').filter(row => row.trim());

  const sessions = [];
  const projects = [];
  const seenSessions = new Set();
  const seenProjects = new Set();
  for (const mention of findMentions(source)) {
    if (mention.kind === 'session') {
      pushUnique(sessions, seenSessions, mention.value, mention.value.toLowerCase());
    } else if (mention.kind === 'project') {
      pushUnique(projects, seenProjects, mention.value);
    }
  }

  const titles = {};
  for (const row of rows) {
    const match = SESSION_TITLE_RE.exec(row);
    if (match && !(match[1] in titles)) titles[match[1]] = match[2];
  }

  let headline = (rows[0] || '').trim();
  const failed = !!isError || ERROR_PREFIX.test(headline);
  if (failed) headline = headline.replace(ERROR_PREFIX, '');

  return { lines: rows.length, sessions, projects, headline, titles, isError: failed };
}
