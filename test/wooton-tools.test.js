const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isWootonTool, wootonToolName, describeWootonCall, summarizeWootonResult, wootonResultText,
} = require('../src/vue/wooton-tools.js');
const { LUCIDE } = require('../src/vue/lucide-icons.js');

// The Chat tab's assistant acts through wooton-mcp.js, and its calls are drawn
// as cards rather than as a tool row with a JSON blob. These are the decisions
// behind a card: what the act is called, how much it changed, and which
// projects and sessions it touched.

const UUID = '3f7a1b20-4c5d-4e6f-8a9b-0c1d2e3f4a5b';
const OTHER = '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

/** Every tool wooton-mcp.js serves, read off its own list. */
function servedTools() {
  const { TOOL_NAMES } = require('../wooton-mcp.js');
  return TOOL_NAMES;
}

// ── Recognising one ───────────────────────────────────────────────

test('only mcp__wooton__ tools are wooton tools', () => {
  assert.equal(isWootonTool('mcp__wooton__list_sessions'), true);
  for (const name of ['list_sessions', 'mcp__browser__navigate', 'Bash', '', null, undefined, 42]) {
    assert.equal(isWootonTool(name), false, String(name));
  }
});

test('the prefix is plumbing and comes off', () => {
  assert.equal(wootonToolName('mcp__wooton__git_status'), 'git_status');
});

// ── Describing a call ─────────────────────────────────────────────

// A tool added to the server without a row here would render with a fallback
// verb and a robot for an icon. It still works; it just reads worse.
test('every tool the server serves has its own verb and a bundled icon', () => {
  for (const tool of servedTools()) {
    const call = describeWootonCall(`mcp__wooton__${tool}`, {});
    assert.equal(call.tool, tool);
    assert.notEqual(call.icon, 'bot', `${tool} fell back to the default icon`);
    assert.ok(LUCIDE[call.icon], `${tool}: icon "${call.icon}" is not in lucide-icons.js`);
    assert.ok(['read', 'write', 'danger'].includes(call.kind), `${tool}: kind ${call.kind}`);
    assert.ok(call.verb && call.verb[0] === call.verb[0].toUpperCase(), `${tool}: verb "${call.verb}"`);
  }
});

test('the verbs say what was done', () => {
  const verb = (tool, input) => describeWootonCall(`mcp__wooton__${tool}`, input).verb;
  assert.equal(verb('list_projects'), 'Listed projects');
  assert.equal(verb('list_sessions'), 'Listed sessions');
  assert.equal(verb('read_session'), 'Read session');
  assert.equal(verb('peek_active_sessions'), 'Checked running sessions');
  assert.equal(verb('search_sessions'), 'Searched sessions');
  assert.equal(verb('git_status'), 'Checked git');
  assert.equal(verb('unpushed_work'), 'Checked unpushed work');
  assert.equal(verb('account_limits'), 'Checked usage limits');
  assert.equal(verb('create_session'), 'Started session');
  assert.equal(verb('create_group_session'), 'Started group session');
  assert.equal(verb('send_to_session'), 'Sent to session');
  assert.equal(verb('delete_session'), 'Deleted session');
  assert.equal(verb('set_group_projects'), 'Changed group projects');
  assert.equal(verb('create_todo'), 'Added TODO');
});

test('archiving with archived:false is unarchiving', () => {
  const verb = (input) => describeWootonCall('mcp__wooton__archive_session', input).verb;
  assert.equal(verb({ sessionId: UUID }), 'Archived session');
  assert.equal(verb({ sessionId: UUID, archived: true }), 'Archived session');
  assert.equal(verb({ sessionId: UUID, archived: false }), 'Unarchived session');
});

