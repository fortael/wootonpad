// buddy-suggestions.js — what to ask Buddy, in one place.
//
// Offered on the empty screen of a new conversation, grouped by what you want
// done. A question ending in "…" is half a question — the rest is yours to
// type.

export const SUGGESTION_GROUPS = [
  {
    id: 'overview',
    emoji: '🔍',
    title: 'Catch up',
    items: [
      'What needs my attention right now?',
      'What did I work on yesterday?',
      'Find sessions about …',
    ],
  },
  {
    id: 'start',
    emoji: '🚀',
    title: 'Start work',
    items: [
      'Start a group session over …',
      'Start a session in …',
      'What does … do?',
    ],
  },
  {
    id: 'todo',
    emoji: '✅',
    title: 'TODOs',
    items: [
      'What should I do first?',
      "What's overdue?",
      'Remind me tomorrow to …',
    ],
  },
  {
    id: 'git',
    emoji: '🌿',
    title: 'Git',
    items: [
      'Which projects have unpushed commits?',
      'What changed in … today?',
    ],
  },
  {
    id: 'memory',
    emoji: '🧠',
    title: 'Memory',
    items: [
      'Remember that …',
      'What do you remember about …?',
    ],
  },
];

/**
 * The row of buttons over the conversation: the questions asked so often that
 * typing them again is a tax. Five, because that is what fits on one line in
 * a narrow window, and five is enough to cover a morning: what is on, what
 * happened, what next, who is waiting, what is unfinished.
 *
 * Settings → Buddy replaces any of them; a blank one falls back to the
 * default, so clearing a box is how you get the original back.
 */
export const DEFAULT_PROMPTS = [
  'What are my TODOs?',
  'What did I work on recently?',
  'What should I focus on now?',
  'Which sessions are waiting for me?',
  'What is left unpushed?',
];

/** The five to draw, the saved ones over the defaults. */
export function promptButtons(saved) {
  return DEFAULT_PROMPTS.map((fallback, i) => String(saved?.[i] || '').trim() || fallback);
}

/**
 * Put a suggestion into Buddy's composer — not send it: the user may want to
 * change it, and one with "…" in it is only half written. The caret goes to
 * the first "…", which is replaced, so typing fills the gap.
 */
export function insertIntoBuddyComposer(text) {
  const input = document.querySelector('#chat-viewer .sbx-sdk__input');
  if (!input) return;
  const gap = text.indexOf('…');
  const value = text.replace('…', '').replace(/\s{2,}/g, ' ');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  const caret = gap === -1 ? value.length : Math.min(gap, value.length);
  input.setSelectionRange(caret, caret);
}
