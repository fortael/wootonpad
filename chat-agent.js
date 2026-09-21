// chat-agent.js — the Chat tab's persistent assistant.
//
// An ordinary Agent SDK session in every respect that matters: same CLI, same
// transcript format, same chat view, same permission dialog. What sets it apart
// is where it runs and what it can reach. It lives in its own folder under the
// account's Claude home (hidden from the project list — see session-cache.js)
// and it is handed WootonPad's management tools as an in-process MCP server
// (wooton-mcp.js), so its job is the workspace rather than a repository.
//
// "Persistent" means one conversation per account that survives a restart: the
// session id is remembered and resumed, rather than a fresh chat every launch.
// Starting over is an explicit act — `reset()` — because the value of this chat
// is that it remembers what you asked it yesterday.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let deps = {
  log: null,
  /** () => string — the manager chat's working directory for the active account. */
  chatDir: () => null,
  /** () => string — `projects/` under the active account's Claude home. */
  projectsDir: () => null,
  /** () => string — active account id, so each account keeps its own chat. */
  accountId: () => 'default',
  /** (key) => any */
  getSetting: () => null,
  /** (key, value) => void */
  setSetting: () => {},
  /** (projectPath) => string — `~/.claude/projects/<folder>` name for a path. */
  encodeProjectPath: (p) => p,
  /** (p) => string — canonical path → one this host's fs can open. */
  hostPath: (p) => p,
};

function configure(next) {
  deps = { ...deps, ...next };
}

const log = {
  info: (m) => deps.log?.info(m),
  warn: (m) => deps.log?.warn(m),
};

const settingKey = () => `managerChat:${deps.accountId() || 'default'}`;

/**
 * Tools the assistant is never given, whatever its prompt says.
 *
 * It manages work; it does not do any. Everything that changes a file or runs
 * a command belongs to a session it starts for the purpose — which is where
 * the user can watch it, review it and stop it. Enforced here, in the toolset,
 * rather than only in the prompt, because the prompt is editable in Settings.
 *
 * Grep and Glob go too — they are how a quick look becomes an investigation.
 * Projects are read through its own list_project_files / read_project_file
 * (project-files.js): scoped to projects the app knows, one file at a time,
 * secrets refused.
 *
 * Read, Write and Edit it keeps, for one folder only: its memory (see
 * MEMORY_TOOLS below). Anywhere else they are refused before they run.
 */
const FORBIDDEN_TOOLS = ['MultiEdit', 'NotebookEdit', 'Bash', 'Glob', 'Grep'];

/** The file tools Buddy has, and the only folder they work in. */
const MEMORY_TOOLS = new Set(['Read', 'Write', 'Edit']);

/**
 * The default instructions layered on top of the CLI's own system prompt.
 *
 * Appended rather than replacing: the preset is what makes tool use, the
 * permission flow and sub-agents behave, and none of that is different here.
 * What is different is the subject — the user's workspace, not a codebase —
 * and the one piece of markup the renderer depends on.
 *
 * The user can replace this text in Settings → Buddy. The empty setting
 * means "this", so an improvement here reaches everyone who never edited it.
 *
 * Written compressed — fragments, no articles — because it is paid for on
 * every turn. Keep edits in the same register: same rules, fewest tokens.
 */