// Delete is the one act nothing brings back; stopping and archiving are not.
test('only deleting is dangerous; stopping and archiving are writes, looking is a read', () => {
  const kind = (tool) => describeWootonCall(`mcp__wooton__${tool}`, {}).kind;
  assert.equal(kind('delete_session'), 'danger');
  assert.equal(kind('stop_session'), 'write');
  assert.equal(kind('archive_session'), 'write');
  assert.equal(kind('send_to_session'), 'write');
  assert.equal(kind('list_sessions'), 'read');
  assert.equal(kind('git_status'), 'read');
});

test('a list of sessions names its scope and its window', () => {
  const detail = (input) => describeWootonCall('mcp__wooton__list_sessions', input).detail;
  assert.equal(detail({ scope: 'active', activeWithinSeconds: 600 }), 'active · last 10 min');
  assert.equal(detail({ scope: 'groups' }), 'group sessions');
  assert.equal(detail({ activeWithinSeconds: 7200, limit: 50 }), 'last 2 h · up to 50');
  assert.equal(detail({}), '');
});

test('a search shows the query it ran, quoted', () => {
  const call = describeWootonCall('mcp__wooton__search_sessions', { query: 'login bug' });
  assert.equal(call.detail, '“login bug”');
  const shallow = describeWootonCall('mcp__wooton__search_sessions', { query: 'x', titleOnly: true });
  assert.equal(shallow.detail, '“x” · titles only');
  const terms = describeWootonCall('mcp__wooton__search_sessions', { terms: ['auth', 'login'], withinDays: 7 });
  assert.equal(terms.detail, '“auth” “login” · last 7 days');
});

test('what was sent is shown, flattened and cut to fit a header', () => {
  const call = describeWootonCall('mcp__wooton__send_to_session', {
    sessionId: UUID,
    text: 'please run\n\nthe tests  again ' + 'and again '.repeat(30),
  });
  assert.ok(call.detail.startsWith('“please run the tests again'), call.detail);
  assert.ok(call.detail.endsWith('…”'), call.detail);
  assert.ok(call.detail.length <= 100, `${call.detail.length} chars`);
});

test('a new session is described by its name and its prompt', () => {
  const detail = (input) => describeWootonCall('mcp__wooton__create_session', input).detail;
  assert.equal(detail({ projectPath: '/p', name: 'Fix login', prompt: 'Look at auth.js' }),
    '“Fix login” · Look at auth.js');
  assert.equal(detail({ projectPath: '/p' }), 'no prompt');
});

test('a TODO is described by its title', () => {
  assert.equal(describeWootonCall('mcp__wooton__create_todo', { title: 'Ship it' }).detail, '“Ship it”');
});

test('a tool this build has never seen still reads as words', () => {
  const call = describeWootonCall('mcp__wooton__rebuild_search_index', {});
  assert.equal(call.verb, 'Rebuild search index');
  assert.equal(call.icon, 'bot');
  assert.equal(call.kind, 'read');
  assert.equal(describeWootonCall('mcp__wooton__', {}).verb, 'WootonPad action');
});

// ── Subjects: which projects and sessions ─────────────────────────

test('project paths come from projectPath and projects[], once each', () => {
  const call = describeWootonCall('mcp__wooton__create_todo', {
    title: 't', projectPath: '/Users/x/api', projects: ['/Users/x/web', '/Users/x/api', ' /Users/x/cli '],
  });
  assert.deepEqual(call.projects, ['/Users/x/api', '/Users/x/web', '/Users/x/cli']);
});

// A chip opens a project by path, and half a path opens nothing.
test('a relative or non-string project is not a subject', () => {
  const call = describeWootonCall('mcp__wooton__create_group_session', {
    projects: ['wootonpad', '', 42, null, 'C:\\work\\app', '/abs/path'],
  });
  assert.deepEqual(call.projects, ['C:\\work\\app', '/abs/path']);
});

test('a session id is a subject only when it is one', () => {
  assert.deepEqual(describeWootonCall('mcp__wooton__stop_session', { sessionId: UUID }).sessions, [UUID]);
  assert.deepEqual(describeWootonCall('mcp__wooton__stop_session', { sessionId: '3f7a1b20' }).sessions, []);
  assert.deepEqual(describeWootonCall('mcp__wooton__list_projects', {}).sessions, []);
});

