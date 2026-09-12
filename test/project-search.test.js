const test = require('node:test');
const assert = require('node:assert/strict');
const { matchProjectPaths, projectName } = require('../src/vue/project-search.js');

const projects = [
  { projectPath: '/Users/zakhar/Projects/switchboard' },
  { projectPath: '/Users/zakhar/Projects/wootonpad-site' },
  { projectPath: '/Users/zakhar/work/invoices' },
  { projectPath: '/srv/deploy/switchboard-staging' },
];

const paths = (query) => [...matchProjectPaths(projects, query)];

test('matches on the project name', () => {
  assert.deepEqual(paths('invoices'), ['/Users/zakhar/work/invoices']);
});

test('matching is case-insensitive and partial', () => {
  assert.deepEqual(paths('SWITCH'), [
    '/Users/zakhar/Projects/switchboard',
    '/srv/deploy/switchboard-staging',
  ]);
});

test('matches on the folder the project sits in', () => {
  assert.deepEqual(paths('work'), ['/Users/zakhar/work/invoices']);
});

// The whole path would match every project on the machine for these two, which
// is the reason folder matching starts below the home directory.
test('the home directory is not part of the folder', () => {
  assert.deepEqual(paths('users'), []);
  assert.deepEqual(paths('zakhar'), []);
});

test('a name that only the path carries still matches from the folder', () => {
  assert.deepEqual(paths('deploy'), ['/srv/deploy/switchboard-staging']);
});

test('an empty query matches nothing', () => {
  assert.deepEqual(paths(''), []);
  assert.deepEqual(paths('   '), []);
  assert.deepEqual([...matchProjectPaths(projects, null)], []);
});

test('survives a missing or malformed project list', () => {
  assert.deepEqual([...matchProjectPaths(null, 'x')], []);
  assert.deepEqual([...matchProjectPaths([{}, { projectPath: '' }], 'x')], []);
});

test('projectName is the last segment, trailing slash or not', () => {
  assert.equal(projectName('/Users/zakhar/Projects/switchboard'), 'switchboard');
  assert.equal(projectName('/Users/zakhar/Projects/switchboard/'), 'switchboard');
  assert.equal(projectName(''), '');
});
