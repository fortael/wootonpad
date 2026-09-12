const test = require('node:test');
const assert = require('node:assert/strict');
const { fuzzyMatch, isTightMatch, highlightParts } = require('../src/vue/fuzzy-match.js');

const hit = (text, query) => fuzzyMatch(text, query);
const marked = (text, query) => highlightParts(text, query).map(p => (p.hit ? `[${p.text}]` : p.text)).join('');

test('a substring matches and is marked where it sits', () => {
  assert.equal(marked('wooton-pad', 'pad'), 'wooton-[pad]');
});

test('initials match across word boundaries', () => {
  const m = hit('wooton-pad', 'wp');
  assert.ok(m);
  assert.ok(m.initials);
  assert.equal(marked('wooton-pad', 'wp'), '[w]ooton-[p]ad');
});

test('letters out of order do not match', () => {
  assert.equal(hit('wooton-pad', 'pw'), null);
});

test('matching is case-insensitive', () => {
  assert.ok(hit('Board redesign', 'BOARD'));
});

test('a run at the start scores above the same letters scattered', () => {
  const tight = hit('api', 'api').score;
  const loose = hit('a-parser-in-the-middle', 'api').score;
  assert.ok(tight > loose, `${tight} should beat ${loose}`);
});

test('isTightMatch rejects letters that merely happen to be there', () => {
  const loose = hit('Set up the schema and seed the staging database', 'sess');
  assert.ok(loose, 'it is a subsequence');
  assert.equal(isTightMatch(loose, 'sess'), false);

  const real = hit('Session cache rewrite', 'sess');
  assert.equal(isTightMatch(real, 'sess'), true);
});

test('an untight match is not highlighted either', () => {
  const text = 'Set up the schema and seed the staging database';
  assert.equal(marked(text, 'sess'), text);
});

test('an empty query matches everything and marks nothing', () => {
  assert.deepEqual(fuzzyMatch('anything', ''), { score: 0, ranges: [] });
  assert.equal(marked('anything', ''), 'anything');
});

test('empty text never matches a real query', () => {
  assert.equal(hit('', 'a'), null);
  assert.equal(hit(null, 'a'), null);
});
