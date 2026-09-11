const path = require('path');
const fs = require('fs');
const { StringDecoder } = require('string_decoder');

/**
 * A session's title, from the first thing the user said.
 *
 * Two shapes need unwrapping before that text is readable. A `!` shell line
 * arrives wrapped in `<bash-input>`; those entries are skipped entirely, since
 * the command is not what the session is about. A slash command arrives wrapped
 * in `<command-name>` / `<command-message>` / `<command-args>`, and those *are*
 * the session — `/clear` starts a new transcript whose first entry is nothing
 * but that envelope. Left raw it rendered as the tags themselves, cut mid-way
 * by the length cap: "/clear clear </com".
 *
 * @returns {string|null} the title, or null when this entry is not one
 */
function summaryFromUserText(text) {
  if (!text) return null;
  if (/<bash-input>|<bash-stdout>|<local-command-caveat>/.test(text)) return null;

  const scheduled = text.match(/<scheduled-task\s+name="([^"]+)"/);
  if (scheduled) return 'Scheduled: ' + scheduled[1];

  const command = text.match(/<command-name>\s*([^<]+?)\s*<\/command-name>/);
  if (command) {
    const name = command[1].startsWith('/') ? command[1] : '/' + command[1];
    const args = text.match(/<command-args>\s*([^<]*?)\s*<\/command-args>/);
    return (args && args[1] ? `${name} ${args[1]}` : name).slice(0, 120);
  }

  // Anything else that still carries markup would render as the markup rather
  // than as words — strip it rather than show a half-closed tag.
  const plain = text.replace(/<\/?[a-zA-Z][^>]*>/g, '').trim();
  return plain ? plain.slice(0, 120) : null;
}

/**
 * Everything derived from a transcript, and nothing that needs the whole of it
 * at once.
 *
 * Each field folds over the entries in order — a running count, a first or last
 * occurrence, a growing set — which is what lets a transcript be read in two
 * ways from the same code: the whole file once, or the bytes appended since the
 * last read. See readSessionFileIncremental for why that matters.
 */
function createAccumulator() {
  return {
    /** Bytes already folded in, so the next read knows where to start. */
    bytes: 0,
    /** A line the last read stopped in the middle of — folded in next time. */
    tail: '',
    summary: '',
    messageCount: 0,
    textContent: '',
    slug: null,
    customTitle: null,
    aiTitle: null,
    // How full the model's context window was on the last assistant turn.
    // Everything the request carried as input counts: fresh tokens, tokens
    // written to the cache, and tokens read back from it. This reproduces the
    // percentage the CLI prints in its own status line.
    contextTokens: 0,
    // The window size is not stated anywhere as a number, but the model ids in
    // a `cost-state` entry's modelUsage carry a `[1m]` suffix when the long
    // context is in play — e.g. "claude-opus-5[1m]". That beats guessing from
    // how many tokens a session happened to reach.
    contextLimit: 0,
    // Files this session actually edited, counted from its own transcript
    // rather than from git: a session may be working in a worktree, and each
    // one carries its own set of changes that `git status` on the parent
    // project would not separate.
    touchedFiles: new Set(),
    // Line churn for the whole session, rebuilt from each edit's own result.
    //
    // The `cost-state` entry carries totalLinesAdded/Removed, but it is a
    // checkpoint the CLI writes at the end of a stretch and it resets: two
    // sessions here report 0/0 despite hundreds of edits, and others report
    // only their last stretch. Counting the results reproduces the CLI's own
    // figure exactly where that figure is whole (verified +2860/-313 on one
    // session) and is complete where it is not.
    linesAdded: 0,
    linesRemoved: 0,
  };
}

/** Fold one already-parsed entry into the accumulator. */
function foldEntry(acc, entry) {
  const usage = entry.message?.usage;
  if (usage) {
    acc.contextTokens = (usage.input_tokens || 0)
      + (usage.cache_creation_input_tokens || 0)
      + (usage.cache_read_input_tokens || 0);
  }
  const result = entry.toolUseResult;
  if (result && typeof result === 'object') {
    if (Array.isArray(result.structuredPatch) && result.structuredPatch.length) {
      for (const hunk of result.structuredPatch) {
        for (const line of hunk.lines || []) {
          if (line.startsWith('+')) acc.linesAdded++;
          else if (line.startsWith('-')) acc.linesRemoved++;
        }
      }
    } else if (typeof result.content === 'string' && result.filePath) {
      // A Write that created the file: no patch to diff against, every
      // line is new.
      acc.linesAdded += result.content.split('\n').length;
    }
  }

  const blocks = entry.message?.content;
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      if (block?.type !== 'tool_use') continue;
      if (!/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(block.name)) continue;
      const target = block.input?.file_path || block.input?.notebook_path;
      if (target) acc.touchedFiles.add(target);
    }
  }
  if (entry.type === 'cost-state' && entry.modelUsage) {
    for (const model of Object.keys(entry.modelUsage)) {
      if (/\[1m\]/i.test(model)) acc.contextLimit = 1000000;
    }
  }
  if (entry.slug && !acc.slug) acc.slug = entry.slug;
  if (entry.type === 'custom-title' && entry.customTitle) {
    acc.customTitle = entry.customTitle;
  }
  if (entry.type === 'ai-title' && entry.aiTitle) {
    acc.aiTitle = entry.aiTitle;
  }
  if (entry.type === 'user' || entry.type === 'assistant' ||
      (entry.type === 'message' && (entry.role === 'user' || entry.role === 'assistant'))) {
    acc.messageCount++;
  }
  const msg = entry.message;
  const text = typeof msg === 'string' ? msg :
    (typeof msg?.content === 'string' ? msg.content :
    (msg?.content?.[0]?.text || ''));
  if (!acc.summary && (entry.type === 'user' || (entry.type === 'message' && entry.role === 'user'))) {
    acc.summary = summaryFromUserText(text) || '';
  }
  if (text && acc.textContent.length < 8000) {
    acc.textContent += text.slice(0, 500) + '\n';
  }
}

