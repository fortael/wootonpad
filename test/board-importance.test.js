const test = require('node:test');
const assert = require('node:assert/strict');
const { IMPORTANCE_CAP, IMPORTANCE_PROMPT, importanceRater } = require('../board-importance.js');

test('a level is handed out at most twice, in the order answered', () => {
  const rate = importanceRater();
  assert.deepEqual([3, 3, 3, 3].map(rate), [3, 3, 0, 0]);
});

test('the cap is per level, not across the board', () => {
  const rate = importanceRater();
  assert.deepEqual([3, 2, 1, 3, 2, 1].map(rate), [3, 2, 1, 3, 2, 1]);
  assert.deepEqual([3, 2, 1].map(rate), [0, 0, 0]);
});

// The prompt says every session may stay at 0, so the common answer is a run
// of them — and none of that may consume a level's budget.
test('zero is free and never claims anything', () => {
  const rate = importanceRater();
  assert.deepEqual([0, 0, 0, 0, 0].map(rate), [0, 0, 0, 0, 0]);
  assert.deepEqual([3, 3].map(rate), [3, 3]);
});

// The model answers with JSON it wrote itself: a missing field, a string, a
// level nobody asked for. None of it may reach the board as a flag.
test('anything that is not a level reads as unflagged', () => {
  const rate = importanceRater();
  for (const value of [undefined, null, '', 'high', NaN, Infinity, -1, 0, 4, 9]) {
    assert.equal(rate(value), 0, `${String(value)} should not flag a card`);
  }
});

test('a number the model wrote as text or with a decimal still rates', () => {
  const rate = importanceRater();
  assert.equal(rate('3'), 3);
  assert.equal(rate(2.4), 2);
});

test('the cap the prompt states is the cap that is enforced', () => {
  assert.ok(IMPORTANCE_PROMPT.includes(`At most ${IMPORTANCE_CAP} sessions may get 3`));
  const rate = importanceRater();
  const asked = Array(IMPORTANCE_CAP + 1).fill(3).map(rate);
  assert.equal(asked.filter(Boolean).length, IMPORTANCE_CAP);
});
