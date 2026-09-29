const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const find = require('../session-find');

test('a date window is local days, both ends inclusive', () => {
  const day = find.timeWindow({ to: '2026-09-28' });
  assert.equal(day.sinceMs, new Date(2026, 8, 28).getTime());
  assert.equal(day.untilMs, new Date(2026, 8, 29).getTime());
  const span = find.timeWindow({ from: '2026-09-21', to: '2026-09-28' });
  assert.equal(span.untilMs - span.sinceMs, 8 * find.DAY_MS);
  const now = Date.now();
  assert.equal(find.timeWindow({ withinDays: 2 }, now).sinceMs, now - 2 * find.DAY_MS);
  assert.equal(find.timeWindow({}), null);
  assert.equal(find.timeWindow({ from: 'monday' }), null);
});

test('a session counts for a period it was alive in, even if touched later', () => {
  const win = find.timeWindow({ to: '2026-09-23' });
  assert.equal(find.overlaps({ created: '2026-09-21T10:00:00', modified: '2026-09-25T10:00:00' }, win), true);
  assert.equal(find.overlaps({ created: '2026-09-24T10:00:00', modified: '2026-09-25T10:00:00' }, win), false);
  assert.equal(find.overlaps({ created: '2026-09-20T10:00:00', modified: '2026-09-22T10:00:00' }, win), false);
});

test('terms: a sentence is split, lower-cased, deduplicated', () => {
  assert.deepEqual(find.normalizeTerms({ query: 'Auth, login  auth', terms: ['Авториз', 'a'] }), ['авториз', 'auth', 'login']);
});

test('a stem matches every form of the word, and the snippet is around it', () => {
  const m = find.matchTerms('Сегодня чинили авторизацию через OAuth', ['авториз', 'oauth', 'jwt']);
  assert.deepEqual(m.matched, ['авториз', 'oauth']);
  assert.match(m.snippet, /авторизацию/);
});

test('more terms outrank fewer; a title match outranks a tail match', () => {
  const ranked = find.rankHits([
    { sessionId: 'tail', matched: new Set(['auth']), modified: '2026-09-28' },
    { sessionId: 'title', matched: new Set(['auth']), inTitle: true, modified: '2026-09-01' },
    { sessionId: 'both', matched: new Set(['auth', 'login']), modified: '2026-08-01' },
  ]);
  assert.deepEqual(ranked.map(h => h.sessionId), ['both', 'title', 'tail']);
});

test('the tail of a transcript: the cut first line is dropped, plumbing is skipped', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sf-')), 't.jsonl');
  const lines = [
    { type: 'user', message: { content: 'x'.repeat(400) }, timestamp: '2026-09-28T09:00:00Z' },
    { type: 'user', message: { content: 'fix the login' }, timestamp: '2026-09-28T10:00:00Z' },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } },
    { type: 'user', message: { content: '<command-name>/compact</command-name>' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Login fixed' }] }, timestamp: '2026-09-28T11:00:00Z' },
  ];
  fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  const records = find.readTailRecords(file, 500);
  const messages = find.messagesOf(records);
  assert.deepEqual(messages.map(m => m.text), ['fix the login', 'Login fixed']);

  const late = find.timeWindow({ from: '2026-09-28' });
  late.sinceMs = Date.parse('2026-09-28T10:30:00Z');
  assert.deepEqual(find.messagesOf(records, late).map(m => m.text), ['Login fixed']);
});
