const test = require('node:test');
const assert = require('node:assert/strict');
const {
  truncateCommand, previewLine, findMentions, splitPathToken, isExternalPathToken, relativeTime,
} = require('../src/vue/chat-text.js');

// ── Folded tool headers ───────────────────────────────────────────

test('a command folds to its first line', () => {
  assert.equal(truncateCommand('npm test'), 'npm test');
  assert.equal(truncateCommand('  git status  '), 'git status');
});

test('more lines than one are marked, so the header does not lie', () => {
  assert.equal(truncateCommand('npm test\nnpm run lint'), 'npm test…');
});

test('a long first line is cut to the width it was given', () => {
  const head = truncateCommand('x'.repeat(200), 20);
  assert.equal(head.length, 20);
  assert.ok(head.endsWith('…'));
});

test('a command that is only whitespace has no header to write', () => {
  assert.equal(truncateCommand('   \n  '), '');
  assert.equal(truncateCommand(undefined), '');
});

test('a preview is one flattened line', () => {
  assert.equal(previewLine('first\n\n  second   line'), 'first second line');
});

// ── Mentions ──────────────────────────────────────────────────────

test('a leading slash command is a mention, covering its own sigil', () => {
  assert.deepEqual(findMentions('/review the diff'), [
    { index: 0, length: 7, kind: 'command', value: 'review' },
  ]);
});

// A slash in a sentence is a path far more often than it is a command, and the
// CLI only reads one at the start of a message anyway.
test('a slash anywhere but the start is not a command', () => {
  assert.deepEqual(findMentions('look in /usr/local/bin'), []);
  assert.deepEqual(findMentions('and/or'), []);
});

test('a command has to be the whole first token', () => {
  assert.deepEqual(findMentions('/usr/local/bin is where it lives'), []);
});

test('file mentions are found mid-sentence and cover the @', () => {
  const found = findMentions('compare @src/app.js with @public/style.css please');
  assert.deepEqual(found.map(m => m.value), ['src/app.js', 'public/style.css']);
  assert.equal('compare @src/app.js'.length, found[0].index + found[0].length);
});

test('sentence punctuation after a path is not part of it', () => {
  assert.deepEqual(findMentions('start with @main.js.').map(m => m.value), ['main.js']);
});

// The boundary is what keeps an address from being read as a file.
test('an email address is not a file mention', () => {
  assert.deepEqual(findMentions('mail fortael@yahoo.com about it'), []);
});

test('a command and a file in one message are both found, in order', () => {
  const found = findMentions('/verify @test/chat-text.test.js');
  assert.deepEqual(found.map(m => m.kind), ['command', 'file']);
});

// ── Session and project mentions ──────────────────────────────────
//
// The two things the app owns, named in prose so an answer can point at one.

const UUID = '3f7a1b20-4c5d-4e6f-8a9b-0c1d2e3f4a5b';

test('a session mention carries its uuid and covers the whole token', () => {
  const found = findMentions(`picked up from @session:${UUID} yesterday`);
  assert.deepEqual(found, [{
    index: 'picked up from '.length,
    length: `@session:${UUID}`.length,
    kind: 'session',
    value: UUID,
  }]);
});

test('a session uuid is matched whatever case it was written in', () => {
  const found = findMentions(`@session:${UUID.toUpperCase()}`);
  assert.deepEqual(found.map(m => m.kind), ['session']);
  assert.equal(found[0].value, UUID.toUpperCase());
});

// Anything looser than 8-4-4-4-12 opens nothing, so it stays prose — the file
// rule still claims it, which is what an unrecognised `@token` has always been.
test('a malformed session mention is not a session', () => {
  for (const text of [
    '@session:not-a-uuid',
    '@session:3f7a1b20-4c5d-4e6f-8a9b',
    `@session:${UUID}0`,
    `@session:${UUID}-extra`,
  ]) {
    const kinds = findMentions(text).map(m => m.kind);
    assert.ok(!kinds.includes('session'), `${text} → ${kinds.join(',')}`);
  }
});

test('a project mention carries its absolute path', () => {
  const found = findMentions('the fix landed in @project:/Users/x/switchboard today');
  assert.deepEqual(found, [{
    index: 'the fix landed in '.length,
    length: '@project:/Users/x/switchboard'.length,
    kind: 'project',
    value: '/Users/x/switchboard',
  }]);
});

test('sentence punctuation after a project path is not part of it', () => {
  assert.deepEqual(findMentions('see @project:/Users/x/foo.').map(m => m.value), ['/Users/x/foo']);
});

// `@project:/Users/x/foo` is also a perfectly good `@path` token, and both
// rules start at the same character. The specific one has to win.
test('the file rule does not swallow a project or session mention', () => {
  assert.deepEqual(findMentions('@project:/Users/x/foo').map(m => m.kind), ['project']);
  assert.deepEqual(findMentions(`@session:${UUID}`).map(m => m.kind), ['session']);
});

