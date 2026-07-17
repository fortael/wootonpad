import { createApp } from 'vue';
import { store } from './store.js';
import SidebarApp from './components/SidebarApp.vue';
import SessionHeaderApp from './components/SessionHeaderApp.vue';

// --- Bridge API exposed to vanilla JS ---
window.vueSidebar = {
  store,

  mount(sidebarEl, headerEl, callbacks) {
    // Mount sessions sidebar
    const sidebarApp = createApp(SidebarApp, { callbacks });
    sidebarApp.mount(sidebarEl);

    // Mount session header
    const headerApp = createApp(SessionHeaderApp);
    headerApp.mount(headerEl);
  },

  // Called by loadProjects() / refreshSidebar()
  setProjects(projects) {
    store.projects = projects;
  },

  // Called by pollActiveSessions()
  setActivePtyIds(ids) {
    store.activePtyIds = new Set(ids);
  },

  // Called by setActiveSession()
  setActiveSession(id) {
    store.activeSessionId = id;
  },

  // Called by setActivity()
  setBusy(sessionId, busy) {
    if (busy) {
      store.sessionBusyState.set(sessionId, true);
    } else {
      store.sessionBusyState.delete(sessionId);
    }
  },

  // Called by OSC 9 handler
  addAttention(sessionId) {
    store.attentionSessions.add(sessionId);
  },

  // Called when Claude finishes responding
  setResponseReady(sessionId) {
    store.responseReadySessions.add(sessionId);
    store.sessionBusyState.delete(sessionId);
  },

  // Called when user opens a session
  clearNotifications(sessionId) {
    store.attentionSessions.delete(sessionId);
    store.responseReadySessions.delete(sessionId);
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

  // Header updates
  setHeaderSession(session) {
    store.headerSession = session;
  },

  setHeaderPtyTitle(title) {
    store.headerPtyTitle = title || null;
  },

  setHeaderShellProfile(profile) {
    store.headerShellProfile = profile || null;
  },

  setHeaderAccount(name) {
    store.headerAccount = name || null;
  },

  clearHeader() {
    store.headerSession = null;
    store.headerPtyTitle = null;
    store.headerShellProfile = null;
    store.headerAccount = null;
  },
};
