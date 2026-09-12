const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * Register an IPC listener and hand back the way to remove it.
 *
 * The `_event` argument is dropped rather than forwarded: it carries a
 * `sender` the renderer has no business holding, and every caller here only
 * ever wanted the payload.
 *
 * @param {string} channel
 * @param {(...args: unknown[]) => void} callback
 * @returns {() => void} unsubscribe — safe to call more than once
 */
function subscribe(channel, callback) {
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('api', {
  // Invoke (request-response)
  getPlans: () => ipcRenderer.invoke('get-plans'),
  getPlansDir: () => ipcRenderer.invoke('get-plans-dir'),
  readPlan: (filename) => ipcRenderer.invoke('read-plan', filename),
  savePlan: (filePath, content) => ipcRenderer.invoke('save-plan', filePath, content),
  refreshStats: () => ipcRenderer.invoke('refresh-stats'),
  getMemories: () => ipcRenderer.invoke('get-memories'),
  // `{ visible, all }` — the archive-filtered tree and the unfiltered one, from
  // one pass over the cache. Both are needed on every refresh and neither can be
  // derived from the other here; see buildProjectSets in session-cache.js.
  getProjectSets: () => ipcRenderer.invoke('get-project-sets'),
  getActiveSessions: () => ipcRenderer.invoke('get-active-sessions'),
  getSessionStatuses: () => ipcRenderer.invoke('get-session-statuses'),
  getActiveTerminals: () => ipcRenderer.invoke('get-active-terminals'),
  stopSession: (id) => ipcRenderer.invoke('stop-session', id),
  toggleStar: (id) => ipcRenderer.invoke('toggle-star', id),
  renameSession: (id, name) => ipcRenderer.invoke('rename-session', id, name),
  archiveSession: (id, archived) => ipcRenderer.invoke('archive-session', id, archived),
  // Deletes the .jsonl as well as the cache rows. Unrecoverable — the caller
  // confirms first.
  deleteSession: (id, projectPath) => ipcRenderer.invoke('delete-session', id, projectPath),
  // Aggregated facts about one session, read from its transcript on demand.
  getSessionMeta: (id) => ipcRenderer.invoke('get-session-meta', id),
  openTerminal: (id, projectPath, isNew, sessionOptions) => ipcRenderer.invoke('open-terminal', id, projectPath, isNew, sessionOptions),
  search: (type, query, titleOnly) => ipcRenderer.invoke('search', type, query, titleOnly),
  readSessionJsonl: (sessionId) => ipcRenderer.invoke('read-session-jsonl', sessionId),
  // One window of a transcript, newest first. `before` pages upward; a window
  // never spans a `/compact` boundary — see transcript-window.js.
  readSessionTranscript: (sessionId, opts) => ipcRenderer.invoke('read-session-transcript', sessionId, opts),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  deleteSetting: (key) => ipcRenderer.invoke('delete-setting', key),

  // Multi-account
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  saveAccounts: (accounts) => ipcRenderer.invoke('save-accounts', accounts),
  createAccount: (name) => ipcRenderer.invoke('create-account', name),
  discoverWslClaudeHomes: () => ipcRenderer.invoke('discover-wsl-claude-homes'),
  createWslAccount: (distro, name) => ipcRenderer.invoke('create-wsl-account', distro, name),
  renameAccount: (id, name) => ipcRenderer.invoke('rename-account', id, name),
  deleteAccount: (id) => ipcRenderer.invoke('delete-account', id),
  getActiveAccountId: () => ipcRenderer.invoke('get-active-account-id'),
  setActiveAccountId: (id) => ipcRenderer.invoke('set-active-account-id', id),
  getAccountsUsage: () => ipcRenderer.invoke('get-accounts-usage'),
  // Account detail panel. readAccountConfigFile only reaches an allowlisted
  // file inside that account's own configDir — it is not a general file read.
  getAccountDetail: (id) => ipcRenderer.invoke('get-account-detail', id),
  readAccountConfigFile: (id, name) => ipcRenderer.invoke('read-account-config-file', id, name),
  checkAccountAuth: (id) => ipcRenderer.invoke('check-account-auth', id),
  getAccountStats: (id) => ipcRenderer.invoke('get-account-stats', id),
  getHomedir: () => ipcRenderer.invoke('get-homedir'),
  getEffectiveSettings: (projectPath) => ipcRenderer.invoke('get-effective-settings', projectPath),
  getScheduleCreatorCommand: () => ipcRenderer.invoke('get-schedule-creator-command'),
  createScheduleSession: (projectPath) => ipcRenderer.invoke('create-schedule-session', projectPath),
  runScheduleNow: (filePath) => ipcRenderer.invoke('run-schedule-now', filePath),
  getShellProfiles: () => ipcRenderer.invoke('get-shell-profiles'),

  browseFolder: () => ipcRenderer.invoke('browse-folder'),
  addProject: (projectPath) => ipcRenderer.invoke('add-project', projectPath),
  removeProject: (projectPath) => ipcRenderer.invoke('remove-project', projectPath),
  // `{ force: true }` overrides every polling interval — see project-polling.js.
  getProjectInfo: (projectPath, opts) => ipcRenderer.invoke('get-project-info', projectPath, opts),
  getProjectDetail: (projectPath) => ipcRenderer.invoke('get-project-detail', projectPath),
  // Per-project flags: `{ hasCompose, composeCheckedAt, archived }` by path.
  getProjectMeta: () => ipcRenderer.invoke('get-project-meta'),
  setProjectArchived: (projectPath, archived) => ipcRenderer.invoke('set-project-archived', projectPath, archived),
  getProjectGitCache: (projectPath) => ipcRenderer.invoke('get-project-git-cache', projectPath),
  // Working-tree diff only — cheap enough to poll. See main.js.
  getProjectChanges: (projectPath) => ipcRenderer.invoke('get-project-changes', projectPath),
  getFileDiff: (projectPath, filePath) => ipcRenderer.invoke('get-file-diff', projectPath, filePath),
  gitBranches: (projectPath) => ipcRenderer.invoke('git-branches', projectPath),
  gitCheckout: (projectPath, branch) => ipcRenderer.invoke('git-checkout', projectPath, branch),
  gitFetch: (projectPath) => ipcRenderer.invoke('git-fetch', projectPath),
  gitPull: (projectPath) => ipcRenderer.invoke('git-pull', projectPath),
  gitCommit: (projectPath, message) => ipcRenderer.invoke('git-commit', projectPath, message),
  gitPush: (projectPath) => ipcRenderer.invoke('git-push', projectPath),
  gitCreateBranch: (projectPath, branchName, checkout) => ipcRenderer.invoke('git-create-branch', projectPath, branchName, checkout),
  getProjectAvatar: (projectPath) => ipcRenderer.invoke('get-project-avatar', projectPath),
  fetchGitlabAvatar: (projectPath, remoteUrl) => ipcRenderer.invoke('fetch-gitlab-avatar', projectPath, remoteUrl),
  gitGenerateCommitMsg: (projectPath, style) => ipcRenderer.invoke('git-generate-commit-msg', projectPath, style),
  // sessions: [{ sessionId, projectPath, title }] — whatever the board is
  // currently showing. Resolves { ok: true, summaries: [{ sessionId, summary }] }
  // or { ok: false, error }.
  // options: { detail } — one session asked for from its own menu gets the
  // whole prompt budget and a longer answer.
  boardSummarizeSessions: (sessions, options) => ipcRenderer.invoke('board-summarize-sessions', sessions, options),
  // Kills the summarize run in flight; resolves the pending call as cancelled.
  boardSummarizeAbort: () => ipcRenderer.invoke('board-summarize-abort'),
  getGitUserInfo: (projectPath) => ipcRenderer.invoke('get-git-user-info', projectPath),
  deleteWorktree: (projectPath, worktreePath) => ipcRenderer.invoke('delete-worktree', projectPath, worktreePath),
  getFileTree: (projectPath) => ipcRenderer.invoke('get-file-tree', projectPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Send (fire-and-forget)
  sendInput: (id, data) => ipcRenderer.send('terminal-input', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal-resize', id, cols, rows),
  closeTerminal: (id) => ipcRenderer.send('close-terminal', id),

  // Listeners (main → renderer)
  //
  // Every one of these returns its own unsubscribe. A component that mounts
  // once per session — SessionSdkApp is keyed by session id — would otherwise
  // leave a live listener behind on every switch, and those stale closures do
  // not go quiet: they read the session id off the shared store, so the guard
  // at the top of each handler still passes and the whole render runs again
  // for every message, once per mount the app has ever made.
  onTerminalData: (callback) => subscribe('terminal-data', callback),
  onSessionDetected: (callback) => subscribe('session-detected', callback),
  onProcessExited: (callback) => subscribe('process-exited', callback),
  onTerminalNotification: (callback) => subscribe('terminal-notification', callback),
  onSessionStatus: (callback) => subscribe('session-status', callback),
  onWindowFullscreen: (callback) => subscribe('window-fullscreen', callback),
  // SDK-backed sessions: the conversation as structured messages, where a PTY
  // session sends terminal bytes over `terminal-data`.
  onSdkMessage: (callback) => subscribe('sdk-message', callback),
  onSdkPermissionRequest: (callback) => subscribe('sdk-permission-request', callback),
  onSdkPermissionCancelled: (callback) => subscribe('sdk-permission-cancelled', callback),
  sdkPermissionResponse: (requestId, decision) => {
    ipcRenderer.send('sdk-permission-response', requestId, decision);
  },
  // An MCP server asking the user directly — a form or a sign-in link. Same
  // pause as a permission prompt, a different reply shape.
  onSdkElicitationRequest: (callback) => subscribe('sdk-elicitation-request', callback),
  sdkElicitationResponse: (requestId, decision) => {
    ipcRenderer.send('sdk-elicitation-response', requestId, decision);
  },
  // A blocking dialog the CLI asked this app to draw — today the offer to
  // retry a refused turn on the fallback model.
  onSdkDialogRequest: (callback) => subscribe('sdk-dialog-request', callback),
  sdkDialogResponse: (requestId, decision) => {
    ipcRenderer.send('sdk-dialog-response', requestId, decision);
  },
  // What this session is still stopped on, for a renderer that just reloaded.
  sdkPendingRequests: (sessionId) => ipcRenderer.invoke('sdk-pending-requests', sessionId),
  // How many sessions want something, for the dock badge — and which ones are
  // blocked, so a newly blocked one can bounce the icon. See main.js.
  reportAttention: (summary) => ipcRenderer.send('attention-summary', summary),
  sdkInterrupt: (sessionId) => ipcRenderer.invoke('sdk-interrupt', sessionId),
  sdkSetPermissionMode: (sessionId, mode) => ipcRenderer.invoke('sdk-set-permission-mode', sessionId, mode),
  sdkCommands: (sessionId) => ipcRenderer.invoke('sdk-commands', sessionId),
  sdkModels: (sessionId) => ipcRenderer.invoke('sdk-models', sessionId),
  sdkSetModel: (sessionId, model) => ipcRenderer.invoke('sdk-set-model', sessionId, model),
  sdkSetEffort: (sessionId, effort) => ipcRenderer.invoke('sdk-set-effort', sessionId, effort),
  sdkContextUsage: (sessionId) => ipcRenderer.invoke('sdk-context-usage', sessionId),
  onSessionForked: (callback) => {
    ipcRenderer.on('session-forked', (_event, oldId, newId) => callback(oldId, newId));
  },
  onProjectsChanged: (callback) => {
    ipcRenderer.on('projects-changed', () => callback());
  },
  onProjectInfoUpdated: (callback) => {
    ipcRenderer.on('project-info-updated', (_event, path, data) => callback(path, data));
  },
  onProjectInfoLoading: (callback) => {
    ipcRenderer.on('project-info-loading', (_event, path) => callback(path));
  },
  onStatusUpdate: (callback) => {
    ipcRenderer.on('status-update', (_event, text, type) => callback(text, type));
  },

  // File drag-and-drop
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // Platform
  platform: process.platform,

  // App version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Auto-updater
  updaterCheck: () => ipcRenderer.invoke('updater-check'),
  updaterDownload: () => ipcRenderer.invoke('updater-download'),
  updaterInstall: () => ipcRenderer.invoke('updater-install'),
  onUpdaterEvent: (callback) => subscribe('updater-event', callback),

  // MCP bridge (main → renderer)
  onMcpOpenDiff: (callback) => {
    ipcRenderer.on('mcp-open-diff', (_event, sessionId, diffId, data) => callback(sessionId, diffId, data));
  },
  onMcpOpenFile: (callback) => {
    ipcRenderer.on('mcp-open-file', (_event, sessionId, data) => callback(sessionId, data));
  },
  onMcpCloseAllDiffs: (callback) => {
    ipcRenderer.on('mcp-close-all-diffs', (_event, sessionId) => callback(sessionId));
  },
  onMcpCloseTab: (callback) => {
    ipcRenderer.on('mcp-close-tab', (_event, sessionId, diffId) => callback(sessionId, diffId));
  },

  // MCP bridge (renderer → main)
  mcpDiffResponse: (sessionId, diffId, action, editedContent) => {
    ipcRenderer.send('mcp-diff-response', sessionId, diffId, action, editedContent);
  },
  readFileForPanel: (filePath) => ipcRenderer.invoke('read-file-for-panel', filePath),
  saveFileForPanel: (filePath, content) => ipcRenderer.invoke('save-file-for-panel', filePath, content),
  watchFile: (filePath) => ipcRenderer.invoke('watch-file', filePath),
  unwatchFile: (filePath) => ipcRenderer.invoke('unwatch-file', filePath),
  onFileChanged: (callback) => subscribe('file-changed', callback),
  onLaunchProjectSession: (callback) => {
    ipcRenderer.on('launch-project-session', (_event, projectPath, continueSession) => callback(projectPath, continueSession));
  },
});
