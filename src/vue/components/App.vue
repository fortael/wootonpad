<template>
  <div class="sbx-shell">
  <!-- ── TOP NAV ────────────────────────────────────────────────── -->
  <!-- The tabs stay put when the sidebar collapses: the rail below shows what
       is *inside* the active tab, so moving the tabs into it as well would
       leave nowhere to switch from. -->
  <TopNavApp
    :tabs="TABS"
    :active-id="store.activeTab"
    :theme="store.theme"
    :sidebar-collapsed="store.sidebarCollapsed"
    :can-toggle-sidebar="true"
    @select="setTab"
    @settings="onGlobalSettings"
    @toggle-sidebar="store.sidebarCollapsed = !store.sidebarCollapsed"
    @toggle-theme="toggleTheme"
  >
    <template #account>
      <AccountDropdownApp ref="accountDropdownRef" :callbacks="accountDropdownCallbacks" />
    </template>
  </TopNavApp>

  <div class="sbx-shell__body">
  <!-- ── COLLAPSED RAIL ─────────────────────────────────────────── -->
  <CollapsedRailApp
    v-if="store.sidebarCollapsed"
    :tabs="TABS"
    :active-id="store.activeTab"
    @open-session="openRailSession"
    @open-plan="planCallbacks.openPlan"
    @open-project="projectsCallbacks.openProject"
    @open-account="onRailAccount"
    @expand="store.sidebarCollapsed = false"
  />

  <!-- ── SIDEBAR ────────────────────────────────────────────────── -->
  <div id="sidebar" v-show="!store.sidebarCollapsed">
    <CommandBar
      :model-value="store.searchQuery"
      :placeholder="searchPlaceholder"
      :add-title="`Quick open (${modLabel}K)`"
      @update:model-value="onSearchValue"
      @add="openSpotlight"
      @spotlight="openSpotlight"
    >
      <template #field-actions>
        <button
          v-show="store.searchQuery"
          type="button"
          class="sbx-commandbar__chip"
          aria-label="Clear search"
          @click="doClearSearch"
        >&times;</button>
      </template>
    </CommandBar>

    <!-- Not scoped to the sessions tab: live sessions are worth watching from
         wherever you are — the board included. It was hidden there on the
         grounds that the cards say the same thing, but the board scrolls and
         filters, and the rail is the one place that is always the whole set.
         Same position on every tab: directly under the search. -->
    <UnreadRail
      :items="activeRows"
      :active-session-id="store.activeSessionId || ''"
      @select="openRailSession"
    />

    <!-- Shared with the board: its cards are the same sessions under the same
         filter flags, so the row that picks between Recent and Archived has to
         be reachable from there too. The list/grid switch is not — the board is
         already a view of its own. -->
    <FilterTabs
      v-if="sessionListVisible || store.activeTab === 'board'"
      :class="{ 'sbx-filtertabs--no-views': store.activeTab === 'board' }"
      :tabs="FILTER_TABS"
      :active="store.sessionFilterTab"
      :view-mode="store.sidebarViewMode"
      @select="onFilterTab"
      @update:view-mode="onViewMode"
    >
      <template #actions>
        <span id="loading-status" v-show="store.loadingStatus">{{ store.loadingStatus }}</span>
        <button
          type="button"
          class="sbx-filtertabs__view"
          data-tooltip="Refresh sessions"
          aria-label="Refresh sessions"
          @click="onResort"
        >
          <SbIcon name="refresh-cw" :size="13" tone="muted" />
        </button>
      </template>
    </FilterTabs>

    <!-- Sidebar content panels (v-show keeps DOM alive for vanilla JS queries) -->
    <div id="sidebar-content" class="sbx-sidebar-panel sbx-sidebar-panel--blocks" v-show="sessionListVisible && !store.accountSwitching">
      <SidebarApp :callbacks="sidebarCallbacks" />
    </div>
    <div v-if="store.accountSwitching && sessionListVisible" id="account-switch-overlay" class="account-switch-preloader">
      <div class="acct-spinner"></div><span>Switching account…</span>
    </div>
    <div id="plans-content" class="sbx-sidebar-panel sbx-sidebar-panel--blocks" v-show="store.activeTab === 'plans'">
      <PlansApp ref="plansRef" :callbacks="planCallbacks" />
    </div>
    <div id="accounts-content" class="sbx-sidebar-panel sbx-sidebar-panel--blocks" v-show="store.activeTab === 'accounts'">
      <AccountsApp ref="accountsRef" :callbacks="accountsCallbacks" />
    </div>
    <div id="projects-content" class="sbx-sidebar-panel sbx-sidebar-panel--blocks" v-show="store.activeTab === 'projects'">
      <ProjectsApp ref="projectsRef" :callbacks="projectsCallbacks" />
    </div>
    <div id="board-sidebar-content" class="sbx-sidebar-panel sbx-sidebar-panel--blocks" v-show="store.activeTab === 'board'">
      <BoardSidebarApp :callbacks="boardSidebarCallbacks" />
    </div>
  </div>

  <!-- ── RESIZE HANDLE ──────────────────────────────────────────── -->
  <div id="sidebar-resize-handle" v-show="!store.sidebarCollapsed"></div>

  <!-- ── MAIN AREA ──────────────────────────────────────────────── -->
  <div
    id="main"
    :class="{ 'is-board': store.showBoard, 'has-board-split': boardSplitActive }"
    :style="{ '--sbx-board-split': store.boardSplitHeight + 'px' }"
  >
    <!-- Drag the seam between the board and the session below it. -->
    <div
      v-if="boardSplitActive"
      class="sbx-board-splitter"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the session pane"
      @mousedown.prevent="startBoardResize"
    ></div>
    <!-- The pane's own close button is on SessionPanelRail now, so it is the
         same control in the same place in both views. -->
    <div id="placeholder">
      <p>Select a session from the sidebar to begin.</p>
    </div>
    <div id="board-viewer" v-show="store.showBoard">
      <SessionBoardApp ref="boardRef" />
    </div>
    <div id="plan-viewer" v-show="store.planViewerOpen">
      <ViewerContentApp
        ref="planViewerRef"
        language="markdown"
        storage-key="markdownPreviewMode"
        :show-copy-path="true"
        :show-copy-content="true"
        :on-save="planOnSave"
        :on-close="closePlanViewer"
      />
    </div>
    <SettingsPanelApp v-if="store.settingsOpen" />
    <div id="project-viewer" style="display:none;">
      <ProjectViewerApp ref="projectViewerRef" :callbacks="projectViewerCallbacks" />
    </div>
    <div id="jsonl-viewer" v-show="store.showJsonl">
      <JsonlViewerApp ref="jsonlRef" />
    </div>
    <div id="subagent-viewer" v-show="store.subagentViewOpen">
      <SubagentViewApp ref="subagentRef" />
    </div>
    <div id="account-viewer" v-show="store.accountViewerOpen">
      <AccountViewerApp ref="accountViewerRef" />
    </div>
    <!-- The side panel is absolutely positioned inside #terminal-area and the
         terminal split is given a matching right margin (css/side-panel.css).
         It cannot be a flex sibling of #terminals: file-panel.js reparents
         #terminals into a #terminal-split of its own at startup. -->
    <div
      id="terminal-area"
      :class="{ 'has-side-panel': sidePanelVisible }"
      :style="{ '--sbx-sidepanel-w': store.sidePanelWidth + 'px' }"
    >
      <div id="vue-session-header">
        <SessionHeaderApp />
      </div>
      <SessionPanelRail v-if="store.headerSession" />
      <SessionSidePanelApp v-if="sidePanelVisible" />
      <!-- Covers the terminal area for a session that has no terminal. Sits
           inside #terminal-area so the rail, the side panel and their gutters
           are laid out identically for both transports. -->
      <SessionSdkApp v-if="sdkSessionVisible" :key="store.headerSession.sessionId" />
      <!-- Legacy terminal header kept for JS references (hidden) -->
      <div id="terminal-header" style="display:none;">
        <div id="terminal-header-info">
          <span id="terminal-header-name"></span>
          <span id="terminal-header-pty-title" style="display:none;"></span>
          <span id="terminal-header-id"></span>
          <span id="terminal-header-shell" style="display:none;"></span>
          <span id="terminal-header-account" class="terminal-account-badge" style="display:none;"></span>
        </div>
        <div id="terminal-header-controls">
          <span id="terminal-header-status"></span>
          <button id="terminal-stop-btn" data-tooltip="Stop process">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1"/></svg>
          </button>
        </div>
      </div>
      <div id="grid-viewer" v-show="store.gridViewActive">
        <div id="grid-viewer-header">
          <span id="grid-viewer-title">Session Overview</span>
          <span id="grid-viewer-count">{{ store.gridViewerCount }}</span>
        </div>
      </div>
      <div id="terminals"></div>
    </div>
  </div>
  </div><!-- /.sbx-shell__body -->
  </div><!-- /.sbx-shell -->

  <!-- Grid cards rendered via Teleport into their existing container element -->
  <Teleport to="#vue-grid-cards">
    <GridCardsApp ref="gridCardsRef" />
  </Teleport>

  <!-- Dialogs (overlays + popover, rendered via Teleport to body inside the component) -->
  <DialogsApp ref="dialogsRef" />

  <SpotlightApp />
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { store } from '../store.js';
import SbIcon from './SbIcon.vue';
import TopNavApp from './TopNavApp.vue';
import CollapsedRailApp from './CollapsedRailApp.vue';
import CommandBar from './CommandBar.vue';
import FilterTabs from './FilterTabs.vue';
import UnreadRail from './UnreadRail.vue';
import SidebarApp from './SidebarApp.vue';
import SessionHeaderApp from './SessionHeaderApp.vue';
import SessionSidePanelApp from './SessionSidePanelApp.vue';
import SessionPanelRail from './SessionPanelRail.vue';
import SessionSdkApp from './SessionSdkApp.vue';
import { loadSidePanelTab } from '../side-panel-tabs.js';
import { isPlainTerminal } from '../session-filter.js';
import { matchProjectPaths } from '../project-search.js';
import { wantsAttention, activeSessions, stateFromStore } from '../session-column.js';
import { parseRateLimitEvent } from '../rate-limits.js';
import PlansApp from './PlansApp.vue';
import AccountsApp from './AccountsApp.vue';
import AccountDropdownApp from './AccountDropdownApp.vue';
import ProjectsApp from './ProjectsApp.vue';
import GridCardsApp from './GridCardsApp.vue';
import SettingsPanelApp from './SettingsPanelApp.vue';
import ProjectViewerApp from './ProjectViewerApp.vue';
import JsonlViewerApp from './JsonlViewerApp.vue';
import SubagentViewApp from './SubagentViewApp.vue';
import AccountViewerApp from './AccountViewerApp.vue';
import SessionBoardApp from './SessionBoardApp.vue';
import BoardSidebarApp from './BoardSidebarApp.vue';
import ViewerContentApp from './ViewerContentApp.vue';
import DialogsApp from './DialogsApp.vue';
import SpotlightApp from './SpotlightApp.vue';