test('a plain file mention still works beside the new kinds', () => {
  const found = findMentions(`@project:/Users/x/foo and @src/app.js and @session:${UUID}`);
  assert.deepEqual(found.map(m => m.kind), ['project', 'file', 'session']);
  assert.deepEqual(found.map(m => m.value), ['/Users/x/foo', 'src/app.js', UUID]);
  // Callers walk the list with a cursor, so it has to stay in reading order.
  for (let i = 1; i < found.length; i++) assert.ok(found[i].index > found[i - 1].index);
});

// A relative path is not a project: the chip opens a project by path, and half
// a path opens nothing.
test('a project mention has to be absolute', () => {
  assert.deepEqual(findMentions('@project:switchboard').map(m => m.kind), ['file']);
});

// ── Path tokens ───────────────────────────────────────────────────

test('a path token splits at its last slash', () => {
  assert.deepEqual(splitPathToken('../src/vue/ap'), { dir: '../src/vue/', base: 'ap' });
  assert.deepEqual(splitPathToken('app'), { dir: '', base: 'app' });
  assert.deepEqual(splitPathToken('../'), { dir: '../', base: '' });
});

test('only a token that walks needs the disk read', () => {
  for (const token of ['../', './', '~/', '~', '/etc/']) {
    assert.equal(isExternalPathToken(token), true, token);
  }
  for (const token of ['src/app.js', 'app', '', 'a/b']) {
    assert.equal(isExternalPathToken(token), false, token);
  }
});

// ── Relative time ─────────────────────────────────────────────────

const now = Date.UTC(2026, 0, 2, 12, 0, 0);
const ago = (ms) => relativeTime(now - ms, now);

test('anything within the minute is just now', () => {
  assert.equal(ago(0), 'just now');
  assert.equal(ago(30e3), 'just now');
});

// Floored, not rounded: ninety minutes is an hour ago, not two.
test('the unit is the largest one that fits, counted down', () => {
  assert.equal(ago(2 * 60e3), '2 minutes ago');
  assert.equal(ago(59 * 60e3), '59 minutes ago');
  assert.equal(ago(90 * 60e3), '1 hour ago');
  assert.equal(ago(2 * 24 * 3600e3), '2 days ago');
  assert.equal(ago(10 * 24 * 3600e3), '1 week ago');
});

test('an unreadable timestamp says nothing rather than NaN', () => {
  assert.equal(relativeTime('not a date', now), '');
  assert.equal(relativeTime(undefined, now), '');
});

// A clock that disagrees is not a message from the future.
test('a timestamp ahead of now reads as just now', () => {
  assert.equal(relativeTime(now + 60e3, now), 'just now');
});

// ── Local command envelopes ───────────────────────────────────────
//
// The three records the CLI writes while a slash command runs. All three are
// addressed to the model, not to the reader — rendered as prose they were
// three bubbles of XML where the user ran one command.

const { localCommandEnvelope } = require('../src/vue/chat-text.js');

test('the caveat is recognised as plumbing', () => {
  const envelope = localCommandEnvelope(
    '<local-command-caveat>Caveat: The messages below were generated by the user '
    + 'while running local commands.</local-command-caveat>');
  assert.deepEqual(envelope, { kind: 'caveat' });
});

test('an invocation yields its name without the slash, and its arguments', () => {
  assert.deepEqual(localCommandEnvelope(
    '<command-name>/auto-mode-setup</command-name>\n'
    + '            <command-message>auto-mode-setup</command-message>\n'
    + '            <command-args>--wizard posture=mixed --propose</command-args>'),
  { kind: 'call', name: 'auto-mode-setup', args: '--wizard posture=mixed --propose' });
});

test('an invocation with no arguments still parses', () => {
  assert.deepEqual(
    localCommandEnvelope('<command-name>/usage</command-name>\n<command-args></command-args>'),
    { kind: 'call', name: 'usage', args: '' });
});

test('stdout and stderr are told apart', () => {
  assert.deepEqual(localCommandEnvelope('<local-command-stdout>0% used</local-command-stdout>'),
    { kind: 'output', text: '0% used', isError: false });
  assert.deepEqual(localCommandEnvelope('<local-command-stderr>no such command</local-command-stderr>'),
    { kind: 'output', text: 'no such command', isError: true });
});

// The caveat and the command can share one record, and then it is the command
// that has to win — otherwise the invocation is dropped as plumbing.
test('a record carrying both is read as the invocation', () => {
  const envelope = localCommandEnvelope(
    '<local-command-caveat>ignore this</local-command-caveat><command-name>/usage</command-name>');
  assert.equal(envelope.kind, 'call');
  assert.equal(envelope.name, 'usage');
});

test('an ordinary message is not an envelope', () => {
  for (const text of ['', null, 'Run /usage and tell me', 'a < b && c > d']) {
    assert.equal(localCommandEnvelope(text), null, String(text));
  }
});
