const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { mainProcessFiles, watchForDevReload } = require('../dev-reload');

test('only the app’s own loaded modules relaunch it', () => {
  const root = path.join(path.sep, 'src', 'app');
  const loaded = [
    path.join(root, 'main.js'),
    path.join(root, 'workers', 'scan-projects.js'),
    path.join(root, 'node_modules', 'ws', 'index.js'),
    path.join(path.sep, 'src', 'app-other', 'main.js'),
    path.join(path.sep, 'elsewhere', 'x.js'),
  ];
  assert.deepEqual(mainProcessFiles(loaded, root), [
    path.join(root, 'main.js'),
    path.join(root, 'workers', 'scan-projects.js'),
  ]);
});

test('a packaged app watches nothing', () => {
  let asked = false;
  watchForDevReload({ app: { isPackaged: true, on: () => { asked = true; } }, root: __dirname, getWindow: () => null });
  assert.equal(asked, false);
});
