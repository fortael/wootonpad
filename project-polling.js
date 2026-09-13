/**
 * WootonPad — how often a project is worth asking about, and whether it is
 * worth asking Docker at all.
 *
 * Extracted from main.js for the same reason dock-attention.js was: the rules
 * are the part that can be wrong, and they should be testable without an
 * Electron app, a git repository or a Docker daemon. Nothing here touches the
 * filesystem — `detectCompose` takes the `exists` predicate as an argument.
 *
 * The shape of the problem: `git rev-parse` + `git diff --shortstat` cost a
 * couple of processes and a few milliseconds. `docker compose ps` costs a
 * process launch, a round trip to the daemon, and up to eight seconds of
 * timeout when the daemon is slow or absent. Thirty projects on one timer is
 * therefore not thirty cheap questions, it is one cheap question and one
 * expensive one, thirty times over — and for most projects the expensive one
 * has no answer, because there is no compose file to have containers for.
 */

// Compose V2 accepts all four spellings, in this order of precedence. The
// `.override.` files never appear alone, so looking for them adds nothing.
const COMPOSE_FILENAMES = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
];

// `docker compose` walks up from the working directory until it finds a
// project file, so a repository inside a compose-managed tree really does have
// containers even with a bare root. Two levels is enough for the usual
// monorepo-with-services layout and stops well short of turning one stray
// compose.yml in a home directory into "every project has containers".
const COMPOSE_PARENT_LEVELS = 2;

/**
 * Does this project have a compose file it could be asked about?
 *
 * @param {string} projectPath      POSIX project path (canonical form)
 * @param {object} io
 * @param {(p: string) => boolean} io.exists   true when the path is a file
 * @param {(...parts: string[]) => string} io.join
 * @param {(p: string) => string} io.dirname
 * @param {string} [io.stopAt]      never walk at or above this directory
 * @returns {boolean}
 */
function detectCompose(projectPath, io) {
  const { exists, join, dirname, stopAt } = io;
  let dir = projectPath;
  for (let level = 0; level <= COMPOSE_PARENT_LEVELS; level++) {
    for (const name of COMPOSE_FILENAMES) {
      if (exists(join(dir, name))) return true;
    }
    const parent = dirname(dir);
    // dirname('/') === '/': the walk has to end on its own, not on a counter.
    if (!parent || parent === dir) break;
    // The home directory is where a stray compose.yml would be mistaken for
    // every project's own, so the walk stops below it rather than at it.
    if (stopAt && parent === stopAt) break;
    dir = parent;
  }
  return false;
}

/** A recorded answer goes stale: a compose file may be added months later. */
const COMPOSE_RECHECK_MS = 24 * 3600 * 1000;

/**
 * @param {{hasCompose: boolean|null, composeCheckedAt: number|null}|null} meta
 * @param {number} [now]
 */
function composeCheckDue(meta, now = Date.now()) {
  if (!meta || meta.hasCompose === null || meta.hasCompose === undefined) return true;
  if (!meta.composeCheckedAt) return true;
  return (now - meta.composeCheckedAt) > COMPOSE_RECHECK_MS;
}

// A project someone is working in right now is the only one whose numbers are
// moving, so it gets the short interval and everything else gets an interval
// chosen to stay out of the way. The docker figures are deliberately several
// times the git ones: containers change state far more rarely than a working
// tree does, and asking costs far more.
const TTL = {
  activeGit: 20 * 1000,
  idleGit: 5 * 60 * 1000,
  activeDocker: 60 * 1000,
  idleDocker: 10 * 60 * 1000,
};

/**
 * Jitter keeps projects cached in the same pass from expiring in the same
 * pass. ±25%, so the ordering of two very different intervals never inverts.
 */
function jitter(ms, rand = Math.random) {
  return Math.round(ms * (0.75 + rand() * 0.5));
}

/**
 * What, if anything, is due for this project.
 *
 * @param {object} state
 * @param {boolean} state.active        has a live session in it
 * @param {boolean} state.archived
 * @param {boolean|null} state.hasCompose
 * @param {number|null} state.gitFetchedAt
 * @param {number|null} state.dockerFetchedAt
 * @param {boolean} [state.force]       an explicit refresh overrides every TTL
 * @param {number} [now]
 * @returns {{git: boolean, docker: boolean}}
 */
function pollPlan(state, now = Date.now()) {
  const { active, archived, hasCompose, gitFetchedAt, dockerFetchedAt, force } = state;

  // An archived project is not asked about at all. Opening it goes through
  // get-project-detail, which is forced and answers in full — that is what
  // "only when you open it" means here.
  if (archived && !force) return { git: false, docker: false };

  // hasCompose === false is the whole point of recording it: never again.
  // null is "not looked yet", which is a reason to look, not to skip.
  const composePossible = hasCompose !== false;

  if (force) return { git: true, docker: composePossible };

  const gitTtl = active ? TTL.activeGit : TTL.idleGit;
  const dockerTtl = active ? TTL.activeDocker : TTL.idleDocker;

  return {
    git: !gitFetchedAt || (now - gitFetchedAt) >= gitTtl,
    docker: composePossible && (!dockerFetchedAt || (now - dockerFetchedAt) >= dockerTtl),
  };
}

/**
 * The projects the activity poller should visit: distinct, not archived, and
 * backed by at least one live session. Deliberately not "all projects" — the
 * full sweep is a separate feature, and doing it here by accident is exactly
 * the cost this module exists to avoid.
 *
 * @param {Iterable<string>} sessionProjectPaths  may repeat, may contain null
 * @param {Map<string, {archived?: boolean}>} metaByPath
 * @returns {string[]}
 */
function activeProjectPaths(sessionProjectPaths, metaByPath) {
  const out = [];
  const seen = new Set();
  for (const p of sessionProjectPaths) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    if (metaByPath?.get(p)?.archived) continue;
    out.push(p);
  }
  return out;
}

module.exports = {
  COMPOSE_FILENAMES,
  COMPOSE_PARENT_LEVELS,
  COMPOSE_RECHECK_MS,
  TTL,
  detectCompose,
  composeCheckDue,
  pollPlan,
  activeProjectPaths,
  jitter,
};
