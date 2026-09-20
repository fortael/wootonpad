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

Dependency versions are exact (`.npmrc` has `save-exact=true`); the lockfile
pins the rest. `dependencies` is what the packaged app loads at runtime — main
process `require`s plus the xterm files `public/index.html` loads from
`node_modules`. Anything only bundled (CodeMirror, marked, Vue) or only used by
scripts is a devDependency. Check with `npm audit` after changing either.

## Architecture

WootonPad = **Electron app**. Session manager + IDE emulator for Claude Code CLI. Standard Electron split:

- **Main process** (`main.js`) — all Node.js/filesystem/PTY logic. Talks to renderer over IPC.
- **Renderer process** (`public/`) — plain HTML/CSS/JS, no framework. Gets `window.api` from preload bridge.
- **Preload** (`preload.js`) — context bridge exposing `window.api` to renderer. Every IPC channel declared here.

### Data flow

1. Claude Code stores sessions as `.jsonl` under `~/.claude/projects/<encoded-path>/`.
2. `main.js` watches that dir, keeps **SQLite cache** (`~/.wootonpad/wootonpad.db` via `db.js`) of session metadata + full-text search index. Accounts made before the rename keep their `~/.switchboard/accounts/<id>` folders: Claude Code encodes a session's project path into the folder name it stores the transcript under, so moving one would orphan its sessions.
3. Cache filled by **Worker thread** (`workers/scan-projects.js`) on first load, or incrementally by `session-cache.js` when watcher sees `.jsonl` changes.
4. Renderer calls `window.api.getProjectSets()` → IPC → `buildProjectSets()` for the project/session tree. Returns `{ visible, all }` — archive-filtered and unfiltered — in one pass: sidebar and project page need both, neither derivable from the other in renderer.

### Key modules

| File | Role |
|------|------|
| `db.js` | SQLite schema, migrations, all DB read/write helpers (`~/.wootonpad/wootonpad.db`, renamed from switchboard.db on first open) |
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
| `todo-due.js` | Due dates on TODO notes: parsing, status, labels, Buddy's agenda — shared by main and the renderer |
| `session-alerts.js` | When a session is worth a system notification (waiting on you; finished a turn longer than the threshold) |
| `tray-status.js` | Menu-bar status light (macOS): state from session statuses, icons drawn as bitmaps |
| `dev-reload.js` | Running from source only: relaunch on a main-process edit, reload the window on a rebuilt bundle |
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
dialog. It manages and never works: `chatAgent.FORBIDDEN_TOOLS` (Bash,
Glob, Grep, NotebookEdit — it reads projects through its own scoped
`read_project_file`) is enforced as `disallowedTools`, independent of the
system prompt. It always runs in Manual mode (`MANAGER_PERMISSION_MODE`,
picker hidden, `sdk-set-permission-mode` refuses) and defaults to Haiku. The
prompt is editable in Settings → Buddy (`managerChatPrompt`, empty =
default). Its memory is the CLI's own auto-memory
(`<configDir>/projects/<encoded chat dir>/memory/`, MEMORY.md loaded by the
CLI) — the app adds no memory mechanism of its own. Because that memory is
written with Write/Edit, Buddy keeps Read/Write/Edit, fenced to that folder by
`chatAgent.fileToolVerdict` in the PreToolUse hook (`preToolUse` in
sdk-session.js — the only gate that also sees Read, which never prompts). The
side panel's Memory pane lists the real files (`buddy-memory` IPC, folder
watched for `buddy-memory-changed`). The mascot at the foot of its sidebar comes in several
designs (`src/vue/buddy-designs.js`, each with its own palette, picked above
it and remembered): the classic 16×16 robot acts pose by pose in
PixelBuddy.vue, and every other design is rigged instead — its sprite is cut
into eyes, mouth and lights, which `buddy-rig.js` blinks, looks, talks and
bounces for whatever the session is doing. Over its
chat sit five quick questions (`buddyPrompts`, defaults in
`src/vue/buddy-suggestions.js`, rewritten in Settings → Buddy); clicking one
types it into the composer rather than sending it. It links
sessions and projects as `@session:<uuid>` / `@project:<path>` — `@` in its
composer completes the project half (`project-mentions.js`), where the same
key completes a file in an ordinary session; `chat-text.js`
turns those into chips in assistant text too. Sessions it starts arrive in the
renderer as `external-session-started`.

### TODO notes

Account notes (`account-notes.js`, `<configDir>/notes/*.md`) carry due dates:
a list deadline as a `due:` frontmatter key, an item's own as a
`due:YYYY-MM-DD` token on its line (`📅 YYYY-MM-DD` read too). One set of
rules in `todo-due.js`, required by main and bundled into the renderer, so
chips, the rail badge and Buddy's `todo_agenda` agree on what is overdue — a
done item or a finished list is never late. `archived: true` in the header
puts a note away: out of lists, badges and the agenda, still on disk.

### Unread counters, notifications, menu bar

- **Unread** (`src/vue/unread.js`, setting `unreadCounters`, off by default):
  per session, `assistantCount` from the cache (one per API message —
  `read-session-file.js` folds consecutive blocks of one message id) minus the
  count seen when it was last on screen (localStorage `unreadSeen`). First
  sight and switching the feature on start at "all read". Buddy is counted from
  its live stream (it has no cache row). Drawn on session rows and as tab badges.
- **Notifications** (`session-alerts.js`, fed by the `SessionStatusTracker`
  onChange in main): `requires_action` always notifies (sound via
  `notifySound`); a turn ending notifies only after `notifyMinWorkSeconds`.
  Never for the session on screen in a focused window — the renderer reports
  it as `visible-session`. Clicks come back as `open-session-from-outside`.
  Running from source, the Electron in node_modules is only linker-signed, and
  macOS then refuses `UNUserNotificationCenter` ("UNErrorDomain error 1") — so
  `scripts/sign-dev-electron.js` (postinstall, and `npm start`) re-signs that
  bundle ad-hoc, which is enough to make native notifications work and be
  clickable. It skips while that Electron is running; main.js keeps an
  AppleScript fallback for when the native path is refused anyway, and those
  banners cannot open the session.
- **Menu bar** (`tray-status.js`, setting `trayIcon`, macOS): idle ring,
  spinning arc while any live session runs, orange disc while one waits; its
  menu lists them. Follows the setting on save (`set-setting` for `global`).
