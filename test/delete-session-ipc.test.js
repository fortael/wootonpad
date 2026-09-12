const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A source-level guard, in the shape test/git-push-target.test.js already uses
// for main.js: the handler is an inline ipcMain.handle and there is nothing to
// import, but the regression it protects against is specific and was real.
//
// The bug: a session launched a moment ago has no .jsonl yet, so nothing has
// indexed it. delete-session looked the session up in the cache, found
// nothing, and returned { ok: false, error: 'Session not found in cache' } —
// the renderer then kept the row, and there was no way to get rid of it.
const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function handlerBody(channel) {
  const start = source.indexOf(`ipcMain.handle('${channel}'`);
  assert.notEqual(start, -1, `${channel} handler not found in main.js`);
  const end = source.indexOf("\nipcMain.handle(", start + 1);
  return source.slice(start, end === -1 ? source.length : end);
}

test('delete-session does not refuse a session the cache has never seen', () => {
  const body = handlerBody('delete-session');
  assert.doesNotMatch(body, /Session not found in cache/);
  assert.match(body, /encodeProjectPath\(projectPath\)/,
    'it falls back to the project path the renderer passes');
});

test('the renderer sends the project path along with the id', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.match(preload, /deleteSession: \(id, projectPath\) =>/);

  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(app, /window\.api\.deleteSession\(id, projectPath\)/);
});
