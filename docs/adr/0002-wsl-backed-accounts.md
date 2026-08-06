# 0002 — WSL-backed accounts, with the POSIX path kept canonical

## Status

Accepted

## Context

Claude Code is frequently run inside WSL while WootonPad runs as a Windows
application — both the CLI and the projects live in the distribution. In that
setup the app found nothing: `CLAUDE_DIR` is `os.homedir()/.claude`, which on
Windows is `C:\Users\<user>\.claude`, while the sessions are in
`/home/<user>/.claude/projects` inside the distribution.

Underneath that, five separate things were broken. Sessions were read from the
wrong home; the project paths recorded in the `.jsonl` files are POSIX and could
not be handed to a Windows `fs` call; `git`/`docker` ran with `cwd` set to those
POSIX paths; Claude sessions were explicitly forced back onto a Windows shell;
and the MCP bridge bound `127.0.0.1` and declared `runningInWindows: false`.

The obvious fix — a global "Claude lives in WSL" toggle — was considered and
rejected (see below).

## Decision

A WSL installation of Claude is modelled as an **account**, the abstraction the
app already has for "a separate Claude home". An account may carry `wslDistro`,
`wslUncPrefix` and `wslHome` alongside its existing `configDir`, which for such
an account points at the distribution's `~/.claude` through
`\\wsl.localhost\<distro>\…`.

**The POSIX path stays canonical.** It is what Claude wrote into the `.jsonl`
files and what `encodeProjectPath` must hash to find the right project folder,
so it is what the app stores in `projectPath`, in settings keys, and in the
cache. A Windows folder picker returns the UNC form, so `add-project`
normalises it back. Translation happens only where a Windows API is about to
touch the file, through `hostPath()` for `fs` calls and `projectJoin()` for path
composition — `path.join` on Windows would rewrite a POSIX path with backslashes
and destroy the canonical form.

Both kinds of POSIX path are translated, not just distribution-local ones: a
project on a Windows volume opened from inside the distribution is recorded as
`/mnt/c/…`, which a Windows `fs` call cannot open either. `wslToWindowsPath`
maps that back to its drive letter and everything else to UNC.

Whatever the account owns follows the account, not the Windows home: plans, the
global `CLAUDE.md`, memory files, `/stats`, the schedule creator command and the
fork/plan-accept watcher all resolve through `activeConfigDir()` /
`activeProjectsDir()`, and are re-pointed when the active account changes. The
two schedule modules had pinned their directories at module load, so they take
an injected `configure({ getProjectsDir, getCommandsDir, hostPath, projectJoin })`
whose defaults reproduce the previous single-home behaviour.

**Anything that operates on a project runs inside the distribution.** A single
`projectExecFile()` funnel rewrites `(argv, cwd)` into
`wsl.exe -d <distro> --cd <cwd> --exec <argv>`, as an argv array so the project
path never passes through shell quoting. Every git call goes through
`projectGit()` on top of it; so do `docker compose`, `du`, the `claude -p` used
for commit messages, and scheduled commands. Sessions themselves take the WSL
shell profile named by the account, whatever the shell setting says.

**Change detection falls back to polling.** A recursive `fs.watch` over the 9p
share does not raise an error — it succeeds and then delivers nothing — so for a
WSL account the app does not attempt it and sweeps folder mtimes instead,
reusing `getFolderIndexMtimeMs`.

**IDE emulation follows the contract the CLI already implements.** Verified by
reading Claude CLI 2.1.223, which handles the IDE-on-Windows/CLI-in-WSL case
directly:

- it scans `%USERPROFILE%\.claude\ide` and `/mnt/c/Users/*/.claude/ide` for lock
  files, so the lock stays in the Windows home where the app already wrote it;
- it reads `runningInWindows` from the lock, which the app now sets to `true`
  for a WSL session;
- it then resolves the IDE host itself: `ip route show | grep -i default`, take
  the gateway, TCP-probe it, fall back to `127.0.0.1`. So the server binds to
  the `vEthernet (WSL)` address — the same address that gateway names — rather
  than to loopback or to `0.0.0.0`;
- `CLAUDE_CODE_SSE_PORT` marks the lock valid without workspace matching, and
  `wsl.exe` only passes variables listed in `WSLENV`, so that one name is listed
  there. `USERPROFILE` deliberately is not: the CLI only scans the Windows lock
  directory while it is unset.

No feature flags: this project does not use them.

## Alternatives rejected

- **A global "Claude lives in WSL" boolean.** It cannot express *which*
  distribution, so it decays into two settings anyway. Worse, it makes one cache
  mean two different things depending on the toggle, so every flip invalidates
  it, where `session_cache.accountId` (migration v4) already partitions per
  account for free. It also cannot show Windows and WSL sessions side by side.
- **Making the Windows UNC path canonical.** `encodeProjectPath` would then hash
  the wrong string and look for project folders that do not exist. The mapping
  from session to project folder is Claude's, and it is POSIX.
- **Running git and docker on the Windows side over `\\wsl.localhost\`.** Works
  for reads but is slow, trips git's ownership checks, and reaches a Windows
  docker daemon rather than the project's own.
- **Binding the MCP socket to `0.0.0.0`.** Reachable, but exposes the bridge to
  every network the machine is on. The `vEthernet (WSL)` address is exactly as
  reachable from the distribution and no wider.
- **Requiring `networkingMode=mirrored`.** Would work — loopback is shared — but
  imposes a machine-wide WSL configuration change on the user. Binding to the
  WSL adapter covers the default NAT setup, and mirrored mode still works
  through the CLI's own fallback to `127.0.0.1`.

## Consequences

- Existing accounts have no `wslDistro`, so `hostPath()`, `projectJoin()`,
  `canonicalProjectPath()` and `projectExecFile()` are all identity for them and
  behaviour is unchanged.
- A project seen through a WSL account has a different `projectPath` string from
  the same project seen from Windows. Per-project settings, `project_git_cache`
  and `project_avatars` are keyed by that string and do not carry over. Session
  names and archive state do — `session_meta` is keyed by `sessionId`.
- The MCP socket listens on the WSL adapter address, so Windows Firewall governs
  it. If no `vEthernet (WSL)` address exists the app logs that the CLI will only
  reach it under mirrored networking, rather than failing silently.
- The CLI resolves a proxy for the IDE WebSocket (`proxy: JX(t.url)` on the
  `ws-ide` transport) and honours `HTTP_PROXY` / `ALL_PROXY` / `NO_PROXY`. A
  proxy configured **inside the distribution** will therefore capture the
  connection to the host address unless `NO_PROXY` covers it. The app does not
  inject proxy variables — overriding a user's proxy setup silently is worse
  than the failure — so this is the first thing to check if the bridge never
  connects. The rest of the handshake was verified against the same binary:
  subprotocol `mcp`, and the token in `X-Claude-Code-Ide-Authorization`, both of
  which the bridge already matches.
- The cost of the polling sweep over the 9p share is unmeasured; a sweep taking
  more than half the interval is logged once so the real number appears in the
  app log instead of being guessed at.
