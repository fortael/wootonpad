// Where a push would go, and whether it can go at all.
//
// Both views that offer a Push button — the project page and the session side
// panel — used to answer this for themselves, and both answered it wrong in
// the same way: they disabled the button whenever `upstream` was unset and the
// side panel said "No upstream branch — nothing to push to."
//
// That is not what happens. main.js's git-push tries a plain `git push` and,
// when that fails, falls back to `git push --set-upstream origin <branch>`.
// A branch with no upstream is the normal state of a branch before its first
// push, and pushing it is exactly the thing you want to do — the button was
// refusing to do something the backend has always been able to do.
//
// Kept as one function so the button's state and the line of text next to it
// can never again disagree about the same repository.

/** The remote main.js pushes a new branch to. Must match git-push there. */
const DEFAULT_REMOTE = 'origin';

/**
 * @param {object|null} detail  a get-project-detail result
 * @returns {{
 *   canPush: boolean,
 *   label: string,          // the destination, for the row that names it
 *   willSetUpstream: boolean,
 *   reason: string|null,    // why not, when canPush is false
 * }}
 */
export function pushTarget(detail) {
  const unpushed = detail?.unpushedCommits?.length || 0;
  const upstream = detail?.upstream || null;

  if (upstream) {
    return {
      canPush: unpushed > 0,
      label: upstream,
      willSetUpstream: false,
      reason: unpushed > 0 ? null : 'Nothing to push.',
    };
  }

  // No upstream. There is still somewhere to push to as long as the repository
  // has a remote at all — and if it has none, that is the honest thing to say
  // rather than blaming the branch.
  if (!detail?.remoteUrl) {
    return { canPush: false, label: '—', willSetUpstream: false, reason: 'No remote configured.' };
  }

  const branch = detail?.branch || null;
  return {
    canPush: unpushed > 0,
    label: branch ? `${DEFAULT_REMOTE}/${branch}` : DEFAULT_REMOTE,
    willSetUpstream: true,
    reason: unpushed > 0 ? null : 'Nothing to push.',
  };
}

export { DEFAULT_REMOTE };
