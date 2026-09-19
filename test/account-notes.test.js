const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const notes = require('../account-notes');

function tmpNotesDir() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-notes-')), 'notes');
}

test('a created note carries its title and project, and lists with its TODO count', () => {
  const dir = tmpNotesDir();
  try {
    const created = notes.createNote(dir, { title: 'Ship the release', projects: ['/repo/app', '/repo/lib'] });
    assert.ok(created.ok);
    assert.match(created.filename, /^\d{4}-\d{2}-\d{2}-ship-the-release\.md$/);

    fs.appendFileSync(created.filePath, 'write notes\n- [x] tag the commit\n', 'utf8');

    const [note] = notes.listNotes(dir);
    assert.equal(note.title, 'Ship the release');
    assert.deepEqual(note.projects, ['/repo/app', '/repo/lib']);
    assert.equal(note.total, 2, 'the template item plus the appended one');
    assert.equal(note.done, 1);
    assert.equal(note.todos[1].text, 'tag the commit');
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('two notes with the same title do not overwrite each other', () => {
  const dir = tmpNotesDir();
  try {
    const first = notes.createNote(dir, { title: 'Same name' });
    const second = notes.createNote(dir, { title: 'Same name' });
    assert.notEqual(first.filename, second.filename);
    assert.equal(notes.listNotes(dir).length, 2);
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('ticking a box rewrites that box and nothing else', () => {
  const dir = tmpNotesDir();
  try {
    const { filename, filePath } = notes.createNote(dir, {
      title: 'List',
      body: ['- [ ] one', '  - [ ] nested two', 'prose in between', '* [x] three'].join('\n'),
    });

    assert.equal(notes.toggleTodo(dir, filename, 1).done, true);
    let content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes('  - [x] nested two'), 'indentation and marker survive');
    assert.ok(content.includes('- [ ] one'));
    assert.ok(content.includes('prose in between'));

    assert.equal(notes.toggleTodo(dir, filename, 2).done, false, 'a ticked box unticks');
    content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes('* [ ] three'));

    assert.equal(notes.toggleTodo(dir, filename, 99).ok, false);
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('related projects can be retagged without opening the file', () => {
  const dir = tmpNotesDir();
  try {
    const { filename } = notes.createNote(dir, { title: 'Untagged' });
    notes.setNoteProjects(dir, filename, ['/repo/other', '/repo/second']);
    assert.deepEqual(notes.listNotes(dir)[0].projects, ['/repo/other', '/repo/second']);

    notes.setNoteProjects(dir, filename, []);
    assert.deepEqual(notes.listNotes(dir)[0].projects, []);
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('a note written with the older single project key is read, and upgraded on retag', () => {
  const dir = tmpNotesDir();
  try {
    notes.ensureDir(dir);
    const file = path.join(dir, 'legacy.md');
    fs.writeFileSync(file, ['---', 'title: Legacy', 'project: /repo/one', '---', '', '- [ ] carry on', ''].join('\n'), 'utf8');
    assert.deepEqual(notes.listNotes(dir)[0].projects, ['/repo/one']);

    notes.setNoteProjects(dir, 'legacy.md', ['/repo/one', '/repo/two']);
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(!/^project:/m.test(content), 'the single-project key does not survive alongside the list');
    assert.deepEqual(notes.listNotes(dir)[0].projects, ['/repo/one', '/repo/two']);
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('a project path containing a comma survives a round trip', () => {
  const dir = tmpNotesDir();
  try {
    const { filename } = notes.createNote(dir, { title: 'Odd path', projects: ['/repo/a,b'] });
    assert.deepEqual(notes.listNotes(dir)[0].projects, ['/repo/a,b']);
    notes.setNoteProjects(dir, filename, ['/repo/a,b', '/repo/c']);
    assert.deepEqual(notes.listNotes(dir)[0].projects, ['/repo/a,b', '/repo/c']);
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('a note written by hand without frontmatter still opens and titles itself', () => {
  const dir = tmpNotesDir();
  try {
    notes.ensureDir(dir);
    fs.writeFileSync(path.join(dir, 'scratch.md'), '# Scratch\n\n- [ ] think\n', 'utf8');
    const [note] = notes.listNotes(dir);
    assert.equal(note.title, 'Scratch');
    assert.equal(note.total, 1);
    assert.equal(notes.toggleTodo(dir, 'scratch.md', 0).done, true);
    assert.ok(fs.readFileSync(path.join(dir, 'scratch.md'), 'utf8').includes('- [x] think'));
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('nothing outside the notes directory can be read, written or deleted', () => {
  const dir = tmpNotesDir();
  const outside = path.join(path.dirname(dir), 'secret.md');
  try {
    notes.ensureDir(dir);
    fs.writeFileSync(outside, 'secret', 'utf8');

    assert.equal(notes.readNote(dir, '../secret.md').ok, false);
    assert.equal(notes.deleteNote(dir, '../secret.md').ok, false);
    assert.equal(notes.readNote(dir, 'nested/note.md').ok, false);
    assert.equal(notes.saveNote(dir, outside, 'overwritten').ok, false);
    assert.equal(notes.saveNote(dir, path.join(dir, 'note.txt'), 'x').ok, false, 'only .md files');
    assert.equal(fs.readFileSync(outside, 'utf8'), 'secret');

    const { filePath } = notes.createNote(dir, { title: 'Fine' });
    assert.equal(notes.saveNote(dir, filePath, '# edited\n').ok, true);
    assert.equal(fs.readFileSync(filePath, 'utf8'), '# edited\n');
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('a note reads back as prose and checkboxes in the order they were written', () => {
  const dir = tmpNotesDir();
  try {
    notes.createNote(dir, {
      title: 'Mixed',
      body: [
        'Why this matters: the API changes on Friday.',
        '',
        '- [ ] migrate the client',
        '- [x] tell the team',
        '',
        '## Notes',
        'Rollback is a revert of one commit.',
        '',
      ].join('\n'),
    });

    const [note] = notes.listNotes(dir);
    assert.deepEqual(note.blocks.map(b => b.type), ['text', 'todo', 'todo', 'text']);
    assert.equal(note.blocks[0].text, 'Why this matters: the API changes on Friday.');
    assert.equal(note.blocks[1].index, 0, 'a block keeps the todo index the toggle takes');
    assert.equal(note.blocks[2].done, true);
    assert.equal(note.blocks[3].text, '## Notes\nRollback is a revert of one commit.');
    assert.ok(!note.blocks.some(b => b.type === 'text' && b.text.startsWith('# Mixed')),
      'the title heading is the card title, not part of the body');
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

// ── Due dates ─────────────────────────────────────────────────────

test('a note carries its list deadline and each item its own date, out of the text', () => {
  const dir = tmpNotesDir();
  try {
    notes.createNote(dir, {
      title: 'Dated',
      due: '2026-09-30',
      body: ['- [ ] own date due:2026-09-20', '- [x] done 📅 2026-09-01', '- [ ] follows the list'].join('\n'),
    });
    const [note] = notes.listNotes(dir);
    assert.equal(note.due, '2026-09-30');
    assert.equal(note.nextDue, '2026-09-20');
    assert.deepEqual(note.todos.map(t => [t.text, t.due]), [
      ['own date', '2026-09-20'], ['done', '2026-09-01'], ['follows the list', null],
    ]);
    assert.equal(note.blocks.find(b => b.type === 'todo').due, '2026-09-20');
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('setting an item\'s date rewrites that line\'s token and nothing else', () => {
  const dir = tmpNotesDir();
  try {
    const { filename, filePath } = notes.createNote(dir, {
      title: 'List',
      body: ['- [ ] one', '  - [x] two due:2026-09-01', 'prose due:2026-01-01'].join('\n'),
    });
    assert.equal(notes.setTodoDue(dir, filename, 0, '2026-09-20').ok, true);
    assert.equal(notes.setTodoDue(dir, filename, 1, null).ok, true);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes('- [ ] one due:2026-09-20'));
    assert.ok(content.includes('  - [x] two\n'), 'cleared, box and indentation kept');
    assert.ok(content.includes('prose due:2026-01-01'), 'prose is not an item');

    assert.equal(notes.setTodoDue(dir, filename, 0, '2026-02-30').ok, false);
    assert.equal(notes.setTodoDue(dir, filename, 9, '2026-09-20').ok, false);
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('the list deadline is added, moved and removed in the header only', () => {
  const dir = tmpNotesDir();
  try {
    const { filename, filePath } = notes.createNote(dir, { title: 'List', body: 'due: this is prose\n- [ ] a' });
    notes.setNoteDue(dir, filename, '2026-10-01');
    notes.setNoteDue(dir, filename, '2026-10-02');
    let content = fs.readFileSync(filePath, 'utf8');
    assert.equal((content.match(/^due: 2026-10-02$/gm) || []).length, 1);
    assert.ok(!content.includes('2026-10-01'));
    assert.equal(notes.listNotes(dir)[0].due, '2026-10-02');

    notes.setNoteDue(dir, filename, null);
    content = fs.readFileSync(filePath, 'utf8');
    assert.ok(!/^due: 2026/m.test(content));
    assert.ok(content.includes('due: this is prose'), 'a body line that looks like a key stays');
    assert.equal(notes.listNotes(dir)[0].due, null);
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('a hand-written note without a header gets one for its deadline', () => {
  const dir = tmpNotesDir();
  try {
    notes.ensureDir(dir);
    fs.writeFileSync(path.join(dir, 'bare.md'), '# Bare\n- [ ] a\n', 'utf8');
    assert.equal(notes.setNoteDue(dir, 'bare.md', '2026-10-01').ok, true);
    const [note] = notes.listNotes(dir);
    assert.equal(note.due, '2026-10-01');
    assert.equal(note.total, 1);
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('notes list soonest-due first, undated after, pinned above all', () => {
  const dir = tmpNotesDir();
  try {
    notes.createNote(dir, { title: 'Undated', body: '- [ ] a' });
    notes.createNote(dir, { title: 'Later', body: '- [ ] a due:2026-10-10' });
    notes.createNote(dir, { title: 'Sooner', body: '- [ ] a due:2026-09-21' });
    notes.createNote(dir, { title: 'Done', body: '- [x] a due:2026-09-01' });
    const order = notes.listNotes(dir).map(n => n.title);
    assert.deepEqual(order.slice(0, 2), ['Sooner', 'Later']);
    assert.ok(order.indexOf('Undated') > 1 && order.indexOf('Done') > 1, 'nothing open and dated sorts by touch');
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});
