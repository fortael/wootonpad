// The session side panel's panes, in one place so the rail that opens them
// and the panel that renders them cannot drift apart.
//
// Two panels share this: the one beside an open session, and the one beside
// the Chat tab's assistant. They are the same component with a `scope`, and
// each scope remembers its own open pane — the assistant's TODO list staying
// open must not open one over the next session you look at.
import { store } from './store.js';
import { isPlainTerminal } from './session-filter.js';

const TAB_KEYS = { session: 'sessionSidePanelTab', chat: 'chatSidePanelTab' };

export const TABS = [
  // A group session's own pane: the projects it spans and the two files that
  // describe the task — see session-groups.js. Only offered beside a group.
  { id: 'group', label: 'Group projects and memory', icon: 'layers' },
  // Buddy's own notes, kept between conversations — see chat-agent.js. Only
  // offered beside Buddy.
  { id: 'memory', label: "Buddy's memory", icon: 'brain' },
  { id: 'changes', label: 'Uncommitted changes', icon: 'file-diff' },
  { id: 'todos', label: 'TODOs and plans', icon: 'list-todo' },
  // Sub-agents have transcripts but no session rows, so this rail is the only
  // place in the app they are visible at all.
  { id: 'tasks', label: 'Background tasks', icon: 'bot' },
  { id: 'containers', label: 'Containers', icon: 'container' },
  { id: 'shell', label: 'Shell', icon: 'terminal' },
];

const IDS = new Set(TABS.map(t => t.id));

// The assistant manages the workspace and works in no repository, so there is
// no working tree, no compose file and nowhere a shell would be useful. What it
// does have is a memory of its own.
const CHAT_TABS = new Set(['memory', 'todos', 'tasks']);

/**
 * The panes that make sense beside this subject, in rail order.
 *
 * A plain terminal gets none — it already is a shell in its project. A group
 * session gets the group pane first; everywhere else it is not offered.
 */
export function tabsFor(session, scope = 'session') {
  if (scope === 'chat') return TABS.filter(t => CHAT_TABS.has(t.id));
  if (!session || isPlainTerminal(session)) return [];
  const sessionTabs = TABS.filter(t => t.id !== 'memory');
  if (session.groupProjects?.length) return sessionTabs;
  return sessionTabs.filter(t => t.id !== 'group');
}

/** The open pane for a scope, or null. */
export function panelTab(scope = 'session') {
  return scope === 'chat' ? store.chatSidePanelTab : store.sidePanelTab;
}

/** Restore the pane the user last had open. Runs once, at app start. */
export function loadSidePanelTab() {
  // Migration: the panel used to be a boolean with three stacked sections.
  // Someone who had it open gets the first pane rather than a closed panel.
  const legacy = localStorage.getItem('sessionSidePanelOpen');
  const saved = localStorage.getItem(TAB_KEYS.session);
  if (saved && IDS.has(saved)) return saved;
  if (!saved && legacy === '1') return 'changes';
  return null;
}

/** The Chat tab's counterpart — opened on TODOs the first time. */
export function loadChatSidePanelTab() {
  const saved = localStorage.getItem(TAB_KEYS.chat);
  if (saved === 'none') return null;
  return saved && CHAT_TABS.has(saved) ? saved : 'todos';
}

/**
 * Show a file in the panel, read-only, over whatever pane is open.
 *
 * Opens the panel if it is closed — the pane behind is arbitrary at that point,
 * and closing the file lands on it, which is the same place the diff overlay
 * lands. `path` is absolute; the chat resolves a mention against the session's
 * own project before calling this.
 */
export function openSidePanelFile(path, scope = 'session') {
  if (!path) return;
  store.sidePanelFile = path;
  if (!panelTab(scope)) setSidePanelTab(scope === 'chat' ? 'todos' : 'changes', scope);
}

/**
 * @param {string|null} id
 * @param {'session'|'chat'} [scope]
 */
export function setSidePanelTab(id, scope = 'session') {
  if (scope === 'chat') {
    const next = id && CHAT_TABS.has(id) ? id : null;
    store.chatSidePanelTab = next;
    // Remembered as closed too: the chat opens with its TODOs showing unless
    // someone has put them away.
    localStorage.setItem(TAB_KEYS.chat, next || 'none');
    return;
  }
  const next = id && IDS.has(id) ? id : null;
  store.sidePanelTab = next;
  if (next) localStorage.setItem(TAB_KEYS.session, next);
  else localStorage.removeItem(TAB_KEYS.session);
  // The boolean is gone; clear it so a downgrade cannot resurrect the old
  // three-section layout on top of the new one.
  localStorage.removeItem('sessionSidePanelOpen');
}
