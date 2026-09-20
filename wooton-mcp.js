// wooton-mcp.js — WootonPad's own management tools, as an in-process MCP server.
//
// The Chat tab is a persistent assistant that manages the application rather
// than a repository: which sessions are running, what they last said, which
// projects are carrying unpushed work, what the account has left to spend. It
// is an Agent SDK session like any other (sdk-session.js), so the only way to
// give it those abilities is a set of MCP tools — and the cheapest MCP server
// is one that lives in this process, where the implementations already are.
//
// Nothing here touches the filesystem or SQLite. Every capability arrives
// through `configure()` from main.js, which already owns the cache, the PTY
// map and the account. That keeps this module a translation layer with one
// job: turn a main-process call into text a model can read, and turn a
// `{ ok: false }` into a tool error.
//
// Output is written for a reader, not a parser. A model that gets 400 lines of
// JSON spends its turn summarising the shape of the data; a model that gets one
// scannable line per session spends it answering the question. The one piece of
// markup that matters is `@session:<uuid>` / `@project:<path>` — the renderer
// turns those into clickable chips, so a session mentioned without its UUID is
// a session the user cannot open.

const { z } = require('zod');
const todoDue = require('./todo-due');

// The SDK ships as ESM and this process is CommonJS — same dynamic import,
// same lazy caching as sdk-session.js. A user who never opens the Chat tab
// never pays for loading it.
let _sdk = null;
async function sdk() {
  if (!_sdk) _sdk = await import('@anthropic-ai/claude-agent-sdk');
  return _sdk;
}

// Injected by main.js. Listed here for the shape only; the real ones are all
// main-process functions — see CLAUDE.md on modules that cannot reach the
// active account for themselves.
let deps = { log: null };

/**
 * Wire in the main-process implementations. Called once from main.js, before
 * the first Chat session starts.
 *
 * @param {object} next  see the deps table in main.js
 */
function configure(next) {
  deps = { ...deps, ...next };
}

const log = {
  info: (m) => deps.log?.info(m),
  warn: (m) => deps.log?.warn(m),
  error: (m) => deps.log?.error(m),
  debug: (m) => deps.log?.debug(m),
};

/**
 * A wired dependency, or a readable failure. A tool the host forgot to wire
 * should say so in the transcript rather than throw a TypeError about calling
 * undefined — the model can then tell the user which ability is missing.
 */
function dep(name) {
  const fn = deps[name];
  if (typeof fn !== 'function') throw new Error(`${name}() is not available in this build of WootonPad`);
  return fn;
}

/** A `{ ok: false, error }` from main.js is a failed tool call, not an exception. */
function ok(result, what) {
  if (!result || result.ok === false) throw new Error(result?.error || `${what} failed`);
  return result;
}

// ── Formatting ────────────────────────────────────────────────────

// Lists are capped rather than truncated silently: the tail of a 500-session
// list is never the answer, but the fact that it was cut sometimes is.
const MAX_ROWS = 60;
const MAX_FILES = 40;
const BODY_CHARS = 300;

/** Renderer markup. Always the full UUID — an abbreviation is not clickable. */
const sessionRef = (id) => `@session:${id}`;
const projectRef = (p) => `@project:${p}`;

// Project paths are POSIX-canonical whatever host we run on (CLAUDE.md rule 1),
// so the last segment is taken by hand instead of through `path`, which would
// read a POSIX path with Windows rules.
const baseName = (p) => String(p || '').split('/').filter(Boolean).pop() || String(p || '');

