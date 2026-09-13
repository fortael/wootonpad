// session-controls.js — what a session was last running as, from its own record.
//
// The CLI already writes this into the transcript, so there is no need for a
// second copy of it anywhere:
//
//   permissionMode   on `user` entries — written when a prompt is submitted
//   effort           on `assistant` entries
//   model            on the assistant message, the standard Anthropic field
//
// Reading it back beats storing our own, for three reasons: it covers sessions
// that existed before this app recorded anything, it picks up a mode changed in
// a terminal session as readily as one changed in the chat, and there is only
// one thing to be wrong.
//
// Later entries win — the last value in the file is what the session is on.

/** Values the mode picker can actually take; anything else is not restored. */
const MODES = new Set(['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

/**
 * @param {Array<object>} entries transcript entries, oldest first
 * @returns {{ permissionMode: string|null, effort: string|null, model: string|null }}
 */
export function controlsFromTranscript(entries) {
  const found = { permissionMode: null, effort: null, model: null };
  if (!Array.isArray(entries)) return found;

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    if (typeof entry.permissionMode === 'string' && MODES.has(entry.permissionMode)) {
      found.permissionMode = entry.permissionMode;
    }
    if (typeof entry.effort === 'string' && EFFORTS.has(entry.effort)) {
      found.effort = entry.effort;
    }
    // Only the assistant's own messages say which model answered. A `model` on
    // anything else is a request that may never have run.
    const model = entry.message?.model;
    if (entry.type === 'assistant' && typeof model === 'string' && model) {
      found.model = model;
    }
  }

  return found;
}
