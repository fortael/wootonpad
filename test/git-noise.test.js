const test = require('node:test');
const assert = require('node:assert/strict');
const { isNoiseFile, withoutNoise, countNoise } = require('../src/vue/git-noise.js');

// macOS writes .DS_Store into every directory you look at, so a repo without it
// in .gitignore always has three or four in the untracked list. "Add all" meant
// the new source files, not the Finder's bookkeeping.

test('the Finder droppings are noise wherever they sit', () => {
  assert.equal(isNoiseFile('.DS_Store'), true);
  assert.equal(isNoiseFile('src/.DS_Store'), true);
  assert.equal(isNoiseFile('a/b/c/.DS_Store'), true);
  assert.equal(isNoiseFile('._Rules.php'), true, 'AppleDouble sidecar');
  assert.equal(isNoiseFile('Thumbs.db'), true);
  assert.equal(isNoiseFile('tests/desktop.ini'), true);
});

test('a real file is not noise, however it is named', () => {
  assert.equal(isNoiseFile('src/Rules.php'), false);
  assert.equal(isNoiseFile('DS_Store.md'), false);
  assert.equal(isNoiseFile('my.DS_Store.txt'), false);
  assert.equal(isNoiseFile('_private.go'), false);
  assert.equal(isNoiseFile(''), false);
  assert.equal(isNoiseFile(null), false);
});

// Editor and tooling droppings are a project's own business, and guessing at
// them here would be this app deciding what a repository tracks.
test('only OS junk is skipped, not everything unwanted', () => {
  assert.equal(isNoiseFile('.idea/workspace.xml'), false);
  assert.equal(isNoiseFile('node_modules/x/index.js'), false);
  assert.equal(isNoiseFile('main.pyc'), false);
});

test('add-all takes everything else', () => {
  const list = ['src/a.php', '.DS_Store', 'tests/.DS_Store', 'tests/b.php'];
  assert.deepEqual(withoutNoise(list), ['src/a.php', 'tests/b.php']);
  assert.equal(countNoise(list), 2);
});

test('nothing at all is not a crash', () => {
  assert.deepEqual(withoutNoise([]), []);
  assert.deepEqual(withoutNoise(null), []);
  assert.equal(countNoise(undefined), 0);
});
