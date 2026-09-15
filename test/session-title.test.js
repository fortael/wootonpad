const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sessionTitle, sessionSubtitle, sessionFirstPrompt, titlePending, titleSource,
} = require('../src/vue/session-title.js');

// The order is the whole decision, so these are the tests: which of the three
// names wins, and what is left to say underneath it.

test('the model title is what the session is called', () => {
  const s = { aiTitle: 'Session transition JSONL matching', summary: 'ok so the watcher is broken' };
  assert.equal(sessionTitle(s), 'Session transition JSONL matching');
});

test('a name the user typed outranks everything', () => {
  const s = { name: 'Friday', aiTitle: 'Rate limit backoff', summary: 'why is this 429ing' };
  assert.equal(sessionTitle(s), 'Friday');
});

test('a session the model has not titled yet is called by its first prompt', () => {
  assert.equal(sessionTitle({ summary: 'add a dark theme' }), 'add a dark theme');
});

test('a session with nothing at all falls back', () => {
  assert.equal(sessionTitle({}), 'Session');
  assert.equal(sessionTitle({}, 'abc123'), 'abc123');
  assert.equal(sessionTitle(null), 'Session');
  assert.equal(sessionTitle(undefined, 'abc123'), 'abc123');
});

// ── The line underneath ───────────────────────────────────────────

test('the subtitle is how the conversation opened', () => {
  const s = { aiTitle: 'Rate limit backoff', summary: 'why is this 429ing' };
  assert.equal(sessionSubtitle(s), 'why is this 429ing');
});

// The row would then say the same thing twice, in two sizes.
test('a session titled by its own first prompt has no subtitle', () => {
  assert.equal(sessionSubtitle({ summary: 'add a dark theme' }), '');
});

test('a renamed session still shows what it started as', () => {
  const s = { name: 'Friday', summary: 'why is this 429ing' };
  assert.equal(sessionSubtitle(s), 'why is this 429ing');
});

test('a session with no first prompt has no subtitle', () => {
  assert.equal(sessionSubtitle({ aiTitle: 'Rate limit backoff' }), '');
  assert.equal(sessionSubtitle({}), '');
  assert.equal(sessionSubtitle(null), '');
});

// cleanDisplayName is a renderer global. Outside the browser the helper has to
// answer anyway rather than throw on `window`.
test('it works without the renderer around it', () => {
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(sessionTitle({ aiTitle: 'Plain' }), 'Plain');
});

// ── While the name is being decided ───────────────────────────────
//
// The CLI writes an `ai-title` record once it knows what the conversation is
// about, which is a real gap after the first prompt. The row says so rather
// than showing a name that is about to be replaced by a different one.

const busy = true;
const idle = false;

test('a session that has just been given its first prompt is still being named', () => {
  assert.equal(titlePending({ summary: 'add a dark theme', messageCount: 2 }, busy), true);
});

test('a session that already has a name is not waiting for one', () => {
  assert.equal(titlePending({ aiTitle: 'Dark theme', summary: 'x', messageCount: 2 }, busy), false);
  assert.equal(titlePending({ name: 'Friday', summary: 'x', messageCount: 2 }, busy), false);
});

// The record is not guaranteed. A row promising a title since this morning is
// lying, so the claim is bounded on both sides.
test('a session with no turn running is not waiting for anything', () => {
  assert.equal(titlePending({ summary: 'add a dark theme', messageCount: 2 }, idle), false);
});

test('a long session that never got a title is not still deciding', () => {
  assert.equal(titlePending({ summary: 'x', messageCount: 400 }, busy), false);
  assert.equal(titlePending({ summary: 'x', messageCount: 12 }, busy), true);
  assert.equal(titlePending({ summary: 'x', messageCount: 13 }, busy), false);
});

// Before the first prompt lands there is nothing under the placeholder either,
// so the row is simply "New session" rather than a bar over a blank line.
test('a session with nothing said in it yet is not waiting', () => {
  assert.equal(titlePending({ summary: '', messageCount: 0 }, busy), false);
  assert.equal(titlePending(null, busy), false);
  assert.equal(titlePending(undefined, busy), false);
});

test('the opening sentence is available whatever else is on the row', () => {
  assert.equal(sessionFirstPrompt({ aiTitle: 'Dark theme', summary: 'add a dark theme' }), 'add a dark theme');
  assert.equal(sessionFirstPrompt({ summary: 'add a dark theme' }), 'add a dark theme');
  assert.equal(sessionFirstPrompt({}), '');
  assert.equal(sessionFirstPrompt(null), '');
});

// A turn is several requests and the tracker goes idle between them; a bar tied
// to `busy` alone blinks on and off while the session is plainly still working.
// And the title usually lands just *after* the turn ends, with `busy` false for
// good. So the wait is measured from when the transcript last moved.
const AT = Date.parse('2026-09-15T12:00:00Z');
const justWritten = { summary: 'x', messageCount: 2, modified: '2026-09-15T11:59:58Z' };
const quiet = { summary: 'x', messageCount: 2, modified: '2026-09-15T11:59:45Z' };

test('a session whose transcript just moved is still being named', () => {
  assert.equal(titlePending(justWritten, false, AT), true);
});

// The bug this bound exists for: a session that was never going to get a title
// sat under a loading bar long after its turn had visibly finished.
test('a session that has gone quiet stops waiting', () => {
  assert.equal(titlePending(quiet, false, AT), false);
});

test('a working session is being named however long it has been going', () => {
  assert.equal(titlePending(quiet, true, AT), true);
});

test('a write time that makes no sense is not a reason to wait', () => {
  assert.equal(titlePending({ summary: 'x', messageCount: 2 }, false, AT), false);
  assert.equal(titlePending({ summary: 'x', messageCount: 2, modified: 'nonsense' }, false, AT), false);
  // Clock skew: a file that claims to have been written in the future is not
  // a file that was written a moment ago.
  assert.equal(titlePending({ summary: 'x', messageCount: 2, modified: '2027-01-01T00:00:00Z' }, false, AT), false);
});

// The CLI does not title every session. Surveyed across the transcripts on this
// machine, every long conversation carried an `ai-title` record and every short
// one carried none at all — "Ping", "What time?", "What can you do?" are never
// named. So the wait is the length of a pause in the work, not a guess at how
// long a title takes, and it has to end well inside the gap between two turns.
test('the wait ends within seconds of the work stopping', () => {
  const at = (seconds) => titlePending(
    { summary: 'x', messageCount: 2, modified: new Date(AT - seconds * 1000).toISOString() },
    false, AT,
  );
  assert.equal(at(1), true);
  assert.equal(at(4), true);
  assert.equal(at(6), false);
  assert.equal(at(30), false);
});

// ── Where the name came from ──────────────────────────────────────
//
// The three names look identical once drawn, and the case that matters is the
// one that looks like success: a generated title that never arrived falls back
// to the opening line, which reads exactly like a title that worked.

test('a renamed session says so', () => {
  assert.equal(titleSource({ name: 'Friday', aiTitle: 'X', summary: 'y' }), 'named');
});

test('a generated title says so', () => {
  assert.equal(titleSource({ aiTitle: 'Rate limit backoff', summary: 'why is this 429ing' }), 'ai');
});

test('a row showing only the opening line says that instead of claiming a title', () => {
  assert.equal(titleSource({ summary: 'why is this 429ing' }), 'prompt');
});

test('a session with nothing said in it has nothing to attribute', () => {
  assert.equal(titleSource({}), null);
  assert.equal(titleSource(null), null);
  assert.equal(titleSource({ summary: '' }), null);
});
