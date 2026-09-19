const test = require('node:test');
const assert = require('node:assert/strict');

const chatAgent = require('../chat-agent');

test('with nothing customised, the assistant gets the default role and then the default style', () => {
  const prompt = chatAgent.composeSystemPrompt('', '');
  const role = prompt.indexOf("workspace manager");
  const style = prompt.indexOf('# How to answer');
  assert.ok(role >= 0, 'the role is there');
  assert.ok(style > role, 'the style comes after the role');
});

test('a customised role keeps the default style, and the other way round', () => {
  const customRole = chatAgent.composeSystemPrompt('Be a strict dispatcher.', '');
  assert.match(customRole, /^Be a strict dispatcher\./);
  assert.match(customRole, /# How to answer/);
  assert.doesNotMatch(customRole, /workspace manager/);

  const customStyle = chatAgent.composeSystemPrompt('', 'One line only.');
  assert.match(customStyle, /workspace manager/);
  assert.match(customStyle, /One line only\./);
  assert.doesNotMatch(customStyle, /# How to answer/);
});

test('whitespace-only settings fall back to the defaults', () => {
  assert.equal(chatAgent.composeSystemPrompt('  \n', '\t'), chatAgent.composeSystemPrompt('', ''));
});

test('the style asks for brevity and scannable lists', () => {
  const style = chatAgent.responseStyle();
  assert.match(style, /Shortest possible/);
  assert.match(style, /Short bullets/);
});

test('the assistant is never handed a tool that runs commands or searches trees', () => {
  for (const name of ['Bash', 'NotebookEdit', 'Glob', 'Grep']) {
    assert.ok(chatAgent.FORBIDDEN_TOOLS.includes(name), `${name} is forbidden`);
  }
});

// ── Memory ────────────────────────────────────────────────────────
//
// The CLI's own auto-memory. The app reads its files and fences Buddy's file
// tools into its folder; it writes nothing itself.

const fs = require('fs');
const os = require('os');
const path = require('path');

function withAccount(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-buddy-'));
  const chatDir = path.join(home, 'wooton-chat');
  const projectsDir = path.join(home, 'projects');
  chatAgent.configure({
    chatDir: () => chatDir,
    projectsDir: () => projectsDir,
    encodeProjectPath: p => p.replace(/[^A-Za-z0-9]/g, '-'),
    hostPath: p => p,
  });
  try { return fn({ home, chatDir, projectsDir }); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

test('the memory folder is the CLI\'s auto-memory folder for Buddy\'s cwd', () => {
  withAccount(({ chatDir, projectsDir }) => {
    assert.equal(chatAgent.memoryDir(), path.join(projectsDir, chatDir.replace(/[^A-Za-z0-9]/g, '-'), 'memory'));
  });
});

test('Read, Write and Edit work inside the memory folder and nowhere else', () => {
  withAccount(({ chatDir }) => {
    const dir = chatAgent.memoryDir();
    assert.deepEqual(chatAgent.fileToolVerdict('Write', { file_path: path.join(dir, 'MEMORY.md') }), { decision: 'allow' });
    assert.deepEqual(chatAgent.fileToolVerdict('Read', { file_path: path.join(dir, 'project-clip.md') }), { decision: 'allow' });
    for (const target of ['/etc/passwd', path.join(chatDir, 'x.md'), path.join(dir, '..', 'escape.jsonl'), dir]) {
      assert.equal(chatAgent.fileToolVerdict('Edit', { file_path: target }).decision, 'deny', target);
    }
    assert.equal(chatAgent.fileToolVerdict('Read', {}).decision, 'deny', 'no path is no pass');
    assert.equal(chatAgent.fileToolVerdict('mcp__wooton__list_todos', {}), null, 'other tools get no verdict');
  });
});

test('the memory files list with the index first', () => {
  withAccount(() => {
    const dir = chatAgent.memoryDir();
    assert.deepEqual(chatAgent.listMemory().files, [], 'no folder yet is no files');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project-clip.md'), 'clip-service: Go\n');
    fs.writeFileSync(path.join(dir, 'MEMORY.md'), '- [Clip](project-clip.md)\n');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not memory');
    const { files } = chatAgent.listMemory();
    assert.deepEqual(files.map(f => f.name), ['MEMORY.md', 'project-clip.md']);
    assert.match(files[1].content, /clip-service/);
  });
});
