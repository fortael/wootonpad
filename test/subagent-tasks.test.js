const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { listSubagents, readSubagentEntries } = require('../subagent-tasks');

function makeSession() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-agents-'));
  const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const sessionDir = path.join(root, sessionId);
  fs.mkdirSync(path.join(sessionDir, 'subagents'), { recursive: true });
  return { root, sessionId, sessionDir, parentPath: path.join(root, sessionId + '.jsonl') };
}

function writeAgent(sessionDir, agentId, meta, entries) {
  const dir = path.join(sessionDir, 'subagents');
  fs.writeFileSync(path.join(dir, `agent-${agentId}.meta.json`), JSON.stringify(meta), 'utf8');
  fs.writeFileSync(
    path.join(dir, `agent-${agentId}.jsonl`),
    entries.map(e => JSON.stringify(e)).join('\n') + '\n',
    'utf8',
  );
}

test('an agent whose Task has no tool_result yet is still running', () => {
  const s = makeSession();
  try {
    writeAgent(s.sessionDir, 'aaa111', { agentType: 'Explore', description: 'Map the pipeline', toolUseId: 'toolu_open' }, [
      { type: 'user', isSidechain: true, timestamp: '2026-09-01T10:00:00.000Z', message: { role: 'user', content: 'go' } },
      { type: 'assistant', timestamp: '2026-09-01T10:01:00.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'working on it' }] } },
    ]);
    writeAgent(s.sessionDir, 'bbb222', { agentType: 'general-purpose', description: 'Ship it', toolUseId: 'toolu_done' }, [
      { type: 'user', isSidechain: true, timestamp: '2026-09-01T09:00:00.000Z', message: { role: 'user', content: 'go' } },
      { type: 'assistant', timestamp: '2026-09-01T09:30:00.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'done, all tests pass' }] } },
    ]);

    fs.writeFileSync(s.parentPath, [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_done', name: 'Task' }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_done', content: 'ok' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_open', name: 'Task' }] } }),
    ].join('\n'), 'utf8');

    const agents = listSubagents(s.sessionDir, s.parentPath);
    assert.equal(agents.length, 2);
    assert.equal(agents[0].agentId, 'aaa111', 'running agents come first');
    assert.equal(agents[0].running, true);
    assert.equal(agents[0].agentType, 'Explore');
    assert.equal(agents[0].description, 'Map the pipeline');
    assert.equal(agents[0].startedAt, '2026-09-01T10:00:00.000Z');
    assert.equal(agents[0].lastText, 'working on it');

    const finished = agents.find(a => a.agentId === 'bbb222');
    assert.equal(finished.running, false);
    assert.equal(finished.lastText, 'done, all tests pass');
  } finally {
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('a session with no sub-agents, or an unreadable parent, returns a list not a throw', () => {
  const s = makeSession();
  try {
    assert.deepEqual(listSubagents(s.sessionDir, s.parentPath), []);
    assert.deepEqual(listSubagents(path.join(s.root, 'nope'), s.parentPath), []);

    // No parent transcript on disk: nothing can be proved finished, so nothing
    // is claimed to be running either.
    writeAgent(s.sessionDir, 'ccc333', { agentType: 'Explore', toolUseId: 'toolu_x' }, [
      { type: 'user', timestamp: '2026-09-01T10:00:00.000Z', message: { role: 'user', content: 'go' } },
    ]);
    const [agent] = listSubagents(s.sessionDir, path.join(s.root, 'missing.jsonl'));
    assert.equal(agent.running, false);
  } finally {
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('the transcript is read whole, and only for a plausible agent id', () => {
  const s = makeSession();
  try {
    writeAgent(s.sessionDir, 'ddd444', { agentType: 'Explore' }, [
      { type: 'user', message: { role: 'user', content: 'one' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'two' }] } },
    ]);
    const result = readSubagentEntries(s.sessionDir, 'ddd444');
    assert.equal(result.entries.length, 2);

    assert.equal(readSubagentEntries(s.sessionDir, '../../etc/passwd').error, 'invalid agent id');
    assert.ok(readSubagentEntries(s.sessionDir, 'nosuchagent').error);
  } finally {
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('a truncated last line does not hide the message before it', () => {
  const s = makeSession();
  try {
    const dir = path.join(s.sessionDir, 'subagents');
    fs.writeFileSync(path.join(dir, 'agent-eee555.meta.json'), JSON.stringify({ agentType: 'Explore' }), 'utf8');
    fs.writeFileSync(
      path.join(dir, 'agent-eee555.jsonl'),
      JSON.stringify({ type: 'assistant', timestamp: '2026-09-01T10:00:00.000Z', message: { content: [{ type: 'text', text: 'complete line' }] } })
        + '\n{"type":"assistant","message":{"content":[{"type":"te',
      'utf8',
    );
    const [agent] = listSubagents(s.sessionDir, s.parentPath);
    assert.equal(agent.lastText, 'complete line');
  } finally {
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('the running count skips the parent read when every agent has gone quiet', () => {
  const s = makeSession();
  try {
    const { countRunningSubagents } = require('../subagent-tasks');

    writeAgent(s.sessionDir, 'fff666', { agentType: 'Explore', toolUseId: 'toolu_open' }, [
      { type: 'user', message: { role: 'user', content: 'go' } },
    ]);
    fs.writeFileSync(s.parentPath, JSON.stringify({
      type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_open', name: 'Task' }] },
    }), 'utf8');

    assert.equal(countRunningSubagents(s.sessionDir, s.parentPath), 1);

    // Backdate the agent's file past the quiet window: nothing that old can
    // still be running, and the count says so without reading the parent.
    const old = Date.now() - 60 * 60 * 1000;
    const file = path.join(s.sessionDir, 'subagents', 'agent-fff666.jsonl');
    fs.utimesSync(file, new Date(old), new Date(old));
    assert.equal(countRunningSubagents(s.sessionDir, s.parentPath), 0);
    assert.equal(countRunningSubagents(s.sessionDir, s.parentPath, { recentMs: 2 * 60 * 60 * 1000 }), 1);

    // A finished Task is not counted however recent its file is.
    fs.appendFileSync(s.parentPath, '\n' + JSON.stringify({
      type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_open', content: 'ok' }] },
    }), 'utf8');
    assert.equal(countRunningSubagents(s.sessionDir, s.parentPath, { recentMs: 2 * 60 * 60 * 1000 }), 0);

    assert.equal(countRunningSubagents(path.join(s.root, 'nope'), s.parentPath), 0);
  } finally {
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});
