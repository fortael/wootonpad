// file-tree.js — a flat list of paths, drawn as the directory tree it is.
//
// The changes list was one row per path, full path in each: nine files under
// `internal/app/find/rules/` repeated that prefix nine times and pushed the
// only part that differs — the filename — off the right edge of a side panel.
//
// The output is deliberately a *flat* array of rows with a depth on each,
// rather than a nested structure rendered recursively. The list is redrawn on
// every git poll and `v-for` over one array is a great deal less work than a
// component tree; the indent is a margin.

/**
 * @typedef {object} TreeRow
 * @property {'dir'|'file'} kind
 * @property {string} path    full path from the repo root
 * @property {string} name    what to draw — a basename, or a run of directories
 * @property {number} depth   0 at the repo root
 * @property {number} added
 * @property {number} deleted
 * @property {number} count   files at or under this row
 * @property {object|null} entry  the original entry, on file rows
 */

/** Sort: directories first, then files, each alphabetically. */
function byKindThenName(a, b) {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function makeNode(name, path, isDir) {
  return { name, path, isDir, children: new Map(), entry: null, added: 0, deleted: 0, count: 0 };
}

/**
 * Build the trie. Totals are summed on the way down, so a directory row can
 * report what is under it without a second walk.
 */
function buildTree(entries) {
  const root = makeNode('', '', true);
  for (const entry of entries || []) {
    const file = typeof entry === 'string' ? entry : entry?.file;
    if (!file) continue;
    const added = Number(entry?.added) || 0;
    const deleted = Number(entry?.deleted) || 0;
    const parts = String(file).split('/').filter(Boolean);
    if (!parts.length) continue;

    let node = root;
    node.count++;
    node.added += added;
    node.deleted += deleted;
    for (let i = 0; i < parts.length; i++) {
      const isDir = i < parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      if (!node.children.has(parts[i])) node.children.set(parts[i], makeNode(parts[i], path, isDir));
      node = node.children.get(parts[i]);
      node.count++;
      node.added += added;
      node.deleted += deleted;
      // A path can be both a file here and a directory elsewhere only in a
      // broken repo; the last segment wins, because that is the thing that has
      // a diff attached.
      if (!isDir) {
        node.isDir = false;
        node.entry = typeof entry === 'string' ? { file } : entry;
      }
    }
  }
  return root;
}

/**
 * `a` → `b` → `c` with nothing else in them is one row reading `a/b/c`.
 * Every file browser does this, and without it a Go or Java repo is a column
 * of single-child folders three levels deep before anything is visible.
 */
function collapseChain(node) {
  let current = node;
  const names = [node.name];
  while (current.isDir && current.children.size === 1) {
    const only = [...current.children.values()][0];
    if (!only.isDir) break;
    names.push(only.name);
    current = only;
  }
  return { node: current, name: names.filter(Boolean).join('/') };
}

/**
 * The rows to draw, in order.
 *
 * @param {Array<{file: string, added?: number, deleted?: number}>|string[]} entries
 * @param {Set<string>} [collapsed]  directory paths that are folded shut
 * @returns {TreeRow[]}
 */
export function treeRows(entries, collapsed) {
  const shut = collapsed instanceof Set ? collapsed : new Set();
  const rows = [];

  const walk = (node, depth) => {
    const children = [...node.children.values()].sort(byKindThenName);
    for (const child of children) {
      if (!child.isDir) {
        rows.push({
          kind: 'file',
          path: child.path,
          name: child.name,
          depth,
          added: child.added,
          deleted: child.deleted,
          count: 1,
          entry: child.entry,
        });
        continue;
      }
      const { node: tail, name } = collapseChain(child);
      rows.push({
        kind: 'dir',
        // The path of the *last* directory in the run: that is what folding
        // this row has to remember, and what its children hang off.
        path: tail.path,
        name,
        depth,
        added: tail.added,
        deleted: tail.deleted,
        count: tail.count,
        entry: null,
      });
      if (!shut.has(tail.path)) walk(tail, depth + 1);
    }
  };

  walk(buildTree(entries), 0);
  return rows;
}

/** Every directory row a tree of these entries would have. For "collapse all". */
export function dirPaths(entries) {
  return treeRows(entries, new Set()).filter(row => row.kind === 'dir').map(row => row.path);
}
