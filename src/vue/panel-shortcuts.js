// panel-shortcuts.js — the keys that drive the session's tool rail.
//
// Pure on purpose: the matcher and the label are the two things worth testing,
// and neither of them needs a store, a DOM or Vue.
//
// Two of the keys asked for were already spoken for, and both are said out
// loud here rather than quietly taken:
//
//   ⌘K  is the command palette — the search field advertises it, and it has to
//       answer while the focus is inside a terminal. Changes take ⌘D (diff).
//   ⌘H  is "Hide WootonPad" on macOS. It is a native menu accelerator (see
//       buildMenu in main.js), so it is handled before the renderer ever sees
//       the key. Hiding the panel takes ⇧⌘H.

/**
 * @typedef {object} Shortcut
 * @property {string} id     a side-panel tab id, or 'stop' / 'hide'
 * @property {string} key    e.key, lower case
 * @property {boolean} [shift]
 * @property {string} label  what the key is for, for the tooltip
 */

/** @type {Shortcut[]} */
export const PANEL_SHORTCUTS = [
  { id: 'shell', key: 't', label: 'Shell' },
  { id: 'changes', key: 'd', label: 'Uncommitted changes' },
  { id: 'todos', key: 'o', label: 'TODOs and plans' },
  { id: 'tasks', key: 'b', label: 'Background tasks' },
  { id: 'containers', key: 'p', label: 'Containers' },
  { id: 'stop', key: ';', label: 'Stop session' },
  { id: 'hide', key: 'h', shift: true, label: 'Hide the panel' },
];

const BY_ID = new Map(PANEL_SHORTCUTS.map(s => [s.id, s]));

/** @param {string} id @returns {Shortcut|null} */
export function shortcutFor(id) {
  return BY_ID.get(id) || null;
}

/**
 * Which shortcut a keydown is, if any.
 *
 * The modifier is Cmd on a Mac and Ctrl elsewhere, exactly as the rest of the
 * app reads it. Alt is never part of one, so a key with Alt held is somebody
 * typing an accented character and not reaching for a panel.
 *
 * @param {KeyboardEvent|{key?: string, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean}} event
 * @param {boolean} isMac
 * @returns {string|null} the id
 */
export function matchShortcut(event, isMac) {
  if (!event || event.altKey) return null;
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (!mod) return null;
  // The other modifier must not be down: ⌃⌘T is a different gesture from ⌘T,
  // and on Windows Alt+Ctrl is AltGr.
  if (isMac ? event.ctrlKey : event.metaKey) return null;

  const key = String(event.key || '').toLowerCase();
  if (!key) return null;
  for (const shortcut of PANEL_SHORTCUTS) {
    if (shortcut.key !== key) continue;
    if (!!shortcut.shift !== !!event.shiftKey) continue;
    return shortcut.id;
  }
  return null;
}

/**
 * `⇧⌘H` on a Mac, `Ctrl+Shift+H` everywhere else — the form each platform
 * writes its own shortcuts in.
 *
 * @param {Shortcut|string|null} shortcut  a shortcut or an id
 * @param {boolean} isMac
 * @returns {string} '' when there is no shortcut for it
 */
export function formatShortcut(shortcut, isMac) {
  const def = typeof shortcut === 'string' ? shortcutFor(shortcut) : shortcut;
  if (!def) return '';
  const key = def.key.length === 1 ? def.key.toUpperCase() : def.key;
  return isMac
    ? `${def.shift ? '⇧' : ''}⌘${key}`
    : `Ctrl+${def.shift ? 'Shift+' : ''}${key}`;
}
