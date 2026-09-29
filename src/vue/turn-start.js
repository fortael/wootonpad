// turn-start.js — when the turn in flight began, read off the transcript.
//
// A chat view opened in the middle of a turn has not seen the prompt that
// started it, so its "Working · 8m" count has nothing to count from. The last
// thing the user actually said is where the turn began. Tool results are
// `user` records too, and so are the CLI's own injected notes and the
// "[Request interrupted by user]" line it writes when a turn is stopped; none
// of them starts a turn.

const INTERRUPTED = /^\[Request interrupted by user/;

/** Did the user say this, or is it the CLI talking to the model? */
function isPrompt(entry) {
  if (!entry || entry.type !== 'user' || entry.isMeta || entry.isSidechain) return false;
  if (entry.toolUseResult !== undefined) return false;
  const content = entry.message?.content;
  if (typeof content === 'string') return content.trim().length > 0 && !INTERRUPTED.test(content.trim());
  if (!Array.isArray(content) || !content.length) return false;
  if (content.some(b => b?.type === 'tool_result')) return false;
  if (content.some(b => b?.type === 'image')) return true;
  return content.some(b => {
    const text = b?.type === 'text' ? String(b.text || '').trim() : '';
    return text && !INTERRUPTED.test(text);
  });
}

/**
 * Milliseconds since the epoch of the last prompt in `entries`, or 0 when the
 * window holds none — a long turn can push its prompt above the page read.
 *
 * @param {Array<object>} entries  raw transcript records, oldest first
 */
export function lastPromptAt(entries) {
  for (let i = (entries || []).length - 1; i >= 0; i--) {
    if (!isPrompt(entries[i])) continue;
    const t = Date.parse(entries[i].timestamp);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}
