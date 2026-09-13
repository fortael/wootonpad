// board-importance.js — how much of the board a summary run may flag.
//
// The summarize prompt asks the model to rate each session 0-3: where the work
// is close enough to done, or big enough, to be worth looking at next. The
// board draws a flag and an outline off that (see src/vue/board-focus.js).
//
// The cap is the whole point. A board with six red cards says exactly as much
// as a board with none, so it is both asked for in the prompt and enforced on
// the answer — a model that ignores it does not get to blunt the signal.

const IMPORTANCE_CAP = 2;

// Levels are about *where to look next*, not about how good the work is: a
// session one step from shipping outranks a bigger one that is nowhere near.
const IMPORTANCE_PROMPT =
  'Also rate how much each session deserves attention right now, as "importance":\n'
  + '3 — all but finished. Generated files, migrations or contracts landed, or tests were run and the linter is reported passing. It reads as done, or one step from it.\n'
  + '2 — real code changed and a lot of it, logically close to finishing, a couple of iterations left.\n'
  + '1 — worth not losing: genuine work, but only small edits, or nothing has happened here in a while.\n'
  + '0 — everything else. Test-only or documentation-only edits, trivial changes, or nothing that stands out.\n'
  + 'Judge on the combination: how finished the work looks, how much of it there is, and how impactful it is.\n'
  + `At most ${IMPORTANCE_CAP} sessions may get 3, at most ${IMPORTANCE_CAP} get 2, at most ${IMPORTANCE_CAP} get 1 — more than that and there is no focus left. `
  + '0 is the default and nothing has to be promoted off it: every session at 0 is a correct answer. Do not hand out a level just to have one.\n\n';

/**
 * A rater that clamps to 0-3 and hands out each level at most `cap` times.
 *
 * Stateful by design, one per run: first come, first kept. The order the model
 * answered in is its own ranking of the set, so what falls off the end is what
 * it thought least of — anything else would need a second opinion this has no
 * way to ask for.
 *
 * @param {number} [cap]
 * @returns {(value: unknown) => number} 0 when unrated, out of range, or capped
 */
function importanceRater(cap = IMPORTANCE_CAP) {
  const claimed = new Map();
  return (value) => {
    const level = Math.round(Number(value));
    if (!Number.isFinite(level) || level < 1 || level > 3) return 0;
    const used = claimed.get(level) || 0;
    if (used >= cap) return 0;
    claimed.set(level, used + 1);
    return level;
  };
}

module.exports = { IMPORTANCE_CAP, IMPORTANCE_PROMPT, importanceRater };