// ── Template refs ────────────────────────────────────────────────
const plansRef = ref(null);
const accountsRef = ref(null);
const accountDropdownRef = ref(null);
const projectsRef = ref(null);
const gridCardsRef = ref(null);
const projectViewerRef = ref(null);
const jsonlRef = ref(null);
const subagentRef = ref(null);
const accountViewerRef = ref(null);
const planViewerRef = ref(null);
const dialogsRef = ref(null);
const boardRef = ref(null);

// One Markdown pane serves plans and account notes, and each has its own
// path-guarded write in the main process — so the save has to go to the one
// that owns whatever is open, not to whichever guard is more forgiving.
// The way out of the full-screen Markdown pane: back to whatever the main
// area was showing before it — the board, the open session, or the empty
// placeholder. Without it a plan opened from a session was a room with no
// door: the pane covers the session view and its own controls are all about
// the file.
function closePlanViewer() {
  store.planViewerOpen = false;
  window.vuePlans?.clearActive?.();
  const terminalArea = document.getElementById('terminal-area');
  const placeholder = document.getElementById('placeholder');
  if (store.activeTab === 'board') store.showBoard = true;
  if (store.headerSession) {
    if (terminalArea) terminalArea.style.display = '';
    if (placeholder) placeholder.style.display = 'none';
  } else if (!store.showBoard && placeholder) {
    placeholder.style.display = '';
  }
}

