const test = require('node:test');
const assert = require('node:assert/strict');

const { assistantText, lastAnswerText, mentionsIn, hasMentions } = require('../src/vue/buddy-mentions.js');

const A = '3f1c2a44-1111-2222-3333-aaaaaaaaaaaa';
const B = '9b7e0d12-4444-5555-6666-bbbbbbbbbbbb';

const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const toolResult = () => ({ type: 'user', message: { content: [{ type: 'tool_result', content: `@session:${B}` }] } });
const said = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const called = () => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__wooton__list_sessions' }] } });

test('the last answer is everything said since the user last spoke', () => {
  const entries = [
    user('first'), said(`old @session:${B}`),
    user('what needs me?'), said('Checking.'), called(), toolResult(), said(`@session:${A} is waiting`),
  ];
  const text = lastAnswerText(entries);
  assert.match(text, /Checking\./);
  assert.match(text, new RegExp(A));
  assert.doesNotMatch(text, new RegExp(B), 'neither the older answer nor a tool result counts');
});

test('only assistant text is read', () => {
  assert.equal(assistantText(user('hi')), '');
  assert.equal(assistantText(called()), '');
  assert.equal(assistantText(said('hello')), 'hello');
});

test('sessions and projects come out in order, once each', () => {
  const m = mentionsIn(`@session:${A} and @project:/repo/app, again @session:${A.toUpperCase()} and @session:${B}`);
  assert.deepEqual(m.sessions, [A, B]);
  assert.deepEqual(m.projects, ['/repo/app']);
});

test('a TODO counts when its filename or a long enough title appears', () => {
  const notes = [
    { filename: '2026-09-19-index-review.md', title: 'Index review in data-mart' },
    { filename: 'test.md', title: 'Test' },
  ];
  assert.deepEqual(mentionsIn('Added 2026-09-19-index-review.md', notes).todos, ['2026-09-19-index-review.md']);
  assert.deepEqual(mentionsIn('The Index review in data-mart note is open', notes).todos, ['2026-09-19-index-review.md']);
  assert.deepEqual(mentionsIn('Test the thing', notes).todos, [], 'a short title is an ordinary word');
});

test('nothing mentioned is nothing to show', () => {
  assert.equal(hasMentions(mentionsIn('no refs here')), false);
  assert.equal(hasMentions(mentionsIn(`@session:${A}`)), true);
});
