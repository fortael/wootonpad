const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createInputQueue, userMessage, isPromptContent, DIALOG_KINDS } = require('../sdk-session');

test('a queued message is delivered to a later reader', async () => {
  const q = createInputQueue();
  q.push('a');
  q.push('b');
  const it = q[Symbol.asyncIterator]();
  assert.deepEqual(await it.next(), { value: 'a', done: false });
  assert.deepEqual(await it.next(), { value: 'b', done: false });
});

// The whole point of the queue: query() asks for the next prompt long before
// the user has typed it, so the read has to park rather than end the stream.
test('a reader waiting on an empty queue is woken by a push', async () => {
  const q = createInputQueue();
  const it = q[Symbol.asyncIterator]();
  const pending = it.next();
  let settled = false;
  pending.then(() => { settled = true; });
  await new Promise(r => setImmediate(r));
  assert.equal(settled, false, 'the read parked instead of ending the stream');
  q.push('typed later');
  assert.deepEqual(await pending, { value: 'typed later', done: false });
});

test('closing ends the stream and wakes a parked reader', async () => {
  const q = createInputQueue();
  const it = q[Symbol.asyncIterator]();
  const pending = it.next();
  q.close();
  assert.deepEqual(await pending, { value: undefined, done: true });
  assert.equal(q.closed, true);
});

test('messages queued before a close are still drained', async () => {
  const q = createInputQueue();
  q.push('first');
  q.close();
  const it = q[Symbol.asyncIterator]();
  assert.deepEqual(await it.next(), { value: 'first', done: false });
  assert.deepEqual(await it.next(), { value: undefined, done: true });
});

test('a closed queue refuses new input', () => {
  const q = createInputQueue();
  q.close();
  assert.equal(q.push('too late'), false);
});

test('the queue is iterable with for-await', async () => {
  const q = createInputQueue();
  q.push('one');
  q.push('two');
  q.close();
  const seen = [];
  for await (const m of q) seen.push(m);
  assert.deepEqual(seen, ['one', 'two']);
});

// supportedDialogKinds is a promise to the CLI, not a preference: declaring a
// kind makes it start parking those dialogs here instead of falling back to
// its no-dialog behaviour. A name on this list with no renderer behind it
// would strand the turn, so the list and the renderer are checked together.
test('every declared dialog kind is one the dialog component renders', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'vue', 'components', 'RequestDialog.vue'), 'utf8');
  for (const kind of DIALOG_KINDS) {
    assert.ok(source.includes(kind), `RequestDialog.vue does not mention ${kind}`);
  }
});

test('a prompt is wrapped in the shape the SDK expects', () => {
  const m = userMessage('hello');
  assert.equal(m.type, 'user');
  assert.equal(m.message.role, 'user');
  assert.equal(m.message.content, 'hello');
  assert.equal(m.parent_tool_use_id, null);
});

// A prompt with an attachment is content blocks, not a string — the wrapper
// forwards whichever it is given rather than stringifying one into the other.
test('content blocks survive the wrapper intact', () => {
  const blocks = [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
    { type: 'text', text: 'what is this' },
  ];
  assert.deepEqual(userMessage(blocks).message.content, blocks);
});

test('a prompt the CLI cannot answer is refused before it is queued', () => {
  assert.equal(isPromptContent('hello'), true);
  assert.equal(isPromptContent([{ type: 'text', text: 'hi' }]), true);
  assert.equal(isPromptContent(''), false);
  assert.equal(isPromptContent([]), false);
  assert.equal(isPromptContent(null), false);
  // A block with no `type` fails the whole request, not just itself.
  assert.equal(isPromptContent([{ text: 'no type' }]), false);
  assert.equal(isPromptContent(['just a string']), false);
});
