const test = require('node:test');
const assert = require('node:assert/strict');
const { controlsFromTranscript } = require('../src/vue/session-controls.js');

// The shapes a real transcript uses: permissionMode on the user's entry,
// effort on the assistant's, model on the assistant message.
const userTurn = (permissionMode) => ({ type: 'user', permissionMode, message: { role: 'user', content: 'hi' } });
const reply = (effort, model) => ({ type: 'assistant', effort, message: { role: 'assistant', model, content: [] } });

test('the three controls are read out of the entries that carry them', () => {
  const found = controlsFromTranscript([
    userTurn('acceptEdits'),
    reply('high', 'claude-sonnet-5'),
  ]);
  assert.deepEqual(found, { permissionMode: 'acceptEdits', effort: 'high', model: 'claude-sonnet-5' });
});

// A session is on whatever it was last set to, not what it started on.
test('the last value in the file wins', () => {
  const found = controlsFromTranscript([
    userTurn('default'), reply('high', 'claude-sonnet-5'),
    userTurn('auto'), reply('xhigh', 'claude-opus-5'),
  ]);
  assert.deepEqual(found, { permissionMode: 'auto', effort: 'xhigh', model: 'claude-opus-5' });
});

test('entries that say nothing leave the earlier answer standing', () => {
  const found = controlsFromTranscript([
    userTurn('auto'), reply('xhigh', 'claude-opus-5'),
    { type: 'system', subtype: 'turn_duration' },
    { type: 'user', message: { role: 'user', content: 'more' } },
  ]);
  assert.equal(found.permissionMode, 'auto');
  assert.equal(found.effort, 'xhigh');
});

// A model on anything but an assistant entry is a request that may never have
// run; the assistant's own message is what actually answered.
test('only the assistant names the model', () => {
  const found = controlsFromTranscript([
    { type: 'user', message: { role: 'user', model: 'claude-haiku-4-5', content: 'hi' } },
  ]);
  assert.equal(found.model, null);
});

test('a mode the picker cannot show is not restored', () => {
  assert.equal(controlsFromTranscript([userTurn('somethingNew')]).permissionMode, null);
  assert.equal(controlsFromTranscript([userTurn('bypassPermissions')]).permissionMode, 'bypassPermissions');
});

test('an effort level that is not one is ignored', () => {
  assert.equal(controlsFromTranscript([reply('turbo', 'm')]).effort, null);
  assert.equal(controlsFromTranscript([reply('max', 'm')]).effort, 'max');
});

test('a transcript with none of it reports none of it', () => {
  assert.deepEqual(controlsFromTranscript([{ type: 'user', message: { content: 'hi' } }]),
    { permissionMode: null, effort: null, model: null });
});

test('nonsense never throws', () => {
  for (const value of [null, undefined, 'no', 42, [null, 7, {}]]) {
    assert.deepEqual(controlsFromTranscript(value),
      { permissionMode: null, effort: null, model: null });
  }
});
