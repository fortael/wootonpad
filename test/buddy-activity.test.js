const test = require('node:test');
const assert = require('node:assert/strict');
const { activityFor, toolActivity } = require('../src/vue/buddy-activity.js');

const assistant = (...content) => ({ type: 'assistant', message: { content } });

test('a turn opening and a tool coming back are thinking', () => {
  assert.equal(activityFor({ type: 'system', subtype: 'init' }), 'Thinking');
  assert.equal(activityFor({ type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } }), 'Thinking');
});

test('a tool call is said as the step in progress', () => {
  assert.equal(activityFor(assistant({ type: 'tool_use', name: 'mcp__wooton__todo_agenda', input: {} })), 'Checking what is due');
  assert.equal(toolActivity('mcp__wooton__read_project_file', { path: 'docs/README.md' }), 'Reading README.md');
  assert.equal(toolActivity('mcp__wooton__search_sessions', { query: 'censor' }), 'Searching “censor”');
  assert.equal(toolActivity('AskUserQuestion'), 'Asking you');
  assert.equal(toolActivity('mcp__wooton__brand_new_tool'), 'Working');
  assert.equal(toolActivity('SomethingElse'), 'Working');
});

test('the newest block of a message decides, and text is the answer being written', () => {
  assert.equal(activityFor(assistant(
    { type: 'text', text: 'Let me look.' },
    { type: 'tool_use', name: 'mcp__wooton__list_sessions', input: {} },
  )), 'Going through sessions');
  assert.equal(activityFor(assistant({ type: 'text', text: 'Here is what I found' })), 'Writing the answer');
  assert.equal(activityFor(assistant({ type: 'thinking', thinking: '' })), 'Thinking');
});

test('anything else leaves the bubble as it is', () => {
  assert.equal(activityFor(null), null);
  assert.equal(activityFor({ type: 'result' }), null);
  assert.equal(activityFor({ type: 'user', message: { content: 'typed prompt' } }), null);
  assert.equal(activityFor(assistant({ type: 'text', text: '  ' })), null);
});
