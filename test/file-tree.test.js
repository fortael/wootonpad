const test = require('node:test');
const assert = require('node:assert/strict');
const { treeRows, dirPaths } = require('../src/vue/file-tree.js');

const f = (file, added = 0, deleted = 0) => ({ file, added, deleted });
const shape = (rows) => rows.map(r => `${'  '.repeat(r.depth)}${r.name}${r.kind === 'dir' ? '/' : ''}`);

test('files in one directory are one folder with the names under it', () => {
  const rows = treeRows([f('src/a.js'), f('src/b.js')]);
  assert.deepEqual(shape(rows), ['src/', '  a.js', '  b.js']);
});

// The reason the list was unreadable: every row repeated the same prefix and
// the part that differs was off the right edge.
test('a file row is a basename, not a path', () => {
  const rows = treeRows([f('internal/app/find/rules/text.go')]);
  assert.equal(rows[rows.length - 1].name, 'text.go');
  assert.equal(rows[rows.length - 1].path, 'internal/app/find/rules/text.go');
});

test('a run of single-child directories is one row', () => {
  const rows = treeRows([f('internal/app/find/rules/text.go')]);
  assert.deepEqual(shape(rows), ['internal/app/find/rules/', '  text.go']);
});

test('the run stops where the tree branches', () => {
  const rows = treeRows([f('a/b/c/one.go'), f('a/b/d/two.go')]);
  assert.deepEqual(shape(rows), ['a/b/', '  c/', '    one.go', '  d/', '    two.go']);
});

test('directories come before files, each in alphabetical order', () => {
  const rows = treeRows([f('z.txt'), f('a.txt'), f('src/x.js'), f('lib/y.js')]);
  assert.deepEqual(shape(rows), ['lib/', '  y.js', 'src/', '  x.js', 'a.txt', 'z.txt']);
});

test('a directory reports what is under it', () => {
  const rows = treeRows([f('src/a.js', 3, 1), f('src/b.js', 4, 2), f('top.txt', 1, 0)]);
  const src = rows.find(r => r.kind === 'dir');
  assert.equal(src.count, 2);
  assert.equal(src.added, 7);
  assert.equal(src.deleted, 3);
});

test('a folded directory hides its children and nothing else', () => {
  const entries = [f('src/a.js'), f('src/b.js'), f('top.txt')];
  const rows = treeRows(entries, new Set(['src']));
  assert.deepEqual(shape(rows), ['src/', 'top.txt']);
  // Still says how much is behind it.
  assert.equal(rows[0].count, 2);
});

// Folding is keyed on the path of the *last* directory in a collapsed run,
// because that is the row's own identity — `a/b/c` folds as `a/b/c`.
test('a collapsed run folds by the path it ends at', () => {
  const rows = treeRows([f('a/b/c/one.go')], new Set(['a/b/c']));
  assert.deepEqual(shape(rows), ['a/b/c/']);
});

test('the file entry travels with its row', () => {
  const entry = f('src/a.js', 2, 5);
  const rows = treeRows([entry]);
  const file = rows.find(r => r.kind === 'file');
  assert.equal(file.entry, entry, 'the row has to be able to open the diff it names');
  assert.equal(file.added, 2);
  assert.equal(file.deleted, 5);
});

test('plain strings work as well as entries', () => {
  const rows = treeRows(['a/b.txt']);
  assert.deepEqual(shape(rows), ['a/', '  b.txt']);
  assert.deepEqual(rows[1].entry, { file: 'a/b.txt' });
});

test('every directory is listed for a collapse-all', () => {
  assert.deepEqual(dirPaths([f('a/b/c/one.go'), f('a/b/d/two.go')]), ['a/b', 'a/b/c', 'a/b/d']);
});

test('nothing at all is no rows, not a crash', () => {
  assert.deepEqual(treeRows([]), []);
  assert.deepEqual(treeRows(null), []);
  assert.deepEqual(treeRows(undefined), []);
  assert.deepEqual(treeRows([null, {}, { file: '' }, 'a.txt']), [
    { kind: 'file', path: 'a.txt', name: 'a.txt', depth: 0, added: 0, deleted: 0, count: 1, entry: { file: 'a.txt' } },
  ]);
});

test('a leading slash or a doubled one does not make an empty row', () => {
  assert.deepEqual(shape(treeRows(['/a//b.txt'])), ['a/', '  b.txt']);
});
