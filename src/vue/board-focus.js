// board-focus.js — what the summarizer's importance levels mean on screen.
//
// One table, because the board's cards and the summary list beside them are
// two views of the same answer: main.js rates each session 0-3 (see
// BOARD_IMPORTANCE_PROMPT) and both ends draw the same flag for the same
// number. 0 is not in here — it means "no flag", which is most of the board.

export const FOCUS_LEVELS = {
  3: {
    label: 'Ready to land',
    hint: 'Reads as all but finished — the next session here could be the last one.',
  },
  2: {
    label: 'Nearly there',
    hint: 'A lot of real work landed and it is logically close to done.',
  },
  1: {
    label: 'Do not lose',
    hint: 'Worth keeping in view — small edits only, or nothing here for a while.',
  },
};

/** `1..3` → its row, or null for 0 and anything unrecognised. */
export function focusLevel(value) {
  return FOCUS_LEVELS[value] || null;
}