const planOnSave = async (filePath, content) => {
  if (store.planViewerKind !== 'note') return window.api.savePlan(filePath, content);
  const result = await window.api.saveNote(filePath, content);
  // Ticking a box in the editor has to move the count in the sidebar.
  window.vuePlans?.refreshNotes?.();
  return result;
};

// ── Tab config ───────────────────────────────────────────────────
const TABS = [
  { id: 'sessions', icon: 'sparkles', label: 'Sessions' },
  { id: 'board', icon: 'square-kanban', label: 'Board' },
  { id: 'plans', icon: 'book-open', label: 'Plans' },
  { id: 'projects', icon: 'folder', label: 'Projects' },
  { id: 'accounts', icon: 'users', label: 'Accounts' },
];

// ── Search ───────────────────────────────────────────────────────
// The board renders the same sessions in another shape, so the sidebar keeps
// its list — and its filters — on both tabs.
// ── Board split resize ───────────────────────────────────────────
// Height of the session pane under the board, in px, measured from the bottom
// of #main. Kept in px rather than a ratio so the terminal keeps its row count
// when the window resizes.
const BOARD_SPLIT_MIN = 160;
const BOARD_SPLIT_MARGIN = 220;   // leave at least this much board visible

function setBoardSplit(px) {
  const main = document.getElementById('main');
  const max = Math.max(BOARD_SPLIT_MIN, (main?.clientHeight || 800) - BOARD_SPLIT_MARGIN);
  store.boardSplitHeight = Math.round(Math.min(max, Math.max(BOARD_SPLIT_MIN, px)));
}

function startBoardResize(event) {
  const main = document.getElementById('main');
  if (!main) return;
  const bottom = main.getBoundingClientRect().bottom;
  let frame = 0;

  const onMove = (e) => {
    setBoardSplit(bottom - e.clientY);
    // Refit on a frame, not on every mousemove: each one resizes the PTY.
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; window._refitOpenTerminals?.(); });
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    localStorage.setItem('boardSplitHeight', String(store.boardSplitHeight));
    window._refitOpenTerminals?.();
  };

  document.body.style.cursor = 'row-resize';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  void event;
}

