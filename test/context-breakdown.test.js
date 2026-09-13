const test = require('node:test');
const assert = require('node:assert/strict');
const { breakdown, formatTokens, toolLabel, share } = require('../src/vue/context-breakdown.js');

// Shaped like a real SDKControlGetContextUsageResponse, trimmed to what the
// panel reads.
const usage = () => ({
  totalTokens: 268_200,
  maxTokens: 1_000_000,
  rawMaxTokens: 1_000_000,
  percentage: 27,
  model: 'claude-opus-5',
  categories: [
    { name: 'Messages', tokens: 233_200, color: '#5b8cff' },
    { name: 'MCP tools', tokens: 13_400, color: '#e06c3a' },
    { name: 'System prompt', tokens: 6_100, color: '#3fbf7f' },
    { name: 'Skills', tokens: 5_800, color: '#d9a13b' },
    { name: 'Autocompact buffer', tokens: 33_000, color: '#666' },
    { name: 'Free space', tokens: 702_200, color: '#444' },
    { name: 'MCP tools (deferred)', tokens: 77_600, color: '#555', isDeferred: true },
    { name: 'Empty category', tokens: 0, color: '#000' },
  ],
  mcpTools: [
    { name: 'mcp__linear__create_issue', serverName: 'linear', tokens: 900 },
    { name: 'mcp__linear__list_issues', serverName: 'linear', tokens: 700 },
    { name: 'mcp__slack__post', serverName: 'slack', tokens: 500 },
    { name: 'mcp__slack__search', serverName: 'slack', tokens: 300 },
    { name: 'mcp__jira__ticket', serverName: 'jira', tokens: 200 },
    { name: 'mcp__jira__comment', serverName: 'jira', tokens: 100 },
    { name: 'mcp__jira__unloaded', serverName: 'jira', tokens: 0 },
  ],
  memoryFiles: [
    { path: '/Users/me/Projects/app/CLAUDE.md', type: 'Project', tokens: 2_100 },
    { path: '/Users/me/.claude/CLAUDE.md', type: 'User', tokens: 1_000 },
  ],
  agents: [],
});

const names = (rows) => rows.map(r => r.name);

test('the bar draws what is spent — not free space, not deferred schemas', () => {
  const { bar } = breakdown(usage());
  assert.deepEqual(names(bar), ['Messages', 'MCP tools', 'System prompt', 'Skills', 'Autocompact buffer']);
});

test('segment widths are shares of the window', () => {
  const { bar } = breakdown(usage());
  const messages = bar.find(r => r.name === 'Messages');
  assert.equal(Math.round(messages.width), 23);   // 233.2k of 1M
});

test('every category with tokens gets a row, empty ones do not', () => {
  const { rows } = breakdown(usage());
  assert.ok(!names(rows).includes('Empty category'));
  assert.equal(rows.length, 7);
});

test('free space and deferred rows are present but stated as context, not spend', () => {
  const { rows } = breakdown(usage());
  const free = rows.find(r => r.name === 'Free space');
  const deferred = rows.find(r => r.name === 'MCP tools (deferred)');
  assert.equal(free.muted, true);
  assert.equal(free.share, '70.2%');
  assert.equal(deferred.muted, true);
  // Not 0%: the schemas are out of the window, not free.
  assert.equal(deferred.share, '—');
});

test('deferred rows sort last, after everything in the window', () => {
  const { rows } = breakdown(usage());
  assert.equal(rows[rows.length - 1].name, 'MCP tools (deferred)');
});

test('drill-downs rank by tokens and cap with a remainder', () => {
  const { sections } = breakdown(usage(), { limit: 3 });
  const mcp = sections.find(s => s.label === 'MCP tools');
  assert.deepEqual(mcp.items.map(i => i.label), ['create_issue', 'list_issues', 'post']);
  // Six tools carry tokens; the seventh is loaded but costs nothing.
  assert.equal(mcp.more, 3);
  // The heading counts the section, not the slice shown under it.
  assert.equal(mcp.total, 6);
});

test('a section with nothing to show is omitted', () => {
  const { sections } = breakdown(usage());
  assert.ok(!sections.some(s => s.label === 'Agents'));
});

test('memory files are labelled by their last two segments and titled in full', () => {
  const { sections } = breakdown(usage());
  const memory = sections.find(s => s.label === 'Memory files');
  assert.deepEqual(memory.items.map(i => i.label), ['app/CLAUDE.md', '.claude/CLAUDE.md']);
  assert.match(memory.items[0].title, /^Project — \/Users\/me/);
});

test('the wire name of an MCP tool is not what a human reads', () => {
  assert.equal(toolLabel('mcp__linear__create_issue'), 'create_issue');
  assert.equal(toolLabel('Read'), 'Read');
  assert.equal(toolLabel(''), '');
});

test('a share too small to round is not shown as zero', () => {
  assert.equal(share(200, 1_000_000), '<0.1%');
  assert.equal(share(0, 1_000_000), '0.0%');
  assert.equal(share(500, 0), '');
});

test('token counts are readable at panel width', () => {
  assert.equal(formatTokens(268_200), '268k');
  assert.equal(formatTokens(13_400), '13.4k');
  assert.equal(formatTokens(1_000_000), '1M');
  assert.equal(formatTokens(1_500_000), '1.5M');
  assert.equal(formatTokens(900), '900');
  assert.equal(formatTokens(undefined), '0');
});

test('an answer with nothing in it does not throw', () => {
  const view = breakdown();
  assert.deepEqual(view.bar, []);
  assert.deepEqual(view.rows, []);
  assert.deepEqual(view.sections, []);
});

test('the window falls back to maxTokens when the raw one is absent', () => {
  const u = usage();
  delete u.rawMaxTokens;
  assert.equal(breakdown(u).window, 1_000_000);
});

// ── Placement ─────────────────────────────────────────────────────
//
// The chip lives in the chat's control bar, at the bottom of the view. A
// panel that only ever dropped downwards went through the floor of the window.

const { placePopover } = require('../src/vue/context-breakdown.js');
const viewport = { width: 1400, height: 900 };

test('it drops below the chip when there is room', () => {
  const style = placePopover({ top: 100, bottom: 120, right: 900 }, viewport);
  assert.equal(style.top, '126px');
  assert.equal(style.bottom, undefined);
  assert.equal(style.maxHeight, '766px');
});

test('it flips above the chip when the floor is too close', () => {
  // 40px of room below — the case in the bug report.
  const style = placePopover({ top: 820, bottom: 846, right: 900 }, viewport);
  assert.equal(style.top, undefined);
  assert.equal(style.bottom, '86px', 'pinned to the chip from below');
  assert.equal(style.maxHeight, '806px');
});

test('it stays below when neither side has room, rather than flapping', () => {
  const style = placePopover({ top: 60, bottom: 86, right: 900 }, { width: 1400, height: 200 });
  assert.equal(style.top, '92px');
  // Short window: a scroller, not a box with negative height.
  assert.equal(style.maxHeight, '160px');
});

test('it is right-aligned to the chip and clamped to the viewport', () => {
  assert.equal(placePopover({ top: 10, bottom: 30, right: 900 }, viewport).left, '600px');
  // A chip near the left edge would put the panel off-screen.
  assert.equal(placePopover({ top: 10, bottom: 30, right: 120 }, viewport).left, '8px');
  // …and a viewport narrower than the panel still starts at the margin.
  assert.equal(placePopover({ top: 10, bottom: 30, right: 200 }, { width: 240, height: 900 }).left, '8px');
});
