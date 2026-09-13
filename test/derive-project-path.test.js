const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { decodeFolderName, deriveProjectPath } = require('../derive-project-path.js');

// A real tree, because resolving the name is done against the disk: the
// encoding flattens '/', '.', '_' and '-' to the same dash, so only the
// directories that exist can say which was which.
// realpath, because the fallback test below encodes this path and then resolves
// it back against the disk: os.tmpdir() on a Windows runner is the 8.3 short
// form (C:\Users\RUNNER~1\...), and no directory is really called RUNNER~1, so
// the walk would have nothing to match.
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'wp-derive-')));
const mk = (...segments) => {
  const dir = path.join(root, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

mk('Users', 'me', 'Projects', 'switchboard');
mk('Users', 'me', 'Projects', 'wooton-pad');
mk('Users', 'me', 'Projects', 'my.api');
mk('Users', 'me', 'Projects', 'deep', 'nested', 'thing');

// The encoder's own rule (encode-project-path.js), applied to a path under the
// scratch root so the fixtures read like the real folder names.
const encode = (p) => p.replace(/[^a-zA-Z0-9]/g, '-');
const relEncoded = (...segments) => encode('/' + path.join('Users', 'me', 'Projects', ...segments));

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('a plain path round-trips', () => {
  assert.equal(
    decodeFolderName(relEncoded('switchboard'), root),
    path.join(root, 'Users/me/Projects/switchboard'),
  );
});

test('a dash in the project name is not a path separator', () => {
  assert.equal(
    decodeFolderName(relEncoded('wooton-pad'), root),
    path.join(root, 'Users/me/Projects/wooton-pad'),
  );
});

test('a dot in the project name resolves too', () => {
  assert.equal(
    decodeFolderName(relEncoded('my.api'), root),
    path.join(root, 'Users/me/Projects/my.api'),
  );
});

test('nesting deeper than one level resolves', () => {
  assert.equal(
    decodeFolderName(relEncoded('deep', 'nested', 'thing'), root),
    path.join(root, 'Users/me/Projects/deep/nested/thing'),
  );
});

test('a path that is not on disk resolves to nothing', () => {
  // Better than a guess: the caller has its own fallback, and a wrong path
  // would key a project the rest of the app cannot act on.
  assert.equal(decodeFolderName(relEncoded('never-existed'), root), null);
  assert.equal(decodeFolderName('', root), null);
  assert.equal(decodeFolderName(null, root), null);
});

test('deriveProjectPath falls back to the folder name when no transcript names the project', () => {
  // The case this exists for: the CLI writes a transcript with no `cwd` when a
  // session is opened and abandoned, and deleting the last real session leaves
  // exactly that behind. Reading cwd out of it yields nothing.
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-projects-'));
  const folderName = encode(path.join(root, 'Users/me/Projects/switchboard'));
  const folder = path.join(projectsDir, folderName);
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'stub.jsonl'), JSON.stringify({ type: 'mode', mode: 'normal' }) + '\n');

  assert.equal(deriveProjectPath(folder, folderName), path.join(root, 'Users/me/Projects/switchboard'));
  fs.rmSync(projectsDir, { recursive: true, force: true });
});

test('a transcript that does name the project still wins', () => {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-projects-'));
  const folder = path.join(projectsDir, '-whatever-the-name-says');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 's.jsonl'), JSON.stringify({ type: 'user', cwd: '/real/path/from/transcript' }) + '\n');

  assert.equal(deriveProjectPath(folder, '-whatever-the-name-says'), '/real/path/from/transcript');
  fs.rmSync(projectsDir, { recursive: true, force: true });
});