// Board with a session previewed below it: both panes are visible at once.
// Anything that fills the main area — a document, a transcript, an account,
// the settings — is showing *instead of* the board and its preview, so the
// seam between them has nothing left to drag and must not be painted over
// the top of it.
const mainViewerOpen = computed(() =>
  store.planViewerOpen || store.showJsonl || store.subagentViewOpen
  || store.accountViewerOpen || store.settingsOpen
);

const boardSplitActive = computed(() =>
  store.activeTab === 'board' && !!store.boardPreviewId && !mainViewerOpen.value
);

const sessionListVisible = computed(() => store.activeTab === 'sessions');

// Each tab searches what it shows, and the placeholder says which fields —
// there is no modifier on the field any more, so the rule has to be readable
// from the bar itself.
const searchPlaceholder = computed(() => {
  switch (store.activeTab) {
    case 'plans': return 'Search plans by title or text…';
    case 'projects': return 'Search projects by name or folder…';
    case 'accounts': return 'Search accounts by name or folder…';
    case 'board': return 'Search the board by session or project…';
    default: return 'Search sessions by title or project…';
  }
});

let searchDebounceTimer = null;

function onSearchValue(value) {
  store.searchQuery = value;
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    searchDebounceTimer = null;
    const query = store.searchQuery.trim();
    if (!query) { doClearSearch(); return; }
    if (store.activeTab === 'board') { runBoardSearch(query); return; }
    window.__sb?.search?.(query);
  }, 200);
}

// app.js's __sb.search dispatches on its own copy of the active tab and knows
// only the four list tabs, so on the board it falls through and nothing
// filters. Same index, same query, same destination — the result goes to
// store.searchMatchIds through the same bridge app.js uses, which is what the
// board's filterSessions() call already reads.
let boardSearchIds = null;
let boardSearchProjectPaths = null;

async function runBoardSearch(query) {
  // Session titles only: the board is a set of cards labelled by title, and a
  // hit somewhere in a transcript leaves a card on screen with nothing on it
  // to say why. Project names come from the list, which the index has no rows
  // for — see project-search.js.
  try {
    const results = await window.api.search('session', query, true);
    boardSearchIds = new Set(results.map(r => r.id));
  } catch {
    boardSearchIds = null;
  }
  boardSearchProjectPaths = matchProjectPaths(store.projects, query);
  window.vueSidebar?.setSearch(boardSearchIds, boardSearchProjectPaths);
}

// app.js re-asserts its own (null) search set on every refreshSidebar, and
// those fire on the board too — a session exiting would otherwise drop an
// active board search without the user touching the field. Re-applying makes
// the field non-null, so this cannot re-enter.
watch(() => store.searchMatchIds, (ids) => {
  if (ids === null && boardSearchIds && store.activeTab === 'board' && store.searchQuery.trim()) {
    store.searchMatchIds = boardSearchIds;
    store.searchMatchProjectPaths = boardSearchProjectPaths;
  }
});

function doClearSearch() {
  store.searchQuery = '';
  boardSearchIds = null;
  boardSearchProjectPaths = null;
  if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
  window.__sb?.clearSearch?.();
}

// The command palette. The sidebar field filters the tab you are on; this
// crosses all of them — see SpotlightApp.vue.
const modLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '\u2318' : 'Ctrl+';
function openSpotlight() { store.spotlightOpen = true; }

// ── Theme ────────────────────────────────────────────────────────
// Mirrored onto <html data-theme> — public/css/theme-light.css keys off it.
function applyTheme(next) {
  store.theme = next === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = store.theme;
  localStorage.setItem('theme', store.theme);
}

function toggleTheme() {
  applyTheme(store.theme === 'light' ? 'dark' : 'light');
}

// ── Plan meters ──────────────────────────────────────────────────
//
// The 5-hour and 7-day limits belong to the account, not to any one chat, so
// they are kept here and drawn on the account chip. A terminal session shows
// them in the CLI's own status line; an SDK session has no status line, which
// is what `rate_limit_event` is read for — see rate-limits.js.
//
// Persisted per account because the event only arrives during a turn: without
// it, the chip would be blank until something ran.

let limitsKey = '';

async function loadRateLimits() {
  try {
    const accountId = await window.api.getActiveAccountId();
    limitsKey = `rateLimits:${accountId || 'default'}`;
    store.rateLimits = (await window.api.getSetting(limitsKey)) || null;
  } catch {
    store.rateLimits = null;
  }
}

window.api.onSdkMessage?.((_sessionId, message) => {
  if (message?.type !== 'rate_limit_event') return;
  const limits = parseRateLimitEvent(message.rate_limit_info);
  if (!limits) return;
  store.rateLimits = limits;
  if (limitsKey) window.api.setSetting(limitsKey, limits).catch(() => {});
});

onMounted(loadRateLimits);

