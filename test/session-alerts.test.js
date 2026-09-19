const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionAlerts, formatSpan, waitingReason } = require('../session-alerts');

function harness(settings = {}, watching = () => false) {
  let t = 0;
  const sent = [];
  const alerts = createSessionAlerts({
    now: () => t,
    settings: () => settings,
    isWatching: watching,
    titleFor: id => `Title ${id}`,
    notify: n => sent.push(n),
  });
  return { alerts, sent, advance: (ms) => { t += ms; } };
}

test('a turn longer than the threshold notifies when it ends', () => {
  const { alerts, sent, advance } = harness({ notifyMinWorkSeconds: 3 });
  alerts.onChange('s1', { state: 'running' });
  advance(5000);
  alerts.onChange('s1', { state: 'idle', lastAssistantMessage: 'All   tests pass.' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'finished');
  assert.equal(sent[0].title, 'Done · Title s1');
  assert.equal(sent[0].body, '5s · All tests pass.');
  assert.equal(sent[0].sound, false);
});

test('a short turn says nothing', () => {
  const { alerts, sent, advance } = harness({ notifyMinWorkSeconds: 3 });
  alerts.onChange('s1', { state: 'running' });
  advance(2000);
  alerts.onChange('s1', { state: 'idle' });
  assert.equal(sent.length, 0);
});

test('the turn is timed from when work started, through a question in the middle', () => {
  const { alerts, sent, advance } = harness({ notifyMinWorkSeconds: 10 });
  alerts.onChange('s1', { state: 'running' });
  advance(4000);
  alerts.onChange('s1', { state: 'requires_action', message: 'Claude needs your permission to use Bash' });
  advance(4000);
  alerts.onChange('s1', { state: 'running' });
  advance(4000);
  alerts.onChange('s1', { state: 'idle' });
  assert.deepEqual(sent.map(n => n.kind), ['waiting', 'finished']);
  assert.match(sent[1].body, /^Worked 12s$/);
});

test('waiting always notifies, with the sound the setting asks for', () => {
  const loud = harness({ notifyMinWorkSeconds: 999 });
  loud.alerts.onChange('s1', { state: 'requires_action', tool: 'AskUserQuestion' });
  assert.equal(loud.sent[0].kind, 'waiting');
  assert.equal(loud.sent[0].title, 'Waiting for you · Title s1');
  assert.equal(loud.sent[0].body, 'Has a question for you');
  assert.equal(loud.sent[0].sound, true);

  const quiet = harness({ notifySound: false });
  quiet.alerts.onChange('s1', { state: 'requires_action' });
  assert.equal(quiet.sent[0].sound, false);
});

test('nothing about the session you are looking at, and nothing when switched off', () => {
  const watched = harness({}, id => id === 's1');
  watched.alerts.onChange('s1', { state: 'requires_action' });
  watched.alerts.onChange('s1', { state: 'running' });
  watched.advance(60000);
  watched.alerts.onChange('s1', { state: 'idle' });
  assert.equal(watched.sent.length, 0);

  const off = harness({ notifyEnabled: false });
  off.alerts.onChange('s2', { state: 'requires_action' });
  off.alerts.onChange('s2', { state: 'running' });
  off.advance(60000);
  off.alerts.onChange('s2', { state: 'idle' });
  assert.equal(off.sent.length, 0);
});

test('a re-keyed session keeps its turn timer', () => {
  const { alerts, sent, advance } = harness({ notifyMinWorkSeconds: 3 });
  alerts.onChange('old', { state: 'running' });
  advance(5000);
  alerts.rekey('old', 'new');
  alerts.onChange('new', { state: 'idle' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].sessionId, 'new');
});

test('spans and reasons read the way a person says them', () => {
  assert.equal(formatSpan(7000), '7s');
  assert.equal(formatSpan(245000), '4m 05s');
  assert.equal(formatSpan(4320000), '1h 12m');
  assert.equal(waitingReason({ tool: 'Bash' }), 'Wants to use Bash');
  assert.equal(waitingReason({}), 'Needs your answer to go on');
});