/**
 * Fold a chunk of the file into the accumulator.
 *
 * `complete` says whether the chunk ends on a record boundary. It does not when
 * the chunk is the tail of a file the CLI is still writing to, and the half
 * line is carried over rather than parsed and dropped.
 */
function foldChunk(acc, chunk, { complete }) {
  const text = acc.tail + chunk;
  acc.tail = '';
  const lines = text.split('\n');
  if (!complete) acc.tail = lines.pop() ?? '';
  for (const line of lines) {
    if (!line) continue;
    try { foldEntry(acc, JSON.parse(line)); } catch { /* a half-written line */ }
  }
}

/** Shape the accumulator into the session row the cache stores. */
function finalize(acc, { sessionId, folder, projectPath, stat }) {
  if (!acc.summary || acc.messageCount < 1) return null;
  return {
    sessionId, folder, projectPath,
    summary: acc.summary, firstPrompt: acc.summary,
    created: stat.birthtime.toISOString(),
    modified: stat.mtime.toISOString(),
    messageCount: acc.messageCount,
    textContent: acc.textContent,
    slug: acc.slug,
    customTitle: acc.customTitle,
    aiTitle: acc.aiTitle,
    contextTokens: acc.contextTokens,
    contextLimit: acc.contextLimit,
    changedFiles: acc.touchedFiles.size,
    linesAdded: acc.linesAdded,
    linesRemoved: acc.linesRemoved,
  };
}

/** Parse a single .jsonl file into a session object (or null if invalid) */
function readSessionFile(filePath, folder, projectPath) {
  const sessionId = path.basename(filePath, '.jsonl');
  try {
    const stat = fs.statSync(filePath);
    const acc = createAccumulator();
    foldChunk(acc, fs.readFileSync(filePath, 'utf8'), { complete: true });
    acc.bytes = stat.size;
    return finalize(acc, { sessionId, folder, projectPath, stat });
  } catch {
    return null;
  }
}

/**
 * The same answer, from only the bytes appended since `previous` was made.
 *
 * A transcript is append-only and reaches tens of megabytes, while the watcher
 * fires on every write. Re-reading and re-parsing the whole file each time cost
 * 150–190ms of blocked main thread and a few hundred megabytes of garbage per
 * change on a 44MB session — several times a second while a session is working,
 * which is also when the app most needs the main process to be answering.
 *
 * Falls back to a full read whenever the file cannot be treated as the same one
 * grown longer: a different inode means it was replaced, and a smaller size
 * means it was rewritten.
 *
 * @param {string} filePath
 * @param {string} folder
 * @param {string} projectPath
 * @param {{ acc: object, ino: number }} [previous] state from a prior call
 * @returns {{ session: object|null, state: { acc: object, ino: number } }}
 */
function readSessionFileIncremental(filePath, folder, projectPath, previous) {
  const sessionId = path.basename(filePath, '.jsonl');
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { session: null, state: null };
  }

  const reusable = previous
    && previous.acc
    && previous.ino === stat.ino
    && previous.acc.bytes <= stat.size;

  const acc = reusable ? previous.acc : createAccumulator();
  // Decoding is stateful across reads for the same reason folding is: a byte
  // range can end in the middle of a multi-byte character as easily as in the
  // middle of a record, and the decoder holds the partial sequence back until
  // the rest of it arrives.
  if (!acc.decoder) acc.decoder = new StringDecoder('utf8');

  try {
    if (!reusable) {
      const buf = fs.readFileSync(filePath);
      // Counted from what was actually read, not from the stat: a live session
      // can grow between the two, and a byte folded twice is a message counted
      // twice for the rest of the session.
      acc.bytes = buf.length;
      foldChunk(acc, acc.decoder.write(buf), { complete: true });
    } else if (stat.size > acc.bytes) {
      const fd = fs.openSync(filePath, 'r');
      try {
        const length = stat.size - acc.bytes;
        const buf = Buffer.allocUnsafe(length);
        const read = fs.readSync(fd, buf, 0, length, acc.bytes);
        acc.bytes += read;
        const text = acc.decoder.write(buf.subarray(0, read));
        foldChunk(acc, text, { complete: text.endsWith('\n') });
      } finally {
        fs.closeSync(fd);
      }
    }
  } catch {
    return { session: null, state: null };
  }

  return {
    session: finalize(acc, { sessionId, folder, projectPath, stat }),
    state: { acc, ino: stat.ino },
  };
}

module.exports = { readSessionFile, readSessionFileIncremental, summaryFromUserText };
