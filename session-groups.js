// session-groups.js — sessions that work across several projects at once.
//
// Everywhere else in WootonPad a session belongs to exactly one project: the
// directory it was launched in is the directory Claude wrote into the `.jsonl`,
// and the sidebar groups sessions by it. A task that spans three repositories
// has nowhere to live under that rule — whichever repo you start it in becomes
// "the" project, and the other two are `--add-dir` guests with no memory of
// their own.
//
// A group is a real directory of its own, created under the account's Claude
// home, holding nothing but a CLAUDE.md naming the projects and a manifest.
// A session started there is an ordinary session in an ordinary project as far
// as the CLI, the transcript cache and the search index are concerned. Only the
// renderer knows better: `groupsRoot()` is folded into a single synthetic
// "Grouped sessions" entry rather than listed as N one-session projects.
//
// The manifest (`wooton-group.json`) is the only thing that distinguishes one
// of these directories from any other. It is what the footer strip of project
// avatars is drawn from, and what `setProjects()` rewrites when the membership
// changes — CLAUDE.md is regenerated from it, never edited in place, so the two
// cannot drift.

const fs = require('fs');
const path = require('path');

const MANIFEST = 'wooton-group.json';
const MEMORY = 'MEMORY.md';
const GROUPS_DIRNAME = 'groups';

// A group's path is canonical in the form the session's transcript carries,
// which on a WSL-backed account is POSIX even on Windows. `path.join` there
// would rewrite it with backslashes (CLAUDE.md, "WSL-backed accounts" rule 2),
// so a POSIX root is joined as POSIX; everything else as the host does.
const join = (root, ...parts) =>
  (String(root).startsWith('/') ? path.posix.join : path.join)(root, ...parts);

// On Windows the same directory arrives spelled more than one way: `path.join`
// writes `\`, a transcript's cwd may say `/`, and the drive letter comes in
// either case. Compared in one spelling, a group is a group however it was
// written. Identity for any path without a backslash or a drive letter.
function comparable(p) {
  return String(p)
    .replace(/\\/g, '/')
    .replace(/^([a-z]):/, (_, drive) => `${drive.toUpperCase()}:`)
    .replace(/(.)\/+$/, '$1');
}

/** `groups` under a Claude home. Not created until the first group is. */
function groupsRoot(configDir) {
  return join(configDir, GROUPS_DIRNAME);
}

/**
 * Is this project path one of the group directories under `root`?
 *
 * Compared on the path, not on the manifest: this is called for every cached
 * session on every sidebar render, and a `statSync` per row is not free. A
 * directory under `groups/` with no manifest is still a group directory — one
 * whose manifest we failed to write — and hiding it is the better failure.
 */
function isGroupPath(root, projectPath) {
  if (!root || !projectPath) return false;
  const top = comparable(root);
  const at = comparable(projectPath);
  return at === top || at.startsWith(top.endsWith('/') ? top : top + '/');
}

/** `group-3` from `…/groups/group-3`, or null if the path is not one. */
function groupIdFromPath(root, projectPath) {
  if (!isGroupPath(root, projectPath)) return null;
  const top = comparable(root).replace(/\/$/, '');
  const id = comparable(projectPath).slice(top.length + 1).split('/')[0];
  return id || null;
}

function groupDir(root, id) {
  return join(root, id);
}

/**
 * Read a group's manifest.
 *
 * `hostPath` translates the canonical POSIX path into one a Windows `fs` call
 * can open — identity on every account that is not WSL-backed. See CLAUDE.md.
 */
function readGroup(root, id, hostPath = (p) => p) {
  try {
    const dir = groupDir(root, id);
    const raw = fs.readFileSync(hostPath(join(dir, MANIFEST)), 'utf8');
    const parsed = JSON.parse(raw);
    return normalize(parsed, id, dir);
  } catch {
    return null;
  }
}

/** A manifest that has been hand-edited still has to produce a usable group. */
function normalize(parsed, id, dir) {
  return {
    id,
    dir,
    name: typeof parsed?.name === 'string' && parsed.name ? parsed.name : id,
    created: parsed?.created || null,
    projects: Array.isArray(parsed?.projects) ? parsed.projects.filter(p => typeof p === 'string' && p) : [],
  };
}

