// Notes and TODO lists that belong to an account, not to a project.
//
// They live in `<configDir>/notes/*.md`, beside plans, for the same reason
// plans do: the account's Claude home is what follows the account around, and
// a note about "the thing I still owe the payments repo" is not something to
// leave inside that repo's working tree.
//
// A note is plain Markdown with a small frontmatter — the title, the projects
// it is about and, optionally, the day the whole list is due by. Nothing here
// needs the general frontmatter parser in schedule-runner: these files are
// written by this module, the keys are flat, and a note typed by hand with a
// missing header still opens.

const fs = require('fs');
const path = require('path');
const { isDueDate, parseDueToken, setDueToken, nextDue } = require('./todo-due');

const NOTE_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;
const TODO_RE = /^(\s*[-*]\s+\[)([ xX])(\].*)$/;

function ensureDir(notesDir) {
  fs.mkdirSync(notesDir, { recursive: true });
  return notesDir;
}

// Only files this module could have written, and only directly inside the
// notes directory: the renderer passes filenames, and a filename is not a path.
function notePath(notesDir, filename) {
  const name = String(filename || '');
  if (!NOTE_FILE_RE.test(name)) return null;
  const resolved = path.resolve(notesDir, name);
  if (path.dirname(resolved) !== path.resolve(notesDir)) return null;
  return resolved;
}

// A note can relate to several projects — a refactor that touches three
// services is one thought, not three notes. Stored as a JSON array on one
// line, because a project path may contain a comma and a bare list could not
// say so. The older single `project:` key is still read: notes written before
// this existed keep working.
function parseProjects(meta) {
  const raw = meta.projects != null ? meta.projects : meta.project;
  if (raw == null) return [];
  const text = String(raw).trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const list = JSON.parse(text);
      if (Array.isArray(list)) return list.map(p => String(p).trim()).filter(Boolean);
    } catch {}
  }
  return text.split(',').map(p => p.trim()).filter(Boolean);
}

function formatProjects(projects) {
  return JSON.stringify((projects || []).map(p => String(p).trim()).filter(Boolean));
}

function parseNote(content) {
  const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: String(content) };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: match[2] };
}

// Every checkbox line in document order. The index is the position in this
// list, which is what the sidebar sends back when a box is ticked — a line
// number would move the moment anything above it is edited.
//
// An item's own due date rides in its text as a `due:YYYY-MM-DD` token (see
// todo-due.js); it comes out as `due` and leaves the text, so nothing draws
// the token as words.
function noteTodos(body) {
  const todos = [];
  const lines = String(body).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TODO_RE);
    if (!m) continue;
    const { due, text } = parseDueToken(m[3].replace(/^\]\s*/, ''));
    todos.push({
      index: todos.length,
      line: i,
      done: m[2] !== ' ',
      text,
      due,
    });
  }
  return todos;
}

// The note as the panel shows it: prose and checkboxes in the order they were
// written. A list of TODOs alone loses the half of a note that says why they
// are there, which is usually the important half.
function noteBlocks(body, todos) {
  const blocks = [];
  const todoByLine = new Map(todos.map(t => [t.line, t]));
  const lines = String(body).split('\n');
  let text = [];
  let budget = MAX_BLOCK_CHARS;

  const flushText = () => {
    if (!text.length) return;
    const joined = text.join('\n').trim();
    text = [];
    if (!joined) return;
    const clipped = joined.slice(0, Math.max(budget, 0));
    budget -= clipped.length;
    if (clipped) blocks.push({ type: 'text', text: clipped });
  };

  for (let i = 0; i < lines.length; i++) {
    const todo = todoByLine.get(i);
    if (todo) {
      flushText();
      blocks.push({ type: 'todo', index: todo.index, done: todo.done, text: todo.text, due: todo.due });
      continue;
    }
    // The first heading is the card's own title; repeating it inside is noise.
    // Blank lines before it do not count as content, or a note that starts
    // with one would keep its title twice.
    const nothingYet = !blocks.length && text.every(l => !l.trim());
    if (nothingYet && lines[i].trim().startsWith('# ')) { text = []; continue; }
    text.push(lines[i]);
  }
  flushText();
  return blocks;
}

const MAX_BLOCK_CHARS = 8000;

