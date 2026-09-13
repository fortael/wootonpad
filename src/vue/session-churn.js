// How much a session changed, from the session's own transcript.
//
// Shared by the board's cards and the sidebar's rows because they are answering
// the same question and had no reason to answer it differently — the board said
// "+120 −30" and the list said nothing at all, which made the list the worse
// place to look for work you had already done.
//
// These are counted per session, not per project: a session running in a
// worktree reports its own work, not the working tree's.

/**
 * @param {object} session
 * @returns {null | { added: number, removed: number }} null when nothing was
 *          touched, so the caller can leave the row alone rather than draw
 *          "+0 −0" on every session that only ever read.
 */
export function sessionChurn(session) {
  const added = session?.linesAdded || 0;
  const removed = session?.linesRemoved || 0;
  if (!added && !removed) return null;
  return { added, removed };
}
