const test = require('node:test');
const assert = require('node:assert/strict');
const { matchProjects, projectMention } = require('../src/vue/project-mentions.js');
const { DEFAULT_PROMPTS, promptButtons } = require('../src/vue/buddy-suggestions.js');

const projects = [
  { projectPath: '/Users/zakhar/Projects/wootonpad' },
  { projectPath: '/Users/zakhar/Projects/notes-site' },
  { projectPath: '/Users/zakhar/work/wooton-invoices' },
  { projectPath: '/Users/zakhar/.claude/worktrees/fix-thing' },
  { projectPath: '/Users/zakhar/.wootonpad/groups', isGroupContainer: true },
];

const names = (token) => matchProjects(projects, token).map(p => p.name);

test('a half-typed mention offers the projects it could mean, best first', () => {
  // Same rank, so alphabetical: a list that reorders itself between keystrokes
  // is a list you cannot aim at.
  assert.deepEqual(names('woot'), ['wooton-invoices', 'wootonpad']);
  assert.deepEqual(names('invoice'), ['wooton-invoices'], 'a match inside the name counts');
  assert.deepEqual(names('nothing-like-this'), []);
});

test('the prefix Buddy reads is accepted while it is being typed', () => {
  assert.deepEqual(names('project:woot'), ['wooton-invoices', 'wootonpad']);
  assert.equal(projectMention('/Users/zakhar/Projects/wootonpad'), '@project:/Users/zakhar/Projects/wootonpad ');
});

test('a bare @ offers everything worth pointing at', () => {
  const all = names('');
  assert.deepEqual(all, ['notes-site', 'wooton-invoices', 'wootonpad']);
  assert.ok(!all.includes('fix-thing'), 'a worktree is reached through its project');
  assert.ok(!all.some(n => n === 'groups'), 'the group container is not a project');
});

test('the folder a project sits in is offered as its hint, and matches too', () => {
  const [found] = matchProjects(projects, 'work');
  assert.equal(found.name, 'wooton-invoices');
  assert.equal(found.folder, 'zakhar/work');
});

test('a Windows project is named and hinted from its backslashed path', () => {
  const [hit] = matchProjects([{ projectPath: 'C:\\Users\\u\\work\\invoices' }], 'inv');
  assert.equal(hit.name, 'invoices');
  assert.equal(hit.folder, 'u/work');
});

test('the quick questions fall back one by one', () => {
  assert.deepEqual(promptButtons([]), DEFAULT_PROMPTS);
  assert.deepEqual(promptButtons(null), DEFAULT_PROMPTS);
  const mine = promptButtons(['  Mine  ', '', null, undefined, 'Last']);
  assert.equal(mine[0], 'Mine');
  assert.equal(mine[1], DEFAULT_PROMPTS[1]);
  assert.equal(mine[4], 'Last');
  assert.equal(mine.length, 5);
});