function summarize(filename, filePath, content, stat) {
  const { meta, body } = parseNote(content);
  const todos = noteTodos(body);
  const heading = body.split('\n').find(l => l.trim().startsWith('# '));
  const due = isDueDate(meta.due) ? meta.due : null;
  return {
    filename,
    filePath,
    title: meta.title || (heading ? heading.slice(2).trim() : filename.replace(/\.md$/, '')),
    projects: parseProjects(meta),
    pinned: meta.pinned === 'true',
    // Put away: kept on disk, out of every list until someone asks for it.
    archived: meta.archived === 'true',
    modified: stat.mtime.toISOString(),
    // The list's own deadline, and the soonest day anything still open in it
    // is due by — its own date or, failing that, the list's.
    due,
    nextDue: nextDue(todos, due),
    todos,
    blocks: noteBlocks(body, todos),
    done: todos.filter(t => t.done).length,
    total: todos.length,
    // The first lines that are neither the heading nor a checkbox, so a note
    // with no TODOs in it still says something in the list.
    preview: body
      .split('\n')
      .filter(l => l.trim() && !l.trim().startsWith('#') && !TODO_RE.test(l))
      .slice(0, 2)
      .join(' ')
      .slice(0, 160),
  };
}

function listNotes(notesDir) {
  let files;
  try {
    files = fs.readdirSync(notesDir).filter(f => NOTE_FILE_RE.test(f));
  } catch {
    return [];
  }
  const notes = [];
  for (const filename of files) {
    const filePath = path.join(notesDir, filename);
    try {
      notes.push(summarize(filename, filePath, fs.readFileSync(filePath, 'utf8'), fs.statSync(filePath)));
    } catch {}
  }
  // Pinned first, then whatever is due soonest — a list due tomorrow belongs
  // above one edited this morning — then most recently touched, the order the
  // plans list uses. A note with nothing open and dated sorts by touch alone.
  notes.sort((a, b) => Number(a.archived) - Number(b.archived)
    || Number(b.pinned) - Number(a.pinned)
    || byNextDue(a, b)
    || new Date(b.modified) - new Date(a.modified));
  return notes;
}

function byNextDue(a, b) {
  if (a.nextDue && b.nextDue) return a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : 0;
  if (a.nextDue) return -1;
  if (b.nextDue) return 1;
  return 0;
}

