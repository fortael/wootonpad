const test = require('node:test');
const assert = require('node:assert/strict');
const { toolPolicy, toolsInState, sdkToolRules, trimPolicy, ASK_BY_DEFAULT } = require('../tool-policy.js');
const { TOOL_NAMES } = require('../wooton-mcp.js');

test('reaching out of the app asks first, the rest just runs', () => {
  const policy = toolPolicy(TOOL_NAMES);
  for (const name of ['open_url', 'open_in_app', 'open_folder', 'open_terminal', 'delete_session']) {
    assert.equal(policy[name], 'ask', `${name} should ask`);
  }
  assert.equal(policy.list_sessions, 'auto');
  assert.equal(policy.create_todo, 'auto', 'writing a note is not a surprise');
  assert.equal(Object.keys(policy).length, TOOL_NAMES.length, 'every tool has a state');
  for (const name of ASK_BY_DEFAULT) assert.ok(TOOL_NAMES.includes(name), `${name} is a tool that exists`);
});

test('the user overrides any of it, and nonsense is ignored', () => {
  const policy = toolPolicy(TOOL_NAMES, { open_url: 'auto', list_sessions: 'off', delete_session: 'wat' });
  assert.equal(policy.open_url, 'auto');
  assert.equal(policy.list_sessions, 'off');
  assert.equal(policy.delete_session, 'ask', 'an unknown state falls back to the default');
});

test('the SDK gets pre-approvals and refusals; asking is the absence of both', () => {
  const policy = toolPolicy(['a', 'b', 'c'], { a: 'auto', b: 'ask', c: 'off' });
  const rules = sdkToolRules(policy);
  assert.deepEqual(rules.allowed, ['mcp__wooton__a']);
  assert.deepEqual(rules.disallowed, ['mcp__wooton__c']);
  assert.deepEqual(toolsInState(policy, 'ask'), ['b']);
});

test('only what differs from the default is stored', () => {
  const chosen = { open_url: 'ask', list_sessions: 'off', delete_session: 'auto', nope: 'off', list_todos: 'bad' };
  assert.deepEqual(trimPolicy(TOOL_NAMES, chosen), { list_sessions: 'off', delete_session: 'auto' });
  assert.deepEqual(trimPolicy(TOOL_NAMES, {}), {});
});
