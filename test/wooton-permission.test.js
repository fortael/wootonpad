const test = require('node:test');
const assert = require('node:assert/strict');

const { describeWootonPermission, splitChecklist } = require('../src/vue/wooton-permission.js');

const ALWAYS = { suggestions: [{ type: 'addRules' }] };

test('a TODO is asked about as its title and checklist, not as JSON', () => {
  const d = describeWootonPermission('mcp__wooton__create_todo', {
    title: 'Index review in content-data-mart',
    body: '- [ ] Review existing indexes\n- [ ] Check slow queries\nSome context',
    projects: ['/repo/content-data-mart'],
  }, ALWAYS);
  assert.equal(d.question, 'Add this TODO?');
  assert.deepEqual(d.projects, ['/repo/content-data-mart']);
  const title = d.fields.find(f => f.label === 'Title');
  assert.equal(title.value, 'Index review in content-data-mart');
  const list = d.fields.find(f => f.kind === 'checklist');
  assert.deepEqual(list.items.map(i => i.text), ['Review existing indexes', 'Check slow queries']);
  assert.equal(d.fields.find(f => f.label === 'Note').value, 'Some context');
  assert.ok(!JSON.stringify(d.fields).includes('- [ ]'), 'no Markdown source left in the fields');
});

test('the answers read as options, with "always" only when the CLI offers a rule', () => {
  const withRule = describeWootonPermission('mcp__wooton__create_todo', { title: 'x' }, ALWAYS);
  assert.deepEqual(withRule.choices.map(c => c.id), ['allow', 'always', 'deny']);
  assert.equal(withRule.choices[0].label, 'Add it');
  const withoutRule = describeWootonPermission('mcp__wooton__create_todo', { title: 'x' }, {});
  assert.deepEqual(withoutRule.choices.map(c => c.id), ['allow', 'deny']);
});

test('deleting a session warns, is marked dangerous, and never offers "always"', () => {
  const d = describeWootonPermission('mcp__wooton__delete_session',
    { sessionId: '3f1c2a44-1111-2222-3333-aaaaaaaaaaaa' }, ALWAYS);
  assert.equal(d.kind, 'danger');
  assert.match(d.warning, /cannot be undone/);
  assert.deepEqual(d.sessions, ['3f1c2a44-1111-2222-3333-aaaaaaaaaaaa']);
  assert.deepEqual(d.choices.map(c => c.id), ['allow', 'deny']);
  assert.equal(d.choices[0].tone, 'danger');
});

test('a tool without a tailored shape still gets fields, not JSON', () => {
  const d = describeWootonPermission('mcp__wooton__future_tool', { label: 'x', tags: ['a', 'b'], projectPath: '/repo/a' });
  assert.deepEqual(d.fields.map(f => f.kind), ['text', 'list']);
  assert.deepEqual(d.projects, ['/repo/a']);
  assert.equal(d.fields.some(f => f.label === 'projectPath'), false, 'the project is a chip, not a field too');
});

test('a checklist splits into items and prose', () => {
  assert.deepEqual(splitChecklist('# Heading\n- [x] done\n* [ ] open\nplain'), {
    items: [{ text: 'done', done: true }, { text: 'open', done: false }],
    note: 'Heading\nplain',
  });
});
