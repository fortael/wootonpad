const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, normalizeUntyped, messageLabel } = require('../src/vue/message-normalizer.ts');

const assistant = (content) => ({ type: 'assistant', message: { role: 'assistant', content }, session_id: 's' });
const kinds = (items) => items.map(i => i.kind);

test('assistant text becomes a text item', () => {
  const items = normalize(assistant([{ type: 'text', text: 'hello' }]));
  assert.deepEqual(items, [{ kind: 'text', role: 'assistant', text: 'hello' }]);
});

test('empty and whitespace-only text is dropped rather than rendered blank', () => {
  assert.deepEqual(normalize(assistant([{ type: 'text', text: '   ' }])), []);
});

test('thinking, tool_use and tool_result each get their own item', () => {
  const items = normalize(assistant([
    { type: 'thinking', thinking: 'considering' },
    { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/tmp/a' } },
    { type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' },
  ]));
  assert.deepEqual(kinds(items), ['thinking', 'tool_use', 'tool_result']);
  assert.equal(items[1].name, 'Read');
  assert.deepEqual(items[1].input, { file_path: '/tmp/a' });
  assert.equal(items[2].toolUseId, 'toolu_1');
  assert.equal(items[2].isError, false);
});

test('a failed tool result carries its error flag', () => {
  const items = normalize(assistant([
    { type: 'tool_result', tool_use_id: 't', content: 'boom', is_error: true },
  ]));
  assert.equal(items[0].isError, true);
});

test('string content is accepted as well as blocks', () => {
  assert.deepEqual(normalize(assistant('plain')), [{ kind: 'text', role: 'assistant', text: 'plain' }]);
});

// A screenshot a tool returned and one the user pasted into the composer are
// the same block; only the message they arrive in says which side of the
// transcript they belong on.
test('an image carries the role of the message it came in', () => {
  const block = {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: 'QUJD' },
  };
  assert.deepEqual(normalize(assistant([block])), [
    { kind: 'image', role: 'assistant', mediaType: 'image/png', data: 'QUJD' },
  ]);
  const pasted = normalize({ type: 'user', message: { role: 'user', content: [block] }, session_id: 's' });
  assert.deepEqual(pasted, [
    { kind: 'image', role: 'user', mediaType: 'image/png', data: 'QUJD' },
  ]);
});

test('an image block with no data is dropped rather than drawn broken', () => {
  assert.deepEqual(normalize(assistant([{ type: 'image', source: { type: 'url', url: 'x' } }])), []);
});

// Content blocks are an open set with no exhaustive type to check against, so
// the runtime card is the only thing standing between a new block and silence.
test('an unrecognised content block becomes a visible unknown item', () => {
  const items = normalize(assistant([{ type: 'redacted_thinking', data: 'xx' }]));
  assert.equal(items[0].kind, 'unknown');
  assert.equal(items[0].label, 'block:redacted_thinking');
  assert.deepEqual(items[0].raw, { type: 'redacted_thinking', data: 'xx' });
});

test('a result closes the turn and reports whether it succeeded', () => {
  assert.deepEqual(normalize({ type: 'result', subtype: 'success', result: 'done', session_id: 's' }),
    [{ kind: 'turn_end', ok: true, text: 'done' }]);
  assert.equal(normalize({ type: 'result', subtype: 'error_during_execution', session_id: 's' })[0].ok, false);
});

test('a text delta carries the token that was just written', () => {
  assert.deepEqual(normalize({
    type: 'stream_event',
    session_id: 's',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } },
  }), [{ kind: 'delta', target: 'text', text: 'Hel' }]);
});

test('a thinking delta is told apart from a spoken one', () => {
  assert.deepEqual(normalize({
    type: 'stream_event',
    session_id: 's',
    event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } },
  }), [{ kind: 'delta', target: 'thinking', text: 'hmm' }]);
});

