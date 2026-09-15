const test = require('node:test');
const assert = require('node:assert/strict');
const { toolFromResult, resultCost, unwrapResult } = require('../src/vue/message-render.js');

// A window of the transcript can start in the middle of a turn, and then the
// results of calls made in the page above arrive with nothing to fold into.
// The `toolUseResult` the CLI writes beside a result is a different object per
// tool, and that is the only thing left to name it by — the call is precisely
// what is missing. Every payload below is the real shape, taken from a
// transcript on disk.

test('a shell result is known by its streams', () => {
  assert.equal(toolFromResult({
    stdout: '(eval):1: no matches found', stderr: '', interrupted: false,
    isImage: false, noOutputExpected: false,
  }), 'Bash');
  // A command that printed nothing still has the fields.
  assert.equal(toolFromResult({ stdout: '', stderr: '', interrupted: false }), 'Bash');
});

test('an edit is known by its patch, a write by its type', () => {
  assert.equal(toolFromResult({
    filePath: '/a/b.js', oldString: 'x', newString: 'y',
    structuredPatch: [], userModified: false, replaceAll: false,
  }), 'Edit');
  assert.equal(toolFromResult({
    type: 'create', filePath: '/a/b.js', content: 'hello', structuredPatch: [],
  }), 'Write');
  assert.equal(toolFromResult({ type: 'text', file: { filePath: '/a/b.js', content: '…' } }), 'Read');
});

test('the three that leave the machine are each distinct', () => {
  assert.equal(toolFromResult({ matches: ['WebFetch'], query: 'select:WebFetch', total_deferred_tools: 176 }), 'ToolSearch');
  assert.equal(toolFromResult({ query: 'go sdk', results: [], durationSeconds: 14.2, searchCount: 1 }), 'WebSearch');
  assert.equal(toolFromResult({ bytes: 26497, code: 200, codeText: 'OK', result: '…' }), 'WebFetch');
});

test('a shape nothing recognises is not guessed at', () => {
  assert.equal(toolFromResult({ whatever: 1 }), null);
  assert.equal(toolFromResult(null), null);
  assert.equal(toolFromResult('a string'), null);
  assert.equal(toolFromResult([1, 2, 3]), null);
});

// ── What it cost ──────────────────────────────────────────────────
//
// Only what the result actually states. Most say nothing — a shell command's
// answer carries its output and no accounting — and inventing a number for
// those would be worse than the blank it replaces.

test('a search reports its own duration and how many it ran', () => {
  const cost = resultCost({ query: 'x', results: [], durationSeconds: 14.227807, searchCount: 1 });
  assert.match(cost, /14/);
  assert.match(cost, /1 search$/);
});

test('several searches are counted in the plural', () => {
  assert.match(resultCost({ searchCount: 3 }), /3 searches/);
});

test('a fetch reports what it brought back', () => {
  assert.match(resultCost({ bytes: 26497, code: 200, codeText: 'OK' }), /26 KB/);
  assert.match(resultCost({ bytes: 800 }), /800 B/);
});

test('an agent reports its tokens', () => {
  assert.match(resultCost({ totalTokens: 12400 }), /12k tokens/);
  assert.match(resultCost({ totalDurationMs: 45000, totalTokens: 900 }), /900 tokens/);
});

test('a usage block is added up rather than ignored', () => {
  const cost = resultCost({
    usage: {
      input_tokens: 100, output_tokens: 200,
      cache_creation_input_tokens: 300, cache_read_input_tokens: 400,
    },
  });
  assert.match(cost, /1\.0k tokens/);
});

test('a result that states nothing costs nothing to say so', () => {
  assert.equal(resultCost({ stdout: 'hi', stderr: '' }), '');
  assert.equal(resultCost(null), '');
  assert.equal(resultCost('a string'), '');
  assert.equal(resultCost({ searchCount: 0, bytes: 0 }), '');
});

// ── Whether the call failed ───────────────────────────────────────
//
// The maps that hold a result between a call and its answer predate the error
// flag, and some still hold the bare content. Both shapes have to read.

test('a wrapped answer keeps its error flag', () => {
  assert.deepEqual(unwrapResult({ content: 'Exit code 1', isError: true }),
    { content: 'Exit code 1', isError: true });
  assert.deepEqual(unwrapResult({ content: 'ok', isError: false }),
    { content: 'ok', isError: false });
});

test('a bare answer is not an error', () => {
  assert.deepEqual(unwrapResult('plain output'), { content: 'plain output', isError: false });
  assert.deepEqual(unwrapResult([{ type: 'text', text: 'x' }]),
    { content: [{ type: 'text', text: 'x' }], isError: false });
});

// A Write result carries a `content` field of its own and must not be mistaken
// for the wrapper — that would render the file instead of the result.
test('a payload that merely has content is not a wrapper', () => {
  const write = { type: 'create', filePath: '/a/b.js', content: 'the whole file' };
  assert.deepEqual(unwrapResult(write), { content: write, isError: false });
});