/** Every group under `root`, newest first. */
function listGroups(root, hostPath = (p) => p) {
  let names;
  try {
    names = fs.readdirSync(hostPath(root), { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return [];
  }
  return names
    .map(id => readGroup(root, id, hostPath))
    .filter(Boolean)
    .sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
}

/**
 * The next free `group-N`.
 *
 * Counts from the highest existing number rather than from the count, so
 * deleting `group-2` out of three does not hand its name to the next group and
 * point two transcripts' worth of history at one directory.
 */
function nextGroupId(root, hostPath = (p) => p) {
  let highest = 0;
  try {
    for (const entry of fs.readdirSync(hostPath(root), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const match = /^group-(\d+)$/.exec(entry.name);
      if (match) highest = Math.max(highest, Number(match[1]));
    }
  } catch {}
  return `group-${highest + 1}`;
}

const basename = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || p;

/**
 * The instructions the session opens with.
 *
 * Regenerated from the manifest on every membership change, which is why it
 * carries no hand-written sections — anything typed into it would be lost the
 * next time a project was added. Notes that have to survive go in MEMORY.md,
 * which this never touches.
 *
 * Beyond naming the projects, the bulk of this is about the one failure mode a
 * cross-repository task has and a single-repository one does not: the model
 * knowing a symbol, a field name or a convention from repo A and assuming it in
 * repo B. Hence the insistence on reading each project's own CLAUDE.md, on
 * writing the shared contract down once, and on sub-agents for exploration —
 * three repositories' worth of file listings will not fit in one context, and
 * the part worth keeping is the contract, not the listings.
 */
function buildClaudeMd(group) {
  const list = group.projects.map(p => `- \`${p}\` — ${basename(p)}`).join('\n');
  return `# ${group.name}

This task spans several projects. They are:

${list}

All of them are mounted as working directories, so you can read and edit in any
of them from here. This folder is not one of them: it belongs to the task, and
it is where everything about the task as a whole is kept.

## How to work here

- **Read each project's own \`CLAUDE.md\` before you touch it.** They disagree
  with each other — different conventions, different test runners, different
  names for the same idea. What is true in one of these repositories is not
  evidence about another.
- **Write the cross-project contract down, once.** The exact field name, its
  type, its default, which side owns it, how it is serialised between them.
  Every repository's change should refer back to that one definition rather
  than to whatever the previous repository happened to do.
- **Never assume a symbol exists in another project.** Search for it there.
- **Use sub-agents for exploration.** Send one into each project to answer a
  specific question and report back. Three repositories of file listings will
  not fit in one context window, and the part worth keeping is the conclusion.
  Keep the main conversation for the contract and the sequencing.
- **Sequence the changes and say so.** Which project has to land first for the
  others to compile, deploy or pass their tests.

## MEMORY.md

Keep a \`MEMORY.md\` in this folder and update it as you go. It is the only
thing about this task that outlives the conversation. Structure it as:

- **Goal** — one paragraph. What "done" looks like across all the projects.
- **Contract** — the shared definitions. The thing every project must agree on.
- **Per project** — one section each, naming the files touched and what is left.
- **Decisions** — choices made and why, especially ones that were not obvious.
- **Open questions** — what is still unknown, and who or what would answer it.

Write it for a reader who has none of this conversation.
`;
}

function writeGroupFiles(root, group, hostPath) {
  const dir = groupDir(root, group.id);
  fs.mkdirSync(hostPath(dir), { recursive: true });
  fs.writeFileSync(
    hostPath(join(dir, MANIFEST)),
    JSON.stringify({ id: group.id, name: group.name, created: group.created, projects: group.projects }, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(hostPath(join(dir, 'CLAUDE.md')), buildClaudeMd(group), 'utf8');
  return dir;
}

/**
 * Create `groups/group-N`, its manifest and its CLAUDE.md.
 *
 * MEMORY.md is deliberately not seeded. An empty file with five headings in it
 * reads to the model as a memory that has already been kept and found to hold
 * nothing — the CLAUDE.md asks for one instead, which is a request it acts on.
 *
 * @param {string} root      groupsRoot(configDir)
 * @param {object} options
 * @param {string[]} options.projects   absolute project paths, canonical form
 * @param {string} [options.name]
 * @param {(p: string) => string} [hostPath]
 * @returns {{ ok: true, group: object } | { ok: false, error: string }}
 */
function createGroup(root, { projects, name } = {}, hostPath = (p) => p) {
  const cleaned = [...new Set((projects || []).filter(p => typeof p === 'string' && p.trim()))];
  if (cleaned.length < 2) return { ok: false, error: 'A group needs at least two projects' };

  try {
    fs.mkdirSync(hostPath(root), { recursive: true });
    const group = {
      id: nextGroupId(root, hostPath),
      name: (name || '').trim() || cleaned.map(basename).join(' + '),
      created: new Date().toISOString(),
      projects: cleaned,
    };
    group.dir = writeGroupFiles(root, group, hostPath);
    return { ok: true, group };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Change which projects a group covers. CLAUDE.md is rewritten from the new
 * manifest, so the instructions and the membership cannot disagree.
 *
 * A live session does not re-read CLAUDE.md, so this takes effect on the next
 * turn at the earliest — the caller is the one that knows whether to say so.
 */
function setProjects(root, id, projects, hostPath = (p) => p) {
  const group = readGroup(root, id, hostPath);
  if (!group) return { ok: false, error: `No such group: ${id}` };
  const cleaned = [...new Set((projects || []).filter(p => typeof p === 'string' && p.trim()))];
  if (cleaned.length < 1) return { ok: false, error: 'A group needs at least one project' };
  try {
    group.projects = cleaned;
    group.dir = writeGroupFiles(root, group, hostPath);
    return { ok: true, group };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Rename without touching membership. */
function renameGroup(root, id, name, hostPath = (p) => p) {
  const group = readGroup(root, id, hostPath);
  if (!group) return { ok: false, error: `No such group: ${id}` };
  const next = String(name || '').trim();
  if (!next) return { ok: false, error: 'Name cannot be empty' };
  try {
    group.name = next;
    group.dir = writeGroupFiles(root, group, hostPath);
    return { ok: true, group };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  GROUPS_DIRNAME,
  MANIFEST,
  MEMORY,
  groupsRoot,
  isGroupPath,
  groupIdFromPath,
  groupDir,
  readGroup,
  listGroups,
  nextGroupId,
  createGroup,
  setProjects,
  renameGroup,
  // exported for tests
  buildClaudeMd,
};
