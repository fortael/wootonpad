// "Does this project match the search?" — the one answer, shared.
//
// The FTS index holds sessions, plans and memory files; it has no row for a
// project, so a query that names one can only be answered over the project
// list the renderer already has. Three views ask it — the sidebar list, the
// board and the board's own project rail — and they have to agree, or the
// same query shows a project on one and hides it on the other.
//
// app.js is a plain script rather than a module, so main.js hangs this on
// window for it; everything inside the bundle imports it directly.

/** The last path segment — what every view prints as the project's name. */
export function projectName(projectPath) {
  return String(projectPath || '').split('/').filter(Boolean).pop() || '';
}

/**
 * Paths of the projects matching `query` by name or by folder.
 *
 * @param {Array<{projectPath: string}>} projects
 * @param {string} query
 * @returns {Set<string>}
 */
export function matchProjectPaths(projects, query) {
  const q = String(query || '').trim().toLowerCase();
  const out = new Set();
  if (!q) return out;
  for (const p of projects || []) {
    const projectPath = p?.projectPath;
    if (!projectPath) continue;
    // The name is a substring of the path, so the path test alone would do —
    // but it also matches the home directory every project sits under, which
    // makes "users" select all of them. Name first, folder second.
    if (projectName(projectPath).toLowerCase().includes(q)) { out.add(projectPath); continue; }
    if (folderPart(projectPath).toLowerCase().includes(q)) out.add(projectPath);
  }
  return out;
}

// Everything above the project's own directory, minus the home prefix: what
// the user thinks of as "where it lives" without the part that is the same
// for every project on the machine.
function folderPart(projectPath) {
  const segments = String(projectPath || '').split('/').filter(Boolean);
  const parent = segments.slice(0, -1);
  const home = parent.findIndex(s => s === 'Users' || s === 'home');
  return (home === -1 ? parent : parent.slice(home + 2)).join('/');
}
