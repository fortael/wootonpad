// tool-policy.js — which of Buddy's own tools run, and which ask first.
//
// Every tool on the `wooton` server is in one of three states:
//
//   auto  it runs when the assistant calls it
//   ask   the permission dialog comes up first, as for any other tool
//   off   the assistant is not given it at all
//
// The defaults below are the app's opinion; Settings → Assistant is the
// user's, and theirs wins. Deleting a session, stopping containers and the
// four tools that reach out of the app — a browser window, an editor, a file
// manager, a shell — ask first, because they do something on the user's
// machine that they did not press a button for.
//
// Pure: main.js turns this into `allowedTools` and `disallowedTools`.

const ASK_BY_DEFAULT = new Set([
  'delete_session',
  'stop_containers',
  'open_url',
  'open_in_app',
  'open_folder',
  'open_terminal',
]);

const STATES = ['auto', 'ask', 'off'];

/**
 * The state of every tool: what the user chose, or the default.
 *
 * @param {string[]} toolNames  every tool the server has
 * @param {Record<string, string>} [saved]  the `mcpTools` setting
 * @returns {Record<string, 'auto'|'ask'|'off'>}
 */
function toolPolicy(toolNames, saved) {
  const out = {};
  for (const name of toolNames || []) {
    const chosen = saved?.[name];
    out[name] = STATES.includes(chosen) ? chosen : (ASK_BY_DEFAULT.has(name) ? 'ask' : 'auto');
  }
  return out;
}

/** The names in one state, in the order they were given. */
function toolsInState(policy, state) {
  return Object.keys(policy || {}).filter(name => policy[name] === state);
}

/**
 * What the SDK needs, from a policy.
 *
 * `ask` is the absence of a rule rather than a rule of its own: a tool that is
 * not pre-approved goes through the ordinary permission dialog. `off` has to be
 * said out loud, or the model still has it.
 *
 * @returns {{ allowed: string[], disallowed: string[] }} fully-qualified names
 */
function sdkToolRules(policy, prefix = 'mcp__wooton__') {
  return {
    allowed: toolsInState(policy, 'auto').map(name => prefix + name),
    disallowed: toolsInState(policy, 'off').map(name => prefix + name),
  };
}

/** Only what differs from the default is worth storing. */
function trimPolicy(toolNames, chosen) {
  const defaults = toolPolicy(toolNames);
  const out = {};
  for (const [name, state] of Object.entries(chosen || {})) {
    if (!STATES.includes(state) || !(name in defaults)) continue;
    if (state !== defaults[name]) out[name] = state;
  }
  return out;
}

module.exports = { toolPolicy, toolsInState, sdkToolRules, trimPolicy, ASK_BY_DEFAULT, STATES };