function readNote(notesDir, filename) {
  const filePath = notePath(notesDir, filename);
  if (!filePath) return { ok: false, error: 'invalid note name' };
  try {
    return { ok: true, filePath, content: fs.readFileSync(filePath, 'utf8') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Takes the absolute path the editor was opened with, and refuses anything
// that is not inside the notes directory — the editor is shared with plans,
// which have their own guarded write.
function saveNote(notesDir, filePath, content) {
  const resolved = path.resolve(String(filePath || ''));
  const root = path.resolve(notesDir);
  if (path.dirname(resolved) !== root || !NOTE_FILE_RE.test(path.basename(resolved))) {
    return { ok: false, error: 'path outside notes directory' };
  }
  try {
    ensureDir(notesDir);
    fs.writeFileSync(resolved, String(content), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function slugify(title) {
  const slug = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'note';
}

function uniqueFilename(notesDir, base) {
  const stamp = new Date().toISOString().slice(0, 10);
  let filename = `${stamp}-${base}.md`;
  let n = 2;
  while (fs.existsSync(path.join(notesDir, filename))) {
    filename = `${stamp}-${base}-${n++}.md`;
  }
  return filename;
}

function createNote(notesDir, { title, projects, project, body, due } = {}) {
  const cleanTitle = String(title || '').trim() || 'Untitled note';
  ensureDir(notesDir);
  const filename = uniqueFilename(notesDir, slugify(cleanTitle));
  const filePath = path.join(notesDir, filename);
  const related = Array.isArray(projects) ? projects : (project ? [project] : []);
  const header = [
    '---',
    `title: ${cleanTitle}`,
    `projects: ${formatProjects(related)}`,
    ...(isDueDate(due) ? [`due: ${due}`] : []),
    `created: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${cleanTitle}`,
    '',
  ].join('\n');
  const content = header + (body != null ? String(body) : '- [ ] ') + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
  return { ok: true, filename, filePath };
}

function deleteNote(notesDir, filename) {
  const filePath = notePath(notesDir, filename);
  if (!filePath) return { ok: false, error: 'invalid note name' };
  try {
    fs.unlinkSync(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Flip one checkbox in place. Rewriting only that character keeps whatever
// else the file holds — indentation, nested lists, prose — exactly as typed.
function toggleTodo(notesDir, filename, index) {
  const filePath = notePath(notesDir, filename);
  if (!filePath) return { ok: false, error: 'invalid note name' };
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const { body } = parseNote(content);
  const target = noteTodos(body)[index];
  if (!target) return { ok: false, error: 'no such item' };

  // The body's line numbers are offset by however long the frontmatter is.
  const offset = content.split('\n').length - body.split('\n').length;
  const lines = content.split('\n');
  const lineNo = target.line + offset;
  const m = lines[lineNo]?.match(TODO_RE);
  if (!m) return { ok: false, error: 'item moved — reload the note' };
  lines[lineNo] = m[1] + (target.done ? ' ' : 'x') + m[3];

  try {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return { ok: true, done: !target.done };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Set or clear one item's due date. Same surgery as ticking a box: only that
// line changes, and on it only the `due:` token — see todo-due.js.
function setTodoDue(notesDir, filename, index, due) {
  if (due != null && !isDueDate(due)) return { ok: false, error: `not a date: ${due}` };
  const filePath = notePath(notesDir, filename);
  if (!filePath) return { ok: false, error: 'invalid note name' };
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const { body } = parseNote(content);
  const target = noteTodos(body)[index];
  if (!target) return { ok: false, error: 'no such item' };

  const offset = content.split('\n').length - body.split('\n').length;
  const lines = content.split('\n');
  const lineNo = target.line + offset;
  const m = lines[lineNo]?.match(TODO_RE);
  if (!m) return { ok: false, error: 'item moved — reload the note' };
  lines[lineNo] = m[1] + m[2] + setDueToken(m[3], due || null);

  try {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return { ok: true, due: due || null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Set or clear the deadline of a whole list — a `due:` frontmatter key.
// Items with no date of their own are due by it.
function setNoteDue(notesDir, filename, due) {
  if (due != null && !isDueDate(due)) return { ok: false, error: `not a date: ${due}` };
  return rewriteHeaderKey(notesDir, filename, 'due', due || null);
}

// Archive or bring back a note. Only a header key: the file stays where it is,
// so a link to it, Buddy's memory of it and its history in git all survive.
function setNoteArchived(notesDir, filename, archived) {
  return rewriteHeaderKey(notesDir, filename, 'archived', archived ? 'true' : null);
}

// One frontmatter key replaced, added or (for null) removed, the rest of the
// file untouched. A note typed by hand without a header gets one.
function rewriteHeaderKey(notesDir, filename, key, value) {
  const filePath = notePath(notesDir, filename);
  if (!filePath) return { ok: false, error: 'invalid note name' };
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const { meta, body } = parseNote(content);
  const hasHeader = /^---\r?\n/.test(content);
  const line = value == null ? null : `${key}: ${value}`;
  const keyRe = new RegExp(`^${key}:.*(\\r?\\n|$)`, 'm');

  if (!hasHeader) {
    if (line == null) return { ok: true };
    content = ['---', `title: ${meta.title || filename.replace(/\.md$/, '')}`, line, '---', '', body].join('\n');
  } else {
    // Only inside the header: a body line that happens to start with "due:"
    // is the note's text, not its metadata.
    const end = content.search(/\r?\n---\r?\n?/);
    let header = content.slice(0, end + 1);
    const rest = content.slice(end + 1);
    if (key in meta) header = line == null ? header.replace(keyRe, '') : header.replace(new RegExp(`^${key}:.*$`, 'm'), line);
    else if (line != null) header += `${line}\n`;
    content = header + rest;
  }

  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true, [key]: value };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Changing which projects a note relates to, without opening the editor.
// Rewrites the frontmatter key — and retires a legacy single `project:` line
// in the same pass, so a note has one answer rather than two.
function setNoteProjects(notesDir, filename, projects) {
  const filePath = notePath(notesDir, filename);
  if (!filePath) return { ok: false, error: 'invalid note name' };
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const list = (Array.isArray(projects) ? projects : [projects])
    .map(p => String(p || '').trim())
    .filter(Boolean);
  const line = `projects: ${formatProjects(list)}`;
  const { meta, body } = parseNote(content);
  const hasHeader = /^---\r?\n/.test(content);

  if (!hasHeader) {
    content = ['---', `title: ${meta.title || filename.replace(/\.md$/, '')}`, line, '---', '', body].join('\n');
  } else {
    content = content.replace(/^project:.*\r?\n/m, '');
    content = 'projects' in meta
      ? content.replace(/^projects:.*$/m, line)
      : content.replace(/^---\r?\n/, `---\n${line}\n`);
  }

  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true, projects: list };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  listNotes,
  readNote,
  saveNote,
  createNote,
  deleteNote,
  toggleTodo,
  setTodoDue,
  setNoteDue,
  setNoteArchived,
  setNoteProjects,
  ensureDir,
};
