// git-push-links.js — the merge/pull-request link a push just printed.
//
// Every forge answers a push by telling you what to do next, on stderr, in the
// `remote:` lines git relays verbatim:
//
//   remote: To create a merge request for reindex_fix, visit:
//   remote:   https://gitlab.com/group/proj/-/merge_requests/new?merge_request%5B…
//
//   remote: Create a pull request for 'topic' on GitHub by visiting:
//   remote:      https://github.com/owner/repo/pull/new/topic
//
// That link is the one thing anybody wants immediately after a push, and until
// now it was thrown away: main.js ran the push with execFileSync, which returns
// stdout, and all of this is on stderr.
//
// Pure string work, so it is tested rather than eyeballed against one forge.

/**
 * `remote:` lines only. A URL anywhere else in git's output is not the forge
 * talking — it is a remote name, an error from a credential helper, or the
 * user's own branch name — and must not end up behind a button that opens a
 * browser.
 */
const REMOTE_LINE = /^remote:\s?(.*)$/;

// Deliberately http(s) only. The text is whatever the server chose to send, and
// it is about to become the href of something clickable.
const URL_IN_LINE = /\bhttps?:\/\/[^\s<>"'`]+/g;

/** Trailing punctuation a forge wraps its URL in, or a sentence ends with. */
function trimUrl(url) {
  return url.replace(/[.,;:)\]}>'"]+$/, '');
}

/**
 * What a link is for, from its shape. Order matters: an existing request is
 * matched before the "new" form, because the paths overlap.
 *
 * @returns {{ kind: 'view'|'create', label: string }|null}
 */
function classify(url) {
  // GitLab: /-/merge_requests/new?… to open one, /-/merge_requests/42 to see it
  if (/\/-\/merge_requests\/new\b/.test(url)) return { kind: 'create', label: 'Create merge request' };
  if (/\/-\/merge_requests\/\d+/.test(url)) return { kind: 'view', label: 'View merge request' };

  // GitHub: /pull/new/<branch> to open one, /pull/42 to see it. `/compare/…`
  // is what Gitea, Forgejo and older GitHub Enterprise print instead.
  if (/\/pull\/new\//.test(url)) return { kind: 'create', label: 'Create pull request' };
  if (/\/pull\/\d+/.test(url)) return { kind: 'view', label: 'View pull request' };
  if (/\/compare\//.test(url)) return { kind: 'create', label: 'Create pull request' };

  // Bitbucket
  if (/\/pull-requests\/new\b/.test(url)) return { kind: 'create', label: 'Create pull request' };
  if (/\/pull-requests\/\d+/.test(url)) return { kind: 'view', label: 'View pull request' };

  return null;
}

/**
 * Every request link in a push's output, best first.
 *
 * An existing request outranks an invitation to open one: when a forge prints
 * both, the branch already has a request and "create another" is the wrong
 * button to be offering.
 *
 * @param {string} text  stdout and stderr of the push, in any order
 * @returns {Array<{ url: string, kind: 'view'|'create', label: string }>}
 */
function parsePushLinks(text) {
  if (typeof text !== 'string' || !text) return [];
  const found = [];
  const seen = new Set();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = REMOTE_LINE.exec(rawLine.trim());
    if (!line) continue;
    for (const match of line[1].match(URL_IN_LINE) || []) {
      const url = trimUrl(match);
      if (seen.has(url)) continue;
      const what = classify(url);
      if (!what) continue;
      seen.add(url);
      found.push({ url, ...what });
    }
  }

  // Stable within a kind — the order the server printed them is the order it
  // considers them in.
  return found.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'view' ? -1 : 1));
}

/** The one to put on a button, or null when the forge said nothing. */
function bestPushLink(text) {
  return parsePushLinks(text)[0] || null;
}

module.exports = { parsePushLinks, bestPushLink };
