// todo-due.js — due dates on TODO notes and their checklist items.
//
// A due date is a calendar day, not an instant: "due Friday" means the whole of
// Friday wherever the user happens to be. So it is stored as `YYYY-MM-DD` and
// compared against the local date by day number — never through
// `new Date('2026-09-20')`, which parses as UTC midnight and lands on the day
// before for everyone west of Greenwich.
//
// Two places carry one:
//   - a checklist line, as a `due:2026-09-20` token anywhere after the box
//     (`📅 2026-09-20`, the Obsidian Tasks spelling, is read too, so a note
//     kept in a vault elsewhere does not lose its dates here);
//   - the note itself, as a `due:` frontmatter key — the deadline for the whole
//     list, which every item without a date of its own inherits.
//
// Pure, and shared: account-notes.js parses with it, wooton-mcp.js builds
// Buddy's agenda with it, and the renderer draws its chips with it — so the
// sidebar and Buddy cannot disagree about what is overdue.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Preceded by whitespace or the start, followed by whitespace or the end: a
// date inside a URL or a word is not a due date.
const TOKEN_SRC = '(^|\\s)(?:due:\\s?|\u{1F4C5}\\s*)(\\d{4}-\\d{2}-\\d{2})(?=\\s|$)';

const DAY_MS = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** A real calendar day in `YYYY-MM-DD` — 2026-02-30 is not one. */
function isDueDate(value) {
  const m = DATE_RE.exec(String(value || ''));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const pad = n => String(n).padStart(2, '0');

/** Today in the machine's own time zone, as `YYYY-MM-DD`. */
function localToday(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Days since the epoch for a `YYYY-MM-DD` — arithmetic without time zones. */
function dayNumber(date) {
  const m = DATE_RE.exec(String(date || ''));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

function fromDayNumber(n) {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDays(date, days) {
  return fromDayNumber(dayNumber(date) + days);
}

/** Whole days from `today` to `due`: negative is overdue, 0 is today. */
function daysUntil(due, today) {
  return dayNumber(due) - dayNumber(today);
}

/**
 * The due date a checklist item's text carries, and the text without it.
 * The first token wins; any others are dropped from the text all the same, so
 * a line edited by hand into two dates does not show one of them as words.
 */
function parseDueToken(text) {
  const source = String(text || '');
  let due = null;
  const stripped = source.replace(new RegExp(TOKEN_SRC, 'gu'), (_all, lead, date) => {
    if (!due && isDueDate(date)) due = date;
    return lead;
  });
  return { due, text: stripped.replace(/\s{2,}/g, ' ').trim() };
}

/**
 * The same line with its due date set to `due`, or removed when `due` is
 * null. The token goes at the end, where a person typing one would put it;
 * everything else on the line stays as written.
 */
function setDueToken(line, due) {
  // The token goes with the space before it, so one taken from the middle of
  // a line leaves a single space behind rather than two.
  const cleaned = String(line || '')
    .replace(new RegExp(TOKEN_SRC, 'gu'), '')
    .replace(/[ \t]+$/, '');
  if (!due) return cleaned;
  return `${cleaned} due:${due}`;
}

/**
 * How pressing a date is, for colour: `overdue`, `today`, `soon` (the next two
 * days), `later`, or `none`. A done item is `done` whatever its date says — a
 * finished task is never late.
 */
function dueStatus(due, today, done = false) {
  if (done) return 'done';
  if (!isDueDate(due)) return 'none';
  const days = daysUntil(due, today);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 2) return 'soon';
  return 'later';
}

/**
 * A date as how long is left — or how late it is — the way a person says it:
 * "3d overdue", "yesterday", "today", "tomorrow", "in 4d", "in 3w". Past two
 * months the count stops meaning much and it becomes a date: "Dec 1", or the
 * full one in another year.
 */
function dueLabel(due, today) {
  if (!isDueDate(due)) return '';
  const days = daysUntil(due, today);
  if (days === -1) return 'yesterday';
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days}d`;
  if (days < 60) return `in ${Math.round(days / 7)}w`;
  return dueShortDate(due, today);
}

/**
 * A date on its own, with nothing relative about it: "Sep 15", or the full
 * date in another year. For a finished item — "4d overdue" on something done
 * is noise, the day it was due is only history.
 */
function dueShortDate(due, today) {
  if (!isDueDate(due)) return '';
  const date = new Date(dayNumber(due) * DAY_MS);
  if (due.slice(0, 4) === String(today).slice(0, 4)) return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
  return due;
}

/** The weekday of a date, for the agenda's "today is" line. */
function weekday(date) {
  const n = dayNumber(date);
  return Number.isFinite(n) ? WEEKDAYS[new Date(n * DAY_MS).getUTCDay()] : '';
}

/**
 * What someone — or a model — typed for a date, as `YYYY-MM-DD`.
 *
 * Takes the ISO form, `today`, `tomorrow`, `+3d` / `+2w`, and a weekday name
 * (the next one, never today). `none`, `clear` or an empty value clears it.
 *
 * @returns {{ ok: true, due: string|null } | { ok: false, error: string }}
 */
function resolveDueInput(input, today) {
  const raw = input == null ? '' : String(input).trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'clear' || raw === 'null') return { ok: true, due: null };
  if (isDueDate(raw)) return { ok: true, due: raw };
  if (raw === 'today') return { ok: true, due: today };
  if (raw === 'tomorrow') return { ok: true, due: addDays(today, 1) };
  const rel = /^\+(\d{1,3})\s*([dw])$/.exec(raw);
  if (rel) return { ok: true, due: addDays(today, Number(rel[1]) * (rel[2] === 'w' ? 7 : 1)) };
  const wd = WEEKDAY_NAMES.findIndex(name => raw === name || raw === name.slice(0, 3));
  if (wd !== -1) {
    const current = new Date(dayNumber(today) * DAY_MS).getUTCDay();
    return { ok: true, due: addDays(today, ((wd - current + 7) % 7) || 7) };
  }
  return { ok: false, error: `Not a date: "${input}". Use YYYY-MM-DD, today, tomorrow, +3d, +2w or a weekday.` };
}

/** The earliest date an open item of this note is due by, its own or the note's. */
function nextDue(todos, noteDue = null) {
  let best = null;
  for (const t of todos || []) {
    if (t.done) continue;
    const due = t.due || noteDue;
    if (isDueDate(due) && (!best || due < best)) best = due;
  }
  return best;
}

/**
 * Every open item across the notes, the most pressing first: overdue (oldest
 * first), then by date, then the undated ones in the order their notes list.
 *
 * @param {Array<{ filename, title, projects?, due?, todos: Array<{ index, text, done, due? }> }>} notes
 * @param {string} today  `YYYY-MM-DD`
 * @param {{ withinDays?: number, includeUndated?: boolean, project?: string }} [opts]
 */
function agenda(notes, today, opts = {}) {
  const includeUndated = opts.includeUndated !== false;
  const within = Number.isFinite(opts.withinDays) ? opts.withinDays : null;
  const items = [];
  (notes || []).forEach((note, noteOrder) => {
    // Put away: whatever is left in it is no longer on anyone's list.
    if (note.archived) return;
    if (opts.project && !(note.projects || []).includes(opts.project)) return;
    for (const t of note.todos || []) {
      if (t.done) continue;
      const due = isDueDate(t.due) ? t.due : (isDueDate(note.due) ? note.due : null);
      if (!due && !includeUndated) continue;
      const days = due ? daysUntil(due, today) : null;
      if (due && within != null && days > within) continue;
      items.push({
        filename: note.filename,
        title: note.title,
        projects: note.projects || [],
        index: t.index,
        text: t.text,
        due,
        // The list's deadline rather than one written on the item itself.
        inherited: !!due && !isDueDate(t.due),
        days,
        status: dueStatus(due, today),
        noteOrder,
      });
    }
  });
  items.sort((a, b) => {
    if (a.due && b.due) return a.days - b.days || a.noteOrder - b.noteOrder || a.index - b.index;
    if (a.due) return -1;
    if (b.due) return 1;
    return a.noteOrder - b.noteOrder || a.index - b.index;
  });
  return items;
}

/** The agenda's headings: which bucket a day count falls in. */
function agendaBucket(days) {
  if (days == null) return 'none';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 7) return 'week';
  return 'later';
}

module.exports = {
  isDueDate,
  localToday,
  dayNumber,
  addDays,
  daysUntil,
  parseDueToken,
  setDueToken,
  dueStatus,
  dueLabel,
  dueShortDate,
  weekday,
  resolveDueInput,
  nextDue,
  agenda,
  agendaBucket,
};
