import { ref } from 'vue';

// A single 30s heartbeat for every relative timestamp on screen.
//
// window.lastActivityTime is a plain Map that app.js mutates outside Vue, so a
// component reading it re-renders only when something else makes it. Reading
// `tick.value` in a computed subscribes it to this clock instead. One interval
// for the whole renderer: the board alone can draw fifty cards, and fifty
// intervals would each wake the process on its own schedule.
export const tick = ref(0);

setInterval(() => { tick.value++; }, 30000);

/**
 * A faster heartbeat, for the few things that expire in seconds.
 *
 * One session's title being decided is the case: the wait for it is over about
 * twelve seconds after the transcript stops moving, and a row still showing a
 * loading bar half a minute later is the bug this exists to avoid.
 *
 * Read it *only* from inside the branch that is actually waiting. Vue rebuilds
 * a computed's dependencies on every evaluation, so a row that is not waiting
 * never subscribes and is never woken by this — which is the whole point. A
 * list of fifty rows re-rendering every four seconds is exactly the kind of
 * idle churn the rest of this app was taken off.
 */
export const fastTick = ref(0);

setInterval(() => { fastTick.value++; }, 4000);
