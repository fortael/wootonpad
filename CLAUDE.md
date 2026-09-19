# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repo.

## Rules

- Never `git commit` or `git push` unless user explicitly asks.

## Commands

```bash
# Install dependencies (compiles native modules node-pty and better-sqlite3)
npm install

# Start the app (bundles CodeMirror + Vue once, launches Electron)
npm start

# Dev mode: bundles everything, then watches Vue files + hot-reloads on change
npm run dev

# Faster iteration (skips slow CodeMirror bundle, still rebuilds Vue once)
npm run electron

# Rebundle CodeMirror only (needed after editing public/codemirror-setup.js)
npm run bundle:codemirror

# Run tests
npm test

# Run a single test file
node --test test/folder-index-state.test.js

# Build for distribution
npm run build:mac     # DMG + zip (arm64 + x64)
npm run build:win     # NSIS installer
npm run build:linux   # AppImage + deb
```

Tests use Node built-in `node:test` runner. No Jest, no Mocha.

## Architecture

WootonPad = **Electron app**. Session manager + IDE emulator for Claude Code CLI. Standard Electron split:

- **Main process** (`main.js`) — all Node.js/filesystem/PTY logic. Talks to renderer over IPC.
- **Renderer process** (`public/`) — plain HTML/CSS/JS, no framework. Gets `window.api` from preload bridge.
- **Preload** (`preload.js`) — context bridge exposing `window.api` to renderer. Every IPC channel declared here.

### Data flow

1. Claude Code stores sessions as `.jsonl` under `~/.claude/projects/<encoded-path>/`.
2. `main.js` watches that dir, keeps **SQLite cache** (`~/.wootonpad/switchboard.db` via `db.js` — dir renamed, file not) of session metadata + full-text search index.
3. Cache filled by **Worker thread** (`workers/scan-projects.js`) on first load, or incrementally by `session-cache.js` when watcher sees `.jsonl` changes.
4. Renderer calls `window.api.getProjectSets()` → IPC → `buildProjectSets()` for the project/session tree. Returns `{ visible, all }` — archive-filtered and unfiltered — in one pass: sidebar and project page need both, neither derivable from the other in renderer.

### Key modules

| File | Role |
|------|------|
| `db.js` | SQLite schema, migrations, all DB read/write helpers |
| `session-cache.js` | In-memory + DB cache; incremental folder refresh |
| `session-transitions.js` | Detects fork/plan-accept transitions in active PTY sessions by watching for new `.jsonl` files |
| `mcp-bridge.js` | Per-session WebSocket MCP server — registers WootonPad as VS Code–compatible IDE, so Claude CLI sends diffs/file-opens here, not to a real editor |
| `derive-project-path.js` | Decodes encoded folder names back to filesystem paths |
| `encode-project-path.js` | Encodes filesystem path to `~/.claude/projects/<folder>` convention |
| `shell-profiles.js` | Shell discovery (zsh, bash, WSL) + argv construction for PTY spawn |
| `schedule-runner.js` / `schedule-ipc.js` | Cron-style scheduled tasks |
| `workers/scan-projects.js` | Worker thread for initial full scan of `~/.claude/projects/` |
| `session-groups.js` | Group sessions: `<configDir>/groups/group-N` folders, `wooton-group.json` manifest, generated CLAUDE.md |
| `chat-agent.js` | Chat tab assistant: persistent per-account SDK session in `<configDir>/wooton-chat`, its system prompt |
| `wooton-mcp.js` | In-process MCP server (`mcp__wooton__*`) giving the assistant the app's own tools; formatting only, deps from `main.js` |
| `project-files.js` | The assistant's only file access: one directory listing or one file (≤64 KB) inside a known project or group; refuses `..`, symlinks, secrets, binaries |
| `public/app.js` | Renderer entry; top-level state, routing between sidebar views |
| `public/sidebar.js` | Left sidebar: project/session list, search, starred/archived filters |
| `public/terminal-manager.js` | xterm.js instances, PTY attach/detach, grid view |
| `public/viewer-panel.js` | Right panel: file viewer + diff review UI (CodeMirror) |
| `public/codemirror-setup.js` | CodeMirror bundle entry (dev dep; output `public/codemirror-bundle.js`) |

### IDE emulation (MCP bridge)

On session start `main.js` calls `startMcpServer()`: binds a WebSocket server on a random port, writes a lock file to `~/.claude/ide/`. Claude CLI finds that file, connects, treats WootonPad as an IDE. Diffs arrive as `openDiff` MCP calls; `main.js` forwards them to the renderer over `mcp-open-diff` IPC, `viewer-panel.js` shows them. User's accept/reject/edit decision comes back as `mcpDiffResponse` IPC → `resolvePendingDiff()`.

### Settings

Settings live in SQLite (`settings` table), keyed `"global"` or `"project:<path>"`. Defaults in `SETTING_DEFAULTS` in `main.js`. Renderer always calls `getEffectiveSettings(projectPath)` for merged global+project values.

