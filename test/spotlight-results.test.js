const test = require('node:test');
const assert = require('node:assert/strict');
const { spotlightResults, livingProjects } = require('../src/vue/spotlight-results.js');

const session = (id, name, modified, extra = {}) => ({
  sessionId: id, name, summary: name, modified, ...extra,
});

const projects = () => [
  {
    projectPath: '/Users/zakhar/Projects/wooton-pad',
    sessions: [
      session('a', 'Board redesign', '2026-09-10T10:00:00Z'),
      session('b', 'Search rework', '2026-09-11T10:00:00Z'),
      session('c', 'Old spike', '2026-01-01T10:00:00Z', { archived: 1 }),
    ],
  },
  {
    projectPath: '/Users/zakhar/Projects/my-api',
    sessions: [
      session('d', 'Rate limiting middleware', '2026-09-09T10:00:00Z'),
      session('e', 'wooton-pad client SDK', '2026-09-08T10:00:00Z'),
    ],
  },
  {
    projectPath: '/Users/zakhar/Projects/retired',
    sessions: [session('f', 'wooton experiment', '2026-09-12T10:00:00Z')],
  },
];

const META = { '/Users/zakhar/Projects/retired': { archived: 1 } };

const ids = (rows) => rows.map(r => r.session.sessionId);
const paths = (rows) => rows.map(p => p.projectPath);

test('an empty query is the project list and nothing else', () => {
  const out = spotlightResults({ projects: projects(), query: '' });
  assert.equal(out.projects.length, 3);
  assert.deepEqual(out.sessions, []);
  assert.deepEqual(out.plans, []);
});

test('an archived project is offered nowhere', () => {
  const out = spotlightResults({ projects: projects(), query: '', projectMeta: META });
  assert.ok(!paths(out.projects).includes('/Users/zakhar/Projects/retired'));

  const hits = spotlightResults({ projects: projects(), query: 'wooton', projectMeta: META });
  assert.ok(!ids(hits.sessions).includes('f'), 'its sessions do not leak in either');
});

test('a matching project comes back with all of its live sessions', () => {
  const out = spotlightResults({ projects: projects(), query: 'wooton-pad', projectMeta: META });
  assert.deepEqual(paths(out.projects), ['/Users/zakhar/Projects/wooton-pad']);
  // b before a: most recent first. c is archived.
  assert.deepEqual(ids(out.sessions).slice(0, 2), ['b', 'a']);
  assert.ok(!ids(out.sessions).includes('c'), 'archived sessions stay put away');
});

test("sessions of a named project rank above sessions matched on their own title", () => {
  const out = spotlightResults({ projects: projects(), query: 'wooton', projectMeta: META });
  // 'e' is in my-api and matches only by its title; the named project's own
  // sessions come first whatever their age.
  assert.deepEqual(ids(out.sessions), ['b', 'a', 'e']);
});

test('a session matches on its title, summary or ai title', () => {
  const list = [{
    projectPath: '/p/one',
    sessions: [
      session('x', 'nothing here', '2026-09-01T00:00:00Z', { aiTitle: 'Fixing the migration' }),
      session('y', 'nothing either', '2026-09-02T00:00:00Z'),
    ],
  }];
  const out = spotlightResults({ projects: list, query: 'migration' });
  assert.deepEqual(ids(out.sessions), ['x']);
});

test('plans match on title and filename', () => {
  const plans = [
    { filename: '2026-09-01-search.md', title: 'Search rework' },
    { filename: 'board.md', title: 'Board' },
  ];
  assert.deepEqual(
    spotlightResults({ projects: [], plans, query: 'search' }).plans.map(p => p.filename),
    ['2026-09-01-search.md'],
  );
  assert.deepEqual(
    spotlightResults({ projects: [], plans, query: 'board.md' }).plans.map(p => p.filename),
    ['board.md'],
  );
});

test('limits cap each section', () => {
  const many = [{
    projectPath: '/p/many',
    sessions: Array.from({ length: 30 }, (_, i) => session('s' + i, 'many work', `2026-09-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`)),
  }];
  const out = spotlightResults({ projects: many, query: 'many', limits: { projects: 1, sessions: 4, plans: 1 } });
  assert.equal(out.sessions.length, 4);
});

test('nothing matching gives empty sections rather than throwing', () => {
  const out = spotlightResults({ projects: projects(), query: 'zzzz', projectMeta: META });
  assert.deepEqual(out.projects, []);
  assert.deepEqual(out.sessions, []);
  assert.deepEqual(out.plans, []);
});

test('survives missing input', () => {
  const out = spotlightResults();
  assert.deepEqual(out.projects, []);
  assert.deepEqual(livingProjects(null), []);
  assert.deepEqual(livingProjects([{ projectPath: '/p/a' }, {}]).length, 1);
});

// ── Fuzzy matching ────────────────────────────────────────────────

test('initials find a project the substring matcher would miss', () => {
  const out = spotlightResults({ projects: projects(), query: 'wp', projectMeta: META });
  assert.deepEqual(paths(out.projects), ['/Users/zakhar/Projects/wooton-pad']);
});

test('projects come back ranked, best first', () => {
  const list = [
    { projectPath: '/Users/zakhar/Projects/web-api-playground', sessions: [] },
    { projectPath: '/Users/zakhar/Projects/api', sessions: [] },
  ];
  // Both match "api"; the one that is the word wins over the one that spells
  // it out of three separate pieces.
  assert.deepEqual(paths(spotlightResults({ projects: list, query: 'api' }).projects), [
    '/Users/zakhar/Projects/api',
    '/Users/zakhar/Projects/web-api-playground',
  ]);
});

test('a fuzzy match still has to be a subsequence', () => {
  const out = spotlightResults({ projects: projects(), query: 'pw', projectMeta: META });
  assert.deepEqual(paths(out.projects), [], 'letters out of order do not match');
});

test('a loose match buried in a long title is not a match', () => {
  const list = [{
    projectPath: '/p/one',
    sessions: [
      session('long', 'Set up the schema and seed the staging database from a snapshot', '2026-09-01T00:00:00Z'),
      session('short', 'Session cache rewrite', '2026-09-01T00:00:00Z'),
    ],
  }];
  // "sess" is a subsequence of the long one (s…e…s…s) and the word in the
  // other. Only the second is a result a reader would recognise.
  assert.deepEqual(ids(spotlightResults({ projects: list, query: 'sess' }).sessions), ['short']);
});
