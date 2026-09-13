// The sub-agents a session has spawned.
//
// Claude writes each one to its own transcript beside the session's:
// `<projects>/<folder>/<sessionId>/subagents/agent-<id>.jsonl`, with a
// `.meta.json` naming the agent type, the description the parent gave it, and
// the `Task` tool_use id it was started from. Nothing in the sidebar or the
// board shows these — they are not sessions — so this is the only way to see
// what a session has running underneath it.
//
// Whether one is still running is not recorded anywhere: it is running until
// its Task call has a tool_result in the parent transcript. That is one scan
// of the parent file, done for every agent at once and only when asked.

const fs = require('fs');
const path = require('path');

const AGENT_FILE_RE = /^agent-([A-Za-z0-9_-]+)\.jsonl$/;
const HEAD_BYTES = 16 * 1024;
const TAIL_BYTES = 64 * 1024;

function subagentsDir(sessionDir) {
  return path.join(sessionDir, 'subagents');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// First and last whole lines of a possibly very large transcript, without
// reading the middle: a sub-agent that edited a repository for ten minutes can
// leave megabytes behind, and all the list needs is when it started and what
// it last said.
function readEdges(filePath, size) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch {
    return { first: null, last: null };
  }
  try {
    const headLen = Math.min(HEAD_BYTES, size);
    const head = Buffer.alloc(headLen);
    fs.readSync(fd, head, 0, headLen, 0);
    const headText = head.toString('utf8');
    const firstLine = headText.split('\n')[0];

    const tailLen = Math.min(TAIL_BYTES, size);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    const tailLines = tail.toString('utf8').split('\n').filter(l => l.trim());
    // The last line can be a partial write; step back until one parses.
    let lastEntry = null;
    for (let i = tailLines.length - 1; i >= 0 && !lastEntry; i--) {
      try { lastEntry = JSON.parse(tailLines[i]); } catch {}
    }

    let firstEntry = null;
    try { firstEntry = JSON.parse(firstLine); } catch {}
    return { first: firstEntry, last: lastEntry };
  } finally {
    try { fs.closeSync(fd); } catch {}
  }
}

// The plain text of an entry, for the one-line "what is it doing" on the row.
function entryText(entry) {
  const content = entry?.message?.content ?? entry?.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (block?.type === 'text' && block.text) parts.push(block.text);
    else if (block?.type === 'thinking' && block.thinking) parts.push(block.thinking);
    else if (block?.type === 'tool_use' && block.name) parts.push(`→ ${block.name}`);
  }
  return parts.join('\n').trim();
}

function listSubagents(sessionDir, parentJsonlPath) {
  const dir = subagentsDir(sessionDir);
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const agents = [];
  for (const file of files) {
    const match = AGENT_FILE_RE.exec(file);
    if (!match) continue;
    const agentId = match[1];
    const filePath = path.join(dir, file);
    let stat;
    try { stat = fs.statSync(filePath); } catch { continue; }
    const meta = readJson(path.join(dir, `agent-${agentId}.meta.json`)) || {};
    const { first, last } = readEdges(filePath, stat.size);
    agents.push({
      agentId,
      agentType: meta.agentType || 'agent',
      description: meta.description || '',
      toolUseId: meta.toolUseId || null,
      spawnDepth: meta.spawnDepth || 1,
      startedAt: first?.timestamp || stat.birthtime?.toISOString() || null,
      updatedAt: stat.mtime.toISOString(),
      bytes: stat.size,
      lastText: entryText(last).slice(0, 240),
      // Filled in below — it takes the parent transcript to answer.
      running: false,
    });
  }

  // One read of the parent, one substring test per agent. A finished Task has
  // its tool_result there; anything else is still out working.
  const pending = agents.filter(a => a.toolUseId);
  if (pending.length) {
    let parent = '';
    try { parent = fs.readFileSync(parentJsonlPath, 'utf8'); } catch {}
    for (const agent of pending) {
      agent.running = !!parent && !parent.includes(`"tool_use_id":"${agent.toolUseId}"`);
    }
  }

  // Running first, then most recently active — the same order the rest of the
  // app puts sessions in.
  agents.sort((a, b) => Number(b.running) - Number(a.running)
    || new Date(b.updatedAt) - new Date(a.updatedAt));
  return agents;
}

// How many of a session's sub-agents are still working, for the badge on its
// sidebar row and its board card.
//
// The expensive half of listSubagents is reading the parent transcript, which
// can be tens of megabytes and is polled while a session runs. A finished
// agent's own file stops changing, so a directory whose newest agent file is
// older than `recentMs` cannot have one running and never costs that read.
function countRunningSubagents(sessionDir, parentJsonlPath, { recentMs = 10 * 60 * 1000 } = {}) {
  const dir = subagentsDir(sessionDir);
  let files;
  try {
    files = fs.readdirSync(dir).filter(f => AGENT_FILE_RE.test(f));
  } catch {
    return 0;
  }
  if (!files.length) return 0;

  const cutoff = Date.now() - recentMs;
  const recent = [];
  for (const file of files) {
    try {
      const stat = fs.statSync(path.join(dir, file));
      if (stat.mtimeMs >= cutoff) recent.push(AGENT_FILE_RE.exec(file)[1]);
    } catch {}
  }
  if (!recent.length) return 0;

  let parent = '';
  try { parent = fs.readFileSync(parentJsonlPath, 'utf8'); } catch { return 0; }

  let running = 0;
  for (const agentId of recent) {
    const meta = readJson(path.join(dir, `agent-${agentId}.meta.json`));
    if (!meta?.toolUseId) continue;
    if (!parent.includes(`"tool_use_id":"${meta.toolUseId}"`)) running++;
  }
  return running;
}

// The whole transcript of one sub-agent, parsed the way `read-session-jsonl`
// parses a session's — the viewer that renders sessions renders these too.
function readSubagentEntries(sessionDir, agentId) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(agentId || ''))) return { error: 'invalid agent id' };
  const filePath = path.join(subagentsDir(sessionDir), `agent-${agentId}.jsonl`);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { error: err.message };
  }
  const entries = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch {}
  }
  return { entries, filePath };
}

module.exports = {
  listSubagents, countRunningSubagents, readSubagentEntries, subagentsDir, entryText,
};
