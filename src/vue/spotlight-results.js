// What the ⌘K palette shows, as data.
//
// Extracted from SpotlightApp.vue so the rules can be tested without a DOM:
// which things match, in which order, and what is deliberately left out. The
// component turns this into rows — avatars, status dots, ages, key caps.
//
// The rules, in the order they matter:
//
//   1. Projects first, always. An empty query is the project list and nothing
//      else: that is the "start a session somewhere" menu the + beside the
//      search field opens.
//   2. A project named by the query brings its own sessions with it, ahead of
//      sessions matched only by their own title. Typing a project name and
//      getting the project on top with its work underneath is the whole shape
//      the palette exists for.
//   3. Archived sessions and archived projects are never searched. They are
//      the things that have been put away on purpose.

import { matchProjectPaths } from './project-search.js';

export const SPOTLIGHT_LIMITS = {
  projects: 6,      // only while searching; an empty query lists them all
  sessions: 12,
  plans: 5,
};

/**
 * @param {object} input
 * @param {Array<{projectPath: string, sessions?: Array<object>}>} input.projects
 * @param {Array<{filename: string, title?: string}>} [input.plans]
 * @param {string} [input.query]
 * @param {Record<string, {archived?: number|boolean}>} [input.projectMeta]
 *   project_meta rows, keyed by path — the archived flag lives there.
 * @param {object} [input.limits]
 * @returns {{projects: Array<object>, sessions: Array<{project: object, session: object}>, plans: Array<object>}}
 */
export function spotlightResults({ projects, plans = [], query = '', projectMeta = {}, limits = SPOTLIGHT_LIMITS } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const live = livingProjects(projects, projectMeta);

  if (!q) return { projects: live, sessions: [], plans: [] };

  const matched = matchProjectPaths(live, q);

  const fromMatchedProjects = [];
  const fromTitles = [];
  for (const project of live) {
    const projectMatched = matched.has(project.projectPath);
    for (const session of project.sessions || []) {
      if (session?.archived) continue;
      if (projectMatched) fromMatchedProjects.push({ project, session });
      else if (sessionHaystack(session).includes(q)) fromTitles.push({ project, session });
    }
  }
  fromMatchedProjects.sort(byRecency);
  fromTitles.sort(byRecency);

  return {
    projects: live.filter(p => matched.has(p.projectPath)).slice(0, limits.projects),
    sessions: [...fromMatchedProjects, ...fromTitles].slice(0, limits.sessions),
    // Title and filename only. A plan's body is searchable on the plans tab,
    // where the result is a document you then read; here it is a name you are
    // trying to get back to.
    plans: (plans || [])
      .filter(p => `${p?.title || ''} ${p?.filename || ''}`.toLowerCase().includes(q))
      .slice(0, limits.plans),
  };
}

/** The projects a palette may offer: everything not archived. */
export function livingProjects(projects, projectMeta = {}) {
  return (projects || []).filter(p => p?.projectPath && !projectMeta?.[p.projectPath]?.archived);
}

function sessionHaystack(session) {
  return [session?.name, session?.summary, session?.aiTitle].filter(Boolean).join(' ').toLowerCase();
}

function byRecency(a, b) {
  return new Date(b.session?.modified || 0) - new Date(a.session?.modified || 0);
}
