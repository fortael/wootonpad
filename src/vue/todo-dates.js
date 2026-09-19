// todo-dates.js — the renderer's side of TODO due dates.
//
// The rules live in the root todo-due.js, which main.js uses too, so a chip in
// the sidebar and Buddy's agenda read one definition of "overdue". What this
// adds is the one thing only a long-running window needs: a `today` that moves
// at midnight. A label computed once at render time would still say "today"
// the next morning for anyone who leaves the app open overnight.

import { ref } from 'vue';
import { localToday, dueStatus, isDueDate } from '../../todo-due.js';

export {
  isDueDate, dueStatus, dueLabel, dueShortDate, daysUntil, nextDue, localToday,
} from '../../todo-due.js';

const today = ref(localToday());
let ticking = false;

/**
 * Today's date as a ref, re-read every minute while anything uses it. The
 * timer starts on first use, so a window that never draws a due date never
 * runs one.
 */
export function useToday() {
  if (!ticking) {
    ticking = true;
    setInterval(() => {
      const now = localToday();
      if (now !== today.value) today.value = now;
    }, 60_000);
  }
  return today;
}

/**
 * Open items of a note that are past their date — their own, or the note's
 * when they have none.
 */
export function overdueCount(note, day) {
  const noteDue = isDueDate(note?.due) ? note.due : null;
  return (note?.todos || [])
    .filter(t => !t.done && dueStatus(t.due || noteDue, day) === 'overdue')
    .length;
}

/**
 * What a note's summary chip stands for: the soonest open date and, when it
 * matters, how many items are already past theirs.
 */
export function nextDueHint(note, day = today.value) {
  if (!isDueDate(note?.nextDue)) return '';
  const late = overdueCount(note, day);
  const item = (note.todos || []).find(t => !t.done && (t.due || note.due) === note.nextDue);
  const what = item?.text ? `“${item.text}”` : 'Next item';
  return `${what} due ${note.nextDue}${late > 1 ? ` · ${late} items overdue` : ''}`;
}