// ── Dock badge ───────────────────────────────────────────────────
// The two board columns that mean "this wants you": WAITING INPUT and DONE.
// A session that is working wants nothing and is deliberately not counted —
// which is why this goes through the board's own precedence rather than
// reading the collections, since a session can sit in more than one of them.
//
// The waiting half is sent as ids rather than a count, because main.js has to
// tell a session that has *just* become blocked from one that has been blocked
// for a while — only the first should bounce the icon.
const attentionSummary = computed(() => {
  const { waiting, done } = wantsAttention(stateFromStore(store));
  // Sorted so the key below means the same thing twice. The ids come out of a
  // Set in insertion order, and two runs that agree on which sessions are
  // waiting can still list them differently.
  waiting.sort();
  return { waiting, done: done.length };
});

// Watched by value, not by the object.
//
// The computed builds a fresh object on every invalidation and `watch`
// compares by identity, so this used to fire on every status change anywhere —
// an IPC message and a dock API call each time, usually carrying the number
// already on the icon. Four status flips a second produced four of them.
watch(
  () => {
    const summary = attentionSummary.value;
    return `${summary.waiting.join(',')}|${summary.done}`;
  },
  () => window.api?.reportAttention?.(attentionSummary.value),
  { immediate: true },
);

// Two buttons write this flag — the board's and a project's Sessions tab —
// so it is persisted here, once, rather than in each of them. app.js owns
// `ui_state` and the round trip to SQLite; this only reports the change.
watch(() => store.highlightFresh, (on) => window.__sb?.setHighlightFresh?.(on));

// ── Active rail ──────────────────────────────────────────────────
//
// Everything live or unread — see activeSessions(). It is a superset of what
// the dock badge counts, so a badge reading 1 still has exactly one avatar on
// the rail explaining it; that avatar is now the one wearing the count.
const activeRows = computed(() =>
  activeSessions(store.projects, stateFromStore(store), store.activePtyIds));

function openRailSession(session) {
  if (session) window.__sb?.openSession?.(session);
}

// The collapsed rail's accounts list hands over the account; the viewer wants
// its id.
function onRailAccount(account) {
  if (account?.id) window.__sb?.openAccountViewer?.(account.id);
}

// ── Tab switching ────────────────────────────────────────────────
function setTab(tabId) {
  // A tab that has since been removed can still be sitting in the restored
  // ui_state — switching to it would leave an empty sidebar.
  if (!TABS.some(t => t.id === tabId)) return;
  if (tabId === store.activeTab) return;
  store.activeTab = tabId;
  // Clear search on tab switch
  store.searchQuery = '';
  boardSearchIds = null;
  store.searchMatchIds = null;
  store.searchMatchProjectPaths = null;
  window.__sb?.onTabChange?.(tabId);
}

// ── Filter tabs ──────────────────────────────────────────────────
// The redesign trades four independent toggles for one exclusive tab row, so
// picking a tab is the same as setting exactly one of the store's filter flags.
const FILTER_TABS = [
  { id: 'recent', label: 'Recent' },
  { id: 'active', label: 'Active' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'today', label: 'Today' },
  { id: 'archived', label: 'Archived' },
];

function onFilterTab(id) {
  store.sessionFilterTab = id;
  store.showRunningOnly = id === 'active';
  store.showStarredOnly = id === 'pinned';
  store.showTodayOnly = id === 'today';
  store.showArchived = id === 'archived';
  localStorage.setItem('sessionFilterTab', id);
  window.__sb?.onFilterChange?.({
    showStarredOnly: store.showStarredOnly,
    showRunningOnly: store.showRunningOnly,
    showTodayOnly: store.showTodayOnly,
    showArchived: store.showArchived,
  });
}

function onViewMode(mode) {
  store.sidebarViewMode = mode;
  localStorage.setItem('sidebarViewMode', mode);
  if ((mode === 'grid') !== store.gridViewActive) window.__sb?.toggleGridView?.();
}

// ── Session side panel ───────────────────────────────────────────
// Only meaningful over an open session — it is scoped to that session's own
// project path. Opening, closing or resizing it changes the terminal's width,
// and xterm keeps its own cols/rows, so every transition ends in a refit.
// The board's bottom split gets it too: one pane at a time is narrow enough to
// share that space, and the shell in particular is worth having there.
//
// Never over a plain terminal. Changes, containers and a scratch shell are
// things you want beside a session doing work in a project; a terminal already
// is a shell in that project, and the rail offering to open a second one next
// to it is the panel answering a question its own subject already answered.
// `store.sidePanelTab` is left alone, so the panel comes back by itself on the
// next real session.
const headerIsTerminal = computed(() => isPlainTerminal(store.headerSession));

const sidePanelVisible = computed(() =>
  !!store.sidePanelTab && !!store.headerSession && !headerIsTerminal.value
);

