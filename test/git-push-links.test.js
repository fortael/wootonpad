const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePushLinks, bestPushLink } = require('../git-push-links.js');

// Real output, trailing spaces and all — git pads the `remote:` lines it
// relays, and the parser has to survive that because that is what it gets.

const GITLAB_NEW = `Total 6 (delta 4), reused 0 (delta 0), pack-reused 0 (from 0)
remote:
remote: To create a merge request for reindex_fix, visit:
remote:   https://gitlab.com/tropicalsun/foundation/content-data-mart/-/merge_requests/new?merge_request%5Bsource_branch%5D=reindex_fix
remote:
To gitlab.com:tropicalsun/foundation/content-data-mart.git
 * [new branch]      reindex_fix -> reindex_fix
branch 'reindex_fix' set up to track 'origin/reindex_fix'.`;

const GITHUB_NEW = `Enumerating objects: 5, done.
remote:
remote: Create a pull request for 'topic' on GitHub by visiting:
remote:      https://github.com/owner/repo/pull/new/topic
remote:
To github.com:owner/repo.git
 * [new branch]      topic -> topic`;

test('the GitLab merge request link is picked out of a real push', () => {
  const link = bestPushLink(GITLAB_NEW);
  assert.equal(link.url, 'https://gitlab.com/tropicalsun/foundation/content-data-mart/-/merge_requests/new?merge_request%5Bsource_branch%5D=reindex_fix');
  assert.equal(link.kind, 'create');
  assert.equal(link.label, 'Create merge request');
});

test('the GitHub pull request link is picked out of a real push', () => {
  const link = bestPushLink(GITHUB_NEW);
  assert.equal(link.url, 'https://github.com/owner/repo/pull/new/topic');
  assert.equal(link.kind, 'create');
  assert.equal(link.label, 'Create pull request');
});

// The branch already has one open. "Create another" is the wrong offer.
test('an existing request outranks an invitation to open one', () => {
  const both = `remote: View merge request for topic:
remote:   https://gitlab.com/g/p/-/merge_requests/42
remote: To create a merge request for topic, visit:
remote:   https://gitlab.com/g/p/-/merge_requests/new?merge_request%5Bsource_branch%5D=topic`;
  const link = bestPushLink(both);
  assert.equal(link.kind, 'view');
  assert.equal(link.label, 'View merge request');
  assert.equal(link.url, 'https://gitlab.com/g/p/-/merge_requests/42');
  assert.equal(parsePushLinks(both).length, 2);
});

test('an existing GitHub pull request is recognised too', () => {
  const link = bestPushLink('remote: https://github.com/owner/repo/pull/7');
  assert.deepEqual(link, { url: 'https://github.com/owner/repo/pull/7', kind: 'view', label: 'View pull request' });
});

// Gitea and Forgejo print a compare link rather than a /pull/new one.
test('a compare link is an offer to open a request', () => {
  const link = bestPushLink("remote: Create a new pull request for 'topic':\nremote:   https://git.example.com/o/r/compare/main...topic");
  assert.equal(link.kind, 'create');
  assert.equal(link.label, 'Create pull request');
});

test('Bitbucket is understood as well', () => {
  const link = bestPushLink('remote: https://bitbucket.org/team/repo/pull-requests/new?source=topic&t=1');
  assert.equal(link.kind, 'create');
  assert.equal(link.url, 'https://bitbucket.org/team/repo/pull-requests/new?source=topic&t=1');
});

// ── What must never come back ─────────────────────────────────────
//
// The result of this is the href of a button. Everything here is text a remote
// server chose to send, so the shapes that are not a request link have to stay
// out rather than be "probably fine".

test('a URL outside the remote lines is not the forge talking', () => {
  assert.equal(bestPushLink('To https://github.com/owner/repo/pull/new/topic'), null);
  assert.equal(bestPushLink('fatal: see https://example.com/-/merge_requests/new for help'), null);
});

test('a scheme that is not http is refused', () => {
  assert.equal(bestPushLink('remote: javascript:alert(1)/-/merge_requests/new'), null);
  assert.equal(bestPushLink('remote: file:///etc/passwd/pull/new/x'), null);
  assert.equal(bestPushLink('remote: ftp://host/-/merge_requests/new'), null);
});

test('a link that is not a request link is not offered', () => {
  assert.equal(bestPushLink('remote: https://gitlab.com/g/p/-/pipelines/99'), null);
  assert.equal(bestPushLink('remote: https://github.com/owner/repo'), null);
});

test('an ordinary push offers nothing', () => {
  assert.equal(bestPushLink('Everything up-to-date'), null);
  assert.deepEqual(parsePushLinks('To github.com:o/r.git\n   abc123..def456  main -> main'), []);
});

test('nothing at all is not a crash', () => {
  assert.deepEqual(parsePushLinks(''), []);
  assert.deepEqual(parsePushLinks(null), []);
  assert.deepEqual(parsePushLinks(undefined), []);
  assert.equal(bestPushLink(''), null);
});

// The same link can be printed twice — once in the sentence, once on its own.
test('the same link is offered once', () => {
  const text = 'remote: visit https://github.com/o/r/pull/new/t\nremote:   https://github.com/o/r/pull/new/t';
  assert.equal(parsePushLinks(text).length, 1);
});

test('punctuation around the URL is not part of it', () => {
  assert.equal(
    bestPushLink('remote: open (https://github.com/o/r/pull/new/t).').url,
    'https://github.com/o/r/pull/new/t',
  );
});
