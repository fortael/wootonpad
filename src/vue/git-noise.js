// git-noise.js — files nobody means to commit.
//
// macOS writes .DS_Store into every directory you so much as look at, and a
// repository without it in .gitignore shows three or four of them in the
// untracked list at all times. They are not a decision anyone makes: "Add all"
// meant to track the new source files, not the Finder's bookkeeping.
//
// So `Add all` skips these, and the rows stay listed — they do exist — but say
// why they were left out. A `+` on the row itself still works: that is somebody
// deliberately asking for this one file, which is a different thing entirely.
//
// Deliberately short, and OS junk only. Editor and tooling droppings
// (.idea, node_modules, *.pyc) belong to a project's own .gitignore and
// guessing at them here would be this app deciding what a repository tracks.

const NOISE_NAMES = new Set([
  '.DS_Store',
  '.AppleDouble',
  '.LSOverride',
  '.Spotlight-V100',
  '.Trashes',
  '.fseventsd',
  '__MACOSX',
  'Thumbs.db',
  'ehthumbs.db',
  'desktop.ini',
]);

/** AppleDouble sidecars — `._original-name`, one per file on a non-HFS volume. */
const APPLE_DOUBLE = /^\._/;

/**
 * @param {string} path  repo-relative
 * @returns {boolean}
 */
export function isNoiseFile(path) {
  const name = String(path || '').split('/').filter(Boolean).pop() || '';
  if (!name) return false;
  return NOISE_NAMES.has(name) || APPLE_DOUBLE.test(name);
}

/**
 * The paths an "add everything" should actually add.
 * @param {string[]} paths
 * @returns {string[]}
 */
export function withoutNoise(paths) {
  return (paths || []).filter(p => !isNoiseFile(p));
}

/** How many of these are in a list, for the line that explains the difference. */
export function countNoise(paths) {
  return (paths || []).filter(isNoiseFile).length;
}
