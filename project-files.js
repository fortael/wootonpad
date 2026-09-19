// project-files.js — the assistant's read-only window into a project.
//
// The Chat tab's assistant manages sessions and does no work itself, so it has
// no Read, Grep or Bash (chat-agent.js). It still has to answer "what does this
// project do" without starting a session for it, and that means a README, a
// CLAUDE.md, a manifest: one directory listing or one file at a time, inside a
// project the app already knows about. This module is the whole of that access,
// and every guard on it is here rather than in the tool that calls it.
//
// Paths are canonical — POSIX for a WSL account — and are only translated at
// the fs boundary through the injected `hostPath` (CLAUDE.md, WSL rules 1–2).

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 64 * 1024;
const MAX_ENTRIES = 300;

// Never read, whatever the project: credentials the assistant has no business
// quoting back into a transcript. Matched on every segment of the path, so a
// key under config/ is refused as surely as one at the root.
const SECRET_NAMES = [
  /^\.env(\..*)?$/i,           // .env, .env.local, .env.production
  /^\.netrc$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /\.(pem|key|p12|pfx|keystore|jks|ppk)$/i,
  /^credentials(\..*)?$/i,
  /^secrets?(\..*)?$/i,
  /^\.git-credentials$/i,
];

// Directories whose contents are not the project's own writing.
const SKIPPED_DIRS = new Set(['.git', 'node_modules', 'vendor', '.idea', '.venv', '__pycache__']);

const posixish = (p) => /^\//.test(p);

/** Join a relative path onto a root in the root's own path flavour. */
function joinIn(root, rel) {
  return posixish(root) ? path.posix.join(root, rel) : path.join(root, rel);
}

/**
 * The canonical absolute path of `rel` inside `root`, or null if it escapes.
 *
 * Normalised before the check, so `a/../../etc` is caught; absolute input is
 * refused outright rather than joined, because "relative to the root" is the
 * whole contract.
 */
function resolveInside(root, rel) {
  const cleaned = String(rel || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (cleaned.startsWith('/') || /^[a-zA-Z]:/.test(cleaned)) return null;
  const full = joinIn(root, cleaned);
  const rootNorm = joinIn(root, '.');
  const sep = posixish(root) ? '/' : path.sep;
  if (full === rootNorm) return full;
  return full.startsWith(rootNorm.endsWith(sep) ? rootNorm : rootNorm + sep) ? full : null;
}

/** Is any segment of this relative path a secret or a skipped directory? */
function refusedReason(rel) {
  const segments = String(rel || '').replace(/\\/g, '/').split('/').filter(Boolean);
  for (const seg of segments) {
    if (SECRET_NAMES.some(re => re.test(seg))) return `${seg} may hold secrets and is not readable from here`;
    if (SKIPPED_DIRS.has(seg)) return `${seg}/ is not the project's own files`;
  }
  return null;
}

/**
 * One level of one directory.
 *
 * @returns {{ ok: true, dir: string, entries: Array<{ name, dir, size }> } | { ok: false, error: string }}
 */
function listDir(root, relDir, hostPath = (p) => p) {
  const rel = String(relDir || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const full = resolveInside(root, rel || '.');
  if (!full) return { ok: false, error: 'That directory is outside the project' };
  const refused = rel && refusedReason(rel);
  if (refused) return { ok: false, error: refused };
  let dirents;
  try {
    dirents = fs.readdirSync(hostPath(full), { withFileTypes: true });
  } catch (err) {
    return { ok: false, error: err.code === 'ENOENT' ? `No such directory: ${rel || '(root)'}` : err.message };
  }
  const entries = [];
  for (const d of dirents) {
    if (d.isSymbolicLink()) continue;          // may point anywhere
    if (d.isDirectory()) {
      if (SKIPPED_DIRS.has(d.name)) continue;
      entries.push({ name: d.name, dir: true, size: 0 });
    } else if (d.isFile()) {
      let size = 0;
      try { size = fs.statSync(hostPath(joinIn(full, d.name))).size; } catch {}
      entries.push({ name: d.name, dir: false, size });
    }
  }
  // Folders first, then files, each alphabetically — the way a file tree reads.
  entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
  return { ok: true, dir: rel, entries: entries.slice(0, MAX_ENTRIES) };
}

/**
 * One text file, capped at MAX_BYTES.
 *
 * Refuses symlinks (they can lead out of the project), secrets, and anything
 * with a NUL byte in its head — a binary shown as text is noise the model then
 * tries to explain.
 *
 * @returns {{ ok: true, path, content, lines, size, bytes, truncated } | { ok: false, error: string }}
 */
function readFile(root, relPath, hostPath = (p) => p) {
  const rel = String(relPath || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!rel) return { ok: false, error: 'Name a file inside the project' };
  const full = resolveInside(root, rel);
  if (!full) return { ok: false, error: 'That file is outside the project' };
  const refused = refusedReason(rel);
  if (refused) return { ok: false, error: refused };

  let stat;
  try {
    stat = fs.lstatSync(hostPath(full));
  } catch (err) {
    return { ok: false, error: err.code === 'ENOENT' ? `No such file: ${rel}` : err.message };
  }
  if (stat.isSymbolicLink()) return { ok: false, error: `${rel} is a symlink and is not followed` };
  if (stat.isDirectory()) return { ok: false, error: `${rel} is a directory — list it instead` };
  if (!stat.isFile()) return { ok: false, error: `${rel} is not a regular file` };

  const bytes = Math.min(stat.size, MAX_BYTES);
  const buffer = Buffer.alloc(bytes);
  let fd;
  try {
    fd = fs.openSync(hostPath(full), 'r');
    fs.readSync(fd, buffer, 0, bytes, 0);
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
  if (buffer.subarray(0, Math.min(bytes, 8000)).includes(0)) {
    return { ok: false, error: `${rel} looks like a binary file` };
  }
  const content = buffer.toString('utf8');
  return {
    ok: true,
    path: rel,
    content,
    lines: content ? content.split('\n').length : 0,
    size: stat.size,
    bytes,
    truncated: stat.size > MAX_BYTES,
  };
}

module.exports = {
  MAX_BYTES,
  resolveInside,
  refusedReason,
  listDir,
  readFile,
};
