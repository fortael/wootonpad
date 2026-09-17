// git-staging.js — what a commit from this app stages, and what it must not.
//
// The bug this exists for: committing from the panel used to run `git add -A`,
// which stages untracked files as well as tracked ones. The list the panel
// shows comes from `git diff --numstat HEAD` — tracked changes only. So the two
// were different sets, and everything in the gap went into commits without ever
// appearing on screen: .DS_Store, editor scratch files, a stray .env.
//
// `-u` is the fix. It stages modifications and deletions of files git already
// knows about and leaves untracked files alone, which makes the commit exactly
// the list the panel drew. It is also what every IDE's commit dialog does:
// unversioned files are a separate section there, unchecked by default.
//
// A file the user staged by hand in a terminal is still committed, and is still
// correct: `git diff HEAD` reports the index, so the panel was showing it.

/** Stage what the panel listed. Never `-A` — see above. */
const STAGE_ARGV = ['add', '-u'];

/** What the panel deliberately leaves out, for the line that says so. */
const UNTRACKED_ARGV = ['ls-files', '--others', '--exclude-standard'];

/**
 * A commit is two commands, and this is the first of them.
 * @returns {string[]} argv after `git`
 */
function stageArgv() {
  return [...STAGE_ARGV];
}

/**
 * @param {string} message
 * @returns {string[]} argv after `git`
 */
function commitArgv(message) {
  return ['commit', '-m', String(message)];
}

/**
 * Commit only the named files, whatever is staged.
 *
 * `git commit -- <paths>` takes those paths from the working tree and leaves
 * the index alone for everything else, which is exactly what unchecking a box
 * in the panel means: "not this one, this time". No `add` runs first — the
 * pathspec form does its own staging, and staging the rest would defeat it.
 *
 * @param {string} message
 * @param {string[]} paths  repo-relative, already validated by the caller
 * @returns {string[]} argv after `git`
 */
function commitPathsArgv(message, paths) {
  return ['commit', '-m', String(message), '--', ...paths];
}

/** The untracked files a commit will skip. @returns {string[]} argv after `git` */
function untrackedArgv() {
  return [...UNTRACKED_ARGV];
}

module.exports = { stageArgv, commitArgv, commitPathsArgv, untrackedArgv };
