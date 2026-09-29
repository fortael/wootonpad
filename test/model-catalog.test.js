const test = require('node:test');
const assert = require('node:assert');
const { bareId, mergeModels } = require('../model-catalog');

const SDK = [
  { value: 'default', displayName: 'Default (recommended)', resolvedModel: 'claude-opus-5' },
  { value: 'opus[1m]', displayName: 'Opus (1M context)', resolvedModel: 'claude-opus-5[1m]' },
  { value: 'sonnet', displayName: 'Sonnet', resolvedModel: 'claude-sonnet-5' },
  { value: 'haiku', displayName: 'Haiku', resolvedModel: 'claude-haiku-4-5-20251001' },
];
const API = [
  { id: 'claude-opus-5-5', displayName: 'Claude Opus 5.5' },
  { id: 'claude-opus-5', displayName: 'Claude Opus 5' },
  { id: 'claude-sonnet-5', displayName: 'Claude Sonnet 5' },
  { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' },
  { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5' },
];

test('bare id drops the context marker and the snapshot date', () => {
  assert.equal(bareId('claude-opus-5[1m]'), 'claude-opus-5');
  assert.equal(bareId('claude-haiku-4-5-20251001'), 'claude-haiku-4-5');
});

test('a model newer than the SDK knows goes right after default; older ones at the end', () => {
  const rows = mergeModels(SDK, API);
  assert.deepEqual(rows.map(r => r.value),
    ['default', 'claude-opus-5-5', 'opus[1m]', 'sonnet', 'haiku', 'claude-opus-4-8']);
  assert.equal(rows[1].fromApi, true);
  assert.equal(rows[1].resolvedModel, 'claude-opus-5-5');
});

test('without an API list the SDK rows are untouched', () => {
  assert.deepEqual(mergeModels(SDK, null), SDK);
  assert.deepEqual(mergeModels(null, API.slice(0, 1)).map(r => r.value), ['claude-opus-5-5']);
});
