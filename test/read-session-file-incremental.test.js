const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readSessionFile, readSessionFileIncremental } = require('../read-session-file');

let count = 0;
function makeSession(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `wp-incr-${count++}-`));
  const file = path.join(dir, 'abc123.jsonl');
  fs.writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return { dir, file };
}

function append(file, records) {
  fs.appendFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const assistant = (text, usage) => ({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'text', text }], usage },
});
const edit = (file, added, removed) => ({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [{ type: 'tool_use', name: 'Edit', input: { file_path: file } }],
  },
  toolUseResult: {
    structuredPatch: [{
      lines: [
        ...Array.from({ length: added }, (_, i) => '+new ' + i),
        ...Array.from({ length: removed }, (_, i) => '-old ' + i),
      ],
    }],
  },
});

/** Everything a caller reads off the row, minus the stat-derived timestamps. */
function derived(session) {
  if (!session) return null;
  const { created, modified, ...rest } = session;
  return rest;
}

test('an incremental read of an untouched file matches a full one', () => {
  const { dir, file } = makeSession([user('First question'), assistant('An answer')]);
  try {
    const { session } = readSessionFileIncremental(file, 'folder', '/p');
    assert.deepEqual(derived(session), derived(readSessionFile(file, 'folder', '/p')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('folding appended records matches re-reading the whole file', () => {
  const { dir, file } = makeSession([user('First question'), assistant('An answer')]);
  try {
    let state = readSessionFileIncremental(file, 'folder', '/p').state;

    append(file, [edit('/a.js', 5, 2), user('More'), assistant('Done', {
      input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 300,
    })]);

    const incremental = readSessionFileIncremental(file, 'folder', '/p', state);
    const full = readSessionFile(file, 'folder', '/p');
    assert.deepEqual(derived(incremental.session), derived(full));
    assert.equal(incremental.session.messageCount, 5);
    assert.equal(incremental.session.linesAdded, 5);
    assert.equal(incremental.session.linesRemoved, 2);
    assert.equal(incremental.session.changedFiles, 1);
    assert.equal(incremental.session.contextTokens, 330);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('many small appends fold the same as one big read', () => {
  const { dir, file } = makeSession([user('Start')]);
  try {
    let state = readSessionFileIncremental(file, 'folder', '/p').state;
    for (let i = 0; i < 25; i++) {
      append(file, [assistant('reply ' + i), edit('/f' + (i % 3) + '.js', 2, 1)]);
      state = readSessionFileIncremental(file, 'folder', '/p', state).state;
    }
    const incremental = readSessionFileIncremental(file, 'folder', '/p', state).session;
    assert.deepEqual(derived(incremental), derived(readSessionFile(file, 'folder', '/p')));
    assert.equal(incremental.changedFiles, 3);
    assert.equal(incremental.linesAdded, 50);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a record split across two reads is folded once, whole', () => {
  const { dir, file } = makeSession([user('Start')]);
  try {
    let state = readSessionFileIncremental(file, 'folder', '/p').state;

    // A write the watcher catches mid-flight: the line has no terminator yet.
    const line = JSON.stringify(assistant('a long partial answer'));
    fs.appendFileSync(file, line.slice(0, 20), 'utf8');
    let out = readSessionFileIncremental(file, 'folder', '/p', state);
    state = out.state;
    assert.equal(out.session.messageCount, 1, 'half a record is not a message');

    fs.appendFileSync(file, line.slice(20) + '\n', 'utf8');
    out = readSessionFileIncremental(file, 'folder', '/p', state);
    assert.equal(out.session.messageCount, 2);
    assert.deepEqual(derived(out.session), derived(readSessionFile(file, 'folder', '/p')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a multi-byte character split across two reads survives', () => {
  const { dir, file } = makeSession([user('Start')]);
  try {
    let state = readSessionFileIncremental(file, 'folder', '/p').state;

    const bytes = Buffer.from(JSON.stringify(assistant('ответ — ёжик 🦔')) + '\n', 'utf8');
    // Cut inside the multi-byte run rather than between characters.
    const cut = bytes.length - 12;
    fs.appendFileSync(file, bytes.subarray(0, cut));
    state = readSessionFileIncremental(file, 'folder', '/p', state).state;
    fs.appendFileSync(file, bytes.subarray(cut));

    const out = readSessionFileIncremental(file, 'folder', '/p', state);
    assert.equal(out.session.messageCount, 2);
    assert.ok(out.session.textContent.includes('ответ — ёжик 🦔'));
    assert.deepEqual(derived(out.session), derived(readSessionFile(file, 'folder', '/p')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a rewritten shorter file is read from scratch', () => {
  const { dir, file } = makeSession([user('Start'), assistant('a'), assistant('b')]);
  try {
    const state = readSessionFileIncremental(file, 'folder', '/p').state;
    fs.writeFileSync(file, JSON.stringify(user('Replaced')) + '\n', 'utf8');
    const out = readSessionFileIncremental(file, 'folder', '/p', state);
    assert.equal(out.session.messageCount, 1);
    assert.equal(out.session.summary, 'Replaced');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a replaced file of the same size is read from scratch', () => {
  const { dir, file } = makeSession([user('aaaa'), assistant('bbbb')]);
  try {
    const state = readSessionFileIncremental(file, 'folder', '/p').state;
    const replacement = path.join(dir, 'other.jsonl');
    fs.writeFileSync(replacement, fs.readFileSync(file));
    // A new inode with the same length is exactly what a same-size rewrite
    // looks like to a size check alone.
    fs.renameSync(replacement, file);
    const out = readSessionFileIncremental(file, 'folder', '/p', state);
    assert.equal(out.session.messageCount, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing file reports no session and no state', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-incr-missing-'));
  try {
    const out = readSessionFileIncremental(path.join(dir, 'nope.jsonl'), 'folder', '/p');
    assert.equal(out.session, null);
    assert.equal(out.state, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