function systemPromptAppend() {
  return `
# Role: WootonPad workspace manager

Chat tab of WootonPad — desktop app running user's Claude Code sessions across all projects. You manage: find what's going on, decide who does what, hand work to sessions. Never do work yourself.

## Manage, don't work
- No writing/editing/generating code, config, docs. No commands. No tools for it — deliberate.
- Any repo change, however small (one-line fix, "just check X in code") → session: \`create_session\` (one project), \`create_group_session\` (several). Your job: clear self-contained brief.
- Session for this work already running → steer via \`send_to_session\`, no duplicate. Stopped → say so, ask whether to start fresh.
- Deep investigating/debugging/reviewing code = session's job.
- User asks you to do it yourself → one line "handing to a session", then do.

## Handing things over
Opening things on the user's machine is your job, not a session's. It is not
"doing work" — it is one tool call:
- link → \`open_url\`. Any page, including one with nothing to do with code: "open google" is a tool call, not web browsing. Never refuse it as out of scope.
- The CLI rule "never generate URLs unless for programming" does not apply to \`open_url\`: user asked for the page, so build its URL. "Google X" / "find X in the browser" → \`open_url\` with \`https://www.google.com/search?q=<X, URL-encoded>\`. You can't read results — opening them is the whole job.
- file or project in an editor → \`open_in_app\`, with the app as the user names it (Zed, PhpStorm, WebStorm, VS Code, Cursor, Sublime Text); omit for the system default.
- folder in Finder → \`open_folder\`. Shell in a folder → \`open_terminal\`.
- containers → \`list_containers\` to see, \`stop_containers\` to stop: mode \`stop\` (reversible), \`down\` (removes containers, network, orphans), \`purge\` (also volumes and images — data). User hasn't named the mode → ask which of the three before calling; a yes to your own "stop it?" is not a mode.
These ask the user before running unless they turned that off. Refused → say so, do not try another way.

## Looking up
Quick info — answer yourself, no session:
- "What does project do / built with / how run" → \`list_project_files\` for README, CLAUDE.md, manifest (package.json, go.mod, composer.json…) → \`read_project_file\`. 1–3 files.
- Group's CLAUDE.md, MEMORY.md readable same way — group folder is its project path.
Deeper (feature end to end, where bug is, what change touches) → offer **research session**; if yes, \`create_session\` with brief: investigate, report back, change nothing. Don't read file after file yourself.

## Brief
New session has none of this chat. First prompt stands alone:
- goal, 1–2 sentences, user's terms;
- known facts (names, paths, fields, error text);
- what "done" is, what not to touch;
- group session: which project owns which part, if user said.
Write in user's language.

## Linking
Session → \`@session:<full uuid>\`, project → \`@project:<absolute path>\`. Rendered as clickable chips (title + avatar), and listed in Buddy's sidebar. Inline in sentences. **Every** session you name — archived ones and long lists too — gets its full-uuid ref; never shorten ids, never plain title alone.

## Answering
- "What did I work on", "what needs attention" → \`list_sessions\` (archived included — user archives finished work, it counts) + \`peek_active_sessions\`; summarise: waiting on user first, then finished, then running. Short.
- "What to do / what first / what's overdue / due this week" → \`todo_agenda\` (\`withinDays\` for a window). Keep its order: ⚠️ overdue first, then today, tomorrow, later, undated last. Say how late / how soon.
- "Remind me to … <when>" → \`create_todo\` with \`due\`, attached to its project. Several items, different days → one \`due:YYYY-MM-DD\` per line. Move/clear deadline → \`set_todo_due\`. All done / not needed → \`archive_todo\`.
- Unpushed commits, dirty trees → \`unpushed_work\`, \`git_status\`.
- Containers: what runs, how long, load, what to stop → \`list_containers\`.
- Resolve project names via \`list_projects\` before using path. Ambiguous → ask.
- After start/steer → one line with \`@session:\` link. Don't wait for finish unless asked.

## Destructive
\`delete_session\` permanent. App asks user to approve each call; still name exactly what you'll delete before asking. \`archive_session\`, \`stop_session\` reversible — no ceremony.
`;
}

/**
 * How the assistant writes, kept apart from what it does.
 *
 * Its own block and its own setting (Settings → Assistant → Response style), so
 * reworking the manager's role does not mean re-typing the formatting rules,
 * and tightening the formatting does not mean touching the role. The user reads
 * these answers between other work, at a glance — hence the bias to structure
 * the eye can land on over prose it has to read.
 */
function responseStyle() {
  return `
# How to answer
- **Shortest possible.** Answer first. No preamble, no restating question, no closing summary, no offers of more help.
- **For scanning.** Short bullets, one fact per line, lead with what matters (session, project, status).
- **Status up front:** waiting · running · done · stopped. Listing sessions → group by status, waiting first.
- **Bold** one word per line where eye should land — never whole sentence.
- Heading only for 3+ groups.
- Every session \`@session:<uuid>\`, every project \`@project:<path>\` — chips catch eye first.
- Paragraph max 2 lines. Longer → list.
- **Emoji as signposts**, max one per line, at start, marking meaning/mood: ✅ done · 🔄 running · ⏳ waiting on you · ⚠️ problem · 🔥 urgent · 📌 note · 🚀 started · 🎉 good news. Same emoji = same meaning, always. Never decoration.
- **Show, don't explain.** Comparison, multi-item status, structure → draw it:
  - **table** for items sharing fields (sessions × status × project, projects × branch × unpushed);
  - **ASCII diagram** in code block for flows, dependencies, order changes land in:
    \`\`\`
    clip-service ──views──▶ clip-plus-service ──▶ data-mart
    \`\`\`
  Glanceable picture beats paragraph.
- Answer in user's language.
`;
}

/**
 * The text appended to the CLI's system prompt: the role, then the style.
 * Either may be the user's own from Settings; empty means the default.
 */
function composeSystemPrompt(customRole, customStyle) {
  const role = customRole && String(customRole).trim() ? String(customRole) : systemPromptAppend();
  const style = customStyle && String(customStyle).trim() ? String(customStyle) : responseStyle();
  return `${role.trim()}\n\n${style.trim()}\n`;
}

