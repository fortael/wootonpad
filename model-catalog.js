// model-catalog.js — the model picker's rows: what the SDK knows, plus what
// the account can actually use.
//
// `supportedModels()` answers from the CLI bundled with the Agent SDK, so its
// list is frozen at whatever that CLI shipped with. A model released since —
// available in the official client the same day — is missing until the SDK
// dependency is bumped. The API's /v1/models answers for the account, so its
// list is always current; the rows it adds are the ones the SDK does not know.
//
// Pure: the fetch lives in claude-auth.js.

/** `claude-haiku-4-5-20251001` and `claude-opus-5[1m]` → the model they name. */
function bareId(id) {
  return String(id || '').replace(/\[[^\]]*\]/g, '').replace(/-\d{8}$/, '').trim();
}

/**
 * The SDK's rows with the API's models it does not already offer. A model the
 * API lists above everything the SDK knows is newer than the bundled CLI, so
 * it goes first — that is the one the user came to the picker for. The rest
 * (older models the SDK's short list leaves out) go after.
 *
 * @param {Array<object>} sdkRows  supportedModels() rows: { value, displayName, resolvedModel? }
 * @param {Array<{id: string, displayName?: string}>} apiModels  newest first, as /v1/models returns them
 */
function mergeModels(sdkRows, apiModels) {
  const rows = Array.isArray(sdkRows) ? sdkRows.filter(Boolean) : [];
  const api = Array.isArray(apiModels) ? apiModels.filter(m => m && m.id) : [];
  const known = new Set();
  for (const r of rows) {
    if (r.resolvedModel) known.add(bareId(r.resolvedModel));
    if (r.value) known.add(bareId(r.value));
  }
  const firstKnown = api.findIndex(m => known.has(bareId(m.id)));
  const newer = [];
  const older = [];
  api.forEach((m, i) => {
    const id = bareId(m.id);
    if (!id || known.has(id)) return;
    known.add(id);
    const row = {
      value: m.id,
      displayName: m.displayName || m.id,
      description: 'Available to this account',
      resolvedModel: m.id,
      fromApi: true,
    };
    (firstKnown === -1 || i < firstKnown ? newer : older).push(row);
  });
  // `default` stays on top: it is what an untouched session runs.
  const lead = rows.filter(r => r.value === 'default');
  const rest = rows.filter(r => r.value !== 'default');
  return [...lead, ...newer, ...rest, ...older];
}

module.exports = { bareId, mergeModels };
