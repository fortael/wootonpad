const test = require('node:test');
const assert = require('node:assert/strict');

const mcp = require('../wooton-mcp');

test('every tool is described with its full name and parameters', () => {
  const tools = mcp.describeTools();
  assert.equal(tools.length, mcp.TOOL_NAMES.length);
  for (const tool of tools) {
    assert.equal(tool.fullName, `mcp__wooton__${tool.name}`);
    assert.ok(tool.description.length > 10, `${tool.name} has a description`);
    assert.ok(Array.isArray(tool.params));
  }
});

test('parameters carry their type, whether they are required, and their description', () => {
  const read = mcp.describeTools().find(t => t.name === 'read_session');
  const sessionId = read.params.find(p => p.name === 'sessionId');
  assert.equal(sessionId.required, true);
  assert.equal(sessionId.type, 'string');
  const limit = read.params.find(p => p.name === 'limit');
  assert.equal(limit.required, false);
  assert.equal(limit.type, 'integer');

  const list = mcp.describeTools().find(t => t.name === 'list_sessions');
  assert.match(list.params.find(p => p.name === 'scope').type, /"active"/);
});

test('only the looking tools are read-only', () => {
  const tools = mcp.describeTools();
  assert.equal(tools.find(t => t.name === 'list_projects').readOnly, true);
  assert.equal(tools.find(t => t.name === 'create_session').readOnly, false);
  assert.equal(tools.find(t => t.name === 'delete_session').readOnly, false);
});

test('running a tool validates its arguments and returns the text the model would see', async () => {
  mcp.configure({
    listProjects: () => [{ projectPath: '/repo/app', name: 'app', sessionCount: 2, lastActivity: null }],
  });
  const ok = await mcp.runTool('list_projects', {});
  assert.equal(ok.ok, true);
  assert.equal(ok.isError, false);
  assert.match(ok.text, /@project:\/repo\/app/);

  const bad = await mcp.runTool('read_session', {});
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Invalid arguments/);

  assert.equal((await mcp.runTool('no_such_tool', {})).ok, false);
});

// ── TODO due dates ────────────────────────────────────────────────

const todoDue = require('../todo-due');

function withTodos(extra = {}) {
  const today = todoDue.localToday();
  const notes = [
    {
      filename: 'a.md', title: 'Release', projects: ['/repo/app'], due: todoDue.addDays(today, 10), modified: null,
      todos: [
        { index: 0, text: 'tag it', done: false, due: null },
        { index: 1, text: 'write notes', done: false, due: todoDue.addDays(today, -2) },
        { index: 2, text: 'shipped', done: true, due: todoDue.addDays(today, -5) },
      ],
    },
    {
      filename: 'b.md', title: 'Chores', projects: [], due: null, modified: null,
      todos: [
        { index: 0, text: 'someday', done: false, due: null },
        { index: 1, text: 'call back', done: false, due: today },
      ],
    },
  ];
  const calls = [];
  mcp.configure({
    listTodos: () => notes,
    setTodoDue: (...args) => { calls.push(['setTodoDue', ...args]); return { ok: true }; },
    createTodo: (args) => { calls.push(['createTodo', args]); return { ok: true, filename: 'new.md' }; },
    ...extra,
  });
  return { today, calls };
}

test('the agenda states today and lists overdue first, then by date, undated last', async () => {
  const { today } = withTodos();
  const res = await mcp.runTool('todo_agenda', {});
  assert.equal(res.isError, false);
  const text = res.text;
  assert.ok(text.startsWith(`Today is ${today}`));
  assert.match(text, /4 open · 1 overdue · 1 due today/);
  const order = ['write notes', 'call back', 'tag it', 'someday'].map(t => text.indexOf(t));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in agenda order');
  assert.match(text, /a\.md#1 — write notes · due \S+ \(2d overdue\) ⚠️/);
  assert.match(text, /a\.md#0 — tag it · due \S+ \([^)]+\) \(list deadline\)/);
  assert.ok(!text.includes('shipped'), 'done items are not on the agenda');
});

test('a window leaves out later and undated items but never overdue ones', async () => {
  withTodos();
  const text = (await mcp.runTool('todo_agenda', { withinDays: 1 })).text;
  assert.ok(text.includes('write notes') && text.includes('call back'));
  assert.ok(!text.includes('tag it') && !text.includes('someday'));
});

test('list_todos shows progress and dates', async () => {
  withTodos();
  const text = (await mcp.runTool('list_todos', {})).text;
  assert.match(text, /a\.md — "Release" · 1\/3 done · list due /);
  assert.match(text, /\[ \] 1 write notes · due \S+ \(2d overdue\) ⚠️/);
  assert.ok(!/shipped · due .*⚠️/.test(text), 'a done item is not flagged late');
});

test('set_todo_due resolves words to a date, and no index means the whole list', async () => {
  const { today, calls } = withTodos();
  let res = await mcp.runTool('set_todo_due', { filename: 'a.md', index: 0, due: 'tomorrow' });
  assert.equal(res.isError, false);
  assert.deepEqual(calls.pop(), ['setTodoDue', 'a.md', 0, todoDue.addDays(today, 1)]);

  res = await mcp.runTool('set_todo_due', { filename: 'a.md', due: 'none' });
  assert.deepEqual(calls.pop(), ['setTodoDue', 'a.md', null, null]);
  assert.match(res.text, /no due date/);

  res = await mcp.runTool('set_todo_due', { filename: 'a.md', index: 0, due: 'whenever' });
  assert.equal(res.isError, true);
  assert.equal(calls.length, 0, 'a bad date writes nothing');
});

test('create_todo passes the list deadline through as a date', async () => {
  const { today, calls } = withTodos();
  const res = await mcp.runTool('create_todo', { title: 'Check logs', due: '+3d' });
  assert.equal(res.isError, false);
  assert.equal(calls.pop()[1].due, todoDue.addDays(today, 3));
});
