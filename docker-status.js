// docker-status.js — which containers are up, for how long, and what they cost.
//
// Buddy is asked "what is still running" about containers as much as about
// sessions: a compose stack left up after the work that needed it is memory the
// machine does not get back. This turns `docker ps` and `docker stats
// --no-stream` (both with `--format '{{json .}}'`, one object per line) into
// rows, and ties each container to a project through the compose label that
// records the directory it was started from.
//
// Pure parsing; main.js runs the commands (through projectExecFile, so a WSL
// account asks the distribution's docker).

/**
 * One label out of docker's `Labels` string.
 *
 * The string is `k=v,k=v`, but a value can itself hold commas — compose writes
 * every config file into one label — so it is read by key rather than split.
 */
function label(labels, key) {
  if (!labels) return '';
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|,)${escaped}=([^,]*)`).exec(labels);
  return match ? match[1] : '';
}

function parseLines(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { out.push(JSON.parse(trimmed)); } catch {}
  }
  return out;
}

/** `docker ps [-a] --format '{{json .}}'` → containers. */
function parsePs(text) {
  return parseLines(text).map(c => ({
    id: String(c.ID || ''),
    name: String(c.Names || '').split(',')[0],
    image: String(c.Image || ''),
    state: String(c.State || '').toLowerCase(),      // running | exited | created | paused | restarting
    status: String(c.Status || ''),                  // "Up 3 hours" · "Exited (0) 2 days ago"
    runningFor: String(c.RunningFor || ''),          // "3 hours ago" — since created
    ports: String(c.Ports || ''),
    composeProject: label(c.Labels, 'com.docker.compose.project'),
    service: label(c.Labels, 'com.docker.compose.service'),
    workingDir: label(c.Labels, 'com.docker.compose.project.working_dir'),
  }));
}

/** "12.3%" → 12.3 */
function percent(value) {
  const n = parseFloat(String(value || '').replace('%', ''));
  return Number.isFinite(n) ? n : 0;
}

const UNITS = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };

/** "21.84MiB" → bytes */
function bytes(value) {
  const m = /^([\d.]+)\s*([a-z]+)$/i.exec(String(value || '').trim());
  if (!m) return 0;
  return Math.round(parseFloat(m[1]) * (UNITS[m[2].toLowerCase()] || 1));
}

/** `docker stats --no-stream --format '{{json .}}'` → stats by short id. */
function parseStats(text) {
  const byId = new Map();
  for (const s of parseLines(text)) {
    const [used, limit] = String(s.MemUsage || '').split('/').map(x => x.trim());
    byId.set(String(s.ID || '').slice(0, 12), {
      cpu: percent(s.CPUPerc),
      memBytes: bytes(used),
      memLimitBytes: bytes(limit),
      memPercent: percent(s.MemPerc),
      netIO: String(s.NetIO || ''),
      blockIO: String(s.BlockIO || ''),
      pids: Number(s.PIDs) || 0,
    });
  }
  return byId;
}

/**
 * Containers with their load, running ones first and the heaviest first
 * among them, plus the totals across everything running.
 *
 * @param {ReturnType<typeof parsePs>} containers
 * @param {Map<string, object>} stats
 */
function mergeContainers(containers, stats) {
  const rows = containers.map(c => ({ ...c, ...(stats.get(c.id.slice(0, 12)) || {}) }));
  rows.sort((a, b) => Number(b.state === 'running') - Number(a.state === 'running')
    || (b.cpu || 0) - (a.cpu || 0)
    || (b.memBytes || 0) - (a.memBytes || 0));
  const running = rows.filter(r => r.state === 'running');
  return {
    containers: rows,
    totals: {
      running: running.length,
      stopped: rows.length - running.length,
      cpu: Math.round(running.reduce((n, r) => n + (r.cpu || 0), 0) * 10) / 10,
      memBytes: running.reduce((n, r) => n + (r.memBytes || 0), 0),
      // Docker's own VM on macOS/Windows — the ceiling every container shares.
      memLimitBytes: running.find(r => r.memLimitBytes)?.memLimitBytes || 0,
    },
  };
}

module.exports = { label, parsePs, bytes, parseStats, mergeContainers };
