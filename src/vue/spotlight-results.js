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

import { projectName } from './project-search.js';
import { fuzzyMatch, isTightMatch } from './fuzzy-match.js';

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

  // Ranked, not just filtered: with fuzzy matching several projects can
  // qualify on three letters, so which one is first is the whole answer.
  const scoredProjects = [];
  const matched = new Set();
  for (const project of live) {
    const hit = matchProject(project, q);
    if (!hit) continue;
    matched.add(project.projectPath);
    scoredProjects.push({ project, score: hit.score });
  }
  scoredProjects.sort((a, b) => b.score - a.score);

  const fromMatchedProjects = [];
  const fromTitles = [];
  for (const project of live) {
    const projectMatched = matched.has(project.projectPath);
    for (const session of project.sessions || []) {
      if (session?.archived) continue;
      if (projectMatched) { fromMatchedProjects.push({ project, session }); continue; }
      const hit = matchSession(session, q);
      if (hit) fromTitles.push({ project, session, score: hit.score });
    }
  }
  // A named project's own sessions stay in time order — they are one project's
  // history, and how well a title happens to echo the project name is not a
  // reason to reorder it. Everything else is a search result and ranks.
  fromMatchedProjects.sort(byRecency);
  fromTitles.sort((a, b) => b.score - a.score || byRecency(a, b));

  return {
    projects: scoredProjects.map(entry => entry.project).slice(0, limits.projects),
    sessions: [...fromMatchedProjects, ...fromTitles].slice(0, limits.sessions),
    // Title and filename only. A plan's body is searchable on the plans tab,
    // where the result is a document you then read; here it is a name you are
    // trying to get back to.
    plans: (plans || [])
      .map(plan => ({ plan, hit: matchPlan(plan, q) }))
      .filter(entry => entry.hit)
      .sort((a, b) => b.hit.score - a.hit.score)
      .map(entry => entry.plan)
      .slice(0, limits.plans),
  };
}

// Fuzzy on the name — the thing the row shows and the thing you type — and
// plain substring on the folder. A subsequence over a whole path matches
// nearly every project (the home directory alone carries most letters), so
// the loose matcher is kept to the short string it was meant for.
function matchProject(project, q) {
  const path = project?.projectPath || '';
  const name = tight(projectName(path), q);
  if (name) return name;
  return folderPart(path).toLowerCase().includes(q) ? { score: 0, ranges: [] } : null;
}

function matchSession(session, q) {
  let best = null;
  for (const field of [session?.name, session?.summary, session?.aiTitle]) {
    if (!field) continue;
    const hit = tight(field, q);
    if (hit && (!best || hit.score > best.score)) best = hit;
  }
  return best;
}

function matchPlan(plan, q) {
  return tight(plan?.title || '', q)
    || (String(plan?.filename || '').toLowerCase().includes(q) ? { score: 0, ranges: [] } : null);
}

/** A fuzzy hit, but only if it is one a reader would recognise as one. */
function tight(text, q) {
  const hit = fuzzyMatch(text, q);
  return hit && isTightMatch(hit, q) ? hit : null;
}

// Everything above the project's own directory, minus the home prefix — the
// same rule project-search.js applies, for the same reason: without it, "users"
// selects every project on the machine.
function folderPart(projectPath) {
  const segments = String(projectPath || '').split('/').filter(Boolean);
  const parent = segments.slice(0, -1);
  const home = parent.findIndex(s => s === 'Users' || s === 'home');
  return (home === -1 ? parent : parent.slice(home + 2)).join('/');
}

/** The projects a palette may offer: everything not archived. */
export function livingProjects(projects, projectMeta = {}) {
  return (projects || []).filter(p => p?.projectPath && !projectMeta?.[p.projectPath]?.archived);
}

function byRecency(a, b) {
  return new Date(b.session?.modified || 0) - new Date(a.session?.modified || 0);
}