// Frames with nothing to paint still say the turn is alive, which is what
// keeps the working indicator up through a long silence.
test('every other stream frame is a delta with no text', () => {
  for (const event of [undefined, { type: 'message_start' }, { type: 'content_block_stop' },
    { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{' } }]) {
    assert.deepEqual(normalize({ type: 'stream_event', session_id: 's', event }),
      [{ kind: 'delta', target: 'other', text: '' }]);
  }
});

// What a turn has cost so far, for the working row. The delta is kept
// alongside it — it is what says the turn is still alive.
test('message_start reports the prompt the request went out with', () => {
  assert.deepEqual(normalize({
    type: 'stream_event',
    session_id: 's',
    event: {
      type: 'message_start',
      message: { usage: { input_tokens: 12, cache_read_input_tokens: 400, output_tokens: 1 } },
    },
  }), [
    { kind: 'usage', phase: 'start', inputTokens: 12, cachedTokens: 400, outputTokens: 1 },
    { kind: 'delta', target: 'other', text: '' },
  ]);
});

test('message_delta reports the answer so far', () => {
  assert.deepEqual(normalize({
    type: 'stream_event',
    session_id: 's',
    event: { type: 'message_delta', usage: { output_tokens: 87 } },
  }), [
    { kind: 'usage', phase: 'delta', inputTokens: 0, cachedTokens: 0, outputTokens: 87 },
    { kind: 'delta', target: 'other', text: '' },
  ]);
});

test('session bookkeeping is silent, with the reason recorded', () => {
  const items = normalize({ type: 'system', subtype: 'init', session_id: 's' });
  assert.deepEqual(items, [{ kind: 'silent', reason: 'init' }]);
});

test('a compaction and a refusal each surface as a notice', () => {
  assert.equal(normalize({ type: 'system', subtype: 'compact_boundary', session_id: 's' })[0].kind, 'notice');
  const refusal = normalize({ type: 'system', subtype: 'model_refusal_no_fallback', session_id: 's' })[0];
  assert.equal(refusal.level, 'error');
});

test('a notification renders its text, and an immediate one is raised to a warning', () => {
  const low = normalize({ type: 'system', subtype: 'notification', text: 'heads up', priority: 'low', key: 'k', session_id: 's' });
  assert.deepEqual(low, [{ kind: 'notice', level: 'info', text: 'heads up' }]);
  const urgent = normalize({ type: 'system', subtype: 'notification', text: 'look now', priority: 'immediate', key: 'k', session_id: 's' });
  assert.equal(urgent[0].level, 'warn');
});

// The reason this module exists. Live sessions were seen emitting
// `system:post_turn_summary` and `system:task_summary`, neither of which is in
// the shipped .d.ts — so the compiler could not have caught them.
test('a system subtype nobody has ever seen is surfaced, not swallowed', () => {
  const items = normalize({ type: 'system', subtype: 'something_from_2027', session_id: 's' });
  assert.equal(items[0].kind, 'unknown');
  assert.equal(items[0].label, 'system:something_from_2027');
});

// These two are emitted on every turn but are absent from the shipped types,
// so the compiler cannot route them and they would otherwise raise an unknown
// card per turn. Silencing them is a deliberate, documented exception.
test('subtypes known only from observation are silent, not unknown', () => {
  for (const subtype of ['post_turn_summary', 'task_summary']) {
    const items = normalize({ type: 'system', subtype, session_id: 's' });
    assert.equal(items[0].kind, 'silent', `${subtype} should not cry wolf`);
    assert.equal(items[0].reason, `undeclared:${subtype}`);
  }
});

test('a message type the types do not declare is surfaced too', () => {
  const items = normalize({ type: 'telepathy', session_id: 's' });
  assert.equal(items[0].kind, 'unknown');
  assert.equal(items[0].label, 'telepathy');
});

test('malformed input never throws and never disappears', () => {
  for (const bad of [null, undefined, 42, 'string', {}, { type: 7 }]) {
    const items = normalizeUntyped(bad);
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'unknown');
  }
});

test('labels read the way the logs and the card both need', () => {
  assert.equal(messageLabel({ type: 'system', subtype: 'init' }), 'system:init');
  assert.equal(messageLabel({ type: 'assistant' }), 'assistant');
  assert.equal(messageLabel(null), 'malformed');
});

// ── Recalled memory ───────────────────────────────────────────────
//
// The one thing that shapes an answer without appearing in the conversation.
// The CLI emits it so a renderer can show it; silencing it meant the reply
// simply knew something, with nothing on screen saying where from.

test('recalled memories become one item carrying every entry', () => {
  const items = normalize({
    type: 'system', subtype: 'memory_recall', mode: 'select', session_id: 's', uuid: 'u',
    memories: [
      { path: '/home/me/.claude/memory/prefers-tabs.md', scope: 'personal' },
      { path: 'https://example.test/org.md', scope: 'organization', content: 'Ship on Fridays.' },
    ],
  });
  assert.deepEqual(items, [{
    kind: 'memory',
    mode: 'select',
    memories: [
      { path: '/home/me/.claude/memory/prefers-tabs.md', scope: 'personal', content: '' },
      { path: 'https://example.test/org.md', scope: 'organization', content: 'Ship on Fridays.' },
    ],
  }]);
});

// A file-backed entry has no body — the renderer lazy-loads from the path — so
// an absent `content` must not become the string "undefined".
test('a memory with no body carries an empty one, not undefined', () => {
  const [item] = normalize({
    type: 'system', subtype: 'memory_recall', mode: 'select', session_id: 's', uuid: 'u',
    memories: [{ path: '/a.md', scope: 'personal' }],
  });
  assert.equal(item.memories[0].content, '');
});

test('a recall that surfaced nothing stays silent', () => {
  assert.deepEqual(
    normalize({ type: 'system', subtype: 'memory_recall', mode: 'select', memories: [], session_id: 's', uuid: 'u' }),
    [{ kind: 'silent', reason: 'memory_recall' }]);
});

// A slash command's output is not Claude talking. Live it arrives bare — the
// `<local-command-stdout>` envelope is only ever written to the transcript —
// so the type is the only thing that can tell the two apart.
test('local command output is its own kind, not assistant prose', () => {
  assert.deepEqual(
    normalize({ type: 'system', subtype: 'local_command_output', content: '  0% used\n', session_id: 's' }),
    [{ kind: 'command_output', text: '0% used', isError: false }]);
});

test('a command that printed nothing is silent', () => {
  assert.deepEqual(
    normalize({ type: 'system', subtype: 'local_command_output', content: '   ', session_id: 's' }),
    [{ kind: 'silent', reason: 'local_command_output' }]);
});

// A local command's output is delivered as an assistant message the CLI wrote
// itself. There is no local_command_output on that path and no
// <local-command-stdout> envelope — both are transcript-only — so the synthetic
// model id is the only thing separating "the CLI printed this" from "Claude
// said this". Without it, /usage read as Claude reciting your usage.
const synthetic = (content) => ({
  type: 'assistant', session_id: 's',
  message: { role: 'assistant', model: '<synthetic>', content },
});

test('a synthetic assistant message is command output, not Claude talking', () => {
  assert.deepEqual(normalize(synthetic([{ type: 'text', text: '  0% used  ' }])),
    [{ kind: 'command_output', text: '0% used', isError: false }]);
});

test('a real assistant message with the same words stays prose', () => {
  assert.deepEqual(normalize(assistant([{ type: 'text', text: '0% used' }])),
    [{ kind: 'text', role: 'assistant', text: '0% used' }]);
});

// Only the prose is re-labelled; a synthetic message carrying anything else
// keeps it as whatever it is.
test('non-text blocks on a synthetic message are left alone', () => {
  const items = normalize(synthetic([
    { type: 'text', text: 'ran it' },
    { type: 'tool_use', id: 't1', name: 'Read', input: {} },
  ]));
  assert.deepEqual(kinds(items), ['command_output', 'tool_use']);
});

// `system:error` is how a session says it could not start or could not go on.
// It is not in the shipped types, so it lands in the undeclared handler — and
// as an "unknown message" card it was the one thing in the transcript that
// mattered most, drawn as the thing that looks most like a glitch.
test('a session error is a notice, not an unknown card', () => {
  assert.deepEqual(normalize({
    type: 'system', subtype: 'error', session_id: 's',
    error: 'Claude Code native binary at /usr/local/bin/claude exists but failed to launch.',
  }), [{
    kind: 'notice', level: 'error',
    text: 'Claude Code native binary at /usr/local/bin/claude exists but failed to launch.',
  }]);
});

// Without a message there is nothing to show but the shape, and the unknown
// card is still the honest answer for that.
test('an error with no message stays an unknown card', () => {
  for (const message of [
    { type: 'system', subtype: 'error', session_id: 's' },
    { type: 'system', subtype: 'error', session_id: 's', error: '   ' },
  ]) {
    assert.equal(normalize(message)[0].kind, 'unknown');
  }
});

// Split apart on purpose. A turn is one request per tool round trip and each
// re-sends the whole prompt, so at a large context the cached figure is nearly
// all of it, every time. Added together they made a headline in the millions
// that grew with round trips rather than with work.
test('cache reads are reported apart from new input', () => {
  const [usage] = normalize({
    type: 'stream_event', session_id: 's',
    event: {
      type: 'message_start',
      message: {
        usage: {
          input_tokens: 1200,
          cache_creation_input_tokens: 300,
          cache_read_input_tokens: 796000,
          output_tokens: 4,
        },
      },
    },
  });
  assert.equal(usage.inputTokens, 1500);     // read for the first time
  assert.equal(usage.cachedTokens, 796000);  // re-read
  assert.equal(usage.outputTokens, 4);
});
