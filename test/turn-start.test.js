const test = require('node:test');
const assert = require('node:assert/strict');
const { lastPromptAt } = require('../src/vue/turn-start.js');

const at = (s) => new Date(s).toISOString();

test('the turn began at the last thing the user said', () => {
  const entries = [
    { type: 'user', timestamp: at('2026-09-22T06:40:00Z'), message: { content: 'first' } },
    { type: 'assistant', timestamp: at('2026-09-22T06:40:05Z'), message: { content: [{ type: 'text', text: 'ok' }] } },
    { type: 'user', timestamp: at('2026-09-22T06:50:00Z'), message: { content: [{ type: 'text', text: 'run the tests' }] } },
    { type: 'assistant', timestamp: at('2026-09-22T06:56:42Z'), message: { content: [{ type: 'tool_use', id: 't1' }] } },
  ];
  assert.equal(lastPromptAt(entries), Date.parse('2026-09-22T06:50:00Z'));
});

test('tool results, meta notes and subagent lines do not start a turn', () => {
  const entries = [
    { type: 'user', timestamp: at('2026-09-22T06:50:00Z'), message: { content: 'go' } },
    { type: 'user', timestamp: at('2026-09-22T06:51:00Z'), message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } },
    { type: 'user', timestamp: at('2026-09-22T06:52:00Z'), toolUseResult: {}, message: { content: 'x' } },
    { type: 'user', timestamp: at('2026-09-22T06:53:00Z'), isMeta: true, message: { content: 'caveat' } },
    { type: 'user', timestamp: at('2026-09-22T06:54:00Z'), isSidechain: true, message: { content: 'agent prompt' } },
    { type: 'user', timestamp: at('2026-09-22T06:55:00Z'), message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
    { type: 'user', timestamp: at('2026-09-22T06:56:00Z'), message: { content: '[Request interrupted by user for tool use]' } },
  ];
  assert.equal(lastPromptAt(entries), Date.parse('2026-09-22T06:50:00Z'));
});

test('no prompt in the window is 0, not a guess', () => {
  assert.equal(lastPromptAt([{ type: 'assistant', timestamp: at('2026-09-22T06:56:42Z'), message: { content: [] } }]), 0);
  assert.equal(lastPromptAt(undefined), 0);
});
