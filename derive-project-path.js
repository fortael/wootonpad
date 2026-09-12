const fs = require('fs');
const path = require('path');

// The folder name is the path, with every non-alphanumeric character replaced
// by a dash — see encode-project-path.js. Kept in step with it by hand: this
// module cannot require it without dragging its hashing branch in, and the
// substitution is the only half that has to be reversed.
const encodeSegment = (segment) => segment.replace(/[^a-zA-Z0-9]/g, '-');

// Deep enough for any real project path, shallow enough that a pathological
// name cannot walk the whole disk.
const MAX_DEPTH = 12;

function extractCwdFromJsonl(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      if (!line) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.cwd) return parsed.cwd;
      } catch {}
    }
  } catch {}
  return null;
}

function resolveWorktreePath(cwd) {
  if (!cwd) return cwd;
  // Detect worktree paths: <project>/.claude-worktrees/<name>, <project>/.worktrees/<name>, or <project>/.claude/worktrees/<name>
  const worktreeMatch = cwd.match(/^(.+?)\/\.(?:claude\/worktrees|claude-worktrees|worktrees)\/[^/]+\/?$/);
  if (worktreeMatch) {
    const parent = worktreeMatch[1];
    if (fs.existsSync(parent)) return parent;
  }
  return cwd;
}

/**
 * Resolve `-Users-me-Projects-wooton-pad` back to `/Users/me/Projects/wooton-pad`
 * by walking the filesystem, one level per matched segment.
 *
 * The encoding is lossy — `/`, `.`, `_`, ` ` and `-` all become the same dash —
 * so the name alone cannot be decoded. What resolves it is the disk: at each
 * level only the directories actually there are candidates, and a candidate is
 * accepted when its own encoded name matches the next run of the folder name.
 * `wooton-pad` therefore wins over a `wooton` that does not exist.
 *
 * Ambiguity that survives all of that (two real directories, both matching)
 * takes the first that leads to a complete match, and returns null when none
 * does — a guess would be worse than the caller's own fallback.
 */
function decodeFolderName(name, root = '/') {
  const walk = (dir, rest, depth) => {
    if (!rest) return dir;
    if (depth > MAX_DEPTH) return null;
    let entries;
    try {
      // Symlinks count: /tmp and /var are links on macOS, and a project living
      // under a linked home or volume is ordinary. Confirmed with a stat below
      // rather than trusted, so a link to a file is not walked into.
      entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory() || e.isSymbolicLink());
    } catch {
      return null;
    }
    for (const entry of entries) {
      const encoded = encodeSegment(entry.name);
      if (!encoded) continue;
      const next = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          if (!fs.statSync(next).isDirectory()) continue;
        } catch { continue; }
      }
      if (rest === encoded) return next;
      if (rest.startsWith(encoded + '-')) {
        const found = walk(next, rest.slice(encoded.length + 1), depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  // A leading dash is the root slash the encoder ate.
  const trimmed = String(name || '').replace(/^-+/, '');
  return trimmed ? walk(root, trimmed, 0) : null;
}

/**
 * @param {string} folderPath  the directory inside ~/.claude/projects
 * @param {string} [folderName] its name, used to resolve a project that has no
 *   transcript naming it — a folder just created, or one whose only transcript
 *   is the stub the CLI writes for a session abandoned before its first turn.
 *   Without this a project with no usable transcript resolves to nothing and
 *   disappears from every view in the app.
 */
function deriveProjectPath(folderPath, folderName) {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    // Check direct .jsonl files first
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.jsonl')) {
        const cwd = extractCwdFromJsonl(path.join(folderPath, e.name));
        if (cwd) return cwd;
      }
    }
    // Check session subdirectories (UUID folders with subagent .jsonl files)
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const subDir = path.join(folderPath, e.name);
      try {
        const subFiles = fs.readdirSync(subDir, { withFileTypes: true });
        for (const sf of subFiles) {
          let jsonlPath;
          if (sf.isFile() && sf.name.endsWith('.jsonl')) {
            jsonlPath = path.join(subDir, sf.name);
          } else if (sf.isDirectory() && sf.name === 'subagents') {
            const agentFiles = fs.readdirSync(path.join(subDir, 'subagents')).filter(f => f.endsWith('.jsonl'));
            if (agentFiles.length > 0) jsonlPath = path.join(subDir, 'subagents', agentFiles[0]);
          }
          if (jsonlPath) {
            const cwd = extractCwdFromJsonl(jsonlPath);
            if (cwd) return cwd;
          }
        }
      } catch {}
    }
  } catch {}
  return decodeFolderName(folderName || path.basename(folderPath || ''));
}

module.exports = { deriveProjectPath, decodeFolderName };
