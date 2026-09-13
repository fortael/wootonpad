// chat-text.js — the small text decisions the chat view makes, without a DOM.
//
// Pure string work, split out of message-render.js so it can be tested: that
// file is DOM in, DOM out and cannot run under `node --test`. Three questions
// live here — what a folded tool call says in one line, which parts of a
// message the user typed are references to something the app can open, and how
// long ago a message was written.

/**
 * The one line a folded `Bash` call shows.
 *
 * An `Edit` row names its file and a `Read` row names its file; a `Bash` row
 * said nothing but "Bash", which made it the one call in the transcript you
 * could not identify without opening it. The first line is what identifies a
 * command — the rest is arguments and heredocs that would not fit anyway.
 */
export function truncateCommand(command, max = 96) {
  const lines = String(command || '').split('\n').filter(line => line.trim());
  if (!lines.length) return '';
  let head = lines[0].trim();
  let more = lines.length > 1;
  if (head.length > max) {
    head = head.slice(0, max - 1).trimEnd();
    more = true;
  }
  return more ? head + '…' : head;
}

/** The same idea for prose: one flattened line of it, for a collapsed header. */
export function previewLine(text, max = 120) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trimEnd() + '…';
}

// ── Mentions ──────────────────────────────────────────────────────
//
// `@path` and a leading `/command` are the two things a person types that name
// something this app can act on. In the CLI they are syntax the composer
// highlights; in the transcript they were plain prose, indistinguishable from
// the sentence around them.

/** Only at position 0: that is the only place the CLI reads one as a command. */
const COMMAND_RE = /^\/([a-zA-Z][\w:.-]*)/;

/** `@` after a boundary, so an email address in the middle of a word is not one. */
const FILE_RE = /(^|[\s(\[<"'])@([^\s@()[\]<>"']+)/g;

/** Sentence punctuation that followed the path rather than belonging to it. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

/**
 * @param {string} text
 * @returns {Array<{ index: number, length: number, kind: 'command'|'file', value: string }>}
 *          non-overlapping, in the order they appear; `index`/`length` cover the
 *          sigil as well as the name, because that is what gets replaced.
 */
export function findMentions(text) {
  const source = String(text || '');
  const found = [];

  const command = COMMAND_RE.exec(source);
  // A command is the whole first token or nothing: `/usr/local/bin` in a
  // sentence about a path is not an invocation of `/usr`.
  if (command && (source.length === command[0].length || /\s/.test(source[command[0].length]))) {
    found.push({ index: 0, length: command[0].length, kind: 'command', value: command[1] });
  }

  FILE_RE.lastIndex = 0;
  let match;
  while ((match = FILE_RE.exec(source))) {
    const value = match[2].replace(TRAILING_PUNCTUATION, '');
    if (!value) continue;
    found.push({ index: match.index + match[1].length, length: value.length + 1, kind: 'file', value });
  }

  return found.sort((a, b) => a.index - b.index);
}

// ── Local command envelopes ───────────────────────────────────────
//
// Running a slash command writes three records into the transcript, and all
// three are plumbing addressed to the model rather than messages to read:
//
//   <local-command-caveat>…</local-command-caveat>   don't answer what follows
//   <command-name>/usage</command-name> …            what was invoked
//   <local-command-stdout>…</local-command-stdout>   what it printed
//
// Rendered as prose they are three bubbles of XML where the user expected one
// command and its output — which is exactly what they looked like.

const CAVEAT_RE = /<local-command-caveat>[\s\S]*?<\/local-command-caveat>/;
const NAME_RE = /<command-name>([\s\S]*?)<\/command-name>/;
const ARGS_RE = /<command-args>([\s\S]*?)<\/command-args>/;
const STDOUT_RE = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/;
const STDERR_RE = /<local-command-stderr>([\s\S]*?)<\/local-command-stderr>/;

/**
 * Which envelope this message is, if it is one.
 *
 * @returns {null
 *   | { kind: 'caveat' }
 *   | { kind: 'call', name: string, args: string }
 *   | { kind: 'output', text: string, isError: boolean }}
 */
export function localCommandEnvelope(text) {
  const source = String(text || '');
  if (!source) return null;

  const name = NAME_RE.exec(source);
  if (name) {
    return {
      kind: 'call',
      name: name[1].trim().replace(/^\//, ''),
      args: (ARGS_RE.exec(source)?.[1] || '').trim(),
    };
  }

  const out = STDOUT_RE.exec(source);
  if (out) return { kind: 'output', text: out[1].trim(), isError: false };
  const err = STDERR_RE.exec(source);
  if (err) return { kind: 'output', text: err[1].trim(), isError: true };

  // Last, because the caveat and the command can share one record.
  if (CAVEAT_RE.test(source)) return { kind: 'caveat' };
  return null;
}

// ── Path tokens ───────────────────────────────────────────────────

/** `../src/vue/ap` → `{ dir: '../src/vue/', base: 'ap' }`. */
export function splitPathToken(token) {
  const text = String(token || '');
  const cut = text.lastIndexOf('/');
  return cut === -1
    ? { dir: '', base: text }
    : { dir: text.slice(0, cut + 1), base: text.slice(cut + 1) };
}

/**
 * Does this `@` token name a place outside the project's own file list?
 *
 * The flattened project tree answers everything typed as a bare name, and it
 * answers instantly. Anything that starts by walking — `../`, `~/`, `/` — has
 * to be read off the disk, which is a round trip and a different code path.
 */
export function isExternalPathToken(token) {
  return /^(\.\.?\/|~(\/|$)|\/)/.test(String(token || ''));
}

// ── Relative time ─────────────────────────────────────────────────

const UNITS = [
  ['year', 365 * 24 * 3600e3],
  ['month', 30 * 24 * 3600e3],
  ['week', 7 * 24 * 3600e3],
  ['day', 24 * 3600e3],
  ['hour', 3600e3],
  ['minute', 60e3],
];

// Built once. Constructing an Intl formatter costs more than every call that
// uses it, and the transcript re-reads every timestamp on screen on a clock.
let relativeFormatter = null;
function formatter() {
  if (!relativeFormatter) {
    // 'always', not 'auto': "yesterday" and "last week" read as calendar words
    // for what is actually an elapsed duration — "1 day ago" is the answer to
    // the question the row is asking.
    relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'always' });
  }
  return relativeFormatter;
}

/** "2 minutes ago", "2 days ago" — localised, in whatever the app is running as. */
export function relativeTime(value, now = Date.now()) {
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(then)) return '';
  const elapsed = now - then;
  // Anything in the future is a clock that disagrees, not a message from later.
  if (elapsed < 45e3) return 'just now';
  for (const [unit, ms] of UNITS) {
    // Floored, not rounded: ninety minutes is an hour ago, not two.
    if (elapsed >= ms) return formatter().format(-Math.floor(elapsed / ms), unit);
  }
  return 'just now';
}
