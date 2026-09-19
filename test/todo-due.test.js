const test = require('node:test');
const assert = require('node:assert/strict');

const due = require('../todo-due');

const TODAY = '2026-09-19'; // a Saturday

test('a due date is a real calendar day in ISO form', () => {
  assert.equal(due.isDueDate('2026-09-20'), true);
  assert.equal(due.isDueDate('2026-02-30'), false);
  assert.equal(due.isDueDate('2026-9-20'), false);
  assert.equal(due.isDueDate(null), false);
});

test('today is the local calendar day, not the UTC one', () => {
  assert.equal(due.localToday(new Date(2026, 8, 19, 23, 59)), '2026-09-19');
  assert.equal(due.localToday(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});

test('day arithmetic crosses months and years', () => {
  assert.equal(due.addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(due.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(due.daysUntil('2026-09-17', TODAY), -2);
  assert.equal(due.daysUntil('2026-10-19', TODAY), 30);
});

test('an item\'s date comes out of its text in either spelling', () => {
  assert.deepEqual(due.parseDueToken('check logs due:2026-09-20'), { due: '2026-09-20', text: 'check logs' });
  assert.deepEqual(due.parseDueToken('check logs 📅 2026-09-20'), { due: '2026-09-20', text: 'check logs' });
  assert.deepEqual(due.parseDueToken('due:2026-09-20 first'), { due: '2026-09-20', text: 'first' });
  assert.deepEqual(due.parseDueToken('plain item'), { due: null, text: 'plain item' });
});

test('a date inside a word or a URL is not a due date', () => {
  assert.equal(due.parseDueToken('see https://x.dev/overdue:2026-09-20').due, null);
  assert.equal(due.parseDueToken('release-2026-09-20 notes').due, null);
  assert.equal(due.parseDueToken('overdue:2026-09-20').due, null);
});

test('an impossible date is dropped from the text but not kept as a date', () => {
  assert.deepEqual(due.parseDueToken('thing due:2026-02-30'), { due: null, text: 'thing' });
});

test('setting a date rewrites the token at the end and keeps the rest of the line', () => {
  assert.equal(due.setDueToken('] check logs', '2026-09-20'), '] check logs due:2026-09-20');
  assert.equal(due.setDueToken('] check logs due:2026-09-01 ', '2026-09-20'), '] check logs due:2026-09-20');
  assert.equal(due.setDueToken('] check 📅 2026-09-01 logs', '2026-09-20'), '] check logs due:2026-09-20');
  assert.equal(due.setDueToken('] check logs due:2026-09-01', null), '] check logs');
});

test('status says how pressing a date is, and a done item is never late', () => {
  assert.equal(due.dueStatus('2026-09-18', TODAY), 'overdue');
  assert.equal(due.dueStatus('2026-09-19', TODAY), 'today');
  assert.equal(due.dueStatus('2026-09-21', TODAY), 'soon');
  assert.equal(due.dueStatus('2026-09-22', TODAY), 'later');
  assert.equal(due.dueStatus(null, TODAY), 'none');
  assert.equal(due.dueStatus('2026-09-01', TODAY, true), 'done');
});

test('labels say how long is left, or how late it is', () => {
  assert.equal(due.dueLabel('2026-09-16', TODAY), '3d overdue');
  assert.equal(due.dueLabel('2026-09-18', TODAY), 'yesterday');
  assert.equal(due.dueLabel('2026-09-19', TODAY), 'today');
  assert.equal(due.dueLabel('2026-09-20', TODAY), 'tomorrow');
  assert.equal(due.dueLabel('2026-09-23', TODAY), 'in 4d');
  assert.equal(due.dueLabel('2026-10-02', TODAY), 'in 13d');
  assert.equal(due.dueLabel('2026-10-05', TODAY), 'in 2w');
  assert.equal(due.dueLabel('2026-12-01', TODAY), 'Dec 1');
  assert.equal(due.dueLabel('2027-01-05', TODAY), '2027-01-05');
});

test('dates typed in words resolve against today', () => {
  const at = input => due.resolveDueInput(input, TODAY);
  assert.deepEqual(at('2026-10-01'), { ok: true, due: '2026-10-01' });
  assert.deepEqual(at('today'), { ok: true, due: TODAY });
  assert.deepEqual(at('Tomorrow'), { ok: true, due: '2026-09-20' });
  assert.deepEqual(at('+3d'), { ok: true, due: '2026-09-22' });
  assert.deepEqual(at('+2w'), { ok: true, due: '2026-10-03' });
  assert.deepEqual(at('monday'), { ok: true, due: '2026-09-21' });
  assert.deepEqual(at('sat'), { ok: true, due: '2026-09-26' }, 'the next Saturday, never today');
  assert.deepEqual(at('none'), { ok: true, due: null });
  assert.deepEqual(at(''), { ok: true, due: null });
  assert.equal(at('next sprint').ok, false);
  assert.equal(at('2026-02-30').ok, false);
});

test('the next due date of a note is its earliest open one, the list\'s standing in', () => {
  const todos = [
    { done: true, due: '2026-09-01' },
    { done: false, due: '2026-09-25' },
    { done: false, due: null },
  ];
  assert.equal(due.nextDue(todos, '2026-09-30'), '2026-09-25');
  assert.equal(due.nextDue(todos, '2026-09-20'), '2026-09-20');
  assert.equal(due.nextDue([{ done: true, due: '2026-09-01' }], null), null);
});

test('the agenda puts overdue first, then by date, then the undated in list order', () => {
  const notes = [
    {
      filename: 'a.md', title: 'A', projects: ['/repo/a'], due: '2026-09-25',
      todos: [
        { index: 0, text: 'inherits the list date', done: false, due: null },
        { index: 1, text: 'already done', done: true, due: '2026-09-01' },
        { index: 2, text: 'late', done: false, due: '2026-09-15' },
      ],
    },
    {
      filename: 'b.md', title: 'B', projects: ['/repo/b'], due: null,
      todos: [
        { index: 0, text: 'someday', done: false, due: null },
        { index: 1, text: 'today', done: false, due: TODAY },
        { index: 2, text: 'later late', done: false, due: '2026-09-18' },
      ],
    },
  ];
  const items = due.agenda(notes, TODAY);
  assert.deepEqual(items.map(i => i.text), ['late', 'later late', 'today', 'inherits the list date', 'someday']);
  assert.equal(items[0].status, 'overdue');
  assert.equal(items[3].inherited, true);
  assert.equal(items[3].due, '2026-09-25');
  assert.equal(items[4].due, null);

  const soon = due.agenda(notes, TODAY, { withinDays: 2, includeUndated: false });
  assert.deepEqual(soon.map(i => i.text), ['late', 'later late', 'today'], 'overdue always counts as within');

  assert.deepEqual(due.agenda(notes, TODAY, { project: '/repo/b' }).map(i => i.filename), ['b.md', 'b.md', 'b.md']);
});

test('agenda buckets', () => {
  assert.equal(due.agendaBucket(-1), 'overdue');
  assert.equal(due.agendaBucket(0), 'today');
  assert.equal(due.agendaBucket(1), 'tomorrow');
  assert.equal(due.agendaBucket(7), 'week');
  assert.equal(due.agendaBucket(8), 'later');
  assert.equal(due.agendaBucket(null), 'none');
});
