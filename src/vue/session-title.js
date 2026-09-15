// session-title.js — what a session is called, and what goes under it.
//
// Three names reach the renderer for the same session and they are not
// interchangeable:
//
//   name      what the user typed when they renamed it. Nothing outranks it.
//   aiTitle   what the model called the conversation once it knew what it was
//             about — "Session transition JSONL matching logic".
//   summary   the first thing the user said, cut at 120 characters by
//             summaryFromUserText.
//
// Every list in the app led with `summary`, so every chat was named after its
// own opening sentence: "ok so I think the problem is in the watcher, can
// you…". That is how a conversation *started*. What it turned out to be is the
// model's title, and that is what a list is scanned for — so the two swapped
// places. The first prompt is still worth showing, because it is the thing you
// remember typing; it is just the line underneath rather than the headline.
//
// One module rather than the expression repeated at nine call sites, because
// the order is the decision and it has to be the same order everywhere.

/** utils.js's tag-stripper, when the renderer is the one asking. */
function clean(text) {
  if (!text) return '';
  return (typeof window !== 'undefined' && window.cleanDisplayName
    ? window.cleanDisplayName(text)
    : text) || '';
}

/**
 * What to call this session.
 *
 * @param {{ name?: string, aiTitle?: string, summary?: string, sessionId?: string }} session
 * @param {string} [fallback] shown when the session has no name of any kind —
 *        a brand new one, whose first prompt has not been written yet.
 */
export function sessionTitle(session, fallback = 'Session') {
  if (!session) return fallback;
  return clean(session.name)
    || clean(session.aiTitle)
    || clean(session.summary)
    || fallback;
}

/**
 * The line under the title: how the conversation opened.
 *
 * Empty when it would only repeat what is already on the row — a session with
 * no model title is titled by its first prompt, and printing it twice says
 * nothing and costs a line.
 */
export function sessionSubtitle(session) {
  if (!session) return '';
  const first = clean(session.summary);
  if (!first) return '';
  return first === sessionTitle(session) ? '' : first;
}

/** The sentence that opened the conversation, whatever else is on the row. */
export function sessionFirstPrompt(session) {
  return clean(session?.summary);
}

/**
 * Where the name on the row came from.
 *
 * Worth saying out loud, because the three look identical once drawn and they
 * mean different things — and when a generated title fails to arrive the row
 * silently falls back to the opening line, which reads exactly like a title
 * that worked. "Is this what the model called it, or is it just what I typed?"
 * had no answer on screen.
 *
 * @returns {'named'|'ai'|'prompt'|null} null when there is nothing to say —
 *   a session with no name of any kind yet.
 */
export function titleSource(session) {
  if (!session) return null;
  if (clean(session.name)) return 'named';
  if (clean(session.aiTitle)) return 'ai';
  if (clean(session.summary)) return 'prompt';
  return null;
}

/**
 * Past this many messages, a session that still has no title is not going to
 * get one — and a row that has been promising one since this morning is
 * lying. See titlePending below.
 */
const TITLE_WINDOW_MESSAGES = 12;

/**
 * How long after the transcript last moved the title is still worth waiting for.
 *
 * Only long enough to bridge the gaps *inside* a turn. A turn is several
 * requests and the file goes quiet for a second or two between them; anything
 * beyond that and the bar is waiting for something that is not coming.
 *
 * And it often is not coming. The CLI does not title every session — surveyed
 * across the transcripts on this machine, every long conversation had an
 * `ai-title` record and every short one had none at all. "Ping", "What time?",
 * "What can you do?": no title, ever. So the wait has to be the length of a
 * pause in the work, not a guess at how long a title takes, because for most of
 * these sessions the honest answer is that the first prompt *is* the name.
 *
 * Measured against the file rather than a clock started at session creation:
 * while a turn runs the transcript is written to constantly, so this covers a
 * turn of any length and expires just after the last thing lands.
 */
const TITLE_QUIET_MS = 5_000;

/**
 * Is this session's name still being decided?
 *
 * The CLI titles a conversation once it knows what it is about: it writes an
 * `ai-title` or `custom-title` record after the opening exchange. Between the
 * first prompt and that record there is a real gap, and for the whole of it the
 * only name the row has is the sentence the user typed — which is what goes
 * underneath. Saying so out loud is better than showing a placeholder that
 * silently turns into something else.
 *
 * Bounded three ways, because the record is not guaranteed: the session must
 * have said something, it must be near the start of its life, and its
 * transcript must have moved recently. Outside that it is called by its
 * opening line, which is the honest answer when no better one is coming.
 *
 * `busy` alone is not the test. A turn is several requests and the tracker goes
 * idle between them, so a bar tied to it blinks — and the title usually lands
 * just *after* the turn ends, when `busy` is false for good. When the file was
 * last written is the steadier signal, and the one that expires.
 *
 * @param {object} session
 * @param {boolean} busy  is a turn running right now
 * @param {number} [now]  injectable clock, for the tests
 */
export function titlePending(session, busy, now = Date.now()) {
  if (!session) return false;
  if (session.name || session.aiTitle) return false;
  const messages = session.messageCount || 0;
  if (messages < 1 || messages > TITLE_WINDOW_MESSAGES) return false;
  if (busy) return true;
  const touched = new Date(session.modified).getTime();
  if (!Number.isFinite(touched)) return false;
  const quiet = now - touched;
  return quiet >= 0 && quiet < TITLE_QUIET_MS;
}