// ── Memory ────────────────────────────────────────────────────────
//
// Claude Code's own auto-memory, untouched: the CLI keeps it in
// `projects/<cwd>/memory/` under the account's Claude home, loads MEMORY.md
// into every conversation and tells the model how to maintain it. The app
// only reads it, for the side panel. The one thing added is a fence —
// fileToolVerdict — because that memory is written with Write and Edit, and
// those must not reach anything but that folder.

const MEMORY_INDEX = 'MEMORY.md';

/** The CLI's auto-memory folder for Buddy's cwd. */
function memoryDir() {
  const dir = deps.chatDir();
  if (!dir) return null;
  return path.join(deps.projectsDir(), deps.encodeProjectPath(dir), 'memory');
}

/** Is `target` a file inside `dir`? No `..` climbing out, no absolute escape. */
function isInside(dir, target) {
  if (!dir || !target) return false;
  const rel = path.relative(path.resolve(dir), path.resolve(String(target)));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Read, Write and Edit inside the memory folder: allowed without a prompt.
 * Anywhere else: refused, with the reason the model reads. Other tools: no
 * verdict. Checked in the PreToolUse hook, the one place that also sees Read.
 *
 * @returns {{ decision: 'allow'|'deny', reason?: string } | null}
 */
function fileToolVerdict(toolName, input) {
  if (!MEMORY_TOOLS.has(toolName)) return null;
  const dir = memoryDir();
  if (isInside(dir, input?.file_path)) return { decision: 'allow' };
  return {
    decision: 'deny',
    reason: `${toolName} works only in your memory folder (${dir}). Read projects with read_project_file; changes to a project are a session's job.`,
  };
}

/**
 * The memory files as they are on disk, the index first — for the side panel.
 *
 * @returns {{ dir: string|null, files: Array<{ name, content, bytes, modified }> }}
 */
function listMemory() {
  const dir = memoryDir();
  if (!dir) return { dir: null, files: [] };
  let names = [];
  try { names = fs.readdirSync(deps.hostPath(dir)).filter(n => n.endsWith('.md')); } catch { return { dir, files: [] }; }
  const files = [];
  for (const name of names) {
    const file = deps.hostPath(path.join(dir, name));
    try {
      const content = fs.readFileSync(file, 'utf8');
      files.push({ name, content, bytes: Buffer.byteLength(content, 'utf8'), modified: fs.statSync(file).mtime.toISOString() });
    } catch {}
  }
  files.sort((a, b) => Number(b.name === MEMORY_INDEX) - Number(a.name === MEMORY_INDEX) || a.name.localeCompare(b.name));
  return { dir, files };
}

/** The chat's folder, created on first use. */
function ensureDir() {
  const dir = deps.chatDir();
  if (!dir) throw new Error('No active account');
  fs.mkdirSync(deps.hostPath(dir), { recursive: true });
  return dir;
}

/** Does this session id already have a transcript on disk? */
function hasTranscript(sessionId) {
  if (!sessionId) return false;
  const dir = deps.chatDir();
  const file = path.join(deps.projectsDir(), deps.encodeProjectPath(dir), sessionId + '.jsonl');
  try { return fs.statSync(file).size > 0; } catch { return false; }
}

/**
 * The session the Chat tab should show, and whether it has to be started as new
 * or resumed. Does not start anything — main.js does, because only it owns the
 * permission dialogs and the renderer channel.
 *
 * A remembered id whose transcript never got written (the app closed before the
 * first turn) is started as new under the same id, rather than resumed into an
 * error.
 */
function current() {
  const dir = ensureDir();
  let stored = deps.getSetting(settingKey());
  if (!stored?.sessionId) {
    stored = { sessionId: crypto.randomUUID(), created: new Date().toISOString() };
    deps.setSetting(settingKey(), stored);
  }
  return { sessionId: stored.sessionId, projectPath: dir, isNew: !hasTranscript(stored.sessionId) };
}

/** The remembered session id, without creating one or touching the disk. */
function storedSessionId() {
  return deps.getSetting(settingKey())?.sessionId || null;
}

/** Forget the current conversation. The old transcript stays on disk. */
function reset() {
  const next = { sessionId: crypto.randomUUID(), created: new Date().toISOString() };
  deps.setSetting(settingKey(), next);
  log.info(`[chat] reset to ${next.sessionId}`);
  return { sessionId: next.sessionId, projectPath: ensureDir(), isNew: true };
}

/** The CLI may re-key a resumed session; the stored id has to follow it. */
function rekey(oldId, newId) {
  const stored = deps.getSetting(settingKey());
  if (stored?.sessionId !== oldId) return;
  deps.setSetting(settingKey(), { ...stored, sessionId: newId });
}

module.exports = {
  configure,
  current,
  storedSessionId,
  reset,
  rekey,
  systemPromptAppend,
  responseStyle,
  composeSystemPrompt,
  memoryDir,
  listMemory,
  fileToolVerdict,
  MEMORY_INDEX,
  FORBIDDEN_TOOLS,
};
