const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readSessionFile } = require('../read-session-file');

function makeTmpSession(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-session-'));
  const file = path.join(dir, 'abc123.jsonl');
  fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  return { dir, file };
}

test('parses a minimal valid session', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'Hello world', cwd: '/some/project', sessionId: 'abc123' },
    { type: 'assistant', message: 'Hi there' },
  ]);
  try {
    const session = readSessionFile(file, 'some-folder', '/some/project');
    assert.ok(session, 'should return a session object');
    assert.equal(session.sessionId, 'abc123');
    assert.equal(session.summary, 'Hello world');
    assert.equal(session.messageCount, 2);
    assert.equal(session.folder, 'some-folder');
    assert.equal(session.projectPath, '/some/project');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('returns null when no user messages', () => {
  const { file, dir } = makeTmpSession([
    { type: 'assistant', message: 'Only assistant' },
  ]);
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.equal(session, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('extracts slug from first entry that has it', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'Start', slug: 'my-task' },
    { type: 'assistant', message: 'Response' },
  ]);
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.equal(session.slug, 'my-task');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('extracts aiTitle', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'Do something' },
    { type: 'ai-title', aiTitle: 'Generated Title' },
    { type: 'assistant', message: 'Done' },
  ]);
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.equal(session.aiTitle, 'Generated Title');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('extracts customTitle', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: 'Do something' },
    { type: 'custom-title', customTitle: 'My Custom Name' },
    { type: 'assistant', message: 'Done' },
  ]);
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.equal(session.customTitle, 'My Custom Name');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('skips local command messages for summary', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: '<local-command-caveat>! ls</local-command-caveat>' },
    { type: 'user', message: 'Real first message' },
    { type: 'assistant', message: 'Response' },
  ]);
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.equal(session.summary, 'Real first message');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('returns null for empty file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-session-'));
  const file = path.join(dir, 'empty.jsonl');
  fs.writeFileSync(file, '', 'utf8');
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.equal(session, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('returns null for non-existent file', () => {
  const session = readSessionFile('/nonexistent/path/file.jsonl', 'folder', '/path');
  assert.equal(session, null);
});

test('uses scheduled task name in summary', () => {
  const { file, dir } = makeTmpSession([
    { type: 'user', message: '<scheduled-task name="Daily Digest">run the task</scheduled-task>' },
    { type: 'assistant', message: 'Done' },
  ]);
  try {
    const session = readSessionFile(file, 'folder', '/path');
    assert.ok(session.summary.includes('Daily Digest'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Titles ────────────────────────────────────────────────────────

const { summaryFromUserText } = require('../read-session-file');

// `/clear` starts a new transcript whose only first entry is the command
// envelope. Left raw it rendered as the tags themselves, cut mid-way by the
// length cap — the sidebar showed "/clear clear </com".
test('a slash command titles the session with the command', () => {
  assert.equal(summaryFromUserText(
    '<command-message>clear</command-message>\n<command-name>/clear</command-name>'), '/clear');
});

test('a command name with no slash gets one', () => {
  assert.equal(summaryFromUserText('<command-name>compact</command-name>'), '/compact');
});

test('a command keeps its arguments', () => {
  assert.equal(summaryFromUserText(
    '<command-name>release</command-name>\n<command-args>patch</command-args>'), '/release patch');
});

test('empty arguments do not leave a trailing space', () => {
  assert.equal(summaryFromUserText(
    '<command-name>/clear</command-name>\n<command-args></command-args>'), '/clear');
});

test('a shell line is not a title at all', () => {
  assert.equal(summaryFromUserText('<bash-input>ls -la</bash-input>'), null);
  assert.equal(summaryFromUserText('<local-command-caveat>x</local-command-caveat>'), null);
});

test('a scheduled task is named by its task', () => {
  assert.equal(summaryFromUserText('<scheduled-task name="nightly build">go</scheduled-task>'),
    'Scheduled: nightly build');
});

test('an ordinary prompt is itself', () => {
  assert.equal(summaryFromUserText('Fix the login bug'), 'Fix the login bug');
});

// Markup in a title renders as markup, not as words — and a cap that lands
// mid-tag leaves a fragment on screen.
test('stray markup is stripped rather than rendered', () => {
  assert.equal(summaryFromUserText('look at <b>this</b> file'), 'look at this file');
});

test('a title is capped', () => {
  assert.equal(summaryFromUserText('x'.repeat(400)).length, 120);
});

test('nothing usable yields nothing', () => {
  for (const v of [null, undefined, '', '   ', '<tag></tag>']) {
    assert.equal(summaryFromUserText(v), null);
  }
});
