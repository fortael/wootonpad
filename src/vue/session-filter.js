// The single place that decides whether a session is visible right now.
//
// The sidebar list and the board are two views of the same set. When each of
// them kept its own copy of these rules they drifted immediately — the board
// showed only sessions with a live PTY while the list showed everything, so the
// same project read as "two tasks" on the left and "nothing" on the right.
//
// Callers pass the flags explicitly rather than reading the store here, because
// ProjectGroup receives them as props from its parent.

function sameDay(iso, now = new Date()) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

/**
 * A plain shell, not a Claude session.
 *
 * It has a project and a PTY and nothing else: no transcript, no turns, no
 * lifecycle to be at a point in. Everything that reasons about work — the
 * board's columns, the session side panel and the rail that opens it — has
 * nothing to say about one, so it belongs in the list where it was launched
 * and nowhere else.
 */
export function isPlainTerminal(session) {
  return session?.type === 'terminal';
}

export function filterSessions(sessions, {
  showArchived = false,
  showStarredOnly = false,
  showRunningOnly = false,
  showTodayOnly = false,
  searchMatchIds = null,
  activePtyIds = null,
  showTerminals = true,
} = {}) {
  let out = sessions || [];
  // Deliberately ahead of the search filter: a terminal has no transcript to
  // match, so a hit on one would be a hit on its title alone — and the board,
  // which is the caller that passes false, is no place to land on it.
  if (!showTerminals) out = out.filter(s => !isPlainTerminal(s));
  // A search result is already an explicit choice; archived hits stay in it.
  if (!showArchived && !searchMatchIds) out = out.filter(s => !s.archived);
  if (showStarredOnly) out = out.filter(s => s.starred);
  if (showRunningOnly && activePtyIds) out = out.filter(s => activePtyIds.has(s.sessionId));
  if (showTodayOnly) {
    const now = new Date();
    out = out.filter(s => sameDay(s.modified, now));
  }
  if (searchMatchIds) out = out.filter(s => searchMatchIds.has(s.sessionId));
  return out;
}

/**
 * Does this project have anything to show in the session list right now?
 *
 * A project with nothing surviving the filters is a collapsible header with
 * nothing behind it — and a project with no sessions at all is one on every
 * tab, forever. It was briefly kept on the unfiltered list on the grounds that
 * a freshly added project needs somewhere to start work; the Projects tab is
 * that somewhere, and it lists every project with its own + button.
 *
 * Same rules as filterSessions, by calling it: the two used to be written out
 * twice and the copy in the sidebar is where this rule drifted.
 */
export function projectHasVisibleSessions(project, options) {
  return filterSessions(project?.sessions, options).length > 0;
}