// An SDK-backed session has no xterm to show. Keyed by session id in the
// template so switching sessions rebuilds the transcript rather than appending
// one conversation onto another.
//
// Not in the grid. This sits inside #terminal-area, where the grid also lives,
// and it covers the whole of it — so the one chat for the session in the header
// would be drawn over the grid of all of them. In the grid each session gets its
// own read-only card instead; see mountChatBody in grid-view.js.
const sdkSessionVisible = computed(() =>
  !!store.headerSession
  && !store.gridViewActive
  && store.sdkSessionIds.has(store.headerSession.sessionId)
);

watch(sidePanelVisible, () => {
  requestAnimationFrame(() => window._refitOpenTerminals?.());
});

// ── Sidebar action callbacks ──────────────────────────────────────
function onGlobalSettings() { window.__sb?.openGlobalSettings?.(); }
function onResort() { window.__sb?.resort?.(); }
// The command bar's + is parked (see CommandBar.vue) — adding a project is the
// projects tab's own button now.

// ── Component callbacks ───────────────────────────────────────────
// Per-session actions are not here: SessionMenu calls window.__sb directly, so
// the list only forwards what the rows themselves still do.
const sidebarCallbacks = {
  openSession: (s) => window.__sb?.openSession?.(s),
  newSession: (project, btn) => window.__sb?.newSession?.(project, btn),
  openSettings: (path) => window.__sb?.openSettings?.(path),
  archiveSessions: (sessions) => window.__sb?.archiveSessions?.(sessions),
  removeProject: (path) => window.__sb?.removeProject?.(path),
};

const planCallbacks = {
  openPlan: (plan) => window.__sb?.openPlan?.(plan),
  openNote: (note) => window.openNote?.(note),
};

// A summary's link has to land exactly where a card click lands, so it goes
// through the board's own handler rather than repeating it here.
const boardSidebarCallbacks = {
  selectSession: (s) => boardRef.value?.selectSession(s),
};

const accountsCallbacks = {
  openAccountViewer: (id) => window.__sb?.openAccountViewer?.(id),
  switchAccount: (id) => window.__sb?.switchAccount?.(id),
  openAccountHomeSession: (acc) => window.__sb?.openAccountHomeSession?.(acc),
  renameAccount: (id, name) => window.__sb?.renameAccount?.(id, name),
  deleteAccount: (id) => window.__sb?.deleteAccount?.(id),
  createAccount: (name) => window.__sb?.createAccount?.(name),
  discoverWslClaudeHomes: () => window.__sb?.discoverWslClaudeHomes?.(),
  createWslAccount: (distro, name) => window.__sb?.createWslAccount?.(distro, name),
};

const accountDropdownCallbacks = {
  switchAccount: async (id) => {
    await window.__sb?.switchAccount?.(id);
    // Limits are per account; the ones on screen belong to the old one.
    store.rateLimits = null;
    loadRateLimits();
  },
};

const projectsCallbacks = {
  openProject: (p) => window.__sb?.openProject?.(p),
  newSession: (p, btn) => window.__sb?.newSession?.(p, btn),
  addProject: () => window.__sb?.addProject?.(),
  projectRemoved: () => window.__sb?.projectRemoved?.(),
};

const projectViewerCallbacks = {
  newSession: (p, btn) => window.__sb?.newSession?.(p, btn),
  onTabChange: (tab) => window.__sb?.onPvTabChange?.(tab),
  worktreeDeleted: (worktreePath) => {
    store.projects = store.projects.filter(p => p.projectPath !== worktreePath);
  },
};

// ── Mount lifecycle ───────────────────────────────────────────────
// ── Background tasks ──────────────────────────────────────────────
// How many sub-agents each running session has out working, for the badge on
// its sidebar row and its board card. Only running sessions are asked about:
// a sub-agent lives inside the CLI process that spawned it, so a session that
// is not running has none. When nothing is running, nothing is polled.
const SUBAGENT_COUNT_MS = 6000;
let subagentCountTimer = null;

async function pollSubagentCounts() {
  const ids = [...new Set([
    ...store.activePtyIds,
    ...store.sdkSessionIds,
    ...[...store.sessionBusyState.entries()].filter(([, busy]) => busy).map(([id]) => id),
  ])].filter(Boolean);

  if (!ids.length) {
    if (store.subagentCounts.size) store.subagentCounts.clear();
    return;
  }
  const counts = await window.api.getSubagentCounts(ids).catch(() => null);
  if (!counts) return;
  // Rebuilt rather than merged: a session that finished its agents has to lose
  // the badge, and it says so by being absent from the answer.
  store.subagentCounts.clear();
  for (const [id, n] of Object.entries(counts)) store.subagentCounts.set(id, n);
}

