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

test('the assistant is never handed a tool that edits files or runs commands', () => {
  for (const name of ['Edit', 'Write', 'Bash', 'NotebookEdit']) {
    assert.ok(chatAgent.FORBIDDEN_TOOLS.includes(name), `${name} is forbidden`);
  }
});

// ── Memory ────────────────────────────────────────────────────────

const fs = require('fs');
const os = require('os');
const path = require('path');

test('Buddy\'s memory is written to its own folder and read back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-buddy-'));
  try {
    chatAgent.configure({ chatDir: () => dir });
    assert.equal(chatAgent.readMemory(), '', 'nothing before the first write');
    const res = chatAgent.writeMemory('## Projects\n### clip-service\nGo, publishes views');
    assert.equal(res.ok, true);
    assert.equal(chatAgent.memoryPath(), path.join(dir, 'MEMORY.md'));
    assert.match(chatAgent.readMemory(), /clip-service/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a memory past the cap is refused, not truncated', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-buddy-'));
  try {
    chatAgent.configure({ chatDir: () => dir });
    const res = chatAgent.writeMemory('x'.repeat(chatAgent.MEMORY_MAX_BYTES + 1));
    assert.equal(res.ok, false);
    assert.match(res.error, /condense/);
    assert.equal(chatAgent.readMemory(), '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the memory is part of the prompt, and says so when empty', () => {
  assert.match(chatAgent.composeSystemPrompt('', '', '### clip-service\nGo'), /# Your memory \(MEMORY\.md\)\n\n### clip-service/);
  assert.match(chatAgent.composeSystemPrompt('', '', ''), /nothing remembered yet/);
});
