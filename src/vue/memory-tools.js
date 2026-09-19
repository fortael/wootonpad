// memory-tools.js — a session working with its memory, told apart from file work.
//
// Claude Code's memory is plain files: MEMORY.md, and in the auto-memory folder
// (`projects/<cwd>/memory/`) one file per fact beside it. The model reads and
// writes them with Read, Write and Edit, so in the transcript remembering looks
// exactly like editing source — a path and a diff. It is not the same act, and
// the chat draws it as its own card: a brain, what was done ("Recalled",
// "Saved", "Updated") and which memory, with the text itself under it.
//
// Pure: message-render.js draws the card.

const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit']);

const parts = p => String(p || '').split(/[\\/]+/).filter(Boolean);

/** Is this path a memory file? MEMORY.md anywhere, or any .md in a `memory/` folder. */
export function isMemoryPath(filePath) {
  const segs = parts(filePath);
  const name = segs[segs.length - 1] || '';
  if (/^memory\.md$/i.test(name)) return true;
  return /\.md$/i.test(name) && segs.length > 1 && segs[segs.length - 2].toLowerCase() === 'memory';
}

/** Is this tool call a session working with its memory? */
export function isMemoryCall(name, input) {
  return FILE_TOOLS.has(name) && isMemoryPath(input?.file_path);
}

/**
 * The card's header: the act, and which memory it was.
 *
 * The file is named on its own inside a `memory/` folder — the folder says the
 * rest. A MEMORY.md elsewhere (a group session's, a project's) gets the folder
 * it sits in, since that is what tells two of them apart.
 *
 * @returns {{ verb: string, icon: string, file: string, tool: string }}
 */
export function describeMemoryCall(name, input) {
  const segs = parts(input?.file_path);
  const base = segs[segs.length - 1] || 'memory';
  const folder = segs[segs.length - 2] || '';
  const file = folder && folder.toLowerCase() !== 'memory' ? `${folder}/${base}` : base;
  const verb = name === 'Read' ? 'Recalled memory'
    : name === 'Write' ? 'Saved memory'
      : 'Updated memory';
  return { verb, icon: 'brain', file, tool: name };
}

/**
 * What a Read of a memory file came back with, as the file's own text: the
 * line-number gutter Read adds ("   12→…" or "12\t…") and any system reminder
 * the CLI appended are not part of the memory.
 */
export function memoryReadText(text) {
  return String(text || '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .split('\n')
    .map(line => line.replace(/^\s*\d+(?:→|\t)/, ''))
    .join('\n')
    .replace(/\s+$/, '');
}

/**
 * The text a call put into memory, for the card's body: a Write's whole file,
 * an Edit's lines out and in.
 *
 * @returns {Array<{ kind: 'plain'|'removed'|'added', text: string }>}
 */
export function memoryCallLines(name, input) {
  if (name === 'Write') {
    return String(input?.content || '').replace(/\s+$/, '').split('\n').map(text => ({ kind: 'plain', text }));
  }
  const edits = name === 'MultiEdit' ? (input?.edits || []) : [input || {}];
  const out = [];
  for (const edit of edits) {
    for (const text of String(edit.old_string || '').split('\n')) if (text.trim()) out.push({ kind: 'removed', text });
    for (const text of String(edit.new_string || '').split('\n')) if (text.trim()) out.push({ kind: 'added', text });
  }
  return out;
}
