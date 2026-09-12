import { createApp } from 'vue';
import { store } from './store.js';
import App from './components/App.vue';
import ViewerContentApp from './components/ViewerContentApp.vue';
import SdkGridCard from './components/SdkGridCard.vue';

// Expose store for direct mutation from app.js
window.vueStore = store;

// Status writes go straight in, and deliberately so.
//
// They were briefly queued to the next frame, on the theory that a burst of
// status messages was a burst of board re-renders. Measured, it is not: the
// extra renders are a couple of milliseconds of JS, and the layout and paint
// that actually cost something happen once per frame no matter how many
// mutations landed in it. Batching changed nothing — 11.8 against 12.1 layouts
// a second on the same churn — and cost a frame of latency plus an invariant
// that every writer had to respect. Left direct.

// Stub bridge objects — populated by App.vue onMounted (via template refs).
// These run synchronously during app.mount(), before any other script executes.
window.vueSidebar = {
  store,
  setProjects(projects) { store.projects = projects.map(p => ({ ...p })); },
  setAllProjects(projects) { store.allProjects = projects.map(p => ({ ...p })); },
  // Assigned only when the set actually changed. app.js polls the live PTYs
  // every three seconds and the answer is usually the same one as last time;
  // a fresh Set every poll is a fresh identity, and that alone re-ran the
  // board's column pass and the sidebar's filters on a timer, for nothing.
  setActivePtyIds(ids) {
    const next = ids instanceof Set ? ids : new Set(ids);
    const current = store.activePtyIds;
    if (current.size === next.size) {
      let same = true;
      for (const id of next) {
        if (!current.has(id)) { same = false; break; }
      }
      if (same) return;
    }
    store.activePtyIds = next;
  },
  setActiveSession(id) { store.activeSessionId = id; },
  setBusy(sessionId, busy) {
    if (busy) store.sessionBusyState.set(sessionId, true);
    else store.sessionBusyState.delete(sessionId);
  },
  addAttention(sessionId) { store.attentionSessions.add(sessionId); },
  setResponseReady(sessionId) {
    store.responseReadySessions.add(sessionId);
    store.sessionBusyState.delete(sessionId);
  },
  clearNotifications(sessionId) {
    store.attentionSessions.delete(sessionId);
    store.responseReadySessions.delete(sessionId);
  },
  // Reading a finished turn is not the same as answering a question. Opening a
  // session clears the unread mark; if the session is also sitting on a dialog
  // it is still sitting on it, and the board must keep saying so.
  clearResponseReady(sessionId) { store.responseReadySessions.delete(sessionId); },
  // The board's DONE column, mirrored from app.js's own set. Here rather than
  // written into the store from app.js, so one module owns these collections.
  setReadPending(sessionId, pending) {
    if (pending) store.readPendingSessions.add(sessionId);
    else store.readPendingSessions.delete(sessionId);
  },
  setFilters({ showStarredOnly, showRunningOnly, showTodayOnly, showArchived }) {
    if (showStarredOnly !== undefined) store.showStarredOnly = showStarredOnly;
    if (showRunningOnly !== undefined) store.showRunningOnly = showRunningOnly;
    if (showTodayOnly !== undefined) store.showTodayOnly = showTodayOnly;
    if (showArchived !== undefined) store.showArchived = showArchived;
  },
  setSearch(matchIds, matchProjectPaths) {
    store.searchMatchIds = matchIds;
    store.searchMatchProjectPaths = matchProjectPaths;
  },
  setVisibility(count, ageDays) {
    store.visibleSessionCount = count;
    store.sessionMaxAgeDays = ageDays;
  },
  setHeaderSession(session) { store.headerSession = session; },
  setHeaderPtyTitle(title) { store.headerPtyTitle = title || null; },
  setHeaderShellProfile(profile) { store.headerShellProfile = profile || null; },
  setHeaderAccount(name) { store.headerAccount = name || null; },
  clearHeader() {
    store.headerSession = null;
    store.headerPtyTitle = null;
    store.headerShellProfile = null;
    store.headerAccount = null;
  },
};

// Factory for mounting ViewerContentApp into a plain DOM container (used by file-panel.js)
window.createViewerPanel = function(container, opts = {}) {
  const app = createApp(ViewerContentApp, {
    language: opts.language || 'markdown',
    storageKey: opts.storageKey,
    showCopyPath: !!opts.copyPath,
    showCopyContent: !!opts.copyContent,
    onSave: opts.onSave || null,
    onClose: opts.onClose || null,
  });
  const instance = app.mount(container);
  return {
    open: (...args) => instance.open(...args),
    destroy: () => instance.destroy(),
    getContent: () => instance.getContent(),
  };
};

// The transcript of one SDK-backed session, mounted into a grid card.
//
// grid-view.js builds the grid imperatively out of plain DOM, so the card is
// handed a container and gets back the way to take it down again — the same
// shape createViewerPanel above uses for the file viewer.
window.createSdkGridCard = function(container, sessionId) {
  const app = createApp(SdkGridCard, { sessionId });
  app.mount(container);
  return { destroy: () => app.unmount() };
};

// Stubs for component bridge APIs — App.vue onMounted fills these in
window.vuePlans = {};
window.vueAccounts = {};
window.vueProjects = {};
window.vuePlanViewer = {};
window.vueStatusBar = {};
window.vueAccountDropdown = {};
window.vueGrid = {};
window.vueDialogs = {};

// Mount the single root app (synchronous — all onMounted hooks run before returning)
createApp(App).mount('#app-container');
