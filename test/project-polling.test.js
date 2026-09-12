const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  TTL, COMPOSE_RECHECK_MS,
  detectCompose, composeCheckDue, pollPlan, activeProjectPaths, jitter,
} = require('../project-polling');

/** An `exists` over a fixed set of paths, with the real path helpers. */
function fs(files, stopAt = '/Users/zakhar') {
  const set = new Set(files);
  return {
    exists: (p) => set.has(p),
    join: path.posix.join,
    dirname: path.posix.dirname,
    stopAt,
  };
}

// ── Compose detection ─────────────────────────────────────────────

test('a compose file in the project root is found', () => {
  const io = fs(['/Users/zakhar/Projects/app/docker-compose.yml']);
  assert.equal(detectCompose('/Users/zakhar/Projects/app', io), true);
});

test('every spelling compose accepts is found', () => {
  for (const name of ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml']) {
    const io = fs([`/Users/zakhar/Projects/app/${name}`]);
    assert.equal(detectCompose('/Users/zakhar/Projects/app', io), true, name);
  }
});

test('a project with no compose file anywhere is false', () => {
  const io = fs(['/Users/zakhar/Projects/app/package.json']);
  assert.equal(detectCompose('/Users/zakhar/Projects/app', io), false);
});

// `docker compose ps` walks up itself, so a service inside a compose-managed
// tree really does have containers.
test('a compose file in a parent directory counts', () => {
  const io = fs(['/Users/zakhar/Projects/stack/compose.yml']);
  assert.equal(detectCompose('/Users/zakhar/Projects/stack/services/api', io), true);
});

test('the walk stops after two levels', () => {
  const io = fs(['/Users/zakhar/Projects/compose.yml']);
  // three levels up — further than compose is likely to be meant for us
  assert.equal(detectCompose('/Users/zakhar/Projects/a/b/c', io), false);
});

// The regression this guard exists for: one compose.yml in the home directory
// would otherwise mark every project under it as having containers.
test('a compose file in the home directory does not count', () => {
  const io = fs(['/Users/zakhar/compose.yml'], '/Users/zakhar');
  assert.equal(detectCompose('/Users/zakhar/app', io), false);
});

test('the walk terminates at the filesystem root', () => {
  const io = fs([], null);
  assert.equal(detectCompose('/', io), false);
});

// ── When to look again ────────────────────────────────────────────

test('a project never looked at is due', () => {
  assert.equal(composeCheckDue(null), true);
  assert.equal(composeCheckDue({ hasCompose: null, composeCheckedAt: null }), true);
});

test('a fresh answer is not due', () => {
  const now = Date.now();
  assert.equal(composeCheckDue({ hasCompose: false, composeCheckedAt: now - 1000 }, now), false);
});

test('a day-old answer is due again — a compose file may have been added', () => {
  const now = Date.now();
  assert.equal(composeCheckDue({ hasCompose: false, composeCheckedAt: now - COMPOSE_RECHECK_MS - 1 }, now), true);
});

test('a recorded answer with no timestamp is due', () => {
  assert.equal(composeCheckDue({ hasCompose: true, composeCheckedAt: null }), true);
});

// ── The poll plan ─────────────────────────────────────────────────

const NOW = 1_700_000_000_000;
const base = { active: false, archived: false, hasCompose: true, gitFetchedAt: NOW, dockerFetchedAt: NOW };

test('nothing is due when everything was just fetched', () => {
  assert.deepEqual(pollPlan({ ...base }, NOW), { git: false, docker: false });
});

test('a project never fetched is due for both', () => {
  assert.deepEqual(
    pollPlan({ ...base, gitFetchedAt: null, dockerFetchedAt: null }, NOW),
    { git: true, docker: true },
  );
});

test('an active project is due for git long before an idle one', () => {
  const at = NOW - TTL.activeGit - 1;
  assert.equal(pollPlan({ ...base, active: true, gitFetchedAt: at }, NOW).git, true);
  assert.equal(pollPlan({ ...base, active: false, gitFetchedAt: at }, NOW).git, false);
});

test('an idle project does come due eventually', () => {
  const at = NOW - TTL.idleGit - 1;
  assert.equal(pollPlan({ ...base, active: false, gitFetchedAt: at }, NOW).git, true);
});

// Containers change state far more rarely than a working tree, and asking
// costs far more — so docker's interval is the longer one on both sides.
test('docker is asked less often than git', () => {
  assert.ok(TTL.activeDocker > TTL.activeGit);
  assert.ok(TTL.idleDocker > TTL.idleGit);
});

