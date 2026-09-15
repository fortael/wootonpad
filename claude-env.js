// claude-env.js — what a spawned Claude session must not inherit.
//
// WootonPad hands `process.env` to every CLI it starts, which is right for
// PATH, a proxy, an API key. It is wrong for the variables that describe a
// Claude Code session — because when WootonPad is itself launched from inside
// one, those describe the *parent*, and the CLI believes them.
//
// This is not hypothetical and it is not only a developer's problem: launching
// the app from a terminal that is running `claude`, or from the desktop app's
// own shell, is enough. Observed in that state, every session the app started
// carried:
//
//   CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1   no session ever got a name
//   CLAUDE_CODE_CHILD_SESSION=1            the CLI treated it as nested
//   CLAUDE_CODE_ENTRYPOINT=claude-desktop  it reported as another host
//   CLAUDE_CODE_SESSION_ID=<parent's>      a different conversation's id
//
// The first one is the one that was actually noticed. The CLI generates a
// session's title itself, with Haiku, on the first turn — and that switch turns
// it off. Sessions started this way sat under a loading bar waiting for a title
// that had been disabled before the conversation began, while sessions started
// from a normally-launched app were titled within seconds. Same code, same
// account, same model: one inherited variable between them.
//
// So: when we can see that we are nested, the Claude-owned part of the
// environment is dropped and the CLI is left to establish its own. When we are
// not nested there is nothing to strip, and a `CLAUDE_*` variable can only be
// something the user set on purpose — so it is passed through untouched.

/**
 * Variables that survive the strip.
 *
 * Configuration rather than session identity: things a user exports in a shell
 * profile and would mean for every Claude they run, including this one. The
 * account's own config dir is set by the caller after this runs, but it is
 * listed anyway so the order of the two is not load-bearing.
 */
const KEEP = new Set([
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
  'CLAUDE_CODE_SSE_PORT',
]);

/** Is this process running inside a Claude Code session? */
function isNested(env) {
  return !!(env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT || env.CLAUDE_CODE_SESSION_ID);
}

/**
 * `env` with a parent Claude Code session's variables removed.
 *
 * Everything that is not Claude's is left alone — PATH, proxies, ANTHROPIC_*
 * keys, the user's own shell. Claude's own variables go as a group rather than
 * by a list of names: the list changes with every CLI release, and a deny-list
 * that has fallen one release behind fails silently and in exactly the way this
 * module exists to prevent.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {Record<string, string|undefined>} a copy; the input is not touched
 */
function stripInheritedClaudeEnv(env = process.env) {
  if (!isNested(env)) return { ...env };
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (key === 'CLAUDECODE') continue;
    if (key.startsWith('CLAUDE_') && !KEEP.has(key)) continue;
    out[key] = value;
  }
  return out;
}

module.exports = { stripInheritedClaudeEnv, isNested, KEEP };