onMounted(async () => {
  subagentCountTimer = setInterval(pollSubagentCounts, SUBAGENT_COUNT_MS);
  pollSubagentCounts();

  // Re-export component bridge APIs so app.js can call them
  Object.assign(window.vuePlans, {
    setPlans: (list) => plansRef.value?.setPlans(list),
    setActive: (f) => plansRef.value?.setActive(f),
    clearActive: () => plansRef.value?.clearActive(),
    refreshNotes: () => plansRef.value?.refreshNotes(),
  });
  Object.assign(window.vueAccounts, {
    setAccounts: (list, id) => accountsRef.value?.setAccounts(list, id),
    setActiveAccount: (id) => accountsRef.value?.setActiveAccount(id),
    setUsage: (usage) => accountsRef.value?.setUsage(usage),
    setSearch: (q) => accountsRef.value?.setSearch(q),
  });
  Object.assign(window.vueAccountDropdown, {
    setAccounts: (list, id, usage) => accountDropdownRef.value?.setAccounts(list, id, usage),
    setActiveAccount: (id) => accountDropdownRef.value?.setActiveAccount(id),
    setUsage: (usage) => accountDropdownRef.value?.setUsage(usage),
    close: () => accountDropdownRef.value?.close(),
  });
  Object.assign(window.vueProjects, {
    setProjects: (list) => projectsRef.value?.setProjects(list),
    setSearch: (q) => projectsRef.value?.setSearch(q),
    clearActive: () => projectsRef.value?.clearActive(),
    updateProjectInfo: (path, info) => projectsRef.value?.updateProjectInfo(path, info),
  });
  // GridCardsApp exposes addCard/updateCard/removeCard/clearAll directly
  window.vueGrid = gridCardsRef.value;

  const worktreePattern = /^(.+?)\/\.claude\/worktrees\/([^/]+)\/?$/;
  window.vueProjectViewer = {
    open: (proj) => {
      const worktrees = store.projects
        .filter(p => { const m = p.projectPath.match(worktreePattern); return m && m[1] === proj.projectPath; })
        .map(p => ({ projectPath: p.projectPath, name: p.projectPath.match(worktreePattern)?.[2] || p.projectPath }));
      projectViewerRef.value?.open(proj, worktrees);
    },
    close: () => projectViewerRef.value?.close(),
    setTab: (tab) => projectViewerRef.value?.setTab(tab),
    // The hand-off from the session side panel's read-only view of a file.
    openFile: (relPath) => projectViewerRef.value?.openFile(relPath),
  };
  window.vueApp = { setTab };
  // app.js is a classic script and cannot import the module this lives in, but
  // "is this a shell rather than a conversation" must have one answer — see
  // session-filter.js.
  window.isPlainTerminal = isPlainTerminal;
  window.vueJsonlViewer = {
    open: (s) => jsonlRef.value?.open(s),
    openSubagent: (sessionId, agent) => jsonlRef.value?.openSubagent(sessionId, agent),
  };

  // A sub-agent is not a session, so it has no row to click anywhere else —
  // the side panel's Background tasks pane hands it here. It takes the main
  // area the way a session does, and renders through the same chat renderer,
  // with a bar saying which session it belongs to.
  window.openSubagentTranscript = (sessionId, agent) => {
    if (!sessionId || !agent) return;
    window.hideAllViewers?.();
    const terminalArea = document.getElementById('terminal-area');
    if (terminalArea) terminalArea.style.display = 'none';
    const placeholder = document.getElementById('placeholder');
    if (placeholder) placeholder.style.display = 'none';
    store.subagentViewOpen = true;
    subagentRef.value?.open(sessionId, agent);
  };
  window.vueAccountViewer = {
    load: (id) => accountViewerRef.value?.load(id),
    reload: () => accountViewerRef.value?.reload(),
  };
  Object.assign(window.vueDialogs, {
    openNewSession: (...args) => dialogsRef.value?.openNewSession(...args),
    openResumeSession: (...args) => dialogsRef.value?.openResumeSession(...args),
    openAddProject: (...args) => dialogsRef.value?.openAddProject(...args),
    openPopover: (...args) => dialogsRef.value?.openPopover(...args),
  });

  Object.assign(window.vuePlanViewer, {
    open: (...args) => planViewerRef.value?.open(...args),
  });

  // Settings panel — exposed so app.js and vanilla JS callers can open it.
  // Hides all vanilla-managed main-area content so the xterm canvas can't
  // intercept pointer events while settings is showing.
  window.openSettingsViewer = (scope, projectPath) => {
    store.planViewerOpen = false;
    const hide = ['terminal-area', 'placeholder', 'project-viewer'];
    for (const id of hide) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    store.showBoard = false;
    store.showJsonl = false;
    store.accountViewerOpen = false;
    store.settingsScope = scope || 'global';
    store.settingsProjectPath = projectPath || null;
    store.settingsOpen = true;
  };

  // Prevent browser "Save Page" shortcut from interfering with in-app Cmd+S save
  document.addEventListener('keydown', (e) => {
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
    if (e.key === 's' && mod && !e.shiftKey && !e.altKey) e.preventDefault();
  });
  window.closeSettingsViewer = () => {
    store.settingsOpen = false;
    window._restoreAfterSettings?.();
  };

  // Restore theme before anything paints a colour
  applyTheme(localStorage.getItem('theme'));

  // Restore filter preferences from localStorage. Older builds persisted four
  // independent flags; fold whichever was on into the matching tab.
  // 'running' is what this tab was called before; a stored id from an older
  // build must not silently fall back to Recent.
  const storedTab = localStorage.getItem('sessionFilterTab');
  const savedTab = (storedTab === 'running' ? 'active' : storedTab)
    || (localStorage.getItem('showRunningOnly') === '1' && 'active')
    || (localStorage.getItem('showStarredOnly') === '1' && 'pinned')
    || (localStorage.getItem('showTodayOnly') === '1' && 'today')
    || (localStorage.getItem('showArchived') === '1' && 'archived')
    || 'recent';
  store.sessionFilterTab = FILTER_TABS.some(t => t.id === savedTab) ? savedTab : 'recent';
  store.showRunningOnly = store.sessionFilterTab === 'active';
  store.showStarredOnly = store.sessionFilterTab === 'pinned';
  store.showTodayOnly = store.sessionFilterTab === 'today';
  store.showArchived = store.sessionFilterTab === 'archived';
  store.sidebarViewMode = localStorage.getItem('sidebarViewMode') === 'grid' ? 'grid' : 'list';
  const savedSplit = Number(localStorage.getItem('boardSplitHeight'));
  if (Number.isFinite(savedSplit) && savedSplit > 0) store.boardSplitHeight = savedSplit;

  // Session side panel — the open pane and the width survive a restart.
  store.sidePanelTab = loadSidePanelTab();
  const savedPanelWidth = parseInt(localStorage.getItem('sessionSidePanelWidth'), 10);
  if (Number.isFinite(savedPanelWidth) && savedPanelWidth >= 280) store.sidePanelWidth = savedPanelWidth;

  // Plan viewer globals (migrated from plans-memory-view.js)
  window.cachedPlans = [];

  window.loadPlans = async () => {
    window.cachedPlans = await window.api.getPlans();
    window.vuePlans?.setPlans(window.cachedPlans);
  };
  window.renderPlans = (plans) => {
    window.vuePlans?.setPlans(plans || window.cachedPlans);
  };
  // Clear the main area and hand it to the Markdown pane. `kind` is what the
  // pane's save goes through — see planOnSave.
  const showMarkdown = (kind, title, filePath, content) => {
    document.getElementById('placeholder').style.display = 'none';
    document.getElementById('terminal-area').style.display = 'none';
    document.getElementById('project-viewer').style.display = 'none';
    window.vueProjectViewer?.close();
    if (window.vueStore) {
      window.vueStore.settingsOpen = false;
      window.vueStore.showJsonl = false;
      window.vueStore.planViewerKind = kind;
      window.vueStore.planViewerOpen = true;
    }
    window.vuePlanViewer?.open(title, filePath, content);
  };

  window.openPlan = async (plan) => {
    window.vuePlans?.setActive(plan.filename);
    const result = await window.api.readPlan(plan.filename);
    showMarkdown('plan', plan.title || plan.filename, result.filePath, result.content);
  };

  // Notes open in the same pane as plans — same Markdown, same editor, same
  // preview toggle. Only the directory behind them differs.
  window.openNote = async (note) => {
    const result = await window.api.readNote(note.filename);
    if (!result?.ok) return;
    showMarkdown('note', note.title || note.filename, result.filePath, result.content);
  };
  /**
   * Clear the main area for whatever is about to take it over.
   *
   * `keepBoard` is for the one caller that is *not* taking it over: showing a
   * session the board itself asked for, in the board's own preview pane. That
   * exemption used to apply to every caller, so a project — or an account, or
   * the plans list — opened from the board left the board up and rendered on
   * top of it.
   */
  window.hideAllViewers = (opts) => {
    if (window.vueStore) {
      window.vueStore.planViewerOpen = false;
      window.vueStore.settingsOpen = false;
      if (!(opts?.keepBoard
        && window.vueStore.activeTab === 'board'
        && window.vueStore.boardPreviewId)) {
        window.vueStore.showBoard = false;
      }
      window.vueStore.showJsonl = false;
      window.vueStore.accountViewerOpen = false;
      window.vueStore.subagentViewOpen = false;
    }
    const pv = document.getElementById('project-viewer');
    if (pv) pv.style.display = 'none';
    window.vueProjectViewer?.close();
    const ta = document.getElementById('terminal-area');
    if (ta) ta.style.display = '';
  };
  // showSession's way in. The name is historical — it is the board-preview
  // path, and the only one allowed to leave the board standing.
  window.hidePlanViewer = () => window.hideAllViewers({ keepBoard: true });
});

onBeforeUnmount(() => clearInterval(subagentCountTimer));
</script>