test('a missing or malformed input describes an empty call rather than throwing', () => {
  for (const input of [undefined, null, 'nope', [1, 2]]) {
    const call = describeWootonCall('mcp__wooton__list_sessions', input);
    assert.deepEqual(call.projects, []);
    assert.deepEqual(call.sessions, []);
    assert.equal(call.detail, '');
  }
});

// ── Results ───────────────────────────────────────────────────────

test('the result text is read out of content blocks, a string, or a kept pair', () => {
  assert.equal(wootonResultText('plain'), 'plain');
  assert.equal(wootonResultText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]), 'a\nb');
  assert.equal(wootonResultText({ content: [{ type: 'text', text: 'kept' }], isError: false }), 'kept');
  assert.equal(wootonResultText(null), '');
});

// The reason this exists: a list call names nothing in its input, and it is the
// markup in the answer that says what it touched.
test('a result yields every session and project it names, once each, in order', () => {
  const text = [
    `@session:${UUID} — "Fix login" · api · 4m ago · running · 12 msgs`,
    `@session:${OTHER} — "Docs" · web · 2h ago · idle`,
    `@session:${UUID} — "Fix login" · api · 4m ago · running`,
    '@project:/Users/x/api — api · 3 sessions · 4m ago',
    '@project:/Users/x/web — web · 1 sessions · 2h ago.',
  ].join('\n');
  const summary = summarizeWootonResult(text, false);
  assert.deepEqual(summary.sessions, [UUID, OTHER]);
  assert.deepEqual(summary.projects, ['/Users/x/api', '/Users/x/web']);
  assert.equal(summary.lines, 5);
  assert.equal(summary.headline, `@session:${UUID} — "Fix login" · api · 4m ago · running · 12 msgs`);
  assert.equal(summary.isError, false);
});

test('a result read as content blocks is summarised the same', () => {
  const summary = summarizeWootonResult([{ type: 'text', text: `Started @session:${UUID} in @project:/Users/x/api.` }]);
  assert.deepEqual(summary.sessions, [UUID]);
  assert.deepEqual(summary.projects, ['/Users/x/api']);
});

// peek_active_sessions separates its blocks with a blank line; a blank line is
// spacing, not a row.
test('blank lines are not counted as lines', () => {
  const text = `@session:${UUID} — "a" · api · running\n  user · 1m ago: hi\n\n@session:${OTHER} — "b" · web · running\n  (no messages yet)`;
  assert.equal(summarizeWootonResult(text).lines, 4);
});

test('the title each session row quotes is kept, for the chip to say', () => {
  const text = [
    `@session:${UUID} — "Fix "the" login" · api · 4m ago`,
    `@session:${OTHER} — last 3 message(s), oldest first:`,
  ].join('\n');
  assert.deepEqual(summarizeWootonResult(text).titles, { [UUID]: 'Fix "the" login' });
});

test('a failed call is known by its flag, and its headline is the reason', () => {
  const summary = summarizeWootonResult('Error: no git information for that project', true);
  assert.equal(summary.isError, true);
  assert.equal(summary.headline, 'no git information for that project');
});

// Some result maps keep the bare content and lose the flag. The server writes
// every failure as `Error: <reason>`, so that is enough to go on.
test('a failure whose flag was lost is still a failure', () => {
  assert.equal(summarizeWootonResult('Error: stop_session failed').isError, true);
  assert.equal(summarizeWootonResult('Stopped it. No Error: here').isError, false);
});

test('an empty result has nothing in it', () => {
  assert.deepEqual(summarizeWootonResult('', false), {
    lines: 0, sessions: [], projects: [], headline: '', titles: {}, isError: false,
  });
  assert.equal(summarizeWootonResult(undefined).lines, 0);
});
