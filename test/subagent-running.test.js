const test = require('node:test');
const assert = require('node:assert/strict');
const { agentFinished } = require('../subagent-tasks.js');

// The shapes below are taken from a real parent transcript. They matter in
// their exact form because agentFinished reads the file as a string — parsing
// tens of megabytes on a poll is what the substring tests exist to avoid.

const AGENT = 'a541e7a160e89e13c';
const TOOL = 'toolu_01MHWYMwjr5VVghjDNrro5Ln';

/** The Task call itself. */
const LAUNCH = `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"${TOOL}","name":"Agent","input":{"subagent_type":"Explore"}}]}}`;

/** A background agent's receipt, which arrives the instant it is launched. */
const ASYNC_RECEIPT = `{"type":"user","message":{"content":[{"tool_use_id":"${TOOL}","type":"tool_result","content":[{"type":"text","text":"Async agent launched successfully."}]}]},"toolUseResult":{"isAsync":true,"status":"async_launched","agentId":"${AGENT}"}}`;

/** And, later, the notification that it is done. */
const NOTIFICATION = `{"type":"attachment","attachment":{"type":"queued_command","prompt":"<task-notification>\\n<task-id>${AGENT}</task-id>\\n<tool-use-id>${TOOL}</tool-use-id>\\n"}}`;

/** A synchronous agent's answer — the tool_result *is* the result. */
const SYNC_RESULT = `{"type":"user","message":{"content":[{"tool_use_id":"${TOOL}","type":"tool_result","content":[{"type":"text","text":"Here is what I found."}]}]}}`;

// The bug: a background agent is answered the moment it starts, so the old
// rule — "a tool_result for this id means finished" — marked every one of them
// finished while its transcript was still growing.
test('a background agent that has only been launched is still running', () => {
  assert.equal(agentFinished(LAUNCH + '\n' + ASYNC_RECEIPT, AGENT, TOOL), false);
});

test('a background agent is finished once its notification lands', () => {
  const parent = [LAUNCH, ASYNC_RECEIPT, NOTIFICATION].join('\n');
  assert.equal(agentFinished(parent, AGENT, TOOL), true);
});

test('a synchronous agent is finished by its result, as it always was', () => {
  assert.equal(agentFinished(LAUNCH + '\n' + SYNC_RESULT, AGENT, TOOL), true);
  assert.equal(agentFinished(LAUNCH, AGENT, TOOL), false);
});

// The notification is the last word: an agent cannot un-finish.
test('a notification outranks everything else in the file', () => {
  assert.equal(agentFinished(NOTIFICATION, AGENT, TOOL), true);
  assert.equal(agentFinished(NOTIFICATION + '\n' + ASYNC_RECEIPT, AGENT, TOOL), true);
});

test('one agent finishing says nothing about another', () => {
  const other = 'a0000000000000000';
  const parent = [LAUNCH, ASYNC_RECEIPT, NOTIFICATION].join('\n');
  assert.equal(agentFinished(parent, other, 'toolu_other'), false);
});

test('an unreadable or empty parent is not an answer', () => {
  assert.equal(agentFinished('', AGENT, TOOL), false);
  assert.equal(agentFinished(null, AGENT, TOOL), false);
});

// An agent whose meta predates this app recording the id still resolves the
// old way rather than reading as permanently running.
test('an agent with no id of its own falls back to its tool call', () => {
  assert.equal(agentFinished(SYNC_RESULT, null, TOOL), true);
  assert.equal(agentFinished(LAUNCH, null, TOOL), false);
});

// ── The list, against real files ──────────────────────────────────

const fs = require('fs');
const os = require('os');
const path = require('path');
const { listSubagents } = require('../subagent-tasks.js');

function fixture({ meta, parent, agedHours = 0 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-agents-'));
  const sessionDir = path.join(dir, 'sess');
  const agents = path.join(sessionDir, 'subagents');
  fs.mkdirSync(agents, { recursive: true });
  const jsonl = path.join(agents, `agent-${AGENT}.jsonl`);
  fs.writeFileSync(jsonl, JSON.stringify({ timestamp: '2026-09-16T12:00:00.000Z', type: 'assistant' }) + '\n');
  fs.writeFileSync(path.join(agents, `agent-${AGENT}.meta.json`), JSON.stringify(meta));
  const parentPath = path.join(dir, 'sess.jsonl');
  fs.writeFileSync(parentPath, parent);
  if (agedHours) {
    const when = new Date(Date.now() - agedHours * 3600 * 1000);
    fs.utimesSync(jsonl, when, when);
  }
  return { dir, sessionDir, parentPath };
}

test('a background agent still working reads as running', () => {
  const f = fixture({ meta: { agentType: 'Explore', toolUseId: TOOL }, parent: LAUNCH + '\n' + ASYNC_RECEIPT });
  try {
    const [agent] = listSubagents(f.sessionDir, f.parentPath);
    assert.equal(agent.running, true);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

// An older CLI wrote only the agent type. Filtering those out left them with
// the `running: false` they were initialised with — finished from birth.
test('an agent whose meta has no tool id is still judged', () => {
  const f = fixture({ meta: { agentType: 'general-purpose' }, parent: LAUNCH + '\n' + ASYNC_RECEIPT });
  try {
    const [agent] = listSubagents(f.sessionDir, f.parentPath);
    assert.equal(agent.running, true);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('once notified it is finished', () => {
  const f = fixture({ meta: { toolUseId: TOOL }, parent: [LAUNCH, ASYNC_RECEIPT, NOTIFICATION].join('\n') });
  try {
    assert.equal(listSubagents(f.sessionDir, f.parentPath)[0].running, false);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

// Nothing records an agent killed with its session, so silence is the only
// evidence there is that it is not coming back.
test('an agent that has been silent for hours is not still running', () => {
  const f = fixture({ meta: { toolUseId: TOOL }, parent: LAUNCH + '\n' + ASYNC_RECEIPT, agedHours: 3 });
  try {
    assert.equal(listSubagents(f.sessionDir, f.parentPath)[0].running, false);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('a slow tool call is not silence', () => {
  const f = fixture({ meta: { toolUseId: TOOL }, parent: LAUNCH + '\n' + ASYNC_RECEIPT, agedHours: 0.4 });
  try {
    assert.equal(listSubagents(f.sessionDir, f.parentPath)[0].running, true);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
