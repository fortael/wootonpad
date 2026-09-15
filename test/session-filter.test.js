const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The module is an ES module in src/vue; node:test runs CommonJS here, so it is
// loaded the same way the other renderer-module tests do it.
const { filterSessions, isPlainTerminal, projectHasVisibleSessions } = require('../src/vue/session-filter.js');

const chat = (over = {}) => ({ sessionId: 'c1', modified: new Date().toISOString(), ...over });
const term = (over = {}) => chat({ sessionId: 't1', type: 'terminal', ...over });

// ── What a terminal is ────────────────────────────────────────────

test('a session typed terminal is a plain terminal', () => {
  assert.equal(isPlainTerminal(term()), true);
});

test('everything else is not', () => {
  assert.equal(isPlainTerminal(chat()), false);
  assert.equal(isPlainTerminal(chat({ type: 'sdk' })), false);
  assert.equal(isPlainTerminal(null), false);
  assert.equal(isPlainTerminal(undefined), false);
});

// ── The list keeps them, the board does not ───────────────────────

test('terminals are in the list by default — that is where they were launched', () => {
  const out = filterSessions([chat(), term()]);
  assert.deepEqual(out.map(s => s.sessionId), ['c1', 't1']);
});

test('showTerminals: false drops them', () => {
  const out = filterSessions([chat(), term()], { showTerminals: false });
  assert.deepEqual(out.map(s => s.sessionId), ['c1']);
});

test('dropping terminals leaves the other rules alone', () => {
  const sessions = [chat({ starred: 1 }), chat({ sessionId: 'c2' }), term({ starred: 1 })];
  const out = filterSessions(sessions, { showTerminals: false, showStarredOnly: true });
  assert.deepEqual(out.map(s => s.sessionId), ['c1']);
});

// A terminal has no transcript, so a search hit on one is a hit on its title
// alone — and the board is no place to land on it.
test('a search does not put a terminal back on the board', () => {
  const out = filterSessions([chat(), term()], {
    showTerminals: false,
    searchMatchIds: new Set(['c1', 't1']),
  });
  assert.deepEqual(out.map(s => s.sessionId), ['c1']);
});

test('an archived terminal is dropped once, not twice', () => {
  const out = filterSessions([term({ archived: 1 })], { showTerminals: false });
  assert.deepEqual(out, []);
});

test('no sessions is no sessions', () => {
  assert.deepEqual(filterSessions([], { showTerminals: false }), []);
  assert.deepEqual(filterSessions(null, { showTerminals: false }), []);
});

// ── The wiring ────────────────────────────────────────────────────
//
// The rules above are what the module does. That the board is the caller
// asking for them is checked as text: a Vue SFC cannot be required here, and
// the failure that matters is the option quietly going missing from the call.

function sfc(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', 'vue', 'components', name), 'utf8');
}

test('the board asks for the terminal-free set', () => {
  assert.match(sfc('SessionBoardApp.vue'), /showTerminals:\s*false/, 'the board draws terminals again');
});

test("the board's sidebar counts match the board", () => {
  assert.match(sfc('BoardSidebarApp.vue'), /showTerminals:\s*false/, 'the counts include terminals the board will not draw');
});

// The sessions list must NOT pass it — a terminal you launched has to appear
// somewhere, and the list is the only place left.
test('the sessions list still shows terminals', () => {
  assert.doesNotMatch(sfc('ProjectGroup.vue'), /showTerminals:\s*false/);
});

// ── The side panel ────────────────────────────────────────────────

test('the panel rail hides its tabs over a terminal but keeps stop and close', () => {
  const rail = sfc('SessionPanelRail.vue');
  assert.match(rail, /isPlainTerminal\(store\.headerSession\)\s*\?\s*\[\]\s*:\s*TABS/, 'the tabs are no longer gated');
  assert.match(rail, /v-for="tab in visibleTabs"/, 'the list still renders every tab');
  // The two controls that must survive, whatever the session is.
  assert.match(rail, /aria-label="Stop session"/);
  assert.match(rail, /aria-label="Close session view"/);
});

test('the side panel never opens over a terminal', () => {
  assert.match(
    sfc('App.vue'),
    /sidePanelVisible = computed\(\(\) =>\s*\n\s*!!store\.sidePanelTab && !!store\.headerSession && !headerIsTerminal\.value/,
    'sidePanelVisible no longer excludes terminals',
  );
});

// ── Empty project groups ──────────────────────────────────────────
//
// A project with nothing surviving the filters is a collapsible header with
// nothing behind it. One with no sessions at all is one on every tab, forever —
// it was briefly exempted on the unfiltered list, which is how empty groups
// came back to Recent twice.

const ptys = (...ids) => new Set(ids);

test('a project with no sessions at all is never listed, filters or none', () => {
  const empty = { projectPath: '/p', sessions: [] };
  assert.equal(projectHasVisibleSessions(empty, {}), false);
  assert.equal(projectHasVisibleSessions(empty, { showArchived: true }), false);
  assert.equal(projectHasVisibleSessions(empty, { showStarredOnly: true }), false);
});

test('a project whose only sessions are archived is not listed by default', () => {
  const project = { projectPath: '/p', sessions: [{ sessionId: 'a', archived: true }] };
  assert.equal(projectHasVisibleSessions(project, {}), false);
  assert.equal(projectHasVisibleSessions(project, { showArchived: true }), true);
});

test('a project with one live session is listed', () => {
  const project = { projectPath: '/p', sessions: [{ sessionId: 'a' }] };
  assert.equal(projectHasVisibleSessions(project, {}), true);
});

// The rules are filterSessions', by calling it — not a second copy.
test('the running filter is the same one sessions are judged by', () => {
  const project = { projectPath: '/p', sessions: [{ sessionId: 'a' }, { sessionId: 'b' }] };
  const opts = { showRunningOnly: true, activePtyIds: ptys('b') };
  assert.equal(projectHasVisibleSessions(project, opts), true);
  assert.equal(projectHasVisibleSessions(project, { ...opts, activePtyIds: ptys('z') }), false);
});

test('a malformed project is not listed rather than throwing', () => {
  for (const project of [null, undefined, {}, { sessions: null }]) {
    assert.equal(projectHasVisibleSessions(project, {}), false);
  }
});
