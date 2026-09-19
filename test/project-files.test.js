const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const files = require('../project-files');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-pf-'));
  fs.writeFileSync(path.join(root, 'README.md'), '# Data mart\n\nBuilds the views table.\n');
  fs.writeFileSync(path.join(root, '.env'), 'TOKEN=secret\n');
  fs.mkdirSync(path.join(root, 'config'));
  fs.writeFileSync(path.join(root, 'config', 'server.key'), 'KEY');
  fs.writeFileSync(path.join(root, 'config', 'app.yaml'), 'port: 8080\n');
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'blob.bin'), Buffer.from([0x50, 0x4b, 0x00, 0x01, 0x02]));
  fs.writeFileSync(path.join(root, 'big.txt'), 'x'.repeat(files.MAX_BYTES + 100));
  return root;
}

test('a file inside the project reads back with its line count', () => {
  const root = fixture();
  try {
    const res = files.readFile(root, 'README.md');
    assert.equal(res.ok, true);
    assert.match(res.content, /Builds the views table/);
    assert.equal(res.truncated, false);
    assert.equal(files.readFile(root, './config/app.yaml').ok, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('nothing outside the project can be reached', () => {
  const root = fixture();
  try {
    assert.equal(files.readFile(root, '../../etc/passwd').ok, false);
    assert.equal(files.readFile(root, 'config/../../outside').ok, false);
    assert.equal(files.readFile(root, '/etc/passwd').ok, false);
    assert.equal(files.listDir(root, '..').ok, false);
    assert.equal(files.resolveInside('/repo/app', '../app-evil/x'), null, 'a sibling sharing the prefix is outside');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('secrets are refused wherever they sit', () => {
  const root = fixture();
  try {
    assert.match(files.readFile(root, '.env').error, /secrets/);
    assert.match(files.readFile(root, 'config/server.key').error, /secrets/);
    assert.equal(files.readFile(root, '.git/config').ok, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('binaries are refused and big files are cut at the cap', () => {
  const root = fixture();
  try {
    assert.match(files.readFile(root, 'blob.bin').error, /binary/);
    const big = files.readFile(root, 'big.txt');
    assert.equal(big.ok, true);
    assert.equal(big.truncated, true);
    assert.equal(big.bytes, files.MAX_BYTES);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a symlink is not followed', () => {
  const root = fixture();
  try {
    fs.symlinkSync('/etc/hosts', path.join(root, 'hosts'));
    assert.match(files.readFile(root, 'hosts').error, /symlink/);
    assert.equal(files.listDir(root, '').entries.some(e => e.name === 'hosts'), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a listing is one level, folders first, without .git or node_modules', () => {
  const root = fixture();
  try {
    const res = files.listDir(root, '');
    assert.equal(res.ok, true);
    const names = res.entries.map(e => e.name);
    assert.equal(names[0], 'config');
    assert.ok(names.includes('README.md'));
    assert.equal(names.includes('.git'), false);
    assert.equal(names.includes('node_modules'), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