function toMs(value) {
  if (!value) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * "4m ago", "2d ago", "in 3h". Relative by default because the question behind
 * almost every one of these tools is "recently?", not "at what o'clock?" — a
 * caller who asked about wall-clock time gets the ISO stamp spelled out instead.
 */
function relativeTime(value) {
  const ms = toMs(value);
  if (ms === null) return 'unknown';
  const delta = Date.now() - ms;
  const abs = Math.abs(delta);
  if (abs < 10_000) return 'just now';
  let text;
  if (abs < 60_000) text = `${Math.round(abs / 1000)}s`;
  else if (abs < 3_600_000) text = `${Math.round(abs / 60_000)}m`;
  else if (abs < 86_400_000) text = `${Math.round(abs / 3_600_000)}h`;
  else if (abs < 7 * 86_400_000) text = `${Math.round(abs / 86_400_000)}d`;
  else text = `${Math.round(abs / (7 * 86_400_000))}w`;
  return delta >= 0 ? `${text} ago` : `in ${text}`;
}

/** Message bodies are collapsed to a single line so one message is one row. */
function oneLine(text, max = BODY_CHARS) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return '(empty)';
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const quoted = (title) => `"${oneLine(title || '(untitled)', 80)}"`;

function cappedRows(rows, cap = MAX_ROWS) {
  if (rows.length <= cap) return rows;
  return [...rows.slice(0, cap), `… and ${rows.length - cap} more`];
}

const capped = (rows, cap = MAX_ROWS) => cappedRows(rows, cap).join('\n');

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

function projectLine(p) {
  const bits = [
    p.name || baseName(p.projectPath),
    `${p.sessionCount ?? 0} sessions`,
    p.lastActivity ? relativeTime(p.lastActivity) : 'no activity',
  ];
  if (p.changedCount) bits.push(`${p.changedCount} changed`);
  if (p.unpushedCount) bits.push(`${p.unpushedCount} unpushed`);
  if (p.isGroup) bits.push('group folder');
  return `${projectRef(p.projectPath)} — ${bits.join(' · ')}`;
}

function sessionLine(s) {
  const bits = [
    s.projectName || baseName(s.projectPath),
    relativeTime(s.modified),
    s.status || (s.running ? 'running' : 'idle'),
  ];
  if (s.messageCount) bits.push(`${s.messageCount} msgs`);
  if (s.group?.name) bits.push(`group "${s.group.name}"`);
  if (s.starred) bits.push('starred');
  if (s.archived) bits.push('archived');
  return `${sessionRef(s.sessionId)} — ${quoted(s.title)} · ${bits.join(' · ')}`;
}

const messageLine = (m, indent = '') =>
  `${indent}${m.role} · ${relativeTime(m.ts)}: ${oneLine(m.text)}`;

// ── Server instructions ───────────────────────────────────────────

const INSTRUCTIONS = `You are the assistant built into WootonPad, a desktop app that runs and
organises Claude Code sessions across the user's projects. You manage that
workspace: you start, inspect, steer, stop and tidy sessions, group projects
into shared tasks, track git state and TODO notes. You do not write code
yourself — when work needs doing in a repository, start a session for it and
watch it, because that session is the thing that edits files.

Containers: list_containers shows what is running, stop_containers stops it.
Three modes, and they are not the same thing — "stop" is reversible, "down"
removes the containers and their network, "purge" also deletes volumes and
images, which means data. When the user says "stop the containers" without
saying how far, ask them which of the three they mean rather than picking.

You can hand things to the rest of the machine: open_url puts a link in the
browser, open_in_app opens a file or a project in an editor the user names,
open_folder shows it in Finder, and open_terminal gives them a shell in a
folder. Those four act on the user's desktop rather than inside WootonPad, so
they ask before running unless the user has said otherwise in Settings.

You can look inside a project one file at a time — list_project_files, then
read_project_file — for quick informational questions: a README, a CLAUDE.md, a
manifest. Anything deeper than two or three files is a research session.

When you mention a session in prose, write its full id as @session:<uuid>, and
write a project as @project:<absolute path>. WootonPad renders both as chips the
user can click to open; a session named without that markup is one they cannot
reach. Every session gets the full id — archived ones and long lists included;
never shorten it to the first eight characters. Use the markup inline, in
ordinary sentences — "@session:… is still waiting on a permission prompt" — not
as a separate list of links.

TODO notes carry due dates: a whole list can have one, and each item its own
(an item without one is due with its list). For "what should I do", "what
first", "what is overdue" call todo_agenda — it is already in order, overdue
first — and answer in that order. Tool output states today's date; use it for
"tomorrow" and weekdays rather than guessing. A list whose items are all done
is finished, not late, whatever its date says; offer to archive it.

delete_session destroys a transcript permanently and nothing can bring it back.
Never call it on your own initiative: describe exactly which sessions you would
delete, in plain language, and wait for the user to say yes.`;

// ── Due dates ─────────────────────────────────────────────────────
//
// Dates go out with the words already worked out — "2d overdue", "tomorrow" —
// and with today stated at the top, so the model never does calendar
// arithmetic of its own. The rules are todo-due.js's, the same the sidebar
// colours its chips by.

const AGENDA_HEADINGS = {
  overdue: 'Overdue',
  today: 'Due today',
  tomorrow: 'Due tomorrow',
  week: 'This week',
  later: 'Later',
  none: 'No date',
};

function todayLine(today) {
  return `Today is ${today} (${todoDue.weekday(today)}).`;
}

/**
 * "2026-09-20 (tomorrow)", "2026-09-17 (2d overdue) ⚠️". Done, it is only the
 * date: a finished item is never late, and "5d overdue" beside it would say
 * otherwise.
 */
function dueText(due, today, done = false) {
  if (done) return due;
  const label = todoDue.dueLabel(due, today);
  const late = todoDue.dueStatus(due, today) === 'overdue';
  return `${due}${label && label !== due ? ` (${label})` : ''}${late ? ' ⚠️' : ''}`;
}

/** A date as a model wrote it, or a tool error saying what it accepts. */
function resolveDue(input, today) {
  if (input == null) return null;
  const result = todoDue.resolveDueInput(input, today);
  if (!result.ok) throw new Error(result.error);
  return result.due;
}

// ── Tools ─────────────────────────────────────────────────────────

// Specs rather than direct `tool()` calls: `tool` only exists after the ESM
// import resolves, and TOOL_NAMES has to be readable synchronously so main.js
// can build `allowedTools` before any of this loads.
const SPECS = [
  // ── Read ──
  {
    name: 'list_projects',
    description: 'Every project WootonPad knows about, with its session count, last activity and git state. Start here when the user names a project you have not seen yet.',
    schema: {
      search: z.string().optional().describe('Case-insensitive filter over project name and path.'),
    },
    async handler({ search }) {
      const needle = String(search || '').trim().toLowerCase();
      let projects = dep('listProjects')() || [];
      if (needle) {
        projects = projects.filter(p => `${p.name || ''} ${p.projectPath}`.toLowerCase().includes(needle));
      }
      if (!projects.length) return needle ? `No project matches "${search}".` : 'No projects yet.';
      return capped(projects.map(projectLine));
    },
  },

  {
    name: 'list_sessions',
    description: 'Sessions, newest first — archived ones included and marked, because users archive what they have finished, and "what did I work on" means those too. Narrow with projectPath, activeWithinSeconds, or scope: "all" (default), "active" (running now), "open" (not archived), "archived" (only archived), "groups" (multi-project sessions only).',
    schema: {
      projectPath: z.string().optional().describe('Absolute project path; omit for every project.'),
      limit: z.number().int().optional().describe('How many sessions to return (default 20).'),
      scope: z.enum(['all', 'recent', 'active', 'open', 'archived', 'groups']).optional()
        .describe('"all" (default, archived included) · "recent" same as all · "active" running now · "open" not archived · "archived" only archived · "groups" group sessions.'),
      activeWithinSeconds: z.number().int().optional().describe('Only sessions touched in the last N seconds.'),
    },
    async handler({ projectPath, limit, scope, activeWithinSeconds }) {
      const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
      // Archived by default: an archived session is a finished one, not a
      // deleted one, and leaving them out answered "what did I work on this
      // week" with only whatever happened to still be open.
      const query = { projectPath: projectPath || undefined, limit: take, includeArchived: scope !== 'open' };
      if (scope === 'active') query.activeOnly = true;
      if (scope === 'archived') query.archivedOnly = true;
      if (scope === 'groups') query.groupsOnly = true;
      // sinceMs is a cutoff instant, not a duration — the caller thinks in
      // "the last ten minutes", the cache thinks in timestamps.
      if (activeWithinSeconds) query.sinceMs = Date.now() - activeWithinSeconds * 1000;

      const sessions = dep('listSessions')(query) || [];
      if (!sessions.length) return 'No sessions match.';
      return capped(sessions.map(sessionLine), take);
    },
  },

  {
    name: 'read_session',
    description: 'The tail of one session\'s transcript — the last N messages, oldest first. Use it to find out what a session actually did or where it stopped.',
    schema: {
      sessionId: z.string().describe('Session UUID.'),
      limit: z.number().int().optional().describe('How many messages from the end (default 20).'),
    },
    async handler({ sessionId, limit }) {
      const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const messages = await dep('readSessionMessages')(sessionId, { limit: take }) || [];
      if (!messages.length) return `${sessionRef(sessionId)} has no messages yet.`;
      const head = `${sessionRef(sessionId)} — last ${messages.length} message(s), oldest first:`;
      return [head, ...messages.map(m => messageLine(m))].join('\n');
    },
  },

  {
    name: 'peek_active_sessions',
    description: 'The tail of every session running right now, in one call. This is the answer to "what is everything doing", "is anything stuck" and "did that finish".',
    schema: {
      messagesPerSession: z.number().int().optional().describe('Trailing messages per session (default 3).'),
    },
    async handler({ messagesPerSession }) {
      const take = Math.min(Math.max(Number(messagesPerSession) || 3, 1), 20);
      const sessions = await dep('activeSessionsTail')({ limit: take }) || [];
      if (!sessions.length) return 'Nothing is running right now.';
      const blocks = sessions.map((s) => {
        const head = `${sessionRef(s.sessionId)} — ${quoted(s.title)} · ${baseName(s.projectPath)} · ${s.status || 'running'}`;
        const body = (s.messages || []).map(m => messageLine(m, '  '));
        return [head, ...(body.length ? body : ['  (no messages yet)'])].join('\n');
      });
      // Blank line between blocks: each one is already several lines, and run
      // together they read as a single wall.
      return cappedRows(blocks, 25).join('\n\n');
    },
  },

  {
    name: 'search_sessions',
    description: 'Find sessions by text, archived ones included (and marked). Titles only by default, which is fast and usually enough; set titleOnly false for a full-text search of transcripts.',
    schema: {
      query: z.string().describe('What to look for.'),
      titleOnly: z.boolean().optional().describe('Search titles only (default true).'),
    },
    async handler({ query, titleOnly }) {
      const hits = await dep('searchSessions')(query, { titleOnly: titleOnly !== false }) || [];
      if (!hits.length) return `Nothing matches "${query}".`;
      return capped(hits.map((h) => {
        const bits = [baseName(h.projectPath), relativeTime(h.modified)];
        if (h.archived) bits.push('archived');
        const snippet = h.snippet ? ` — ${oneLine(h.snippet, 140)}` : '';
        return `${sessionRef(h.sessionId)} — ${quoted(h.title)} · ${bits.join(' · ')}${snippet}`;
      }));
    },
  },

  {
    name: 'list_groups',
    description: 'Project groups: named sets of repositories that share a working folder, as created by create_group_session.',
    schema: {},
    async handler() {
      const groups = dep('listGroups')() || [];
      if (!groups.length) return 'No groups yet.';
      return groups.map((g) => {
        const head = `group ${g.id} — ${quoted(g.name)} · ${(g.projects || []).length} projects · created ${relativeTime(g.created)}`;
        const members = (g.projects || []).map(p => `  ${projectRef(p)}`);
        return [head, ...members].join('\n');
      }).join('\n\n');
    },
  },

  {
    name: 'git_status',
    description: 'Branch, ahead/behind counts and the changed files of one project.',
    schema: {
      projectPath: z.string().describe('Absolute project path.'),
    },
    async handler({ projectPath }) {
      const status = dep('projectGitStatus')(projectPath);
      if (!status) throw new Error('no git information for that project');
      if (status.error) throw new Error(status.error);
      const bits = [
        `branch ${status.branch || 'unknown'}`,
        `${status.changedCount ?? 0} changed`,
        `${status.unpushedCount ?? 0} unpushed`,
      ];
      if (status.ahead || status.behind) bits.push(`ahead ${status.ahead || 0} / behind ${status.behind || 0}`);
      const head = `${projectRef(projectPath)} — ${bits.join(' · ')}`;
      const files = (status.files || []).map(f => `  ${f.status} ${f.path}`);
      return files.length ? [head, capped(files, MAX_FILES)].join('\n') : head;
    },
  },

  {
    name: 'unpushed_work',
    description: 'Every project carrying uncommitted changes or commits that have not been pushed — work that would be lost or forgotten. No arguments.',
    schema: {},
    async handler() {
      const projects = dep('projectsWithUnpushed')() || [];
      if (!projects.length) return 'Every project is clean and pushed.';
      return capped(projects.map((p) => {
        const bits = [p.name || baseName(p.projectPath), `branch ${p.branch || 'unknown'}`];
        if (p.changedCount) bits.push(`${p.changedCount} changed`);
        if (p.unpushedCount) bits.push(`${p.unpushedCount} unpushed`);
        return `${projectRef(p.projectPath)} — ${bits.join(' · ')}`;
      }));
    },
  },

  {
    name: 'account_limits',
    description: 'How much of the account\'s five-hour and weekly usage allowance is spent, and when each window resets. No arguments.',
    schema: {},
    async handler() {
      const limits = await dep('accountLimits')();
      if (!limits) return 'This account reports no usage limits.';
      // `percent` is how much of the window is spent, 0–100. `resetsAt` is
      // epoch millis. `stale` means this is the last reading the app saw, not
      // one taken just now — the CLI only reports limits during a turn.
      const windowLine = (label, w) => {
        if (!w || typeof w.percent !== 'number') return `${label}: not reported`;
        const resets = w.resetsAt ? ` · resets ${relativeTime(new Date(w.resetsAt).toISOString())}` : '';
        return `${label}: ${Math.round(w.percent)}% used${resets}`;
      };
      const lines = [windowLine('5-hour', limits.fiveHour), windowLine('7-day', limits.sevenDay)];
      if (limits.updatedAt) lines.push(`(as of ${relativeTime(new Date(limits.updatedAt).toISOString())})`);
      return lines.join('\n');
    },
  },

  {
    name: 'list_todos',
    description: 'The user\'s TODO notes with their checklist items, progress and due dates, soonest due first. Each item\'s index is what toggle_todo and set_todo_due take. Archived notes are left out unless asked for. For "what to do next" use todo_agenda instead.',
    schema: {
      includeArchived: z.boolean().optional().describe('Also list notes the user archived (default false).'),
    },
    async handler({ includeArchived }) {
      const notes = dep('listTodos')({ includeArchived: !!includeArchived }) || [];
      const today = todoDue.localToday();
      if (!notes.length) return 'No TODO notes.';
      return [todayLine(today), ...notes.map((n) => {
        const todos = n.todos || [];
        const done = todos.filter(t => t.done).length;
        const bits = [];
        if (n.archived) bits.push('archived');
        if (todos.length) bits.push(`${done}/${todos.length} done`);
        if (n.due) bits.push(`list due ${dueText(n.due, today, todos.length > 0 && done === todos.length)}`);
        bits.push(`edited ${relativeTime(n.modified)}`);
        const attached = (n.projects || []).map(p => projectRef(p)).join(' ');
        const head = `${n.filename} — ${quoted(n.title)} · ${bits.join(' · ')}${attached ? ` · ${attached}` : ''}`;
        const items = todos.map(t => `  [${t.done ? 'x' : ' '}] ${t.index} ${oneLine(t.text, 120)}`
          + (t.due ? ` · due ${dueText(t.due, today, t.done)}` : ''));
        return [head, ...cappedRows(items, 20)].join('\n');
      })].join('\n\n');
    },
  },

  {
    name: 'todo_agenda',
    description: 'Every open TODO item across all notes, most pressing first: overdue (oldest first), today, tomorrow, this week, later, then undated. An item without its own date is due with its list. The answer to "what should I do", "what first", "what is overdue", "what is due this week".',
    schema: {
      withinDays: z.number().int().min(0).max(366).optional()
        .describe('Only items due within this many days from today (overdue always included). Omit for everything.'),
      includeUndated: z.boolean().optional()
        .describe('Also list open items with no date, after the dated ones. Default: true, or false when withinDays is set.'),
      projectPath: z.string().optional().describe('Only notes attached to this absolute project path.'),
    },
    async handler({ withinDays, includeUndated, projectPath }) {
      const notes = dep('listTodos')() || [];
      const today = todoDue.localToday();
      const items = todoDue.agenda(notes, today, {
        withinDays, includeUndated: includeUndated ?? withinDays == null, project: projectPath,
      });
      if (!items.length) return `${todayLine(today)}\nNothing open${withinDays != null ? ` due within ${withinDays} days` : ''}.`;

      const count = (bucket) => items.filter(i => todoDue.agendaBucket(i.days) === bucket).length;
      const summary = [`${items.length} open`];
      if (count('overdue')) summary.push(`${count('overdue')} overdue`);
      if (count('today')) summary.push(`${count('today')} due today`);

      const out = [`${todayLine(today)} ${summary.join(' · ')}.`];
      let current = null;
      for (const item of items.slice(0, MAX_ROWS)) {
        const bucket = todoDue.agendaBucket(item.days);
        if (bucket !== current) {
          current = bucket;
          out.push('', `${AGENDA_HEADINGS[bucket]}:`);
        }
        const when = item.due ? ` · due ${dueText(item.due, today)}${item.inherited ? ' (list deadline)' : ''}` : '';
        const attached = item.projects.map(p => projectRef(p)).join(' ');
        out.push(`  ${item.filename}#${item.index} — ${oneLine(item.text, 120)}${when} · in ${quoted(item.title)}${attached ? ` · ${attached}` : ''}`);
      }
      if (items.length > MAX_ROWS) out.push(`… and ${items.length - MAX_ROWS} more`);
      return out.join('\n');
    },
  },

  // ── Look inside a project, one file at a time ──
  //
  // Enough to answer "what is this project" or "what stack is it on" without
  // starting a session for it: a README, a CLAUDE.md, a manifest. One level of
  // one directory, one file per call, capped in size — reading a codebase is a
  // session's job, and the descriptions say so.
  {
    name: 'list_project_files',
    description: 'One directory of a project: its files and folders, one level, no recursion. Use it to find the README, CLAUDE.md, a manifest (package.json, go.mod, composer.json, Cargo.toml) or a docs folder before reading it. Not for exploring a codebase — a deep look belongs to a research session.',
    schema: {
      projectPath: z.string().describe('Absolute project path, as list_projects gives it.'),
      dir: z.string().optional().describe('Directory inside the project, relative to its root. Omit for the root.'),
    },
    async handler({ projectPath, dir }) {
      const res = ok(await dep('listProjectFiles')(projectPath, dir || ''), 'list_project_files');
      const rows = (res.entries || []).map(e => (e.dir ? `${e.name}/` : `${e.name}  ${formatSize(e.size)}`));
      const head = `${projectRef(projectPath)} ${res.dir ? `${res.dir}/` : '(root)'} — ${rows.length} entries`;
      return rows.length ? [head, capped(rows, 200)].join('\n') : `${head}\n(empty)`;
    },
  },

  {
    name: 'read_project_file',
    description: 'Read one text file of a project — a README, CLAUDE.md, a manifest, a config, a single source file — up to 64 KB. For quick informational answers: what a project does, what it is built with, how it is run. Secrets (.env, keys) are refused. If the answer needs more than two or three files, or tracing code, offer the user a research session instead of reading on.',
    schema: {
      projectPath: z.string().describe('Absolute project path, as list_projects gives it.'),
      path: z.string().describe('File path relative to the project root, e.g. README.md or docs/setup.md.'),
    },
    async handler({ projectPath, path }) {
      const res = ok(await dep('readProjectFile')(projectPath, path), 'read_project_file');
      const size = res.truncated ? ` · first ${formatSize(res.bytes)} of ${formatSize(res.size)}` : '';
      return `${projectRef(projectPath)} ${res.path} — ${res.lines} lines${size}\n\n${res.content}`;
    },
  },

  // ── Containers ──
  {
    name: 'list_containers',
    description: 'Docker containers and the load they put on the machine: which are running, for how long, CPU and memory each, and totals against Docker\'s memory ceiling. Compose containers are linked to their project. Answers "what is still running", "what is eating memory", "can I stop something". Running only by default; all=true adds stopped ones.',
    schema: {
      all: z.boolean().optional().describe('Include stopped containers (default false).'),
      projectPath: z.string().optional().describe('Only containers started from this project.'),
    },
    async handler({ all, projectPath }) {
      const res = ok(await dep('listContainers')({ all: !!all }), 'list_containers');
      let rows = res.containers || [];
      if (projectPath) rows = rows.filter(c => c.projectPath === projectPath);
      const t = res.totals || {};
      const ceiling = t.memLimitBytes ? ` of ${formatSize(t.memLimitBytes)}` : '';
      const head = `${t.running || 0} running${all ? ` · ${t.stopped || 0} stopped` : ''} · CPU ${t.cpu || 0}% · RAM ${formatSize(t.memBytes)}${ceiling}`;
      if (!rows.length) return `${head}\n(no containers${projectPath ? ' for that project' : ''})`;
      const lines = rows.map((c) => {
        const bits = [c.service ? `${c.service} · ${c.image}` : c.image, c.status];
        if (c.state === 'running') {
          bits.push(`CPU ${c.cpu ?? 0}%`, `RAM ${formatSize(c.memBytes)}${c.memPercent ? ` (${c.memPercent}%)` : ''}`);
          if (c.ports) bits.push(oneLine(c.ports, 60));
        }
        if (c.projectPath) bits.push(projectRef(c.projectPath));
        return `${c.name} — ${bits.join(' · ')}`;
      });
      return [head, capped(lines, 50)].join('\n');
    },
  },

  // ── Write ──
  {
    name: 'create_session',
    description: 'Start a new Claude Code session in one project. Give it a prompt to have it begin work immediately, or leave the prompt out to open an empty session for the user.',
    schema: {
      projectPath: z.string().describe('Absolute project path.'),
      prompt: z.string().optional().describe('First message for the session.'),
      name: z.string().optional().describe('Title to show in the sidebar.'),
    },
    async handler({ projectPath, prompt, name }) {
      const result = ok(await dep('createSession')({ projectPath, prompt, name }), 'create_session');
      return `Started ${sessionRef(result.sessionId)} in ${projectRef(projectPath)}${prompt ? ' with your prompt' : ' (no prompt sent)'}.`;
    },
  },

  {
    name: 'create_group_session',
    description: 'Start one session that works across several repositories at once. WootonPad creates a shared working folder linking the projects, so the session can read and change all of them in a single conversation. Use this whenever a task spans more than one repo — a schema change and its clients, a rename across services — instead of starting one session per project and coordinating them by hand.',
    schema: {
      projects: z.array(z.string()).min(2).describe('Absolute project paths; at least two.'),
      prompt: z.string().optional().describe('First message for the session.'),
      name: z.string().optional().describe('Title for the session and its group.'),
    },
    async handler({ projects, prompt, name }) {
      const result = ok(await dep('createGroupSession')({ projects, prompt, name }), 'create_group_session');
      const members = (result.projects || projects).map(p => `  ${projectRef(p)}`);
      const head = `Started ${sessionRef(result.sessionId)} across ${members.length} projects (group ${result.groupId}):`;
      const tail = result.groupDir ? `Shared working folder: ${result.groupDir}` : null;
      return [head, ...members, tail].filter(Boolean).join('\n');
    },
  },

  {
    name: 'send_to_session',
    description: 'Queue a message into a running session, exactly as if the user had typed it. It is answered after the current turn finishes.',
    schema: {
      sessionId: z.string().describe('Session UUID.'),
      text: z.string().describe('What to say to that session.'),
    },
    async handler({ sessionId, text }) {
      ok(await dep('sendToSession')(sessionId, text), 'send_to_session');
      return `Queued for ${sessionRef(sessionId)}: ${oneLine(text, 160)}`;
    },
  },

  {
    name: 'stop_session',
    description: 'End a running session\'s process. The transcript is kept and the session can be resumed later — this only stops it working now.',
    schema: {
      sessionId: z.string().describe('Session UUID.'),
    },
    async handler({ sessionId }) {
      ok(await dep('stopSession')(sessionId), 'stop_session');
      return `Stopped ${sessionRef(sessionId)}. Its transcript is intact and it can be resumed.`;
    },
  },

  {
    name: 'archive_session',
    description: 'Hide a session from the sidebar without deleting anything. Pass archived false to bring it back.',
    schema: {
      sessionId: z.string().describe('Session UUID.'),
      archived: z.boolean().optional().describe('Archive (default true) or restore (false).'),
    },
    async handler({ sessionId, archived }) {
      const on = archived !== false;
      ok(dep('archiveSession')(sessionId, on), 'archive_session');
      return `${on ? 'Archived' : 'Restored'} ${sessionRef(sessionId)}.`;
    },
  },

  {
    name: 'delete_session',
    description: 'DESTRUCTIVE AND IRREVERSIBLE: permanently deletes a session and its entire transcript from disk. There is no undo, no trash and no backup — the conversation is gone. Never call this on your own judgement or as tidying-up. Tell the user in plain language exactly which session you would delete, quoting its title, and call this only after they have explicitly agreed to that specific deletion. If the user only wants it out of the way, use archive_session instead.',
    schema: {
      sessionId: z.string().describe('Session UUID the user has explicitly agreed to delete.'),
    },
    async handler({ sessionId }) {
      ok(await dep('deleteSession')(sessionId), 'delete_session');
      return `Deleted session ${sessionId} permanently.`;
    },
  },

  {
    name: 'set_group_projects',
    description: 'Replace the set of projects in an existing group. Pass the full list, not just the additions.',
    schema: {
      groupId: z.string().describe('Group id from list_groups.'),
      projects: z.array(z.string()).describe('The complete list of absolute project paths the group should contain.'),
    },
    async handler({ groupId, projects }) {
      const result = ok(dep('setGroupProjects')(groupId, projects), 'set_group_projects');
      const members = (result.group?.projects || projects).map(p => `  ${projectRef(p)}`);
      return [`Group ${groupId} now holds ${members.length} projects:`, ...members].join('\n');
    },
  },

  {
    name: 'stop_containers',
    description: 'Stop a project\'s Docker containers. mode: "stop" leaves everything in place and only stops them; "down" stops and removes the containers, their network and orphans; "purge" is "down" plus its volumes and images — data in those volumes is gone. Ask the user which they want before a "down" or a "purge"; "stop" is the one that costs nothing to undo.',
    schema: {
      projectPath: z.string().describe('Absolute path of the project whose compose file this is.'),
      mode: z.enum(['stop', 'down', 'purge']).optional().describe('"stop" (default) · "down" removes containers and orphans · "purge" also removes volumes and images.'),
    },
    async handler({ projectPath, mode }) {
      const res = await dep('stopContainers')({ projectPath, mode: mode || 'stop' });
      if (!res?.ok) return `Could not do it: ${res?.error || 'unknown error'}`;
      const said = res.output ? `\n${oneLine(res.output, 300)}` : '';
      return `${res.ran}${said}`;
    },
  },

  // ── The user's machine ──
  //
  // Everything here hands something to another program and returns; none of it
  // reads anything back. They ask before running by default (tool-policy.js):
  // a window opening unasked is startling, and a URL opening unasked is worse.

  {
    name: 'open_url',
    description: 'Open a link in the user\'s browser. http and https only. Use it when the user asks to open a page, a pull request, a dashboard.',
    schema: {
      url: z.string().describe('Absolute http(s) URL.'),
    },
    async handler({ url }) {
      const res = await dep('openUrl')(String(url || '').trim());
      return res?.ok ? `Opened ${url}` : `Could not open it: ${res?.error || 'unknown error'}`;
    },
  },

  {
    name: 'open_in_app',
    description: 'Open a file or folder in an editor or another application — "open src/main.js in Zed", "open this project in PhpStorm". Name the application as the user says it (Zed, PhpStorm, WebStorm, VS Code, Cursor, Sublime Text, Finder); omit it for whatever the system opens that file with.',
    schema: {
      path: z.string().describe('Absolute path to the file or folder.'),
      app: z.string().optional().describe('Application name, as a person would say it. Omit for the system default.'),
      line: z.number().int().optional().describe('Line to put the caret on, where the editor supports it.'),
    },
    async handler({ path: target, app: appName, line }) {
      const res = await dep('openInApp')({ path: String(target || '').trim(), app: appName, line });
      if (!res?.ok) return `Could not open it: ${res?.error || 'unknown error'}`;
      return `Opened ${target}${res.app ? ` in ${res.app}` : ''}${line ? ` at line ${line}` : ''}`;
    },
  },

  {
    name: 'open_folder',
    description: 'Show a folder in the file manager (Finder on macOS). Given a file, its folder is opened with the file selected.',
    schema: {
      path: z.string().describe('Absolute path to a folder, or to a file inside the folder to show.'),
    },
    async handler({ path: target }) {
      const res = await dep('openFolder')(String(target || '').trim());
      return res?.ok ? `Opened ${res.opened || target}` : `Could not open it: ${res?.error || 'unknown error'}`;
    },
  },

  {
    name: 'open_terminal',
    description: 'Open a terminal session in WootonPad in a folder — a plain shell, not a Claude session. Use it when the user wants to run something themselves.',
    schema: {
      path: z.string().describe('Absolute path the shell starts in.'),
      name: z.string().optional().describe('What to call the session in the sidebar.'),
    },
    async handler({ path: target, name }) {
      const res = await dep('openTerminal')({ path: String(target || '').trim(), name });
      return res?.ok ? `Opened a terminal in ${target}` : `Could not open it: ${res?.error || 'unknown error'}`;
    },
  },

  {
    name: 'create_todo',
    description: 'Write a TODO note. Checklist lines in the body ("- [ ] thing") become toggleable items; an item gets its own date with " due:YYYY-MM-DD" at the end of its line. `due` is the deadline of the whole list. Attach project paths so the note surfaces alongside that work.',
    schema: {
      title: z.string().describe('Note title.'),
      body: z.string().optional().describe('Markdown body; "- [ ] item" lines become checklist items, "- [ ] item due:2026-09-20" one with its own date.'),
      projects: z.array(z.string()).optional().describe('Absolute project paths this note belongs to.'),
      due: z.string().optional().describe('Deadline for the whole list: YYYY-MM-DD, today, tomorrow, +3d, +2w or a weekday.'),
    },
    async handler({ title, body, projects, due }) {
      const today = todoDue.localToday();
      const date = resolveDue(due, today);
      const result = ok(dep('createTodo')({ title, body, projects, due: date }), 'create_todo');
      const attached = (projects || []).map(p => projectRef(p)).join(' ');
      const when = date ? ` · due ${dueText(date, today)}` : '';
      return `Created note ${result.filename} — ${quoted(title)}${when}${attached ? ` · ${attached}` : ''}`;
    },
  },

  {
    name: 'toggle_todo',
    description: 'Tick or untick one checklist item. Take the filename and the item index from list_todos — the index is per note and shown beside each item.',
    schema: {
      filename: z.string().describe('Note filename from list_todos.'),
      index: z.number().int().describe('Item index within that note.'),
    },
    async handler({ filename, index }) {
      ok(dep('toggleTodo')(filename, index), 'toggle_todo');
      return `Toggled item ${index} in ${filename}.`;
    },
  },

  {
    name: 'archive_todo',
    description: 'Put a TODO note away, or bring it back. Archived notes leave every list and the agenda but stay on disk. For lists that are finished or no longer wanted.',
    schema: {
      filename: z.string().describe('Note filename.'),
      archived: z.boolean().optional().describe('false brings it back. Default true.'),
    },
    async handler({ filename, archived }) {
      const put = archived !== false;
      ok(dep('archiveTodo')(filename, put), 'archive_todo');
      return put ? `Archived ${filename}.` : `${filename} is back in the list.`;
    },
  },

  {
    name: 'set_todo_due',
    description: 'Set, move or clear a due date. With an index: that item\'s own date. Without: the whole list\'s deadline, which items without a date of their own follow. Filename and index from list_todos or todo_agenda.',
    schema: {
      filename: z.string().describe('Note filename.'),
      index: z.number().int().optional().describe('Item index within that note; omit for the whole list.'),
      due: z.string().describe('YYYY-MM-DD, today, tomorrow, +3d, +2w, a weekday — or "none" to clear.'),
    },
    async handler({ filename, index, due }) {
      const today = todoDue.localToday();
      const date = resolveDue(due, today);
      ok(dep('setTodoDue')(filename, index ?? null, date), 'set_todo_due');
      const what = index == null ? `List ${filename}` : `Item ${index} in ${filename}`;
      return date ? `${what} is now due ${dueText(date, today)}.` : `${what} has no due date now.`;
    },
  },
];

/** Bare tool names, for `allowedTools` — the SDK prefixes them with `mcp__wooton__`. */
const TOOL_NAMES = SPECS.map(s => s.name);

/**
 * Tools that only look. The dev panel in Settings runs these against the live
 * app; the rest change something — start a session, archive one, write a
 * note — and are not a thing to fire from a debugging form.
 */
const READ_ONLY_TOOLS = new Set([
  'list_projects', 'list_sessions', 'read_session', 'peek_active_sessions', 'search_sessions',
  'list_groups', 'git_status', 'unpushed_work', 'account_limits', 'list_todos', 'todo_agenda',
  'list_project_files', 'read_project_file', 'list_containers',
]);

/** One parameter row, from the JSON Schema zod derives for a tool's input. */
function paramRows(shape) {
  let schema;
  try { schema = z.toJSONSchema(z.object(shape)); } catch { return []; }
  const required = new Set(schema.required || []);
  return Object.entries(schema.properties || {}).map(([name, prop]) => {
    let type = prop.type || 'any';
    if (Array.isArray(prop.enum)) type = prop.enum.map(v => JSON.stringify(v)).join(' | ');
    else if (type === 'array') type = `${prop.items?.type || 'any'}[]`;
    return { name, type, required: required.has(name), description: prop.description || '' };
  });
}

/**
 * Every tool, as the model sees it: name, description and parameters. For the
 * Settings panel in development builds — the one place the whole toolset is
 * visible at once, rather than inferred from what the assistant happened to
 * call.
 */
function describeTools() {
  return SPECS.map(spec => ({
    name: spec.name,
    fullName: `mcp__wooton__${spec.name}`,
    description: spec.description,
    readOnly: READ_ONLY_TOOLS.has(spec.name),
    params: paramRows(spec.schema),
  }));
}

/**
 * Run one tool directly, outside any session — the same handler, the same
 * argument validation and the same text the model would get back. For
 * debugging what a tool returns without spending a turn to find out.
 */
async function runTool(name, args) {
  const spec = SPECS.find(s => s.name === name);
  if (!spec) return { ok: false, error: `No such tool: ${name}` };
  let parsed;
  try {
    parsed = z.object(spec.schema).parse(args || {});
  } catch (err) {
    return { ok: false, error: `Invalid arguments: ${err.message}` };
  }
  const started = Date.now();
  const result = await guarded(name, spec.handler)(parsed);
  return {
    ok: true,
    text: result.content?.map(c => c.text || '').join('\n') || '',
    isError: !!result.isError,
    ms: Date.now() - started,
  };
}

/**
 * One try/catch for every handler instead of one inside each: the rule is the
 * same everywhere — a thrown Error, a missing dependency and an `{ ok: false }`
 * all become the same tool error, and the model sees the reason rather than a
 * dead turn.
 */
function guarded(name, handler) {
  return async (args) => {
    try {
      const text = await handler(args || {});
      return { content: [{ type: 'text', text: text || '(nothing to report)' }] };
    } catch (err) {
      log.warn(`[wooton-mcp] ${name} failed: ${err.message}`);
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  };
}

/**
 * A fresh MCP server to hand to `query()`'s `options.mcpServers`.
 *
 * Not cached: an SDK server instance binds to exactly one transport, and the
 * Chat session is restarted — on an account switch, after a stop — with the
 * previous one still holding it. The tools themselves are stateless, so a new
 * instance per session costs nothing but the zod schemas.
 *
 * @returns {Promise<object>} McpSdkServerConfigWithInstance
 */
async function wootonMcpServer() {
  const { createSdkMcpServer, tool } = await sdk();
  const server = createSdkMcpServer({
    name: 'wooton',
    version: '1.0.0',
    instructions: INSTRUCTIONS,
    // Never deferred behind tool search. These are the assistant's whole job;
    // making it look them up first costs a round trip on every conversation
    // for tools it was always going to use.
    alwaysLoad: true,
    tools: SPECS.map(spec => tool(spec.name, spec.description, spec.schema, guarded(spec.name, spec.handler))),
  });
  log.info(`[wooton-mcp] server ready with ${TOOL_NAMES.length} tools`);
  return server;
}

module.exports = {
  configure,
  wootonMcpServer,
  describeTools,
  runTool,
  TOOL_NAMES,
  READ_ONLY_TOOLS,
  INSTRUCTIONS,
  // exported for tests
  relativeTime,
};
