// board-projects.js — the board's project list, and the filters behind it.
//
// Two things draw it now: the board's own sidebar and the collapsed rail, which
// is that sidebar folded down to avatars. Counting the cards twice is how the
// two would come to disagree about how many there are, so the count lives here.

import { filterSessions } from './session-filter.js';

/**
 * The rules SessionBoardApp applies, minus the project filter — these counts
 * are what you would see *if* you picked that project, which is the only
 * reading that lets you move between them.
 */
export function boardFilters(store) {
  return {
    showArchived: store.showArchived,
    showStarredOnly: store.showStarredOnly,
    showRunningOnly: store.showRunningOnly,
    showTodayOnly: store.showTodayOnly,
    searchMatchIds: store.searchMatchIds,
    activePtyIds: store.activePtyIds,
    // Matching the board itself — these counts have to be the number of cards
    // picking that project would show, terminals included in neither.
    showTerminals: false,
  };
}

/**
 * One row per project with anything on the board, busiest first.
 *
 * @returns {Array<{ projectPath: string, name: string, count: number, project: object }>}
 */
export function boardProjectRows(store) {
  const base = boardFilters(store);
  const out = [];
  for (const project of store.projects) {
    // Same rule as the board itself: a project the query named counts all of
    // its sessions, not just the ones whose titles matched too.
    const filters = store.searchMatchProjectPaths?.has(project.projectPath)
      ? { ...base, searchMatchIds: null }
      : base;
    const count = filterSessions(project.sessions, filters).length;
    if (!count) continue;
    out.push({
      projectPath: project.projectPath,
      name: project.projectPath.split('/').filter(Boolean).pop() || project.projectPath,
      count,
      // The new-session popover needs the project itself, not just its path.
      project,
    });
  }
  return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
