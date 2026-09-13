// session-column.js — which lane a session is in, and which one to open first.
//
// The board draws four columns and the Recent rail sorts projects by the worst
// state in them. Both were deciding for themselves what a session's state was,
// from the same four collections, and they disagreed at the edges: a session
// that had finished a turn *and* been sent back to work landed in DONE on the
// rail and IN PROGRESS on the board.
//
// One answer, one precedence order, used by both.

/**
 * Precedence, not a partition: a session can carry more than one of these marks
 * at once. Blocked-on-the-user outranks everything — it is the only state that
 * cannot progress without a human. Running outranks done because a session you
 * opened and then sent back to work is working, not finished; otherwise a read
 * turn would pin it in DONE for the whole next turn.
 */
export const COLUMN_PRECEDENCE = ['waiting', 'running', 'done', 'idle'];

/**
 * The order to open them in, which is not the order to rank them by. Once a
 * session is placed, "what should I look at first" puts a finished turn ahead
 * of one still being written: the finished one wants reading, the running one
 * wants nothing.
 */
export const OPEN_ORDER = { waiting: 0, done: 1, running: 2, idle: 3 };

/**
 * @typedef {object} SessionState
 * @property {Set<string>} attention      blocked on the user
 * @property {Map<string, boolean>} busy  mid-turn
 * @property {Set<string>} responseReady  finished, unread
 * @property {Set<string>} readPending    finished, read, not yet put away
 */

/**
 * @param {string} sessionId
 * @param {SessionState} state
 * @returns {'waiting'|'running'|'done'|'idle'}
 */
export function columnOf(sessionId, state) {
  if (state.attention?.has(sessionId)) return 'waiting';
  if (state.busy?.get(sessionId)) return 'running';
  if (state.responseReady?.has(sessionId) || state.readPending?.has(sessionId)) return 'done';
  return 'idle';
}

/** The four collections, read off the Vue store. */
export function stateFromStore(store) {
  return {
    attention: store.attentionSessions,
    busy: store.sessionBusyState,
    responseReady: store.responseReadySessions,
    readPending: store.readPendingSessions,
  };
}

/**
 * The one to open. A project with a dozen sessions has exactly one that wants
 * you right now — the one holding a dialog — and clicking the project should
 * land on it rather than on whichever was touched last.
 *
 * Ties inside a lane go to the most recently active, which is the only ordering
 * that means anything among sessions in the same state.
 *
 * @param {Array<{sessionId: string, modified?: string}>} sessions
 * @param {SessionState} state
 * @returns {object|null}
 */
export function mostUrgent(sessions, state) {
  let best = null;
  let bestRank = Infinity;
  let bestTime = -Infinity;

  for (const session of sessions || []) {
    if (!session?.sessionId) continue;
    const rank = OPEN_ORDER[columnOf(session.sessionId, state)];
    const time = new Date(session.modified || 0).getTime() || 0;
    if (rank < bestRank || (rank === bestRank && time > bestTime)) {
      best = session;
      bestRank = rank;
      bestTime = time;
    }
  }
  return best;
}

/**
 * The sessions that want something from you: blocked on an answer, or finished
 * with a turn you have not read.
 *
 * Not the same as "what is in the WAITING and DONE columns". A card stays in
 * DONE while you have it open — that is the column saying "finished, not yet
 * put away" — but the moment you open it you have read it, and a dock badge
 * still counting it is telling you to go somewhere you already are. So the
 * done half counts unread turns only: `responseReady`, never `readPending`.
 *
 * Placement still goes through columnOf, because the collections overlap: a
 * session you opened after it finished and then sent back to work is in
 * `readPending` *and* `busy`, and it is working, not finished.
 *
 * Only the four collections are walked, so a session in none of them — idle,
 * which is most of them — costs nothing.
 *
 * @param {SessionState} state
 * @returns {{ waiting: string[], done: string[] }}
 */
export function wantsAttention(state) {
  const seen = new Set([
    ...(state?.attention || []),
    ...(state?.busy ? state.busy.keys() : []),
    ...(state?.responseReady || []),
    ...(state?.readPending || []),
  ]);

  const waiting = [];
  const done = [];
  for (const id of seen) {
    const column = columnOf(id, state);
    if (column === 'waiting') waiting.push(id);
    else if (column === 'done' && state?.responseReady?.has(id)) done.push(id);
  }
  return { waiting, done };
}

/**
 * The unread rail's contents: one entry per session that wants something,
 * flattened out of the projects and ordered as a worklist.
 *
 * Deliberately built on `wantsAttention` rather than on a second reading of the
 * collections, because the dock badge counts exactly this. The rail used to
 * show one entry per project with a *live PTY* — a different question with a
 * different answer — so the badge could read 1 with nothing on the rail
 * explaining it, which is the confusion this replaces.
 *
 * One entry per session, never stacked: two sessions of the same project both
 * waiting are two things to answer, and a badge reading "2" on one avatar
 * says which project but not which session.
 *
 * @param {Array<{projectPath: string, sessions: Array<object>}>} projects
 * @param {SessionState} state
 * @returns {Array<{sessionId: string, projectPath: string, project: string,
 *                  status: 'waiting'|'done', modified: string|null}>}
 */
export function unreadSessions(projects, state) {
  const { waiting, done } = wantsAttention(state);
  if (!waiting.length && !done.length) return [];

  // done after waiting, so a session in both lists is recorded as waiting —
  // matching columnOf's precedence, where blocked outranks finished.
  const status = new Map();
  for (const id of done) status.set(id, 'done');
  for (const id of waiting) status.set(id, 'waiting');

  const out = [];
  for (const project of projects || []) {
    const name = project.projectPath?.split('/').filter(Boolean).pop() || project.projectPath || '';
    for (const session of project.sessions || []) {
      const lane = status.get(session?.sessionId);
      if (!lane) continue;
      out.push({
        sessionId: session.sessionId,
        projectPath: project.projectPath,
        project: name,
        status: lane,
        modified: session.modified || null,
        session,
      });
    }
  }

  // Waiting first — it is the only state that cannot progress without you —
  // then most recent within each band.
  return out.sort((a, b) =>
    OPEN_ORDER[a.status] - OPEN_ORDER[b.status]
    || (new Date(b.modified || 0).getTime() || 0) - (new Date(a.modified || 0).getTime() || 0));
}

/** The worst lane anything in this list is in — a project's status in one word. */
export function worstColumn(sessions, state) {
  let worst = 'idle';
  for (const session of sessions || []) {
    if (!session?.sessionId) continue;
    const column = columnOf(session.sessionId, state);
    if (OPEN_ORDER[column] < OPEN_ORDER[worst]) worst = column;
  }
  return worst;
}
