// buddy-mentions.js — what Buddy's last answer was about.
//
// Buddy's sidebar lists the sessions, projects and TODOs its most recent answer
// named, as the rows they are everywhere else in the app — so "these three
// sessions need you" is three clickable rows, not three chips to hunt for in a
// paragraph. Sessions and projects are named with the app's own markup
// (`@session:<uuid>`, `@project:<path>` — see chat-text.js); TODOs have none,
// so a note counts as mentioned when its filename or its title appears.
//
// Only the assistant's own text counts. A tool result that lists fifty
// sessions is what Buddy read, not what it answered.
//
// Pure: the Vue side feeds it transcript records or live SDK messages.

import { findMentions } from './chat-text.js';

/** The text an assistant record or message says, or '' for anything else. */
export function assistantText(entry) {
  if (!entry || entry.type !== 'assistant') return '';
  const content = entry.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(b => b?.type === 'text' && b.text).map(b => b.text).join('\n');
}

/** A prompt the user typed — not a tool result riding in a user record. */
function isUserPrompt(entry) {
  if (!entry || entry.type !== 'user' || entry.isMeta) return false;
  const content = entry.message?.content;
  if (typeof content === 'string') return content.trim().length > 0;
  return Array.isArray(content) && content.some(b => b?.type === 'text' && b.text);
}

/**
 * Everything the assistant said since the user last spoke, oldest first.
 * An answer is often several assistant records with tool calls between them.
 *
 * @param {object[]} entries  transcript records, oldest first
 */
export function lastAnswerText(entries) {
  const parts = [];
  for (let i = (entries?.length || 0) - 1; i >= 0; i--) {
    const entry = entries[i];
    if (isUserPrompt(entry)) break;
    const text = assistantText(entry);
    if (text) parts.unshift(text);
  }
  return parts.join('\n');
}

/**
 * The sessions, projects and TODO notes a piece of text names, in the order it
 * names them, each once.
 *
 * @param {string} text
 * @param {Array<{ filename: string, title?: string }>} [notes]
 * @param {{ resolveShortSession?: Function }} [opts]  see findMentions — a
 *   session the answer named by its short id still counts
 * @returns {{ sessions: string[], projects: string[], todos: string[] }}
 */
export function mentionsIn(text, notes = [], opts = {}) {
  const sessions = [];
  const projects = [];
  for (const m of findMentions(text || '', opts)) {
    if (m.kind === 'session') {
      const id = m.value.toLowerCase();
      if (!sessions.includes(id)) sessions.push(id);
    } else if (m.kind === 'project' && !projects.includes(m.value)) {
      projects.push(m.value);
    }
  }
  // A title shorter than this matches ordinary words ("Test", "Fix") and
  // would pin a note to the sidebar every time the word came up.
  const MIN_TITLE = 6;
  const todos = [];
  for (const note of notes || []) {
    if (!note?.filename) continue;
    const byName = text.includes(note.filename) || text.includes(note.filename.replace(/\.md$/, ''));
    const title = String(note.title || '').trim();
    const byTitle = title.length >= MIN_TITLE && text.includes(title);
    if ((byName || byTitle) && !todos.includes(note.filename)) todos.push(note.filename);
  }
  return { sessions, projects, todos };
}

/** Is there anything to show? */
export function hasMentions(m) {
  return !!(m && (m.sessions.length || m.projects.length || m.todos.length));
}
