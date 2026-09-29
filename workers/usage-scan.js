// usage-scan.js — read the usage records out of an account's transcripts.
//
// Incremental across runs: the caller hands in how far each file was read last
// time, and only the bytes appended since then are parsed. A transcript is
// append-only; one that shrank or changed inode was rewritten and is read from
// the start again (its rows are keyed by message id, so reading one twice
// costs time, not correctness).
//
// Subagent transcripts (`<folder>/<session>/subagents/*.jsonl`) are read too —
// their tokens count against the plan like any other — and carry the parent
// session's id, which is where they are filed.

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { deriveProjectPath } = require('../derive-project-path');
const { usageRowsFromText } = require('../usage-ledger');

const PROJECTS_DIR = workerData.projectsDir;
const KNOWN = workerData.files || {};
const FOLDER_PATHS = workerData.folderPaths || {};

function listTranscripts(folderPath) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(folderPath, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.jsonl')) {
      out.push({ file: path.join(folderPath, e.name), sessionId: e.name.slice(0, -6) });
    } else if (e.isDirectory() && e.name !== 'memory') {
      const agents = path.join(folderPath, e.name, 'subagents');
      let names = [];
      try { names = fs.readdirSync(agents).filter(n => n.endsWith('.jsonl')); } catch {}
      for (const n of names) out.push({ file: path.join(agents, n), sessionId: e.name });
    }
  }
  return out;
}

/** The complete lines in [start, size) and where the next read starts. */
function readFrom(file, start, size) {
  const length = size - start;
  if (length <= 0) return { text: '', next: start };
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(length);
    const read = fs.readSync(fd, buf, 0, length, start);
    // Stop at the last newline: the CLI may be half way through a line, and
    // cutting a buffer there also cannot split a multi-byte character.
    const end = buf.lastIndexOf(0x0a, read - 1);
    if (end === -1) return { text: '', next: start };
    return { text: buf.toString('utf8', 0, end + 1), next: start + end + 1 };
  } finally {
    fs.closeSync(fd);
  }
}

try {
  const folders = (fs.existsSync(PROJECTS_DIR) ? fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }) : [])
    .filter(d => d.isDirectory() && d.name !== '.git')
    .map(d => d.name);

  const rows = [];
  const files = {};
  const folderPaths = {};
  let scanned = 0;

  for (let fi = 0; fi < folders.length; fi++) {
    const folder = folders[fi];
    const folderPath = path.join(PROJECTS_DIR, folder);
    let projectPath = FOLDER_PATHS[folder] || null;

    for (const { file, sessionId } of listTranscripts(folderPath)) {
      let stat;
      try { stat = fs.statSync(file); } catch { continue; }
      const known = KNOWN[file];
      const sameFile = known && (!known.ino || !stat.ino || known.ino === stat.ino) && known.bytes <= stat.size;
      if (sameFile && known.bytes === stat.size) continue;
      const start = sameFile ? known.bytes : 0;

      let chunk;
      try { chunk = readFrom(file, start, stat.size); } catch { continue; }
      files[file] = { ino: stat.ino || 0, bytes: chunk.next };
      if (!chunk.text) continue;
      scanned++;

      const found = usageRowsFromText(chunk.text);
      if (!found.length) continue;
      if (!projectPath) {
        projectPath = deriveProjectPath(folderPath, folder) || found[0].cwd || folder;
        folderPaths[folder] = projectPath;
      }
      for (const r of found) {
        r.sessionId = r.sessionId || sessionId;
        r.folder = folder;
        r.projectPath = projectPath;
        delete r.cwd;
        rows.push(r);
      }
    }
    if (fi % 10 === 0) parentPort.postMessage({ type: 'progress', done: fi + 1, total: folders.length });
  }

  parentPort.postMessage({ ok: true, rows, files, folderPaths, scanned });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message });
}
