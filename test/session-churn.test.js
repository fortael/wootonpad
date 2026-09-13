const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionChurn } = require('../src/vue/session-churn.js');

test('a session that changed lines reports both counts', () => {
  assert.deepEqual(sessionChurn({ linesAdded: 120, linesRemoved: 30 }),
    { added: 120, removed: 30 });
});

test('one-sided changes still report, with a zero for the other side', () => {
  assert.deepEqual(sessionChurn({ linesAdded: 7 }), { added: 7, removed: 0 });
  assert.deepEqual(sessionChurn({ linesRemoved: 4 }), { added: 0, removed: 4 });
});

// A session that only ever read should leave the row alone rather than draw
// "+0 −0" on it — which is most sessions in a long list.
test('a session that changed nothing reports nothing', () => {
  for (const session of [{}, { linesAdded: 0, linesRemoved: 0 }, null, undefined]) {
    assert.equal(sessionChurn(session), null);
  }
});
