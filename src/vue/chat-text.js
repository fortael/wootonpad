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
//
// `@session:<uuid>` and `@project:<path>` are the other direction: the two
// things the app itself owns, so an answer can point at one — "picked up from
// @session:…" — and have it open rather than have the reader go and find it.

/** Only at position 0: that is the only place the CLI reads one as a command. */
const COMMAND_RE = /^\/([a-zA-Z][\w:.-]*)/;

/** `@` after a boundary, so an email address in the middle of a word is not one. */
const FILE_RE = /(^|[\s(\[<"'])@([^\s@()[\]<>"']+)/g;

/**
 * `@session:<uuid>` — the canonical 8-4-4-4-12 form and nothing looser.
 *
 * Strict on purpose: the only thing that makes this different from a file
 * called `session:something` is that it is a session id, so a token that is not
 * one falls through to the file rule rather than becoming a chip that opens
 * nothing. The trailing guard keeps a longer id from matching by its prefix.
 */
const SESSION_RE = /(^|[\s(\[<"'])@session:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![\w-])/gi;

/** `@project:<absolute path>` — POSIX and absolute, to the first whitespace. */
const PROJECT_RE = /(^|[\s(\[<"'])@project:(\/\S*)/g;

/** Sentence punctuation that followed the path rather than belonging to it. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

/** The two `@kind:value` mentions, in the order they are claimed. */
const PREFIXED = [
  { kind: 'session', re: SESSION_RE, trim: false },
  { kind: 'project', re: PROJECT_RE, trim: true },
];

/**
 * @param {string} text
 * @returns {Array<{ index: number, length: number,
 *                   kind: 'command'|'file'|'session'|'project', value: string }>}
 *          non-overlapping, in the order they appear; `index`/`length` cover the
 *          sigil as well as the name, because that is what gets replaced.
 */
/**
 * A bare 8-hex-digit token — a session's short id, the way the app prints one.
 * Not part of anything longer: the first segment of a full UUID is followed by
 * a hyphen, and `@session:` is already its own rule.
 */
const SHORT_ID_RE = /(?<![\w:-])([0-9a-f]{8})(?![\w-])/gi;

/**
 * @param {string} text
 * @param {{ resolveShortSession?: (prefix: string) => string|null }} [opts]
 *   Turns a short id into the full one, when it names exactly one session the
 *   caller knows. Models abbreviate ids however often they are told not to;
 *   with this, one they shortened still becomes a link — and only one that
 *   really is a session, so a git hash in the same sentence stays text.
 */
export function findMentions(text, opts = {}) {
  const source = String(text || '');
  const found = [];

  const command = COMMAND_RE.exec(source);
  // A command is the whole first token or nothing: `/usr/local/bin` in a
  // sentence about a path is not an invocation of `/usr`.
  if (command && (source.length === command[0].length || /\s/.test(source[command[0].length]))) {
    found.push({ index: 0, length: command[0].length, kind: 'command', value: command[1] });
  }

  // Read before `@path`, because the file rule matches these too:
  // `@project:/Users/x/foo` is a perfectly good `@` token. Where both start at
  // the same character the specific one wins and the file mention is dropped —
  // callers walk the list with a cursor and would otherwise take whichever
  // came first out of the sort.
  const claimed = new Set();
  for (const { kind, re, trim } of PREFIXED) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source))) {
      const value = trim ? match[2].replace(TRAILING_PUNCTUATION, '') : match[2];
      if (!value) continue;
      const index = match.index + match[1].length;
      claimed.add(index);
      found.push({ index, length: `@${kind}:`.length + value.length, kind, value });
    }
  }

  FILE_RE.lastIndex = 0;
  let match;
  while ((match = FILE_RE.exec(source))) {
    const value = match[2].replace(TRAILING_PUNCTUATION, '');
    if (!value) continue;
    const index = match.index + match[1].length;
    if (claimed.has(index)) continue;
    found.push({ index, length: value.length + 1, kind: 'file', value });
  }

  if (typeof opts.resolveShortSession === 'function') {
    SHORT_ID_RE.lastIndex = 0;
    let short;
    while ((short = SHORT_ID_RE.exec(source))) {
      const full = opts.resolveShortSession(short[1].toLowerCase());
      if (!full) continue;
      found.push({ index: short.index, length: short[1].length, kind: 'session', value: full });
    }
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
