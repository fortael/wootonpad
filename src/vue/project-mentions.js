// project-mentions.js — `@` in Buddy's composer names a project.
//
// Buddy reads `@project:/path/to/thing` and `@session:<uuid>`; chat-text.js
// draws them back as chips. Typed by hand that is a path to remember and a
// prefix to get right, so the composer completes it: `@` and a few letters
// offer the projects, and picking one writes the whole mention.
//
// The same `@` means a file in an ordinary session (SessionSdkApp's file
// menu). Buddy has no working tree of its own to mean, so there it means a
// project instead.
//
// Pure.

import { projectName } from './project-search.js';

// Either separator: a Windows project's path is written with `\`.
const segments = (p) => String(p || '').split(/[\\/]/).filter(Boolean);

/** Everything above the project's own folder, as a hint under its name. */
function folderOf(projectPath) {
  return segments(projectPath).slice(-3, -1).join('/');
}

/**
 * The projects a half-typed mention could mean, best first.
 *
 * A name that starts with what was typed comes before one that merely
 * contains it, which comes before a match in the folder above — "switch"
 * should find the project called switchboard before every project in
 * ~/Projects/switchboard-ish. Group containers and worktrees are left out:
 * neither is something Buddy can be pointed at.
 *
 * @param {Array<{ projectPath: string, isGroupContainer?: boolean }>} projects
 * @param {string} token  what follows the `@`, with or without `project:`
 * @param {number} [limit]
 * @returns {Array<{ projectPath: string, name: string, folder: string }>}
 */
export function matchProjects(projects, token, limit = 12) {
  const query = String(token || '').replace(/^project:/i, '').trim().toLowerCase();
  const seen = new Set();
  const scored = [];

  for (const project of projects || []) {
    const projectPath = project?.projectPath;
    if (!projectPath || project.isGroupContainer) continue;
    if (/[\\/]\.claude[\\/](worktrees|groups)[\\/]/.test(projectPath)) continue;
    if (seen.has(projectPath)) continue;
    seen.add(projectPath);

    const name = projectName(projectPath);
    const folder = folderOf(projectPath);
    const lowerName = name.toLowerCase();
    let rank;
    if (!query) rank = 3;
    else if (lowerName.startsWith(query)) rank = 0;
    else if (lowerName.includes(query)) rank = 1;
    else if (folder.toLowerCase().includes(query)) rank = 2;
    else continue;

    scored.push({ projectPath, name, folder, rank });
  }

  scored.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return scored.slice(0, limit).map(({ projectPath, name, folder }) => ({ projectPath, name, folder }));
}

/** What picking one writes: the mention Buddy understands, and a space. */
export function projectMention(projectPath) {
  return `@project:${projectPath} `;
}
