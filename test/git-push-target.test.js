const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pushTarget, DEFAULT_REMOTE } = require('../src/vue/git-push-target.js');

const commits = (n) => Array.from({ length: n }, (_, i) => ({ hash: String(i) }));

// ── With an upstream ──────────────────────────────────────────────

test('an upstream with commits behind it can be pushed', () => {
  const t = pushTarget({ upstream: 'origin/main', branch: 'main', remoteUrl: 'git@x:y.git', unpushedCommits: commits(2) });
  assert.deepEqual(t, { canPush: true, label: 'origin/main', willSetUpstream: false, reason: null });
});

test('an upstream that is level has nothing to push', () => {
  const t = pushTarget({ upstream: 'origin/main', branch: 'main', unpushedCommits: [] });
  assert.equal(t.canPush, false);
  assert.equal(t.reason, 'Nothing to push.');
  assert.equal(t.label, 'origin/main');
});

// ── Without an upstream ───────────────────────────────────────────
//
// The bug this module was written for: the button was disabled and the panel
// said "No upstream branch — nothing to push to." on a branch with three
// commits and a remote. main.js's git-push falls back to
// `push --set-upstream origin <branch>`, so there was always somewhere to go.

test('a branch with no upstream but a remote can still be pushed', () => {
  const t = pushTarget({ upstream: null, branch: 'optimize', remoteUrl: 'git@github.com:u/r.git', unpushedCommits: commits(3) });
  assert.equal(t.canPush, true, 'push is still refused without an upstream');
  assert.equal(t.willSetUpstream, true);
  assert.equal(t.label, 'origin/optimize');
  assert.equal(t.reason, null);
});

test('the destination names the remote git-push actually uses', () => {
  const t = pushTarget({ upstream: null, branch: 'feature', remoteUrl: 'x', unpushedCommits: commits(1) });
  assert.equal(t.label, `${DEFAULT_REMOTE}/feature`);
});

test('no upstream and nothing to push is still nothing to push', () => {
  const t = pushTarget({ upstream: null, branch: 'main', remoteUrl: 'x', unpushedCommits: [] });
  assert.equal(t.canPush, false);
  assert.equal(t.reason, 'Nothing to push.');
});

// With no remote there is genuinely nowhere to go — and that is the branch's
// fault in no way at all, so it must not be what the message blames.
test('no remote at all is reported as such', () => {
  const t = pushTarget({ upstream: null, branch: 'main', remoteUrl: null, unpushedCommits: commits(3) });
  assert.deepEqual(t, { canPush: false, label: '—', willSetUpstream: false, reason: 'No remote configured.' });
});

test('a detached HEAD with a remote still names the remote', () => {
  const t = pushTarget({ upstream: null, branch: null, remoteUrl: 'x', unpushedCommits: commits(1) });
  assert.equal(t.label, DEFAULT_REMOTE);
  assert.equal(t.canPush, true);
});

// ── Nothing loaded yet ────────────────────────────────────────────

test('no detail is not an invitation to push', () => {
  for (const d of [null, undefined, {}]) {
    const t = pushTarget(d);
    assert.equal(t.canPush, false, JSON.stringify(d));
    assert.equal(t.reason, 'No remote configured.');
  }
});

// ── The wiring ────────────────────────────────────────────────────
//
// Two views offer a Push button and they used to answer this question apart,
// which is how one of them ended up refusing what the other allowed.

function sfc(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', 'vue', 'components', name), 'utf8');
}

test('both push buttons read the same answer', () => {
  for (const name of ['ProjectViewerApp.vue', 'SessionSidePanelApp.vue']) {
    const src = sfc(name);
    assert.match(src, /pushTarget\(detail\.value\)/, `${name} computes its own push state`);
    assert.match(src, /:disabled="gitBusy \|\| !push\.canPush"/, `${name} gates the button on something else`);
    assert.doesNotMatch(src, /!detail\??\.?\.upstream \|\| !unpushedCommits/, `${name} still gates on upstream`);
  }
});

// The sentence that started this: it claimed there was nowhere to push to on a
// repository that had a remote and three commits waiting.
//
// Matched as rendered text — `>…<` — so that the comments left behind
// explaining why each string went do not count as the string coming back.
test('neither view still renders the old message', () => {
  assert.doesNotMatch(sfc('SessionSidePanelApp.vue'), />[^<]*nothing to push to/i);
  assert.doesNotMatch(sfc('ProjectViewerApp.vue'), />no upstream set</i);
});

// main.js is what makes the optimistic answer true.
test('git-push really does set an upstream when there is none', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(source, /'push', '--set-upstream', '(origin)'/, 'the fallback is gone or uses another remote');
});