### WSL-backed accounts

An account may carry `wslDistro`: its Claude home lives inside that WSL
distribution and `configDir` is the Windows UNC view of it. Accounts without the
field behave as before — every helper below is identity for them. Reasoning:
`docs/adr/0002-wsl-backed-accounts.md`.

Three rules, easiest to break first:

1. **The POSIX path is canonical.** `projectPath` is stored, keyed and
   `encodeProjectPath`-hashed in the form Claude wrote into the `.jsonl` — never
   the Windows form. `add-project` normalises a UNC path from the folder picker
   back to POSIX via `canonicalProjectPath()`.
2. **Translate at the fs boundary, never before.** Wrap the argument of every
   `fs.*` call that can get a project path in `hostPath()`; compose paths with
   `projectJoin()` — plain `path.join` on Windows rewrites a POSIX path with
   backslashes and destroys rule 1. Applies to paths arriving from the CLI over
   MCP too.
3. **Anything that runs *in* a project runs in the distribution.** Use
   `projectExecFile()` (or `projectGit()` on top of it), which rewrites
   `(argv, cwd)` into `wsl.exe -d <distro> --cd <cwd> --exec <argv>`. Never a
   shell string: the project path must not meet shell quoting.

What the account owns follows the account, not the Windows home — plans, global
memory files, `/stats`, schedules. Modules that cannot reach
`activeConfigDir()` take an injected `configure({...})` (see the two schedule
modules) instead of pinning a directory at module load.

Change detection for WSL accounts is an mtime-sweep poll: a recursive
`fs.watch` over the 9p share succeeds and then delivers nothing, so its silence
is indistinguishable from no changes.

MCP bridge never connects for a WSL session — check in this order: a Windows
Firewall rule for inbound connections on the `vEthernet (WSL)` adapter, then a
proxy configured inside the distribution. The CLI resolves a proxy for the IDE
socket and honours `NO_PROXY`, so `HTTP_PROXY`/`ALL_PROXY` set in the distro
captures the connection to the host address.

### Session identity and fork detection

A session spawned with `--fork-session`, or a plan accepted, writes a new
`.jsonl` under a new session UUID. `session-transitions.js` watches active PTY
sessions for new files in their project folder and matches each to its parent
via `forkedFrom` or `parentSessionId` in the JSONL. On a match it re-keys the
active session map and notifies the renderer.

### Group sessions and the Chat tab

A **group session** spans several projects. It runs in its own folder,
`<configDir>/groups/group-N`, holding `wooton-group.json` (name + project list)
and a CLAUDE.md regenerated from it. As far as the CLI and the cache go it is an
ordinary project; `session-cache.js` folds every group folder into one synthetic
entry (`isGroupContainer: true`, projectPath = groups root) and stamps each
session with `group` / `groupProjects`. Hidden from the Projects tab. Rules:

1. `open-terminal` recognises a group path and always starts it as SDK with the
   manifest's projects as `additionalDirectories` — read at start, so a resume
   picks up membership changes.
2. The renderer draws a group session with `GroupAvatar` (tiled member avatars)
   wherever a single project would get `ProjectAvatar`. Its side panel gets a `group` pane (projects, MEMORY.md,
   CLAUDE.md), and the per-tree panes (changes, containers, shell, TODOs) pick
   one member project from a switcher row — the group folder is not a repo.
3. A pending group row goes under the container, not its own folder —
   `injectSessionRow` / `pending.listPath` in `app.js`.

The **Chat tab** (labelled **Buddy**; its id stays `chat`, which the saved
ui_state and the side-panel scope key on) is an SDK session in
`<configDir>/wooton-chat` (hidden from
every list), resumed across restarts, rendered by the same `SessionSdkApp`,
`SessionPanelRail` and `SessionSidePanelApp` via their `session` / `scope="chat"`
props — `side-panel-tabs.js` `tabsFor()` decides which panes each scope gets,
and each scope keeps its own open pane. Its tools are `wooton-mcp.js`, all
pre-approved except `delete_session`, which goes through the normal permission
dialog. It manages and never works: `chatAgent.FORBIDDEN_TOOLS` (Edit, Write,
Bash, and the built-in Read/Glob/Grep — it reads through its own scoped
`read_project_file` instead) is enforced as `disallowedTools`, independent of
the system prompt. It always runs in Manual mode (`MANAGER_PERMISSION_MODE`,
picker hidden, `sdk-set-permission-mode` refuses) and defaults to Haiku. The
prompt is editable in Settings → Buddy (`managerChatPrompt`, empty =
default). Buddy keeps `MEMORY.md` in its folder across conversations: written
only through its own `update_memory` tool (32 KB cap), read back into the
system prompt at every start (`chatAgent.composeSystemPrompt(..., memory)`),
shown in its side panel's Memory pane. It links
sessions and projects as `@session:<uuid>` / `@project:<path>`; `chat-text.js`
turns those into chips in assistant text too. Sessions it starts arrive in the
renderer as `external-session-started`.