test('an active project is due for docker before an idle one', () => {
  const at = NOW - TTL.activeDocker - 1;
  assert.equal(pollPlan({ ...base, active: true, dockerFetchedAt: at }, NOW).docker, true);
  assert.equal(pollPlan({ ...base, active: false, dockerFetchedAt: at }, NOW).docker, false);
});

// The point of the whole flag: a project with no compose file is never asked
// again, however long it has been.
test('a project known to have no compose file is never asked about docker', () => {
  const plan = pollPlan({ ...base, hasCompose: false, dockerFetchedAt: null }, NOW);
  assert.equal(plan.docker, false);
  assert.equal(plan.git, false, 'git is unaffected by the compose flag');
});

test('an unknown compose flag is a reason to look, not to skip', () => {
  assert.equal(pollPlan({ ...base, hasCompose: null, dockerFetchedAt: null }, NOW).docker, true);
});

test('an archived project is not polled at all', () => {
  assert.deepEqual(
    pollPlan({ ...base, archived: true, gitFetchedAt: null, dockerFetchedAt: null }, NOW),
    { git: false, docker: false },
  );
});

test('opening an archived project overrides the whole policy', () => {
  assert.deepEqual(
    pollPlan({ ...base, archived: true, force: true }, NOW),
    { git: true, docker: true },
  );
});

test('a forced refresh still skips docker when there is no compose file', () => {
  assert.deepEqual(
    pollPlan({ ...base, hasCompose: false, force: true }, NOW),
    { git: true, docker: false },
  );
});

// ── Which projects the activity poller visits ─────────────────────

test('one entry per project, however many sessions it has', () => {
  const paths = ['/a', '/b', '/a', '/a'];
  assert.deepEqual(activeProjectPaths(paths, new Map()), ['/a', '/b']);
});

test('sessions with no project path are skipped', () => {
  assert.deepEqual(activeProjectPaths([null, undefined, '', '/a'], new Map()), ['/a']);
});

test('an archived project is left out even when a session is live in it', () => {
  const meta = new Map([['/a', { archived: true }]]);
  assert.deepEqual(activeProjectPaths(['/a', '/b'], meta), ['/b']);
});

test('no sessions means no projects to poll', () => {
  assert.deepEqual(activeProjectPaths([], new Map()), []);
});

test('a missing meta map is treated as nothing archived', () => {
  assert.deepEqual(activeProjectPaths(['/a'], undefined), ['/a']);
});

// ── Jitter ────────────────────────────────────────────────────────

test('jitter stays inside ±25% so two intervals never swap order', () => {
  for (const r of [0, 0.5, 0.999999]) {
    const v = jitter(1000, () => r);
    assert.ok(v >= 750 && v <= 1250, `${v} out of range for rand=${r}`);
  }
});

// ── The wiring ────────────────────────────────────────────────────
//
// Everything above runs against fakes. main.js cannot be required outside
// Electron, so that the rules are actually the ones main.js follows is checked
// as text — crude, and it catches the failure that matters: the module quietly
// stops being consulted and every project is polled again.
test('main.js drives its polling through this module', () => {
  const fsReal = require('node:fs');
  const source = fsReal.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

  assert.match(source, /require\('\.\/project-polling'\)/, 'module is not imported');
  assert.match(source, /pollPlan\(/, 'the plan is never asked for');
  assert.match(source, /detectCompose\(/, 'the compose flag is never detected');
  assert.match(source, /activeProjectPaths\(/, 'the active set is never computed');

  // The flag has to be written, or it is recomputed forever and saves nothing.
  assert.match(source, /setProjectCompose\(/, 'the compose flag is never stored');
});

// A tick that runs exactly as often as the interval it checks finds nothing due
// half the time, and the effective rate silently halves. Measured at 20 s/20 s:
// one refresh in a 70 s window where three were due.
test('the activity tick runs more often than the shortest interval it checks', () => {
  const fsReal = require('node:fs');
  const source = fsReal.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const m = source.match(/const ACTIVE_POLL_MS = ([^;]+);/);
  assert.ok(m, 'ACTIVE_POLL_MS is not declared');
  const tick = Function(`"use strict"; return (${m[1]})`)();
  const shortest = Math.min(TTL.activeGit, TTL.idleGit, TTL.activeDocker, TTL.idleDocker);
  assert.ok(tick < shortest, `tick ${tick}ms is not shorter than ${shortest}ms`);
});
