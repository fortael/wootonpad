const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell, Notification, Tray, nativeImage } = require('electron');
const { stripInheritedClaudeEnv } = require('./claude-env');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pty = require('node-pty');

if (!app.isPackaged) {
  const origUserData = app.getPath('userData');
  const devUserData = origUserData + '-dev';
  if (!fs.existsSync(devUserData) && fs.existsSync(origUserData)) {
    fs.cpSync(origUserData, devUserData, {
      recursive: true,
      filter: (src) => !/(SingletonLock|SingletonSocket|SingletonCookie)$/.test(src),
    });
  } else if (!fs.existsSync(devUserData)) {
    fs.mkdirSync(devUserData, { recursive: true });
  }
  app.setPath('userData', devUserData);
}

const log = require('electron-log');
// getFolderIndexMtimeMs moved to session-cache.js
const { startMcpServer, shutdownMcpServer, shutdownAll: shutdownAllMcp, resolvePendingDiff, rekeyMcpServer } = require('./mcp-bridge');
const { startHookServer, stopHookServer } = require('./hook-server');
const { buildHookSettings } = require('./hook-settings');
const { SessionStatusTracker } = require('./session-status');
const {
  readTranscriptWindow, readSessionLandmarks, recordIndexAtTime, forgetTranscript,
} = require('./transcript-window');
const { createDockAttention } = require('./dock-attention');
const { createSessionAlerts } = require('./session-alerts');
const trayStatus = require('./tray-status');
const {
  detectCompose, composeCheckDue, pollPlan, activeProjectPaths,
} = require('./project-polling');
const sdkSession = require('./sdk-session');
const { fetchAndTransformUsage, getOAuthToken, probeUsage } = require('./claude-auth');
const mcpInventory = require('./mcp-inventory');
const gitPushLinks = require('./git-push-links');
const gitStaging = require('./git-staging');
const { probeMcpServer } = require('./mcp-probe');
const accountNotes = require('./account-notes');
const pluginCatalog = require('./plugin-catalog');
const subagentTasks = require('./subagent-tasks');
const sessionGroups = require('./session-groups');
const wootonMcp = require('./wooton-mcp');
const chatAgent = require('./chat-agent');
const { toolPolicy, sdkToolRules } = require('./tool-policy');
const projectFiles = require('./project-files');
const dockerStatus = require('./docker-status');
log.transports.file.level = app.isPackaged ? 'info' : 'debug';
log.transports.console.level = app.isPackaged ? 'info' : 'debug';

require('./dev-reload').watchForDevReload({ app, root: __dirname, getWindow: () => mainWindow });

// Clean env for child processes — strip Electron internals that cause nested
// Electron apps (or node-pty inside them) to malfunction, and a parent Claude
// Code session's own variables, which the CLI would otherwise believe are its
// own. See claude-env.js for what that breaks.
const cleanPtyEnv = Object.fromEntries(
  Object.entries(stripInheritedClaudeEnv(process.env)).filter(([k]) =>
    !k.startsWith('ELECTRON_') &&
    !k.startsWith('GOOGLE_API_KEY') &&
    k !== 'NODE_OPTIONS' &&
    k !== 'ORIGINAL_XDG_CURRENT_DESKTOP' &&
    k !== 'WT_SESSION'
  )
);

// Shell profiles → shell-profiles.js
const {
  getShellProfiles, resolveShell, isWindows, isWslShell,
  windowsToWslPath, shellArgs,
  wslToWindowsPath, isPosixAbsolutePath, probeWslClaudeHome, discoverWslClaudeHomes, wslExecArgs,
  withWslEnv, wslDistroFromUncPath, projectJoin,
} = require('./shell-profiles');
const { startScheduler } = require('./schedule-runner');
const { encodeProjectPath } = require('./encode-project-path');



// --- Auto-updater (only in packaged builds) ---
let autoUpdater = null;
if (app.isPackaged || process.env.FORCE_UPDATER) {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;

  function sendUpdaterEvent(type, data) {
    log.info(`[updater] ${type}`, data || '');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-event', type, data);
    }
  }
  autoUpdater.on('checking-for-update', () => sendUpdaterEvent('checking'));
  autoUpdater.on('update-available', (info) => sendUpdaterEvent('update-available', info));
  autoUpdater.on('update-not-available', (info) => sendUpdaterEvent('update-not-available', info));
  autoUpdater.on('download-progress', (progress) => sendUpdaterEvent('download-progress', progress));
  autoUpdater.on('update-downloaded', (info) => sendUpdaterEvent('update-downloaded', info));
  autoUpdater.on('error', (err) => {
    log.error('[updater] Error:', err?.message || String(err));
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-event', 'error', { message: err?.message || String(err) });
    }
  });
}
const {
  getMeta, getAllMeta, toggleStar, setName, setArchived, deleteSessionMeta,
  isCachePopulated, getAllCached, getCachedByFolder, getCachedFolder, getCachedSession, upsertCachedSessions,
  deleteCachedSession, deleteCachedFolder,
  getFolderMeta, getAllFolderMeta, setFolderMeta,
  getProjectGitCache, setProjectGitCache, getAllProjectGitCounts,
  getProjectMeta, getAllProjectMeta, setProjectCompose, setProjectArchived, deleteProjectMeta,
  upsertSearchEntries, updateSearchTitle, deleteSearchSession, deleteSearchFolder, deleteSearchType,
  searchByType, isSearchIndexPopulated, searchFtsRecreated,
  getSetting, setSetting, deleteSetting,
  getStoredAvatar, setStoredAvatar,
  closeDb,
} = require('./db');

const DEFAULT_CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CLAUDE_DIR = DEFAULT_CLAUDE_DIR;
const STATS_CACHE_PATH = path.join(CLAUDE_DIR, 'stats-cache.json');
const MAX_BUFFER_SIZE = 256 * 1024;

// --- Multi-account helpers ---

const DEFAULT_ACCOUNT = { id: 'default', name: 'Default', configDir: DEFAULT_CLAUDE_DIR };

function getAccounts() {
  const stored = getSetting('accounts');
  if (!Array.isArray(stored) || stored.length === 0) return [DEFAULT_ACCOUNT];
  // Always ensure default account is present
  if (!stored.find(a => a.id === 'default')) return [DEFAULT_ACCOUNT, ...stored];
  return stored;
}

function getActiveAccount() {
  const global = getSetting('global') || {};
  const activeId = global.activeAccountId || 'default';
  return getAccounts().find(a => a.id === activeId) || DEFAULT_ACCOUNT;
}

function getProjectsDir(account) {
  return path.join(account.configDir, 'projects');
}

// Convenience: current active projects dir
function activeProjectsDir() {
  return getProjectsDir(getActiveAccount());
}

function activeConfigDir() {
  return getActiveAccount().configDir;
}

// Plans live next to the sessions they came from, so they follow the account
// rather than the Windows home.
function activePlansDir() {
  return path.join(activeConfigDir(), 'plans');
}

// A group session's working directory, and the manager chat's. Both are real
// directories holding real transcripts — the account owns them the way it owns
// its plans, so they follow it rather than the Windows home. See CLAUDE.md.
//
// Canonical, like every other project path: on a WSL account the sessions in
// it carry the POSIX form, and a UNC root would never match them.
function activeGroupsRoot() {
  return canonicalProjectPath(sessionGroups.groupsRoot(activeConfigDir()));
}

// The Chat tab's own session lives here. Hidden from the project list: it is
// not somewhere the user works, it is the app talking about itself.
function activeChatDir() {
  return path.join(activeConfigDir(), 'wooton-chat');
}

// --- WSL-backed accounts ---
// An account carrying `wslDistro` points at a Claude home living inside that
// distribution. Its project paths stay in POSIX form (that is what Claude wrote
// into the .jsonl files, and what the project folder name encodes from), so
// every Windows fs call goes through hostPath() and every command that has to
// run *in* the project goes through projectExecFile() — where its git, docker
// and toolchain actually are. On accounts without the field both are identity.

function accountWslDistro(account) {
  return (account && account.wslDistro) || null;
}

function activeWslDistro() {
  return accountWslDistro(getActiveAccount());
}

// Translate a canonical project path into one a Windows fs call can open.
// Identity on any account without a distribution, and on paths that are
// already Windows-shaped — so it is safe to wrap every fs call with it.
function accountHostPath(account, p) {
  if (!accountWslDistro(account) || !isPosixAbsolutePath(p)) return p;
  return wslToWindowsPath(p, account.wslDistro, account.wslUncPrefix);
}

// Request-scoped: the account is read per call, which is right for anything
// driven by the UI. Work that outlives the current selection — a running
// session pushing diffs at us — must bind accountHostPath to its own account
// instead, or an account switch would retarget it mid-session.
function hostPath(p) {
  return accountHostPath(getActiveAccount(), p);
}

// A Windows folder picker returns \\wsl.localhost\<distro>\… for a directory
// inside a distribution. Claude records the POSIX path and the project folder
// name is encoded from it, so that is the form the app stores.
function canonicalProjectPath(p) {
  return wslDistroFromUncPath(p) ? windowsToWslPath(p) : p;
}

// Run argv in `cwd`. For a WSL account this re-targets the call into the
// distribution instead of running it on the Windows side over the 9p share.
// `cwd` and any caller-supplied `env` are dropped when redirecting: both hold
// Windows-side values that mean nothing inside the distribution, which resolves
// the working directory via --cd and the command via the distro's own PATH.
// Returns [file, args, options] for execFile/execFileSync.
function projectExecFile(argv, cwd, options = {}) {
  const distro = activeWslDistro();
  if (!distro || !isPosixAbsolutePath(cwd)) {
    return [argv[0], argv.slice(1), { ...options, cwd }];
  }
  const { cwd: _cwd, env: _env, ...rest } = options;
  return ['wsl.exe', wslExecArgs(distro, cwd, argv), rest];
}

// Env additions a `claude` child needs to run as the *active* account rather
// than whatever ~/.claude happens to hold. Without this every headless CLI
// call authenticates as the default account, which fails outright once that
// one is signed out.
//
// WSL accounts are excluded on purpose, matching the PTY spawn: their
// configDir is the Windows view of a home that is already the default inside
// the distribution, so exporting it points the CLI at an unresolvable path.
function activeAccountClaudeEnv() {
  const account = getActiveAccount();
  if (accountWslDistro(account) || account.configDir === DEFAULT_CLAUDE_DIR) return {};
  return { CLAUDE_CONFIG_DIR: account.configDir };
}

// Build stats in the same format as stats-cache.json using WootonPad's own DB.
// This ensures all accounts see charts even before running `claude /stats`.
function computeStatsFromDb(accountId) {
  const sessions = getAllCached(accountId);
  const dailyMap = {};
  let totalMessages = 0;
  for (const s of sessions) {
    const date = (s.modified || s.created || '').slice(0, 10);
    if (!date || date < '2020-01-01') continue;
    if (!dailyMap[date]) dailyMap[date] = { date, messageCount: 0, toolCallCount: 0 };
    const mc = s.messageCount || 0;
    dailyMap[date].messageCount += mc;
    totalMessages += mc;
  }
  const dailyActivity = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  return {
    dailyActivity,
    dailyModelTokens: [],
    totalSessions: sessions.length,
    totalMessages,
    modelUsage: {},
    lastComputedDate: new Date().toISOString().slice(0, 10),
  };
}

// Active PTY sessions
const activeSessions = new Map();
let mainWindow = null;

// --- Session status ---
// Fed by Claude Code hooks (hook-server.js) and, only for sessions where no
// hook ever arrives, by the legacy OSC inference below. This replaces the
// `cli-busy-state` boolean: 'requires_action' is a third state that a boolean
// could not express, and the old channel's busy=false was ambiguous between
// "finished a turn" and "waiting for you".
const sessionStatus = new SessionStatusTracker({
  onChange: (sessionId, snapshot) => {
    sessionAlerts.onChange(sessionId, snapshot);
    scheduleTrayUpdate();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('session-status', sessionId, snapshot);
  },
});

// --- System notifications ---
// The rules are session-alerts.js's; this is Electron. "Watching" is the
// window in front showing that very session — the renderer says which one is
// on screen (visible-session).
let visibleSessionId = null;
ipcMain.on('visible-session', (_event, id) => { visibleSessionId = id || null; });

const windowFocused = () => !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused();

/** A session's name for a notification or the menu-bar list. */
function alertTitle(sessionId) {
  if (sessionId === chatAgent.storedSessionId()) return 'Buddy';
  const row = getCachedSession(sessionId);
  const meta = getMeta(sessionId);
  const title = sessionTitle({ ...(row || {}), name: meta?.name }) || 'Session';
  const flat = String(title).replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat;
}

/** Bring the window forward on a session — from a notification or the menu bar. */
function showSessionFromOutside(sessionId) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (sessionId) mainWindow.webContents.send('open-session-from-outside', sessionId);
}

// Held until closed: a Notification the garbage collector takes loses its
// click handler, and clicking it then does nothing.
const liveNotifications = new Set();

// macOS drops an app's notifications without a word when it will not trust
// its signature — the dev build's Electron is ad-hoc signed, and never even
// appears in System Settings → Notifications. Electron reports that as
// 'failed'; from then on this run goes straight to AppleScript, which the
// system does let through (under Script Editor's name, and a click on it
// cannot come back here).
// What this build calls itself to macOS. The packaged app is the appId from
// package.json; running from source it is that plus .dev, which is what
// scripts/sign-dev-electron.js writes into the bundle.
const BUNDLE_ID = 'ai.doctly.wootonpad';
const selfBundleId = () => (app.isPackaged ? BUNDLE_ID : `${BUNDLE_ID}.dev`);

// Windows puts up a toast only for an app it can name: the AppUserModelID of
// its Start-menu shortcut, which the installer sets to the appId. From source
// there is no shortcut, and the executable's path is the stand-in Electron's
// own docs use.
if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? BUNDLE_ID : process.execPath);

let nativeNotificationsRefused = false;
// What the system has done with our notifications so far: 'unknown' until one
// is sent, then 'allowed' once macOS says it showed one, or 'refused' when it
// says it will not — or takes one and shows nothing, which is what "Allow
// notifications" being off looks like from in here. Settings reads this,
// because macOS gives no way to ask outright.
let notificationState = 'unknown';

/** The alert sound, played by the app — heard whatever the banner does. */
function playAlertSound() {
  if (process.platform === 'darwin') {
    require('child_process').execFile('afplay', ['/System/Library/Sounds/Glass.aiff'], () => {});
  } else {
    shell.beep();
  }
}

function appleScriptNotification(title, body) {
  if (process.platform !== 'darwin') return Promise.resolve(false);
  const quote = (text) => `"${String(text || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const script = `display notification ${quote(body)} with title "WootonPad" subtitle ${quote(title)}`;
  return new Promise((resolve) => {
    require('child_process').execFile('osascript', ['-e', script], (err) => resolve(!err));
  });
}

/**
 * Show one notification, the app's own if the system takes it, AppleScript's
 * if not. Resolves with which way it went, for Settings → Notifications → Try
 * it.
 *
 * @returns {Promise<{ ok: boolean, via: 'native'|'applescript'|'none', error?: string }>}
 */
function showNotification({ title, body, sessionId = null, sound = false }) {
  if (sound) playAlertSound();
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => { if (!settled) { settled = true; resolve(result); } };
    const fallback = async (error) => {
      const shown = await appleScriptNotification(title, body);
      settle(shown ? { ok: true, via: 'applescript', error } : { ok: false, via: 'none', error });
    };

    if (nativeNotificationsRefused || !Notification.isSupported()) {
      fallback(nativeNotificationsRefused ? 'refused by macOS earlier this run' : 'not supported here');
      return;
    }
    const n = new Notification({ title, body, silent: true });
    liveNotifications.add(n);
    const drop = () => liveNotifications.delete(n);
    n.on('show', () => { notificationState = 'allowed'; settle({ ok: true, via: 'native' }); });
    n.on('failed', (_event, error) => {
      drop();
      nativeNotificationsRefused = true;
      notificationState = 'refused';
      log.warn(`[alerts] native notification refused: ${error}`);
      // Shown either way — even if the wait below already answered "sent".
      appleScriptNotification(title, body).then((shown) => settle(shown
        ? { ok: true, via: 'applescript', error: String(error || '') }
        : { ok: false, via: 'none', error: String(error || '') }));
    });
    n.on('click', () => { drop(); showSessionFromOutside(sessionId); });
    n.on('close', drop);
    n.show();
    // macOS answers 'show' within a few milliseconds when it puts the banner
    // up. Silence means it took the notification and dropped it — which used
    // to be reported as sent, so the sound played over nothing at all. Say
    // what happened and put it up the other way.
    setTimeout(() => {
      if (settled) return;
      log.warn('[alerts] native notification never shown — falling back');
      notificationState = 'refused';
      fallback('macOS took it and showed nothing');
    }, 2500);
  });
}

/**
 * Whether macOS is letting our notifications through, as far as we can tell.
 *
 * There is no API to ask: UNUserNotificationCenter reports its authorisation
 * status to the app that owns it, and Electron does not pass that on. So this
 * is what our own sends have shown — nothing until one goes out, which is why
 * Settings says "send one and find out" rather than guessing.
 */
ipcMain.handle('notification-permission', () => ({
  state: notificationState,
  bundleId: selfBundleId(),
}));

// Where each system keeps the switch. macOS can be sent straight to this
// app's row; Windows only to the page that lists it. Elsewhere there is no
// one place to send anyone.
const NOTIFICATION_SETTINGS_URL = {
  darwin: () => `x-apple.systempreferences:com.apple.preference.notifications?id=${selfBundleId()}`,
  win32: () => 'ms-settings:notifications',
};

/** The system's notification settings, as close to this app's row as it goes. */
ipcMain.handle('open-notification-settings', async () => {
  const url = NOTIFICATION_SETTINGS_URL[process.platform]?.();
  if (!url) return { ok: false, error: 'This system has no notification settings to open' };
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('test-notification', (_event, opts) => showNotification({
  title: 'Test — a session is waiting for you',
  body: 'This is how WootonPad tells you a session needs an answer.',
  sound: opts?.sound !== false,
}));

const sessionAlerts = createSessionAlerts({
  settings: () => getSetting('global') || {},
  isWatching: (id) => windowFocused() && visibleSessionId === id,
  titleFor: alertTitle,
  notify: ({ kind, sessionId, title, body, sound }) => {
    log.info(`[alerts] ${kind} ${sessionId}`);
    showNotification({ title, body, sessionId, sound }).then((r) => {
      if (r.via !== 'native') log.info(`[alerts] ${kind} ${sessionId} shown via ${r.via}${r.error ? ` (${r.error})` : ''}`);
    });
  },
});

// --- Menu-bar status light (macOS) ---
// tray-status.js draws the icons and reads the state; this owns the Tray.
let tray = null;
let trayImages = null;
let trayFrame = 0;
let trayAnimation = null;
let trayUpdateTimer = null;
let trayMenuKey = '';

function trayImagesOnce() {
  if (trayImages) return trayImages;
  const icons = trayStatus.drawIcons();
  const image = (buf, template) => {
    const img = nativeImage.createFromBitmap(buf, { width: icons.size, height: icons.size, scaleFactor: icons.scaleFactor });
    if (template) img.setTemplateImage(true);
    return img;
  };
  trayImages = {
    idle: image(icons.idle, true),
    waiting: image(icons.waiting, false),
    working: icons.working.map(b => image(b, true)),
  };
  return trayImages;
}

function scheduleTrayUpdate() {
  if (!tray || trayUpdateTimer) return;
  trayUpdateTimer = setTimeout(() => { trayUpdateTimer = null; updateTray(); }, 150);
}

function stopTrayAnimation() {
  clearInterval(trayAnimation);
  trayAnimation = null;
}

function updateTray() {
  if (!tray || tray.isDestroyed()) return;
  const live = liveSessionIds();
  const summary = trayStatus.summarize(sessionStatus.all(), id => live.has(id));
  const images = trayImagesOnce();

  if (summary.state === 'working') {
    if (!trayAnimation) {
      trayAnimation = setInterval(() => {
        if (!tray || tray.isDestroyed()) return stopTrayAnimation();
        trayFrame = (trayFrame + 1) % images.working.length;
        tray.setImage(images.working[trayFrame]);
      }, 110);
    }
  } else {
    stopTrayAnimation();
    tray.setImage(summary.state === 'waiting' ? images.waiting : images.idle);
  }
  tray.setTitle(trayStatus.trayTitle(summary), { fontType: 'monospacedDigit' });
  tray.setToolTip(trayStatus.trayTooltip(summary));

  // The menu only when what it lists changed — not on every spinner frame.
  const key = JSON.stringify([summary.waiting.map(s => s.sessionId), summary.working.map(s => s.sessionId)]);
  if (key === trayMenuKey) return;
  trayMenuKey = key;
  const item = (s) => ({ label: alertTitle(s.sessionId), click: () => showSessionFromOutside(s.sessionId) });
  const global = getSetting('global') || {};
  const template = [];
  if (summary.waiting.length) {
    template.push({ label: 'Waiting for you', enabled: false }, ...summary.waiting.map(item), { type: 'separator' });
  }
  if (summary.working.length) {
    template.push({ label: 'Working', enabled: false }, ...summary.working.map(item), { type: 'separator' });
  }
  if (!summary.waiting.length && !summary.working.length) {
    template.push({ label: 'Nothing running', enabled: false }, { type: 'separator' });
  }
  template.push(
    { label: 'Open WootonPad', click: () => showSessionFromOutside(null) },
    {
      label: 'Notifications',
      type: 'checkbox',
      checked: global.notifyEnabled !== false,
      click: (menuItem) => {
        setSetting('global', { ...(getSetting('global') || {}), notifyEnabled: menuItem.checked });
        trayMenuKey = '';
      },
    },
  );
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

/** Create or remove the light to match the setting. macOS only. */
function applyTraySetting() {
  if (process.platform !== 'darwin') return;
  const want = (getSetting('global') || {}).trayIcon !== false;
  if (want && !tray) {
    tray = new Tray(trayImagesOnce().idle);
    trayMenuKey = '';
    updateTray();
  } else if (!want && tray) {
    stopTrayAnimation();
    tray.destroy();
    tray = null;
  }
}

// Started on the first session that needs it rather than at app ready: a user
// who never opens a session never opens a socket.
function hookServer() {
  return startHookServer({ log, onEvent: payload => sessionStatus.apply(payload) });
}

// --- Dock badge and attention ---
// The rules live in dock-attention.js so they can be tested without Electron;
// this is only the wiring. `app.dock` is undefined off macOS, hence the `?.`.
const dock = createDockAttention({
  setBadgeCount: (n) => app.setBadgeCount(n),
  bounce: () => app.dock?.bounce('critical') ?? null,
  cancelBounce: (id) => app.dock?.cancelBounce(id),
  isFocused: () => !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused(),
  log: (message) => log.debug(message),
});

// Belt and braces with mainWindow.on('focus'): the window event is the one
// that fires when you click the bouncing icon, and this one covers coming back
// to an app whose window was never the thing that took focus.
app.on('browser-window-focus', () => dock.stopBounce());

ipcMain.on('attention-summary', (_event, summary) => dock.update(summary));

// --- SDK-backed sessions ---
// The same conversation as a PTY session, carried as structured messages
// instead of a rendered byte stream. Everything below routes by which map the
// id is in, so a session's transport stays an implementation detail of
// open-terminal and nothing downstream has to care.
// A tool call that needs a decision parks here until the renderer answers.
// The SDK is waiting on the promise, so the session is genuinely stopped — the
// same pause a terminal session shows as a prompt, only this one is a dialog.
const pendingPermissions = new Map();   // requestId → { resolve, sessionId, kind, payload }
let permissionSeq = 0;

// Answering the question un-blocks the turn, so the status has to move off
// requires_action there and then. Waiting for the next hook is not enough: an
// allow that the CLI then withdraws, or a denial it does not retry, leaves no
// hook at all and the session would sit marked as waiting on a dialog that is
// no longer on screen.
function settlePermission(requestId, decision) {
  const entry = pendingPermissions.get(requestId);
  if (!entry) return false;
  pendingPermissions.delete(requestId);
  entry.resolve(decision);
  sessionStatus.apply({
    session_id: entry.sessionId,
    hook_event_name: 'PermissionDenied',   // "decision made, carry on" → running
  });
  return true;
}

function denyPending(sessionId, reason) {
  for (const [id, entry] of [...pendingPermissions]) {
    if (entry.sessionId !== sessionId) continue;
    pendingPermissions.delete(id);
    // Three channels, three refusal shapes. An elicitation answered with a
    // permission result is not a refusal, it is a malformed reply.
    entry.resolve(ABANDONED[entry.kind] || { behavior: 'deny', message: reason });
  }
}

/** How each channel spells "nobody is going to answer this". */
const ABANDONED = {
  elicitation: { action: 'cancel' },
  dialog: { behavior: 'cancelled' },
};

/**
 * The dialogs a session is currently stopped on, for a renderer that has just
 * loaded. A reload loses the window's messages but not the CLI's patience: the
 * tool call is still parked on its promise, and without this the session would
 * sit blocked with nothing on screen to answer.
 */
ipcMain.handle('sdk-pending-requests', (_event, sessionId) =>
  [...pendingPermissions.values()]
    .filter(entry => entry.sessionId === sessionId && entry.payload)
    .map(entry => ({ ...entry.payload, kind: entry.kind })));

function askPermission(sessionId, toolName, input, options) {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve({ behavior: 'deny', message: 'WootonPad is not showing this session' });
      return;
    }
    const requestId = `perm-${++permissionSeq}`;
    const payload = {
      requestId,
      toolName,
      input,
      // Everything the CLI would offer as "don't ask again" for this tool.
      suggestions: options?.suggestions || [],
      // What the CLI itself would have shown. The SDK's own guidance is to
      // prefer these over a sentence rebuilt from the tool name — they cover
      // tools this build has never heard of, and they match the official
      // client word for word.
      title: options?.title || '',
      displayName: options?.displayName || '',
      description: options?.description || '',
      blockedPath: options?.blockedPath || '',
      decisionReason: options?.decisionReason || '',
      toolUseID: options?.toolUseID || '',
    };
    // Registered before the abort listener, which fires synchronously when the
    // signal has already been aborted — settling an entry that is not in the
    // map yet would leave the promise parked forever.
    pendingPermissions.set(requestId, { resolve, sessionId, kind: 'permission', payload });

    // The CLI can withdraw the request — a turn interrupted while the dialog
    // is up. Settle it so the promise cannot outlive the question.
    options?.signal?.addEventListener('abort', () => {
      if (!settlePermission(requestId, { behavior: 'deny', message: 'Cancelled' })) return;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sdk-permission-cancelled', sessionId, requestId);
      }
    }, { once: true });

    log.info(`[sdk] session=${sessionId} asking to use ${toolName}`);
    mainWindow.webContents.send('sdk-permission-request', sessionId, payload);
  });
}

/**
 * An MCP server asking the user for something — a form to fill in, or a link
 * to sign in through. A separate channel from tool permissions in the CLI, and
 * a separate one here, but it parks in the same map: what matters downstream is
 * that the session is stopped waiting on a person.
 */
function askElicitation(sessionId, request) {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve({ action: 'decline' });
      return;
    }
    const requestId = `elicit-${++permissionSeq}`;
    const payload = {
      requestId,
      serverName: request?.serverName || '',
      message: request?.message || '',
      mode: request?.mode || 'form',
      url: request?.url || '',
      requestedSchema: request?.requestedSchema || null,
      title: request?.title || '',
      displayName: request?.displayName || '',
      description: request?.description || '',
    };
    // Same shape of entry as a permission, so cancellation, session exit and
    // the status move on answering all work without a second code path. The
    // decision is passed through untouched — the SDK validates it, not us.
    pendingPermissions.set(requestId, { resolve, sessionId, kind: 'elicitation', payload });

    sessionStatus.apply({
      session_id: sessionId,
      hook_event_name: 'PermissionRequest',
      tool_name: `mcp:${request?.serverName || 'server'}`,
    });

    log.info(`[sdk] session=${sessionId} elicitation from ${request?.serverName} mode=${request?.mode || 'form'}`);
    mainWindow.webContents.send('sdk-elicitation-request', sessionId, payload);
  });
}

/**
 * A `request_user_dialog` the CLI asks the host to draw — today only the
 * refusal fallback, which offers to retry a declined turn on another model.
 * sdk-session.js has already filtered out kinds this build cannot render, so
 * anything arriving here is one RequestDialog knows.
 */
function askUserDialog(sessionId, request) {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve({ behavior: 'cancelled' });
      return;
    }
    const requestId = `dialog-${++permissionSeq}`;
    const payload = {
      requestId,
      dialogKind: request?.dialogKind || '',
      payload: request?.payload || {},
      toolUseID: request?.toolUseID || '',
    };
    pendingPermissions.set(requestId, { resolve, sessionId, kind: 'dialog', payload });

    sessionStatus.apply({
      session_id: sessionId,
      hook_event_name: 'PermissionRequest',
      tool_name: request?.dialogKind || 'dialog',
    });

    log.info(`[sdk] session=${sessionId} dialog ${request?.dialogKind}`);
    mainWindow.webContents.send('sdk-dialog-request', sessionId, payload);
  });
}

// --- IPC: sdk-permission-response ---
ipcMain.on('sdk-permission-response', (_event, requestId, decision) => {
  settlePermission(requestId, decision);  // no-op if already cancelled
});

// --- IPC: sdk-elicitation-response / sdk-dialog-response ---
ipcMain.on('sdk-elicitation-response', (_event, requestId, decision) => {
  settlePermission(requestId, decision);
});

ipcMain.on('sdk-dialog-response', (_event, requestId, decision) => {
  settlePermission(requestId, decision);
});

function startSdkSessionFor(sessionId, projectPath, isNew, sessionOptions) {
  return sdkSession.startSdkSession(sessionId, {
    projectPath,
    isNew,
    forkFrom: sessionOptions?.forkFrom || null,
    permissionMode: sessionOptions?.dangerouslySkipPermissions
      ? 'bypassPermissions'
      : (sessionOptions?.permissionMode || undefined),
    model: sessionOptions?.model || undefined,
    // Not a query() option: effort rides the session-scoped flag layer, so
    // sdk-session.js applies it once the session is answering.
    effort: sessionOptions?.effort || undefined,
    // A group session runs in its own folder with every project it spans
    // mounted alongside — see session-groups.js.
    additionalDirectories: sessionOptions?.additionalDirectories || undefined,
    mcpServers: sessionOptions?.mcpServers || undefined,
    systemPrompt: sessionOptions?.systemPrompt || undefined,
    allowedTools: sessionOptions?.allowedTools || undefined,
    disallowedTools: sessionOptions?.disallowedTools || undefined,
    settings: sessionOptions?.settings || undefined,
    preToolUse: sessionOptions?.preToolUse || undefined,
    // The same account resolution every other spawn path uses, so an SDK
    // session writes its transcript into the folder this account's cache
    // watches rather than the default home.
    env: activeAccountClaudeEnv(),

    // Lifecycle events arrive as callbacks here rather than over the HTTP
    // endpoint a PTY session needs, but they are the same payloads feeding the
    // same state machine — see session-status.js.
    onHook: (id, input) => sessionStatus.apply({ ...input, session_id: id }),

    // Called when the permission flow falls through to a prompt. The session
    // is blocked on this promise, so the status has to say so — otherwise the
    // sidebar shows a session that looks busy and never finishes.
    // `liveId` is the session's id now, which is not always the one it was
    // started under — see sdk-session.js. Everything downstream (the dialog in
    // the renderer, the status the sidebar and Buddy read) is keyed by it.
    canUseTool: (toolName, input, options, liveId = sessionId) => {
      sessionStatus.apply({
        session_id: liveId,
        hook_event_name: 'PermissionRequest',
        tool_name: toolName,
      });
      return askPermission(liveId, toolName, input, options);
    },

    // Same stop, different channels — see askElicitation and askUserDialog.
    onElicitation: (id, request) => askElicitation(id, request),
    onUserDialog: (id, request) => askUserDialog(id, request),

    // Only consulted when onHook is absent; kept wired so a future caller that
    // opts out of hooks still reports something.
    onState: (id, state) => {
      if (state === 'exited') {
        // A dialog whose session has gone would hang the renderer forever.
        denyPending(id, 'The session ended');
        sessionStatus.remove(id);
      }
    },

    onSessionId: (oldId, newId) => {
      sessionStatus.rekey(oldId, newId);
      sessionAlerts.rekey(oldId, newId);
      // The manager chat remembers its id across restarts; a re-key has to
      // move what it remembers, or the next launch resumes a dead id — and
      // its running spend with it, or the header's figure drops to zero.
      chatAgent.rekey(oldId, newId);
      const spend = getSetting(spendKey());
      if (spend?.sessionId === oldId) setSetting(spendKey(), { ...spend, sessionId: newId });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('session-forked', oldId, newId);
      }
    },

    onMessage: (id, message) => {
      if (message?.type === 'result') recordManagerSpend(id, message);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sdk-message', id, message);
      }
    },

    onStderr: (id, data) => log.debug(`[sdk] session=${id} stderr: ${String(data).trim().slice(0, 300)}`),
  });
}

// --- Single-instance: parse --project <path> from argv ---
function parseProjectArg(argv) {
  const idx = argv.indexOf('--project');
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  return null;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const projectPath = parseProjectArg(argv);
    if (projectPath) mainWindow.webContents.send('launch-project-session', projectPath);
  });
}

// --- URL scheme IPC for external launchers ---
// macOS routes wootonpad:// URLs to the running app via Apple Events — no
// server, no polling, zero overhead. The OS resolves the handler from its
// Launch Services registry and delivers the URL whether the app is open or not.
//
// New session:      open wootonpad://{dir}
// Continue latest:  open wootonpad://+{dir}
//
// Events may arrive before the window is ready — queue them and flush after
// did-finish-load.
const pendingOpenPaths = [];

// In dev, Electron is the "default app" so we pass the script path explicitly.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('wootonpad', process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient('wootonpad');
}

function dispatchProjectOpen(filePath, continueSession) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send('launch-project-session', filePath, continueSession);
  } else {
    pendingOpenPaths.push({ filePath, continueSession });
  }
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  // wootonpad://+/path/to/project  →  continue last session
  // wootonpad:///path/to/project   →  new session
  const continueSession = url.startsWith('wootonpad://+');
  const prefix = continueSession ? 'wootonpad://+' : 'wootonpad://';
  const filePath = decodeURIComponent(url.slice(prefix.length));
  if (filePath) dispatchProjectOpen(filePath, continueSession);
});

function createWindow() {
  // Restore saved window bounds
  const savedBounds = getSetting('global')?.windowBounds;
  let bounds = { width: 1400, height: 900 };

  let restorePosition = null;
  if (savedBounds && savedBounds.width && savedBounds.height) {
    bounds.width = savedBounds.width;
    bounds.height = savedBounds.height;

    // Only restore position if it's on a visible display
    if (savedBounds.x != null && savedBounds.y != null) {
      const displays = screen.getAllDisplays();
      const onScreen = displays.some(d => {
        const b = d.bounds;
        return savedBounds.x >= b.x - 100 && savedBounds.x < b.x + b.width &&
               savedBounds.y >= b.y - 100 && savedBounds.y < b.y + b.height;
      });
      if (onScreen) {
        restorePosition = { x: savedBounds.x, y: savedBounds.y };
      }
    }
  }

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 800,
    minHeight: 500,
    title: 'Wooton Pad',
    icon: path.join(__dirname, 'build', 'icon.png'),
    // macOS: drop the title bar and let the top nav run to the window's edge,
    // keeping the traffic lights inset over it. css/shell.css reserves room
    // for them and marks the bar draggable, which the OS chrome used to do.
    // Left alone elsewhere: Windows and Linux have no equivalent inset, and a
    // frameless window there means reimplementing minimise/maximise/close.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Set position after creation to prevent macOS from clamping size
  if (restorePosition) {
    mainWindow.setBounds({ ...restorePosition, width: bounds.width, height: bounds.height });
  }

  // macOS hides the traffic lights in full screen, so the gap css/shell.css
  // reserves for them has to go with them.
  const sendFullscreen = (on) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-fullscreen', on);
    }
  };
  mainWindow.on('enter-full-screen', () => sendFullscreen(true));
  mainWindow.on('leave-full-screen', () => sendFullscreen(false));

  // Coming to the front is the answer to a bouncing dock icon, whether or not
  // the session that caused it has been dealt with yet. The badge stays.
  mainWindow.on('focus', () => dock.stopBounce());

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  // Open external links in the system browser instead of a child BrowserWindow
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    }
  });
  // Override window.open so xterm WebLinksAddon's default handler (which does
  // window.open() then sets location.href) routes through our IPC instead of
  // creating a child BrowserWindow.
  mainWindow.webContents.on('did-finish-load', () => {
    // A fresh document owns no scratch shells. Anything ephemeral still running
    // belongs to the document that was just replaced, whose panes never got to
    // run their own teardown — reap it here rather than leaving it to the next
    // pane that happens to open on that slot.
    for (const [, s] of activeSessions) {
      if (s.isEphemeral && !s.exited) {
        try { s.pty.kill(); } catch {}
      }
    }

    const startupProject = parseProjectArg(process.argv);
    if (startupProject) mainWindow.webContents.send('launch-project-session', startupProject);
    for (const { filePath, continueSession } of pendingOpenPaths.splice(0)) {
      mainWindow.webContents.send('launch-project-session', filePath, continueSession);
    }

    mainWindow.webContents.executeJavaScript(`
      window.open = function(url) {
        if (url && /^https?:\\/\\//i.test(url)) { window.api.openExternal(url); return null; }
        const proxy = {};
        Object.defineProperty(proxy, 'location', { get() {
          const loc = {};
          Object.defineProperty(loc, 'href', {
            set(u) { if (/^https?:\\/\\//i.test(u)) window.api.openExternal(u); }
          });
          return loc;
        }});
        return proxy;
      };
      void 0;
    `);
  });

  // Prevent Cmd+R / Ctrl+Shift+R from reloading the page (Chromium built-in).
  // Ctrl+R alone on macOS is NOT a reload shortcut and must pass through to xterm
  // for reverse-i-search.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'r' && input.meta) event.preventDefault();
    if (key === 'r' && input.control && input.shift) event.preventDefault();
  });

  // Save window bounds on move/resize (debounced)
  let boundsTimer = null;
  const saveBounds = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
      const b = mainWindow.getBounds();
      const global = getSetting('global') || {};
      global.windowBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      setSetting('global', global);
    }, 500);
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  // Also save immediately before close (debounce may not have flushed)
  mainWindow.on('close', () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    if (!mainWindow.isMinimized()) {
      const b = mainWindow.getBounds();
      const global = getSetting('global') || {};
      global.windowBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      setSetting('global', global);
    }
  });

  mainWindow.on('closed', () => {
    // On macOS the app stays alive in the dock after the last window closes.
    // Kill all running PTY processes so orphaned `claude` processes don't
    // accumulate in the background with no way for the user to interact.
    for (const [id, session] of activeSessions) {
      if (!session.exited) {
        try { session.pty.kill(); } catch {}
      }
      activeSessions.delete(id);
    }
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Session cache helpers ---

const { deriveProjectPath } = require('./derive-project-path');

// Session cache → session-cache.js
const sessionCache = require('./session-cache');

function initSessionCache() {
  const account = getActiveAccount();
  sessionCache.init({
    PROJECTS_DIR: getProjectsDir(account),
    accountId: account.id,
    activeSessions,
    getMainWindow: () => mainWindow,
    log,
    // Group directories are folded into one "Grouped sessions" entry rather
    // than listed one per group, and the manager chat's own home is not listed
    // at all — see session-groups.js.
    getGroupsRoot: () => activeGroupsRoot(),
    groupHostPath: (p) => accountHostPath(account, p),
    // Both spellings: a WSL account's transcripts may carry the POSIX one.
    getInternalPaths: () => [...new Set([activeChatDir(), canonicalProjectPath(activeChatDir())])],
    db: {
      deleteCachedFolder, getCachedByFolder, upsertCachedSessions, deleteCachedSession,
      deleteSearchFolder, deleteSearchSession, upsertSearchEntries,
      setFolderMeta, getFolderMeta, getAllFolderMeta, getAllMeta, getAllCached, getSetting, getMeta, setName, getAllProjectGitCounts,
    },
  });
}

initSessionCache();
const { readSessionFile, readFolderFromFilesystem, refreshFolder, populateCacheFromFilesystem,
        buildProjectSets, notifyRendererProjectsChanged, populateCacheViaWorker } = sessionCache;


// --- IPC: browse-folder ---
ipcMain.handle('browse-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Project Folder',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// --- IPC: add-project ---
ipcMain.handle('add-project', (_event, rawProjectPath) => {
  const projectPath = canonicalProjectPath(rawProjectPath);
  // A folder picked inside a distribution only belongs to that distribution's
  // account: its Claude home is the one that would record the sessions. Say so,
  // rather than failing later on a path this account cannot resolve.
  const pickedDistro = wslDistroFromUncPath(rawProjectPath);
  const account = getActiveAccount();
  if (pickedDistro && accountWslDistro(account) !== pickedDistro) {
    return { error: `That folder is inside WSL (${pickedDistro}). Switch to the "${pickedDistro}" account to add it.` };
  }
  if (!pickedDistro && isPosixAbsolutePath(projectPath) && !accountWslDistro(account) && isWindows) {
    return { error: `Cannot add "${projectPath}" from a Windows account — switch to the WSL account that owns it.` };
  }
  try {
    // Validate the path exists and is a directory
    const stat = fs.statSync(hostPath(projectPath));
    if (!stat.isDirectory()) return { error: 'Path is not a directory' };

    // Unhide if previously hidden
    const global = getSetting('global') || {};
    if (global.hiddenProjects && global.hiddenProjects.includes(projectPath)) {
      global.hiddenProjects = global.hiddenProjects.filter(p => p !== projectPath);
      setSetting('global', global);
    }

    // Create the corresponding folder in ~/.claude/projects/ so it persists
    const folder = encodeProjectPath(projectPath);
    const folderPath = path.join(activeProjectsDir(), folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // The folder name is the project path with every non-alphanumeric
    // character flattened to a dash, so reading it back is guesswork —
    // derive-project-path.js resolves it against the disk, but here we simply
    // know the answer. Recording it means the project resolves from its first
    // render, before anything has been written inside it.
    setFolderMeta(folder, projectPath, 0);

    // Deliberately no starter transcript. A project is a place work happens,
    // not a transcript: it has to be able to exist with none, and seeding a
    // fake "New project" session to make it visible was the app lying to
    // itself. buildProjectsFromCache() lists empty project directories on
    // their own.
    refreshFolder(folder);

    notifyRendererProjectsChanged();
    // Kick off du -sk once on add; subsequent refreshes use the long random TTL
    cacheProjectSize(projectPath);

    return { ok: true, folder, projectPath };
  } catch (err) {
    return { error: err.message };
  }
});

// --- IPC: remove-project ---
ipcMain.handle('remove-project', (_event, projectPath) => {
  try {
    // Add to hidden projects list
    const global = getSetting('global') || {};
    const hidden = global.hiddenProjects || [];
    if (!hidden.includes(projectPath)) hidden.push(projectPath);
    global.hiddenProjects = hidden;
    setSetting('global', global);

    // Clean up DB cache and search index for this folder
    const folder = encodeProjectPath(projectPath);
    deleteCachedFolder(folder);
    deleteSearchFolder(folder);
    deleteSetting('project:' + projectPath);
    deleteProjectMeta(projectPath);

    notifyRendererProjectsChanged();
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});

// --- IPC: get-project-info (git branch/diff + docker compose, cached per TTL) ---
//
// The intervals themselves, and the rules for which project gets which, are in
// project-polling.js so they can be tested without an Electron app, a git
// repository or a Docker daemon. Read that file first; this one only carries
// them out.
// du -sk is expensive; cache with a random long TTL so projects don't all expire at once
const SIZE_TTL_OPTIONS_MS = [3 * 3600000, 20 * 3600000, 24 * 3600000];

// Docker Desktop on macOS puts its CLI where a GUI app's PATH does not reach.
// Elsewhere the inherited environment already finds it — and on Windows the
// separator is `;` and the variable is spelled `Path`, so appending
// `:/usr/local/bin` there would only break the last entry of the real one.
const DOCKER_ENV = process.platform === 'win32'
  ? process.env
  : {
    ...process.env,
    PATH: [process.env.PATH, '/usr/local/bin', '/opt/homebrew/bin', '/Applications/Docker.app/Contents/Resources/bin']
      .filter(Boolean).join(path.delimiter),
  };

// Which projects are being worked in right now — a PTY session or an SDK one
// counts the same. Their numbers are the only ones that are moving, so they
// are the only ones worth a short interval.
function liveSessionProjectPaths() {
  const paths = [];
  for (const [, session] of activeSessions) {
    if (session?.projectPath) paths.push(session.projectPath);
  }
  try { paths.push(...sdkSession.activeSdkProjectPaths()); } catch {}
  return paths;
}

function isProjectActive(projectPath) {
  return liveSessionProjectPaths().includes(projectPath);
}

/**
 * Look for a compose file and record the answer, so `docker compose ps` is
 * never again run for a project that cannot have containers. Cheap — a handful
 * of existsSync calls — and re-run on open, on refresh and once a day.
 */
function refreshComposeFlag(projectPath) {
  try {
    const found = detectCompose(projectPath, {
      exists: (p) => { try { return fs.existsSync(hostPath(p)); } catch { return false; } },
      join: (...parts) => projectJoin(...parts),
      dirname: (p) => (isPosixAbsolutePath(p) ? path.posix.dirname(p) : path.dirname(p)),
      stopAt: os.homedir(),
    });
    setProjectCompose(projectPath, found);
    return found;
  } catch {
    return null;
  }
}

function parseComposePs(dockerOut) {
  return dockerOut.split('\n').filter(Boolean).map(line => {
    try {
      const c = JSON.parse(line);
      return { name: c.Service || c.Name, state: (c.State || '').toLowerCase(), status: c.Status || '' };
    } catch { return null; }
  }).filter(Boolean);
}

/**
 * @param {string} projectPath
 * @param {{git: boolean, docker: boolean}} plan  which halves to actually run
 * @param {object|null} previous  the last answer, for the half being skipped
 */
function fetchProjectInfo(projectPath, plan = { git: true, docker: true }, previous = null) {
  const { execFile } = require('child_process');
  // argv form: for a WSL account these run inside the distribution, where the
  // project's git and docker live, instead of over the 9p share.
  const run = (argv, opts = {}) => new Promise((resolve) => {
    const [file, args, options] = projectExecFile(argv, projectPath, { encoding: 'utf8', timeout: 10000, ...opts });
    execFile(file, args, options, (err, stdout) => {
      resolve(err ? null : (stdout || '').trim());
    });
  });
  const skip = Promise.resolve(null);
  const data = { branch: null, added: null, deleted: null, containers: null };
  return Promise.all([
    plan.git ? run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 5000 }) : skip,
    plan.git ? run(['git', 'diff', '--shortstat', 'HEAD'], { timeout: 5000 }) : skip,
    plan.docker ? run(['docker', 'compose', 'ps', '--format', 'json'], {
      timeout: 8000,
      env: DOCKER_ENV,
    }) : skip,
  ]).then(([branch, stat, dockerOut]) => {
    if (plan.git) {
      if (branch) data.branch = branch;
      if (stat) {
        const addM = stat.match(/(\d+) insertion/);
        const delM = stat.match(/(\d+) deletion/);
        if (addM) data.added = parseInt(addM[1]);
        if (delM) data.deleted = parseInt(delM[1]);
      }
    } else {
      // A half that was not run keeps what it last said, rather than blanking
      // the row it is drawn in.
      data.branch = previous?.branch ?? null;
      data.added = previous?.added ?? null;
      data.deleted = previous?.deleted ?? null;
    }
    if (plan.docker) {
      if (dockerOut) data.containers = parseComposePs(dockerOut);
      // A project with a compose file that answers with containers settles the
      // question even if the file lives somewhere the walk did not look.
      if (data.containers?.length) {
        try { setProjectCompose(projectPath, true); } catch {}
      }
    } else {
      data.containers = previous?.containers ?? null;
    }
    data.fetchedAt = Date.now();
    data.gitFetchedAt = plan.git ? data.fetchedAt : (previous?.gitFetchedAt ?? null);
    data.dockerFetchedAt = plan.docker ? data.fetchedAt : (previous?.dockerFetchedAt ?? null);
    return data;
  });
}

// du -sk: only run on add-project and when the long-TTL size cache expires
function fetchProjectSize(projectPath) {
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    const [file, args, options] = projectExecFile(['du', '-sk', '.'], projectPath, { encoding: 'utf8', timeout: 15000 });
    execFile(file, args, options, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const kb = parseInt((stdout || '').split(/\s+/)[0]);
      resolve(isNaN(kb) ? null : Math.round(kb / 1024));
    });
  });
}

function cacheProjectSize(projectPath) {
  fetchProjectSize(projectPath).then(sizeMb => {
    if (sizeMb === null) return;
    const ttl = SIZE_TTL_OPTIONS_MS[Math.floor(Math.random() * SIZE_TTL_OPTIONS_MS.length)];
    setSetting('project-size:' + projectPath, { sizeMb, fetchedAt: Date.now(), ttl });
  }).catch(() => {});
}

/**
 * Bring one project's info up to date, if anything about it is due.
 *
 * Returns the cached answer synchronously and refreshes behind it — the list
 * draws immediately and corrects itself. `force` is an explicit refresh: it
 * overrides every interval, and is the only thing that reaches an archived
 * project.
 */
// One fetch per project at a time. The tick, the list and an explicit refresh
// all land on the same handler, and a second fetch started while the first is
// still running does the same work twice and reports out of order.
const projectInfoInFlight = new Set();

function refreshProjectInfo(projectPath, { force = false } = {}) {
  const cacheKey = 'project-info:' + projectPath;
  const cached = getSetting(cacheKey);
  const previous = cached?.data ?? null;

  let meta = null;
  try { meta = getProjectMeta(projectPath); } catch {}
  const hasCompose = (force || composeCheckDue(meta))
    ? refreshComposeFlag(projectPath)
    : meta.hasCompose;

  const plan = pollPlan({
    active: isProjectActive(projectPath),
    archived: !!meta?.archived,
    hasCompose,
    // Old cache entries predate the split and carry only `fetchedAt`.
    gitFetchedAt: previous?.gitFetchedAt ?? cached?.fetchedAt ?? null,
    dockerFetchedAt: previous?.dockerFetchedAt ?? cached?.fetchedAt ?? null,
    force,
  });

  if (!plan.git && !plan.docker) return previous;
  if (projectInfoInFlight.has(projectPath)) return previous;

  projectInfoInFlight.add(projectPath);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('project-info-loading', projectPath);
  }
  const sizeMb = previous?.sizeMb ?? getSetting('project-size:' + projectPath)?.sizeMb ?? null;
  fetchProjectInfo(projectPath, plan, previous).then(data => {
    const merged = sizeMb !== null ? { ...data, sizeMb } : data;
    setSetting(cacheKey, { data: merged, fetchedAt: Date.now() });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project-info-updated', projectPath, merged);
    }
  }).catch(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project-info-updated', projectPath, null);
    }
  }).finally(() => {
    projectInfoInFlight.delete(projectPath);
  });
  return previous;
}

ipcMain.handle('get-project-info', (_event, projectPath, opts) => {
  if (!projectPath || !fs.existsSync(hostPath(projectPath))) return null;
  const cachedSize = getSetting('project-size:' + projectPath);
  const sizeFresh = cachedSize && cachedSize.fetchedAt && (Date.now() - cachedSize.fetchedAt) < (cachedSize.ttl || SIZE_TTL_OPTIONS_MS[0]);
  const sizeMb = cachedSize?.sizeMb ?? null;

  const base = refreshProjectInfo(projectPath, { force: !!opts?.force });

  // Refresh size in background if its long-TTL has expired
  if (!sizeFresh) cacheProjectSize(projectPath);

  return base && sizeMb !== null ? { ...base, sizeMb } : base;
});

// --- Activity-driven polling ---
//
// Only projects with a live session, and only what their own intervals say is
// due. Deliberately not a sweep over every project: that is a separate feature
// with a separate cost, and doing it here by accident is what this whole file
// change exists to stop.
// Deliberately shorter than the shortest interval in project-polling.js. A tick
// that runs exactly as often as the TTL it checks is a race: a tick landing a
// millisecond early finds nothing due and the next one is a whole period away,
// so a 20 s interval polled every 20 s refreshes every 40 s. Measured, before
// this was halved: one refresh in a 70 s window where three were due. The tick
// itself is a Map scan and a subtraction, so running it spare costs nothing.
const ACTIVE_POLL_MS = 10 * 1000;
let activePollTimer = null;

function pollActiveProjects() {
  let metaByPath = new Map();
  try { metaByPath = getAllProjectMeta(); } catch {}
  for (const projectPath of activeProjectPaths(liveSessionProjectPaths(), metaByPath)) {
    try {
      if (!fs.existsSync(hostPath(projectPath))) continue;
      refreshProjectInfo(projectPath);
    } catch {}
  }
}

function startActiveProjectPolling() {
  if (activePollTimer) clearInterval(activePollTimer);
  activePollTimer = setInterval(pollActiveProjects, ACTIVE_POLL_MS);
}

// --- IPC: project archiving ---
//
// An archived project folds away in the list and is not polled at all. The
// data it already has stays in the cache, so opening it still draws something
// while the forced refresh runs.
ipcMain.handle('set-project-archived', (_event, projectPath, archived) => {
  try {
    setProjectArchived(projectPath, !!archived);
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('get-project-meta', () => {
  try {
    return Object.fromEntries(getAllProjectMeta());
  } catch {
    return {};
  }
});

// --- IPC: get-project-detail (full git log + docker details, no cache) ---
ipcMain.handle('get-project-detail', (_event, projectPath) => {
  if (!projectPath || !fs.existsSync(hostPath(projectPath))) return null;
  const { execFileSync } = require('child_process');
  // argv form so the project path never goes through shell quoting, and so a
  // WSL account runs these where the repository actually lives.
  const sh = (argv, opts = {}) => {
    const [file, args, options] = projectExecFile(argv, projectPath, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts,
    });
    return execFileSync(file, args, options).trim();
  };
  const detail = { branch: null, upstream: null, remoteUrl: null, tags: [], worktreePaths: [], commits: [], unpushedCommits: [], changedFiles: [], untrackedFiles: [], totalAdded: 0, totalDeleted: 0, containers: [], readmePath: null };
  for (const name of ['README.md', 'readme.md', 'Readme.md', 'README.rst', 'README']) {
    const fp = projectJoin(projectPath, name);
    if (fs.existsSync(hostPath(fp))) { detail.readmePath = fp; break; }
  }
  try {
    detail.branch = sh(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 5000 });
    const log = sh(['git', 'log', '--format=%h\x1f%s\x1f%an\x1f%ar', '-15'], { timeout: 5000 });
    if (log) {
      detail.commits = log.split('\n').filter(Boolean).map(line => {
        const [hash, message, author, date] = line.split('\x1f');
        return { hash, message, author, date };
      });
    }
    // The upstream first, and on its own. It used to be read *after* the
    // unpushed log inside the same try, so when that log threw it took the
    // upstream and the remote URL down with it.
    try {
      detail.upstream = sh(['git', 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { timeout: 3000 });
      const remoteName = detail.upstream.split('/')[0];
      try {
        detail.remoteUrl = sh(['git', 'remote', 'get-url', remoteName], { timeout: 3000 });
      } catch {}
    } catch {} // no upstream configured for this branch

    // What is here and is not on the remote.
    //
    // `@{u}..HEAD` is the precise question and was the only one asked — but it
    // fails outright on a branch with no upstream, which is every branch
    // before its first push. The page then reported zero unpushed commits for
    // a branch on which every commit was unpushed.
    //
    // Without an upstream the honest answer is everything no remote branch can
    // reach, which is what `git push -u` would send. Only when there is a
    // remote to compare against, though: in a repository with none, that range
    // is the entire history, and "you have 4000 commits to push" is not an
    // answer to anything.
    let unpushedRange = null;
    if (detail.upstream) {
      unpushedRange = ['@{u}..HEAD'];
    } else {
      try {
        if (sh(['git', 'remote'], { timeout: 3000 })) unpushedRange = ['HEAD', '--not', '--remotes'];
      } catch {}
    }
    if (unpushedRange) {
      try {
        const unpushed = sh(['git', 'log', '--format=%h\x1f%s\x1f%an\x1f%ar', ...unpushedRange], { timeout: 5000 });
        if (unpushed) {
          detail.unpushedCommits = unpushed.split('\n').filter(Boolean).map(line => {
            const [hash, message, author, date] = line.split('\x1f');
            return { hash, message, author, date };
          });
        }
      } catch {}
    }
    // Always try origin as fallback even without upstream
    if (!detail.remoteUrl) {
      try {
        detail.remoteUrl = sh(['git', 'remote', 'get-url', 'origin'], { timeout: 3000 });
      } catch {}
    }
    try {
      const tagsRaw = sh(['git', 'tag', '--sort=-version:refname'], { timeout: 3000 });
      detail.tags = tagsRaw ? tagsRaw.split('\n').filter(Boolean).slice(0, 20) : [];
    } catch { detail.tags = []; }
    try {
      const wtRaw = sh(['git', 'worktree', 'list', '--porcelain'], { timeout: 3000 });
      // Each worktree block is separated by blank line; first entry is the main worktree
      detail.worktreePaths = wtRaw.split('\n\n').slice(1).map(block => {
        const match = block.match(/^worktree (.+)/m);
        return match ? match[1].trim() : null;
      }).filter(Boolean);
    } catch { detail.worktreePaths = []; }
    // What a commit from here will deliberately leave behind. The list below
    // is `git diff HEAD` — tracked changes — and a commit stages exactly that,
    // so untracked files are not in either. Counted rather than silently
    // dropped: a new file you meant to commit should not go missing quietly.
    try {
      const others = sh(['git', ...gitStaging.untrackedArgv()], { timeout: 5000 });
      detail.untrackedFiles = others ? others.split('\n').filter(Boolean).slice(0, 200) : [];
    } catch { detail.untrackedFiles = []; }
    const numstat = sh(['git', 'diff', '--numstat', 'HEAD'], { timeout: 5000 });
    if (numstat) {
      detail.changedFiles = numstat.split('\n').filter(Boolean).map(line => {
        const [added, deleted, file] = line.split('\t');
        const a = parseInt(added) || 0;
        const d = parseInt(deleted) || 0;
        detail.totalAdded += a;
        detail.totalDeleted += d;
        return { file, added: a, deleted: d };
      }).sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted));
    }
  } catch {}
  // Opening a project, and the Refresh button, are where the compose flag is
  // (re)established — this is the one call that always runs in full, so it is
  // the honest place to answer the question the polling then relies on.
  const hasCompose = refreshComposeFlag(projectPath);
  if (hasCompose !== false) {
    try {
      const raw = sh(['docker', 'compose', 'ps', '--format', 'json'], {
        timeout: 8000,
        env: DOCKER_ENV,
      });
      if (raw) {
        detail.containers = raw.split('\n').filter(Boolean).map(line => {
          try {
            const c = JSON.parse(line);
            const ports = (c.Publishers || []).map(p => `${p.PublishedPort}→${p.TargetPort}/${p.Protocol}`).filter(p => !p.startsWith('0→')).join(', ');
            return { name: c.Service || c.Name, state: (c.State || '').toLowerCase(), status: c.Status || '', ports };
          } catch { return null; }
        }).filter(Boolean);
      }
      // Containers where the walk found no file: believe the daemon, not us.
      if (detail.containers.length && hasCompose !== true) {
        try { setProjectCompose(projectPath, true); } catch {}
      }
    } catch {}
  }
  try {
    setProjectGitCache(projectPath, detail);
    notifyRendererProjectsChanged();
  } catch {}
  return detail;
});

// --- IPC: get-project-changes ---
// Just the working tree, for polling. `get-project-detail` above answers the
// same question, but it also runs the log, tags, worktrees and
// `docker compose ps` (an 8s timeout), and it broadcasts projects-changed,
// which re-renders the whole sidebar. That is fine once when a panel opens and
// far too much every fifteen seconds.
ipcMain.handle('get-project-changes', (_event, projectPath) => {
  if (!projectPath || !fs.existsSync(hostPath(projectPath))) return null;
  const { execFileSync } = require('child_process');
  try {
    const [file, args, options] = projectExecFile(
      ['git', 'diff', '--numstat', 'HEAD'], projectPath,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 },
    );
    const numstat = execFileSync(file, args, options).trim();
    const changedFiles = [];
    let totalAdded = 0;
    let totalDeleted = 0;
    for (const line of numstat.split('\n')) {
      if (!line) continue;
      const [added, deleted, changed] = line.split('\t');
      const a = parseInt(added, 10) || 0;
      const d = parseInt(deleted, 10) || 0;
      totalAdded += a;
      totalDeleted += d;
      changedFiles.push({ file: changed, added: a, deleted: d });
    }
    changedFiles.sort((x, y) => (y.added + y.deleted) - (x.added + x.deleted));
    return { changedFiles, totalAdded, totalDeleted };
  } catch {
    // Not a repo, or git took too long. The panel keeps what it had.
    return null;
  }
});

ipcMain.handle('get-project-git-cache', (_event, projectPath) => {
  try { return getProjectGitCache(projectPath); } catch { return null; }
});

ipcMain.handle('open-external', (_event, url) => {
  log.info('[open-external IPC]', url);
  if (/^https?:\/\//i.test(url)) return shell.openExternal(url);
});

// --- IPC: MCP bridge ---
ipcMain.on('mcp-diff-response', (_event, sessionId, diffId, action, editedContent) => {
  resolvePendingDiff(sessionId, diffId, action, editedContent);
});

// --- IPC: git operations ---
// Every git call goes through projectGit so it runs where the repository is —
// inside the distribution for a WSL-backed project, on Windows otherwise — and
// so branch names and messages travel as argv rather than in a shell string.
function projectGit(projectPath, argv, opts = {}) {
  const { execFileSync } = require('child_process');
  const [file, args, options] = projectExecFile(['git', ...argv], projectPath, {
    encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'], ...opts,
  });
  return execFileSync(file, args, options);
}

ipcMain.handle('git-branches', (_event, projectPath) => {
  try {
    const current = projectGit(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 5000 }).trim();
    const all = projectGit(projectPath, ['branch'], { timeout: 5000 }).trim();
    const branches = all.split('\n').map(b => b.replace(/^[*+]\s*/, '').trim()).filter(Boolean);
    let remotes = [];
    try {
      const raw = projectGit(projectPath, ['branch', '-r'], { timeout: 5000 }).trim();
      remotes = raw.split('\n').map(b => b.trim().replace(/^origin\//, '')).filter(b => b && b !== 'HEAD' && !b.includes('->') && !branches.includes(b));
    } catch {}
    return { ok: true, current, branches, remotes };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('git-checkout', (_event, projectPath, branch) => {
  try {
    projectGit(projectPath, ['checkout', branch]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.stderr || e.message }; }
});

ipcMain.handle('git-fetch', (_event, projectPath) => {
  try {
    return { ok: true, output: projectGit(projectPath, ['fetch', '--prune'], { timeout: 30000 }) };
  } catch (e) { return { ok: false, error: e.stderr || e.message }; }
});

ipcMain.handle('git-pull', (_event, projectPath) => {
  try {
    return { ok: true, output: projectGit(projectPath, ['pull'], { timeout: 30000 }) };
  } catch (e) { return { ok: false, error: e.stderr || e.message }; }
});

// Track files that are not tracked yet — the one thing the panel used to send
// people to a terminal for. Only what the untracked list offered: every path is
// checked here rather than at the call site, because these arrive from the
// renderer and end up as arguments to git.
ipcMain.handle('git-add', (_event, projectPath, paths) => {
  const list = (Array.isArray(paths) ? paths : [paths])
    .map(p => String(p || '').trim())
    .filter(Boolean);
  if (!list.length) return { ok: false, error: 'nothing to add' };
  if (!safeRepoPaths(list)) return { ok: false, error: 'refusing those paths' };
  try {
    projectGit(projectPath, ['add', '--', ...list]);
    return { ok: true, added: list.length };
  } catch (e) { return { ok: false, error: e.stderr || e.message }; }
});

/** Repo-relative, inside the repo, and not an option. */
function safeRepoPaths(paths) {
  const list = (Array.isArray(paths) ? paths : []).map(p => String(p || '').trim()).filter(Boolean);
  for (const p of list) {
    if (p.startsWith('-') || p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').includes('..')) return null;
  }
  return list;
}

// Stages tracked changes only — see git-staging.js for why this is not `-A`.
// With `paths`, commits exactly those: the panel's checkboxes, which is the
// one way to leave a change out of this commit without stashing it.
ipcMain.handle('git-commit', (_event, projectPath, message, paths) => {
  try {
    const only = paths === undefined || paths === null ? null : safeRepoPaths(paths);
    if (only === null && paths) return { ok: false, error: 'refusing those paths' };
    if (only && !only.length) return { ok: false, error: 'nothing selected to commit' };
    if (only) {
      projectGit(projectPath, gitStaging.commitPathsArgv(message, only));
    } else {
      projectGit(projectPath, gitStaging.stageArgv());
      projectGit(projectPath, gitStaging.commitArgv(message));
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.stderr || e.message }; }
});

// A push, with both streams kept.
//
// Everything a forge says after a push — "to create a merge request, visit…" —
// arrives on stderr as `remote:` lines, and execFileSync hands back stdout
// only, so all of it used to be dropped on the floor. spawnSync keeps both.
function projectGitBoth(projectPath, argv, opts = {}) {
  const { spawnSync } = require('child_process');
  const [file, args, options] = projectExecFile(['git', ...argv], projectPath, {
    encoding: 'utf8', timeout: 30000, ...opts,
  });
  const run = spawnSync(file, args, options);
  const output = `${run.stdout || ''}${run.stderr || ''}`;
  return { ok: run.status === 0, output, error: run.status === 0 ? null : (run.stderr || run.error?.message || `git ${argv[0]} failed`) };
}

ipcMain.handle('git-push', (_event, projectPath) => {
  try {
    let run = projectGitBoth(projectPath, ['push']);
    if (!run.ok) {
      // The normal state of a branch before its first push — see
      // src/vue/git-push-target.js, which is why the button is not disabled.
      const branch = projectGit(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD'], {
        timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      run = projectGitBoth(projectPath, ['push', '--set-upstream', 'origin', branch]);
    }
    if (!run.ok) return { ok: false, error: run.error };
    // Whatever the server offered to do next, for the button the panel shows.
    return { ok: true, output: run.output, link: gitPushLinks.bestPushLink(run.output) };
  } catch (e) {
    return { ok: false, error: e.stderr || e.message };
  }
});

ipcMain.handle('git-create-branch', (_event, projectPath, branchName, checkout) => {
  try {
    projectGit(projectPath, checkout ? ['checkout', '-b', branchName] : ['branch', branchName]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.stderr || e.message }; }
});

// --- IPC: project avatar (GitLab) ---
ipcMain.handle('get-project-avatar', (_event, projectPath) => {
  const result = getStoredAvatar(projectPath);
  if (!result) return null;
  return `data:${result.mimeType};base64,${result.avatarData.toString('base64')}`;
});

ipcMain.handle('fetch-gitlab-avatar', async (_event, projectPath, remoteUrl) => {
  let base = remoteUrl.trim();
  const ssh = base.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  let host, projectApiPath;
  if (ssh) {
    host = `https://${ssh[1]}`;
    projectApiPath = ssh[2];
  } else {
    base = base.replace(/\.git$/, '');
    const m = base.match(/^(https?:\/\/[^/]+)\/(.+)$/);
    if (!m) throw new Error('Cannot parse remote URL');
    host = m[1];
    projectApiPath = m[2];
  }
  const globalSettings = getSetting('global') || {};
  const token = globalSettings.gitlabToken;
  const headers = token ? { 'PRIVATE-TOKEN': token } : {};
  const apiUrl = `${host}/api/v4/projects/${encodeURIComponent(projectApiPath)}`;
  const resp = await fetch(apiUrl, { headers });
  if (!resp.ok) throw new Error(`GitLab API error: ${resp.status}`);
  const data = await resp.json();
  if (!data.avatar_url) {
    setStoredAvatar(projectPath, null, null);
    return null;
  }
  // Use the API avatar endpoint (authenticated) instead of downloading avatar_url directly
  // (avatar_url points to CDN/storage that may reject PRIVATE-TOKEN header).
  const avatarApiUrl = `${host}/api/v4/projects/${data.id}/avatar`;
  const imgResp = await fetch(avatarApiUrl, { headers });
  if (!imgResp.ok) throw new Error(`Avatar download error: ${imgResp.status}`);
  const contentType = imgResp.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await imgResp.arrayBuffer());
  setStoredAvatar(projectPath, buffer, contentType);
  return `data:${contentType};base64,${buffer.toString('base64')}`;
});

ipcMain.handle('git-generate-commit-msg', async (_event, projectPath, style = 'short') => {
  const { spawn } = require('child_process');
  try {
    const diff = projectGit(projectPath, ['diff', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] });
    if (!diff.trim()) return { ok: false, error: 'No changes to describe' };
    const globalSettings = getSetting('global') || {};
    const baseInstruction = globalSettings.commitMessagePrompt || COMMIT_MSG_PROMPT_DEFAULT;
    const styleSuffix = style === 'descriptive'
      ? ' Write a short title line followed by a blank line and a concise bullet list of key changes (3-5 bullets max). Use conventional commit format.'
      : ' Write a single short sentence (max 72 chars). Use conventional commit format (feat/fix/refactor/docs/chore).';
    const prompt = `${baseInstruction}${styleSuffix}\n\nOutput ONLY the commit message, no explanation:\n\n${diff.slice(0, 8000)}`;
    const msg = await new Promise((resolve, reject) => {
      // The claude binary lives wherever the project does — inside the
      // distribution for a WSL-backed one, so this call is routed there too.
      // Absolute path, not a bare name: see resolveClaudeBinary — a packaged
      // macOS app has no shell PATH, so `claude` alone is ENOENT there. A WSL
      // account keeps the bare name: the binary that matters lives inside the
      // distribution, and a host path would be meaningless there.
      const claudeBin = activeWslDistro() ? 'claude' : resolveClaudeBinary();
      const [file, args, options] = projectExecFile(
        [claudeBin, '-p', prompt, '--no-session-persistence'], projectPath,
        { env: { ...process.env, PATH: claudeChildPath(), ...activeAccountClaudeEnv() } }
      );
      const child = spawn(file, args, options);
      let stdout = '', stderr = '';
      child.stdout.on('data', d => { stdout += d; });
      child.stderr.on('data', d => { stderr += d; });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Timed out after 60s')); }, 60000);
      child.on('close', code => {
        clearTimeout(timer);
        if (code !== 0 && !stdout.trim()) reject(new Error(stderr.trim() || `claude exited with code ${code}`));
        else resolve(stdout.trim());
      });
      child.on('error', err => { clearTimeout(timer); reject(err); });
    });
    if (!msg) return { ok: false, error: 'No output from claude' };
    const clean = msg.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    return { ok: true, message: clean };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ── Board summaries ───────────────────────────────────────────────────────
// One headless `claude` call for the whole board rather than one per session:
// N sessions would be N cold CLI starts, N authentications and N timeouts to
// wait out, and the model reads the transcripts faster together than apart.
// Same plumbing as git-generate-commit-msg above — resolved binary, child PATH,
// active-account env, hard timeout, { ok } result.
const BOARD_SUMMARY_MAX_SESSIONS = 12;
const BOARD_SUMMARY_MAX_PROMPT = 8000;      // the budget the commit diff gets
const BOARD_SUMMARY_MAX_PER_SESSION = 1200;

// The last few assistant turns of a transcript. "What did this session just
// finish" needs the end of the conversation and nothing else, and the whole
// file would blow the prompt budget on the first session.
function sessionTranscriptTail(sessionId, limit = BOARD_SUMMARY_MAX_PER_SESSION) {
  const folder = getCachedFolder(sessionId);
  if (!folder) return '';
  let content;
  try {
    content = fs.readFileSync(path.join(activeProjectsDir(), folder, sessionId + '.jsonl'), 'utf-8');
  } catch { return ''; }
  const lines = content.split('\n');
  const turns = [];
  for (let i = lines.length - 1; i >= 0 && turns.length < 3; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== 'assistant' && !(entry.type === 'message' && entry.role === 'assistant')) continue;
    const blocks = entry.message?.content;
    // Text blocks only: a tool_use block is an argument dump, and its result
    // arrives as a separate user entry that says nothing about intent.
    const text = typeof blocks === 'string' ? blocks
      : (Array.isArray(blocks)
        ? blocks.filter(b => b?.type === 'text').map(b => b.text || '').join('\n')
        : (typeof entry.message === 'string' ? entry.message : ''));
    const trimmed = text.trim();
    if (trimmed) turns.unshift(trimmed);
  }
  // Tail, not head: the closing sentences are the ones that say what landed.
  return turns.join('\n---\n').slice(-limit);
}

// What the board flags after a run, and how much of it — see
// board-importance.js for why the cap is enforced rather than only asked for.
const { IMPORTANCE_PROMPT: BOARD_IMPORTANCE_PROMPT, importanceRater } = require('./board-importance');

// The child of the summarize run currently in flight, so the sidebar's Stop
// button has something to kill. One at a time: the renderer disables Summarize
// while a run is pending, and a second run would only queue behind this one on
// the same account anyway.
let boardSummaryChild = null;
let boardSummaryCancelled = false;

ipcMain.handle('board-summarize-abort', () => {
  if (!boardSummaryChild) return { ok: false, error: 'nothing running' };
  boardSummaryCancelled = true;
  try { boardSummaryChild.kill(); } catch {}
  return { ok: true };
});

ipcMain.handle('board-summarize-sessions', async (_event, sessions, options) => {
  const { spawn } = require('child_process');
  // One session asked for from a session's own menu, rather than the board's
  // whole set: the whole prompt budget goes to it and the answer gets room to
  // name what the last few turns actually did.
  const detail = !!options?.detail;
  const list = (Array.isArray(sessions) ? sessions : []).slice(0, BOARD_SUMMARY_MAX_SESSIONS);
  if (!list.length) return { ok: false, error: 'No sessions on the board to summarize' };
  try {
    let budget = BOARD_SUMMARY_MAX_PROMPT;
    const blocks = [];
    for (const session of list) {
      if (budget <= 0) break;
      // Passed as the limit rather than sliced afterwards: sessionTranscriptTail
      // cuts from the front, and the last thing a session said is the point.
      const perSession = detail ? budget : Math.min(BOARD_SUMMARY_MAX_PER_SESSION, budget);
      const tail = sessionTranscriptTail(session.sessionId, perSession);
      if (!tail) continue;
      budget -= tail.length;
      const title = String(session.title || '').replace(/"/g, "'").slice(0, 120);
      blocks.push(`<session id="${session.sessionId}" title="${title}">\n${tail}\n</session>`);
    }
    if (!blocks.length) return { ok: false, error: 'No readable transcripts for these sessions' };

    // Which language the summaries come back in. A preference about reading
    // rather than about the work, so it is global and not per-project.
    const language = (getSetting('global') || {}).summaryLanguage || '';

    const prompt = 'Each <session> below is the tail of a Claude Code transcript.\n'
      + (detail
        ? 'Write 2-3 sentences in past tense describing what the last few turns of that session accomplished. '
        : 'For each one, write 1-2 sentences in past tense saying what that session just finished doing. ')
      + 'Name the concrete files or features the transcript names. Do not mention the transcript, the session id, or yourself.\n'
      // It reads in a sidebar column: left to itself the model writes a
      // paragraph of clause-joined detail that has to be scrolled to finish.
      + (detail
        ? 'Hard limit of 70 words — cut detail rather than run long.\n\n'
        : 'Hard limit of 35 words per summary — cut detail rather than run long.\n\n')
      // Names stay in the language they were written in: a translated path or
      // identifier cannot be searched for or pasted anywhere.
      + (language
        ? `Write every summary in ${language}, whatever language the transcript is in. Leave file paths, identifiers, branch names and commands exactly as they appear.\n\n`
        : '')
      + (detail ? '' : BOARD_IMPORTANCE_PROMPT)
      + 'Reply with ONLY a JSON array, no prose and no code fence, one object per session in the order given:\n'
      + (detail
        ? '[{"id": "<the session id exactly as given>", "summary": "<1-2 sentences>"}]\n\n'
        : '[{"id": "<the session id exactly as given>", "summary": "<1-2 sentences>", "importance": <0-3>}]\n\n')
      + blocks.join('\n\n');

    // Nothing here is project work, but the CLI still runs somewhere: anchor it
    // to a project on the board so a WSL-backed account resolves inside its own
    // distribution rather than on the Windows side.
    const anchor = list.find(s => s.projectPath)?.projectPath;

    const raw = await new Promise((resolve, reject) => {
      const claudeBin = activeWslDistro() ? 'claude' : resolveClaudeBinary();
      const [file, args, options] = projectExecFile(
        // json envelope, not bare text: it is the only way to report what the
        // summary actually cost. The prose lands in `result`.
        [claudeBin, '-p', prompt, '--no-session-persistence', '--output-format', 'json'], anchor,
        { env: { ...process.env, PATH: claudeChildPath(), ...activeAccountClaudeEnv() } }
      );
      const child = spawn(file, args, options);
      // Published so board-summarize-abort can reach it. Cleared on close, so
      // Stop after the run has finished is a no-op rather than a kill of
      // whatever spawned next.
      boardSummaryChild = child;
      boardSummaryCancelled = false;
      let stdout = '', stderr = '';
      child.stdout.on('data', d => { stdout += d; });
      child.stderr.on('data', d => { stderr += d; });
      // Longer than the commit message's 60s: this prompt carries a dozen
      // transcripts and answers with a dozen summaries.
      const timer = setTimeout(() => { child.kill(); reject(new Error('Timed out after 120s')); }, 120000);
      child.on('close', code => {
        clearTimeout(timer);
        boardSummaryChild = null;
        if (boardSummaryCancelled) reject(Object.assign(new Error('Stopped'), { cancelled: true }));
        else if (code !== 0 && !stdout.trim()) reject(new Error(stderr.trim() || `claude exited with code ${code}`));
        else resolve(stdout.trim());
      });
      child.on('error', err => { clearTimeout(timer); boardSummaryChild = null; reject(err); });
    });

    if (!raw) return { ok: false, error: 'No output from claude' };

    // Unwrap the CLI envelope. If it is not there — an older CLI, or a wrapper
    // that printed something else — fall back to treating stdout as the answer
    // and report no usage rather than failing.
    let body = raw;
    let usage = null;
    try {
      const envelope = JSON.parse(raw);
      if (envelope && typeof envelope.result === 'string') {
        body = envelope.result;
        const u = envelope.usage || {};
        usage = {
          inputTokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
          outputTokens: u.output_tokens || 0,
          costUSD: envelope.total_cost_usd || 0,
        };
      }
    } catch {}

    // Models fence JSON even when told not to, and sometimes prefix a sentence.
    const unfenced = body.replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/, '').trim();
    const start = unfenced.indexOf('[');
    const end = unfenced.lastIndexOf(']');
    let parsed;
    try {
      parsed = JSON.parse(start !== -1 && end > start ? unfenced.slice(start, end + 1) : unfenced);
    } catch {
      return { ok: false, error: 'claude did not return JSON' };
    }
    if (!Array.isArray(parsed)) return { ok: false, error: 'claude did not return a JSON array' };
    // One rater per run: the cap is asked for in the prompt and enforced here,
    // because a model that flags six cards red has not answered the question
    // and the board would be the one to show it.
    const rateImportance = importanceRater();

    const summaries = parsed
      .filter(item => item && item.id && typeof item.summary === 'string' && item.summary.trim())
      .map(item => ({
        sessionId: String(item.id),
        summary: item.summary.trim(),
        importance: rateImportance(item.importance),
      }));
    if (!summaries.length) return { ok: false, error: 'claude returned no summaries' };
    return { ok: true, summaries, usage };
  } catch (e) { return { ok: false, error: e.message, cancelled: !!e.cancelled }; }
});

ipcMain.handle('delete-worktree', (_event, projectPath, worktreePath) => {
  const { setProjectGitCache } = require('./db');
  let branch = null;
  // `-C <worktree>` is kept, but the whole call is routed through the project so
  // a WSL-backed worktree path stays POSIX and is resolved by the distribution.
  try {
    branch = projectGit(projectPath, ['-C', worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {}
  // Remove the worktree — idempotent: ignore "not a working tree" error
  try {
    projectGit(projectPath, ['worktree', 'remove', worktreePath, '--force']);
  } catch (e) {
    if (!e.message.includes('is not a working tree') && !e.message.includes('not a git')) {
      return { ok: false, error: e.message };
    }
  }
  // Prune stale worktree refs
  try { projectGit(projectPath, ['worktree', 'prune'], { timeout: 5000 }); } catch {}
  // Delete the branch
  if (branch && branch !== 'HEAD' && branch !== 'main' && branch !== 'master') {
    try { projectGit(projectPath, ['branch', '-D', branch], { timeout: 5000 }); } catch {}
  }
  // Clear project git cache for the worktree path so stale data doesn't show
  try { setProjectGitCache(worktreePath, { branch: null, upstream: null, remoteUrl: null, tags: [], commits: [], unpushedCommits: [], changedFiles: [], totalAdded: 0, totalDeleted: 0, containers: [] }); } catch {}
  return { ok: true, branch };
});

ipcMain.handle('get-git-user-info', (_event, projectPath) => {
  try {
    const name = projectGit(projectPath, ['config', 'user.name']).trim();
    const email = projectGit(projectPath, ['config', 'user.email']).trim();
    return { ok: true, name, email };
  } catch { return { ok: false, name: '', email: '' }; }
});

ipcMain.handle('get-file-tree', (_event, projectPath) => {
  const IGNORE = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '__pycache__', '.venv', 'venv', '.DS_Store', 'target', '.cache', 'coverage', '.turbo']);
  function walk(dir, rel, depth) {
    if (depth > 5) return [];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    return entries
      .filter(e => !IGNORE.has(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(e => {
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        const isDir = e.isDirectory();
        return { name: e.name, path: relPath, isDir, children: isDir ? walk(path.join(dir, e.name), relPath, depth + 1) : null };
      });
  }
  // Only the walk root is translated: entry paths below it are built relative
  // with forward slashes, which is what the renderer joins back onto the
  // canonical project path.
  try { return { ok: true, tree: walk(hostPath(projectPath), '', 0) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

/**
 * One directory's worth of `@` completions, for a token that leaves the project.
 *
 * `get-file-tree` answers everything inside the project and answers it from
 * memory; it cannot answer `@../other-checkout/src/` — and the CLI's own
 * composer can, which is where a sibling repository gets referenced from. So
 * anything starting with `../`, `~/` or `/` is read a directory at a time,
 * which is also the only way to walk one.
 *
 * `token` is what follows the `@`, and the returned `value` is the whole token
 * it should become — the renderer substitutes it, it does not join it.
 */
ipcMain.handle('list-path-completions', (_event, projectPath, token) => {
  const SKIP = new Set(['.git', 'node_modules', '.DS_Store']);
  const LIMIT = 60;
  const text = String(token || '');
  const cut = text.lastIndexOf('/');
  const dir = cut === -1 ? '' : text.slice(0, cut + 1);
  const base = cut === -1 ? text : text.slice(cut + 1);

  // `~` is the host's home. On a WSL account the distribution's own home is a
  // different directory, and there is no cheap way to ask for it from here —
  // a `~/` token on such a project simply finds nothing, which is the same
  // answer it would get for a path that does not exist.
  let target;
  if (dir.startsWith('~/') || dir === '~') target = path.join(os.homedir(), dir.slice(1));
  else if (dir.startsWith('/')) target = dir;
  else target = projectJoin(projectPath, dir || '.');

  let entries;
  try { entries = fs.readdirSync(hostPath(target), { withFileTypes: true }); }
  catch (e) { return { ok: false, error: e.message, entries: [] }; }

  const needle = base.toLowerCase();
  const matched = entries
    .filter(e => !SKIP.has(e.name))
    // Dotfiles only once the dot has been typed, the way a shell does it.
    .filter(e => base.startsWith('.') || !e.name.startsWith('.'))
    .filter(e => e.name.toLowerCase().startsWith(needle))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, LIMIT)
    .map((e) => {
      const isDir = e.isDirectory();
      return { name: e.name, isDir, value: dir + e.name + (isDir ? '/' : '') };
    });

  return { ok: true, entries: matched };
});

ipcMain.handle('get-file-diff', (_event, projectPath, filePath) => {
  const { execFileSync } = require('child_process');
  let oldContent = '';
  try {
    const [file, args, options] = projectExecFile(['git', 'show', `HEAD:${filePath}`], projectPath, {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    oldContent = execFileSync(file, args, options);
  } catch {}
  try {
    const newContent = fs.readFileSync(hostPath(projectJoin(projectPath, filePath)), 'utf8');
    return { ok: true, oldContent, newContent, filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('read-file-for-panel', async (_event, filePath) => {
  try {
    const content = fs.readFileSync(hostPath(filePath), 'utf8');
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('save-file-for-panel', async (_event, filePath, content) => {
  try {
    const resolved = path.resolve(hostPath(filePath));
    if (!fs.existsSync(resolved)) return { ok: false, error: 'File does not exist' };
    fs.writeFileSync(resolved, content, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── File Watching (for viewer panels) ────────────────────────────────
const fileWatchers = new Map(); // filePath → FSWatcher

ipcMain.handle('watch-file', (_event, filePath) => {
  const resolved = path.resolve(hostPath(filePath));
  if (fileWatchers.has(resolved)) return { ok: true };
  try {
    let debounce = null;
    const watcher = fs.watch(resolved, (eventType) => {
      if (eventType !== 'change') return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file-changed', resolved);
        }
      }, 300);
    });
    fileWatchers.set(resolved, watcher);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('unwatch-file', (_event, filePath) => {
  const resolved = path.resolve(hostPath(filePath));
  const watcher = fileWatchers.get(resolved);
  if (watcher) {
    watcher.close();
    fileWatchers.delete(resolved);
  }
  return { ok: true };
});

// --- Group sessions ---
// A group is a directory under the account's Claude home that holds one task
// spanning several projects — see session-groups.js. These handlers only manage
// the directory; the session inside it is started the ordinary way, through
// open-terminal, which recognises the path and mounts the projects.

/**
 * Create the group's folder and register it the way add-project registers a
 * project: a folder under `projects/` and its folder meta, so the first session
 * started in it resolves to the right path before it has written anything.
 */
function createSessionGroup({ projects, name } = {}) {
  const canonical = (projects || []).map(p => canonicalProjectPath(String(p || '').trim())).filter(Boolean);
  const missing = canonical.filter(p => !fs.existsSync(hostPath(p)));
  if (missing.length) return { ok: false, error: `Not found: ${missing.join(', ')}` };

  const result = sessionGroups.createGroup(activeGroupsRoot(), { projects: canonical, name }, hostPath);
  if (!result.ok) return result;

  const folder = encodeProjectPath(result.group.dir);
  try { fs.mkdirSync(path.join(activeProjectsDir(), folder), { recursive: true }); } catch {}
  setFolderMeta(folder, result.group.dir, 0);
  log.info(`[groups] created ${result.group.id} projects=${canonical.length}`);
  return result;
}

ipcMain.handle('list-session-groups', () => sessionGroups.listGroups(activeGroupsRoot(), hostPath));

ipcMain.handle('get-session-group', (_event, groupId) =>
  sessionGroups.readGroup(activeGroupsRoot(), groupId, hostPath));

ipcMain.handle('create-session-group', (_event, options) => createSessionGroup(options));

ipcMain.handle('set-group-projects', (_event, groupId, projects) => {
  const result = sessionGroups.setProjects(activeGroupsRoot(), groupId, projects, hostPath);
  if (result.ok) notifyRendererProjectsChanged();
  return result;
});

// --- Manager chat ---
// The Chat tab's assistant reaches the workspace through wooton-mcp.js, which
// only formats. Everything it can actually do is below: thin wrappers over
// the same cache, status tracker and session map the IPC handlers use, so the
// assistant and the UI can never disagree about what exists.

const sessionTitle = (s) => s?.name || s?.aiTitle || s?.summary || s?.firstPrompt || null;
const projectName = (p) => String(p || '').split('/').filter(Boolean).pop() || p;

/** Sessions with a live process — Claude ones only, not scratch shells. */
function liveSessionIds() {
  const ids = new Set();
  for (const [id, s] of activeSessions) {
    if (!s.exited && !s.isEphemeral && !s.isPlainTerminal) ids.add(id);
  }
  for (const id of sdkSession.activeSdkSessions()) ids.add(id);
  return ids;
}

/**
 * One word per session, in the board's vocabulary: `waiting` is blocked on the
 * user, `running` is mid-turn, `idle` is up with nothing to do. A session with
 * no process has no status — null, not "idle", which would read as running.
 */
function managerStatus(sessionId, live, statuses) {
  if (!live.has(sessionId)) return null;
  const state = statuses.get(sessionId)?.state;
  if (state === 'requires_action') return 'waiting';
  if (state === 'running') return 'running';
  return 'idle';
}

/** Every session in the tree, flattened, with what the assistant needs of it. */
function managerSessions() {
  const { all } = buildProjectSets();
  const live = liveSessionIds();
  const statuses = new Map(sessionStatus.all().map(s => [s.sessionId, s]));
  const out = [];
  for (const project of all) {
    for (const s of project.sessions) {
      if (s.type === 'terminal') continue;
      const group = s.group ? { id: s.group.id, name: s.group.name, projects: s.group.projects } : null;
      out.push({
        sessionId: s.sessionId,
        title: sessionTitle(s),
        projectPath: s.projectPath,
        projectName: group ? group.name : projectName(s.projectPath),
        modified: s.modified,
        created: s.created,
        messageCount: s.messageCount || 0,
        running: live.has(s.sessionId),
        status: managerStatus(s.sessionId, live, statuses),
        archived: s.archived ? 1 : 0,
        starred: s.starred ? 1 : 0,
        group,
      });
    }
  }
  out.sort((a, b) => String(b.modified || '').localeCompare(String(a.modified || '')));
  return out;
}

/** The plain text of one transcript record, or null if it is not a message. */
function recordText(entry) {
  if (!entry || (entry.type !== 'user' && entry.type !== 'assistant') || entry.isMeta) return null;
  const content = entry.message?.content;
  if (typeof content === 'string') return content.trim() || null;
  if (!Array.isArray(content)) return null;
  // Tool results ride in user records; they are plumbing, not what was said.
  const text = content.filter(b => b?.type === 'text' && b.text).map(b => b.text).join('\n').trim();
  return text || null;
}

/**
 * The last `limit` real messages of a transcript, oldest first.
 *
 * Reads a window several times larger than asked for, because most records in
 * an active session are tool calls and their results — a window of 20 records
 * can easily hold two messages worth reading.
 */
function transcriptTail(sessionId, limit = 20) {
  const folder = getCachedFolder(sessionId);
  if (!folder) return [];
  const jsonlPath = path.join(activeProjectsDir(), folder, sessionId + '.jsonl');
  let window;
  try { window = readTranscriptWindow(jsonlPath, { limit: Math.max(limit * 8, 60) }); } catch { return []; }
  const messages = [];
  for (const entry of window.entries || []) {
    const text = recordText(entry);
    if (text) messages.push({ role: entry.type, text, ts: entry.timestamp || null });
  }
  return messages.slice(-limit);
}

/** The project's effective settings, as a new session from the UI would get them. */
function effectiveSettingsFor(projectPath) {
  const global = getSetting('global') || {};
  const project = projectPath ? (getSetting('project:' + projectPath) || {}) : {};
  const effective = { ...SETTING_DEFAULTS };
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    if (global[key] !== undefined && global[key] !== null) effective[key] = global[key];
    if (project[key] !== undefined && project[key] !== null) effective[key] = project[key];
  }
  return effective;
}

/**
 * Start a session on the assistant's behalf and queue its first prompt.
 *
 * Always an SDK session: a prompt is only something this process can hand to
 * a session that takes structured input. The renderer is told afterwards so it
 * can put the row in the sidebar — it is not switched to it, because the user
 * is in the middle of a conversation with the assistant that started it.
 */
async function startManagedSession(projectPath, { prompt, name } = {}) {
  const sessionId = require('crypto').randomUUID();
  const effective = effectiveSettingsFor(projectPath);
  const options = {
    mode: 'sdk',
    permissionMode: effective.dangerouslySkipPermissions ? undefined : (effective.permissionMode || undefined),
    dangerouslySkipPermissions: !!effective.dangerouslySkipPermissions,
    model: effective.model || undefined,
    effort: effective.effort || undefined,
  };
  const groupId = sessionGroups.groupIdFromPath(activeGroupsRoot(), projectPath);
  const group = groupId ? sessionGroups.readGroup(activeGroupsRoot(), groupId, hostPath) : null;
  if (group) {
    options.additionalDirectories = group.projects.filter(p => fs.existsSync(hostPath(p)));
  }

  const result = await startSdkSessionFor(sessionId, projectPath, true, options);
  if (!result.ok) return result;
  if (name) setName(sessionId, name);
  if (prompt && String(prompt).trim()) sdkSession.sendSdkInput(sessionId, String(prompt));

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('external-session-started', {
      sessionId, projectPath, name: name || null, prompt: prompt || '', mode: 'sdk',
      // A group session's row belongs under the one "Grouped sessions" entry,
      // and draws its avatars from the manifest — see foldGroups.
      group, groupsRoot: group ? activeGroupsRoot() : null,
    });
  }
  log.info(`[chat] started session ${sessionId} in ${projectPath}`);
  return { ok: true, sessionId };
}

/**
 * The canonical root of a project the assistant may look inside: one listed
 * in the sidebar, or a group's own folder (its CLAUDE.md and MEMORY.md are what
 * a group is). Anything else — a path the model made up, a home directory, the
 * assistant's own folder — is refused.
 */
function knownProjectRoot(projectPath) {
  const wanted = canonicalProjectPath(String(projectPath || '').trim()).replace(/\/+$/, '');
  if (!wanted) return null;
  const { all } = buildProjectSets();
  for (const p of all) {
    if (!p.isGroupContainer && p.projectPath === wanted) return wanted;
  }
  for (const g of sessionGroups.listGroups(activeGroupsRoot(), hostPath)) {
    if (g.dir === wanted) return wanted;
  }
  return null;
}

/**
 * The last reading of the account's plan meters. The CLI only reports them in
 * the middle of a turn (see rate-limits.js), so this is whatever the renderer
 * last stored — possibly hours old, which the tool says.
 */
function managerLimits() {
  const stored = getSetting(`rateLimits:${getActiveAccount().id}`);
  const windows = stored?.windows;
  if (!windows) return null;
  const pick = (w) => (w ? { percent: w.utilization, resetsAt: w.resetsAt || null } : null);
  return {
    fiveHour: pick(windows.five_hour),
    sevenDay: pick(windows.seven_day),
    updatedAt: stored.updatedAt || null,
  };
}

wootonMcp.configure({
  log,

  // Projects the user works in. The Grouped sessions entry is not one — it is
  // the app's own folder of group folders, and offering it as a project is how
  // the assistant came to list "groups" beside real repositories. Group
  // sessions are reachable through list_sessions (scope "groups") and
  // list_groups instead.
  listProjects: () => {
    const { visible } = buildProjectSets();
    return visible
      .filter(p => !p.isGroupContainer)
      .map(p => ({
        projectPath: p.projectPath,
        name: projectName(p.projectPath),
        sessionCount: p.sessions.length,
        lastActivity: p.sessions[0]?.modified || null,
        unpushedCount: p.unpushedCount || 0,
        changedCount: p.changedCount || 0,
        isGroup: false,
      }));
  },

  listSessions: ({ projectPath, limit, activeOnly, sinceMs, includeArchived, archivedOnly, groupsOnly } = {}) => {
    const root = activeGroupsRoot();
    let sessions = managerSessions();
    if (projectPath) sessions = sessions.filter(s => s.projectPath === projectPath
      || (s.group?.projects || []).includes(projectPath));
    if (archivedOnly) sessions = sessions.filter(s => s.archived);
    else if (!includeArchived) sessions = sessions.filter(s => !s.archived);
    if (activeOnly) sessions = sessions.filter(s => s.running);
    if (groupsOnly) sessions = sessions.filter(s => sessionGroups.isGroupPath(root, s.projectPath));
    if (sinceMs) sessions = sessions.filter(s => new Date(s.modified).getTime() >= sinceMs);
    return sessions.slice(0, limit || 20);
  },

  readSessionMessages: async (sessionId, { limit } = {}) => transcriptTail(sessionId, limit || 20),

  activeSessionsTail: async ({ limit } = {}) => managerSessions()
    .filter(s => s.running)
    .map(s => ({ ...s, messages: transcriptTail(s.sessionId, limit || 3) })),

  searchSessions: async (query, { titleOnly } = {}) => {
    const byId = new Map(managerSessions().map(s => [s.sessionId, s]));
    return searchByType('session', String(query || ''), 30, titleOnly !== false)
      .map(hit => {
        const s = byId.get(hit.id);
        if (!s) return null;
        return {
          sessionId: s.sessionId, title: s.title, projectPath: s.projectPath, modified: s.modified,
          archived: s.archived,
          snippet: titleOnly === false ? String(hit.snippet || '').replace(/<\/?mark>/g, '') : '',
        };
      })
      .filter(Boolean);
  },

  createSession: async ({ projectPath, prompt, name }) => {
    const canonical = canonicalProjectPath(String(projectPath || '').trim());
    if (!canonical || !fs.existsSync(hostPath(canonical))) return { ok: false, error: `No such project: ${projectPath}` };
    return startManagedSession(canonical, { prompt, name });
  },

  /**
   * Stop a project's containers, at one of three depths.
   *
   * Every mode runs `docker compose` in the project, so it only ever touches
   * what that project's compose file declares. The deeper two are destructive
   * — `down` throws away containers and their network, `purge` throws away
   * volumes, which is data — so the tool asks first by default and the mode
   * is named in the dialog the user sees.
   */
  stopContainers: async ({ projectPath, mode = 'stop' }) => {
    const canonical = canonicalProjectPath(String(projectPath || '').trim());
    if (!canonical || !fs.existsSync(hostPath(canonical))) return { ok: false, error: `No such project: ${projectPath}` };
    const ARGV = {
      stop: ['docker', 'compose', 'stop'],
      down: ['docker', 'compose', 'down', '--remove-orphans'],
      purge: ['docker', 'compose', 'down', '--remove-orphans', '--volumes', '--rmi', 'all'],
    };
    const argv = ARGV[mode];
    if (!argv) return { ok: false, error: `Unknown mode: ${mode}` };

    const { execFile } = require('child_process');
    const [file, args, options] = projectExecFile(argv, canonical, {
      encoding: 'utf8', timeout: 120000, env: DOCKER_ENV, maxBuffer: 4 * 1024 * 1024,
    });
    return new Promise((resolve) => {
      execFile(file, args, options, (err, stdout, stderr) => {
        // compose writes its progress to stderr, so that is the interesting
        // stream whether or not it worked.
        const said = String(stderr || stdout || '').trim();
        if (err) {
          if (err.code === 'ENOENT') return resolve({ ok: false, error: 'docker is not installed (or not on PATH)' });
          return resolve({ ok: false, error: said || err.message });
        }
        resolve({ ok: true, ran: `Ran ${argv.join(' ')} in ${canonical}`, output: said });
      });
    });
  },

  // ── The user's desktop ──
  //
  // Each of these hands something to another program. They ask before running
  // (tool-policy.js), so by the time one gets here the user has said yes to
  // this call; what is left is to refuse what should never run at all.

  openUrl: async (url) => {
    const target = String(url || '').trim();
    let parsed;
    try { parsed = new URL(target); } catch { return { ok: false, error: `Not a URL: ${url}` }; }
    // http(s) only: file: would open anything on the disk in the browser, and
    // the rest of the schemes are other applications' front doors.
    if (!/^https?:$/.test(parsed.protocol)) {
      return { ok: false, error: `Only http and https links open: ${parsed.protocol}// is not one` };
    }
    try {
      await shell.openExternal(parsed.toString());
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  openInApp: async ({ path: target, app: appName, line }) => {
    const full = hostPath(String(target || '').trim());
    if (!full || !fs.existsSync(full)) return { ok: false, error: `No such file or folder: ${target}` };
    if (!appName) {
      const error = await shell.openPath(full);
      return error ? { ok: false, error } : { ok: true };
    }
    const resolved = APP_NAMES[String(appName).trim().toLowerCase()] || String(appName).trim();
    // `open -a` is macOS. Elsewhere there is no one way to name an app, so it
    // opens with the default one — and says so, rather than claiming the
    // editor that was asked for.
    if (process.platform !== 'darwin') {
      const error = await shell.openPath(full);
      return error ? { ok: false, error } : {
        ok: true, app: null,
        note: `opened with the default app — picking ${resolved} works on macOS only`,
      };
    }
    // `open -a` names an application; the line number, where an editor takes
    // one, is its own argument after --args and is editor-specific, so only
    // the ones known to accept it get it.
    const args = ['-a', resolved, full];
    if (line && LINE_ARG[resolved]) args.push('--args', ...LINE_ARG[resolved](full, line));
    return new Promise((resolve) => {
      require('child_process').execFile('open', args, (err) => {
        if (!err) return resolve({ ok: true, app: resolved });
        resolve({ ok: false, error: `${resolved} did not open it — is it installed? (${err.message.trim()})` });
      });
    });
  },

  openFolder: async (target) => {
    const full = hostPath(String(target || '').trim());
    if (!full || !fs.existsSync(full)) return { ok: false, error: `No such path: ${target}` };
    // A file is shown inside its folder, selected; a folder is opened.
    if (fs.statSync(full).isDirectory()) {
      const error = await shell.openPath(full);
      return error ? { ok: false, error } : { ok: true, opened: full };
    }
    shell.showItemInFolder(full);
    return { ok: true, opened: path.dirname(full) };
  },

  openTerminal: async ({ path: target, name }) => {
    const canonical = canonicalProjectPath(String(target || '').trim());
    if (!canonical || !fs.existsSync(hostPath(canonical))) return { ok: false, error: `No such folder: ${target}` };
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, error: 'The window is not open' };
    // The renderer owns session rows and the terminal grid, so it starts the
    // shell — the same call the new-session popover's Terminal option makes.
    mainWindow.webContents.send('open-terminal-in', { projectPath: canonical, name: name || null });
    return { ok: true };
  },

  createGroupSession: async ({ projects, prompt, name }) => {
    const created = createSessionGroup({ projects, name });
    if (!created.ok) return created;
    const started = await startManagedSession(created.group.dir, { prompt, name: created.group.name });
    if (!started.ok) return started;
    return {
      ok: true, sessionId: started.sessionId, groupId: created.group.id,
      groupDir: created.group.dir, projects: created.group.projects,
    };
  },

  stopSession: async (sessionId) => {
    if (sdkSession.isSdkSession(sessionId)) {
      denyPending(sessionId, 'The session was stopped');
      sessionStatus.remove(sessionId);
      return sdkSession.stopSdkSession(sessionId);
    }
    const session = activeSessions.get(sessionId);
    if (!session || session.exited) return { ok: false, error: 'That session is not running' };
    try { session.pty.kill(); } catch (err) { return { ok: false, error: err.message }; }
    return { ok: true };
  },

  archiveSession: (sessionId, archived) => {
    if (!getCachedFolder(sessionId)) return { ok: false, error: `No such session: ${sessionId}` };
    setArchived(sessionId, archived ? 1 : 0);
    notifyRendererProjectsChanged();
    return { ok: true };
  },

  // Refuses a running session rather than killing it first, as the UI does:
  // the assistant deleting something that is mid-turn is never what was meant.
  deleteSession: async (sessionId) => {
    if (liveSessionIds().has(sessionId)) return { ok: false, error: 'That session is running — stop it first' };
    const folder = getCachedFolder(sessionId);
    if (!folder) return { ok: false, error: `No such session: ${sessionId}` };
    const jsonlPath = path.join(activeProjectsDir(), folder, sessionId + '.jsonl');
    try { fs.unlinkSync(jsonlPath); } catch (err) { if (err.code !== 'ENOENT') return { ok: false, error: err.message }; }
    forgetTranscript(jsonlPath);
    deleteCachedSession(sessionId);
    deleteSearchSession(sessionId);
    deleteSessionMeta(sessionId);
    notifyRendererProjectsChanged();
    return { ok: true };
  },

  sendToSession: async (sessionId, text) => {
    if (sdkSession.isSdkSession(sessionId)) return sdkSession.sendSdkInput(sessionId, String(text || ''));
    const session = activeSessions.get(sessionId);
    if (!session || session.exited || session.isPlainTerminal) {
      return { ok: false, error: 'That session is not running — start it from the sidebar first' };
    }
    // A terminal session takes keystrokes. The CR is what submits the prompt.
    session.pty.write(String(text || '') + '\r');
    return { ok: true };
  },

  listGroups: () => sessionGroups.listGroups(activeGroupsRoot(), hostPath),

  setGroupProjects: (groupId, projects) => {
    const result = sessionGroups.setProjects(activeGroupsRoot(), groupId, projects, hostPath);
    if (result.ok) notifyRendererProjectsChanged();
    return result;
  },

  projectGitStatus: (projectPath) => {
    if (!projectPath || !fs.existsSync(hostPath(projectPath))) return { error: `No such project: ${projectPath}` };
    try {
      const branch = projectGit(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 5000 }).trim();
      const porcelain = projectGit(projectPath, ['status', '--porcelain=v1', '--branch'], { timeout: 5000 });
      const lines = porcelain.split('\n').filter(Boolean);
      const header = lines[0]?.startsWith('##') ? lines.shift() : '';
      const ahead = Number(/ahead (\d+)/.exec(header)?.[1] || 0);
      const behind = Number(/behind (\d+)/.exec(header)?.[1] || 0);
      const files = lines.map(l => ({ status: l.slice(0, 2).trim() || '?', path: l.slice(3) }));
      return { branch, changedCount: files.length, unpushedCount: ahead, ahead, behind, files };
    } catch (err) {
      return { error: /not a git repository/i.test(String(err.stderr || err.message)) ? 'Not a git repository' : (err.message || 'git failed') };
    }
  },

  // From the cache the project page keeps, not a fresh `git` per project: it
  // is refreshed by the project poller, and a fan-out over every repository
  // the user has ever opened would stall the main process.
  projectsWithUnpushed: () => {
    const { visible } = buildProjectSets();
    return visible
      .filter(p => !p.isGroupContainer && ((p.unpushedCount || 0) > 0 || (p.changedCount || 0) > 0))
      .map(p => ({
        projectPath: p.projectPath,
        name: projectName(p.projectPath),
        branch: getProjectGitCache(p.projectPath)?.branch || null,
        unpushedCount: p.unpushedCount || 0,
        changedCount: p.changedCount || 0,
      }));
  },

  accountLimits: async () => managerLimits(),

  // Every container docker knows, with its load. Through projectExecFile with
  // "/" as the directory, so a WSL account asks the distribution's docker —
  // where its compose stacks actually run.
  listContainers: async ({ all } = {}) => {
    const { execFile } = require('child_process');
    const run = (argv, timeout) => new Promise((resolve) => {
      const [file, args, options] = projectExecFile(argv, '/', {
        encoding: 'utf8', timeout, env: DOCKER_ENV, maxBuffer: 8 * 1024 * 1024,
      });
      execFile(file, args, options, (err, stdout, stderr) => resolve({ err, stdout, stderr }));
    });
    const ps = await run(['docker', 'ps', ...(all ? ['-a'] : []), '--format', '{{json .}}'], 10000);
    if (ps.err) {
      const why = String(ps.stderr || ps.err.message || '');
      if (ps.err.code === 'ENOENT') return { ok: false, error: 'docker is not installed (or not on PATH)' };
      if (/Cannot connect to the Docker daemon|daemon.*running/i.test(why)) return { ok: false, error: 'Docker is not running' };
      return { ok: false, error: why.trim().split('\n')[0] || 'docker ps failed' };
    }
    const containers = dockerStatus.parsePs(ps.stdout);
    // Load only for what is running; stats on a stopped container is nothing.
    const stats = containers.some(c => c.state === 'running')
      ? dockerStatus.parseStats((await run(['docker', 'stats', '--no-stream', '--format', '{{json .}}'], 15000)).stdout)
      : new Map();
    const merged = dockerStatus.mergeContainers(containers, stats);
    // A compose container names the directory it was started from; when that
    // is a project the app knows, it is linked as one.
    const known = new Set(buildProjectSets().all.filter(p => !p.isGroupContainer).map(p => p.projectPath));
    for (const c of merged.containers) {
      const dir = c.workingDir ? canonicalProjectPath(c.workingDir) : '';
      c.projectPath = known.has(dir) ? dir : null;
    }
    return { ok: true, ...merged };
  },

  // One directory or one file of a project the app knows — a real project or
  // a group folder, nothing else on disk. See project-files.js for the guards.
  listProjectFiles: (projectPath, dir) => {
    const root = knownProjectRoot(projectPath);
    if (!root) return { ok: false, error: `Not a known project: ${projectPath}` };
    return projectFiles.listDir(root, dir, hostPath);
  },

  readProjectFile: (projectPath, relPath) => {
    const root = knownProjectRoot(projectPath);
    if (!root) return { ok: false, error: `Not a known project: ${projectPath}` };
    return projectFiles.readFile(root, relPath, hostPath);
  },

  // In the order the Notes list shows them — pinned, then soonest due.
  // Archived notes only when asked for: they are put away.
  listTodos: ({ includeArchived = false } = {}) => accountNotes.listNotes(activeNotesDir())
    .filter(n => includeArchived || !n.archived)
    .map(n => ({
      filename: n.filename,
      title: n.title,
      projects: n.projects || [],
      due: n.due || null,
      archived: !!n.archived,
      todos: (n.todos || []).map((t, index) => ({
        text: t.text, done: !!t.done, index: t.index ?? index, due: t.due || null,
      })),
      modified: n.modified || null,
    })),

  createTodo: ({ title, body, projects, due }) => {
    // A reminder asked for in one sentence is one checkbox, not an empty note
    // with a blank item under its heading.
    const text = body != null && String(body).trim() ? body : `- [ ] ${String(title || '').trim()}`;
    const result = accountNotes.createNote(activeNotesDir(), { title, body: text, projects, due });
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('notes-changed');
    return result?.ok === false ? result : { ok: true, filename: result?.filename };
  },

  toggleTodo: (filename, index) => {
    const result = accountNotes.toggleTodo(activeNotesDir(), filename, index);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('notes-changed');
    return result?.ok === false ? result : { ok: true };
  },

  archiveTodo: (filename, archived) => {
    const result = accountNotes.setNoteArchived(activeNotesDir(), filename, archived);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('notes-changed');
    return result?.ok === false ? result : { ok: true };
  },

  // No index: the whole list's deadline. A null date clears it.
  setTodoDue: (filename, index, due) => {
    const result = index == null
      ? accountNotes.setNoteDue(activeNotesDir(), filename, due)
      : accountNotes.setTodoDue(activeNotesDir(), filename, index, due);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('notes-changed');
    return result?.ok === false ? result : { ok: true };
  },
});

chatAgent.configure({
  log,
  chatDir: () => activeChatDir(),
  projectsDir: () => activeProjectsDir(),
  accountId: () => getActiveAccount().id,
  getSetting,
  setSetting,
  encodeProjectPath,
  hostPath,
});

/**
 * Bring the manager chat up, or report the one already running.
 *
 * Its own tools are pre-approved; everything else — including delete_session,
 * which is left out of `allowedTools` on purpose — goes through the ordinary
 * permission dialog, the same one every SDK session uses.
 */
// --- Buddy's spend ---
// What the Buddy conversation has cost, for the chip in its header. The SDK's
// `result` carries a running total (total_cost_usd, modelUsage — sub-agents
// included) for the life of one process, and a resumed session starts it from
// zero. So the conversation's figure is what earlier processes reached, kept
// in settings, plus what this one has reached so far. A new conversation (a
// new id) starts from nothing. An estimate at list price, as the CLI's own is.

const spendKey = () => `managerChatSpend:${getActiveAccount().id}`;
const ZERO_SPEND = { cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function addSpend(a, b) {
  return {
    cost: (a.cost || 0) + (b.cost || 0),
    input: (a.input || 0) + (b.input || 0),
    output: (a.output || 0) + (b.output || 0),
    cacheRead: (a.cacheRead || 0) + (b.cacheRead || 0),
    cacheWrite: (a.cacheWrite || 0) + (b.cacheWrite || 0),
  };
}

function storedSpend(sessionId) {
  const stored = getSetting(spendKey());
  return stored?.sessionId === sessionId
    ? { sessionId, base: { ...ZERO_SPEND, ...stored.base }, run: { ...ZERO_SPEND, ...stored.run } }
    : { sessionId, base: { ...ZERO_SPEND }, run: { ...ZERO_SPEND } };
}

function managerSpend(sessionId) {
  const { base, run } = storedSpend(sessionId);
  return { sessionId, ...addSpend(base, run) };
}

/** A new process for the conversation: what the last one reached is banked. */
function bankManagerSpend(sessionId) {
  const s = storedSpend(sessionId);
  setSetting(spendKey(), { sessionId, base: addSpend(s.base, s.run), run: { ...ZERO_SPEND } });
}

function recordManagerSpend(sessionId, result) {
  if (!sessionId || sessionId !== chatAgent.current().sessionId) return;
  const run = { ...ZERO_SPEND, cost: Number(result.total_cost_usd) || 0 };
  for (const u of Object.values(result.modelUsage || {})) {
    run.input += u.inputTokens || 0;
    run.output += u.outputTokens || 0;
    run.cacheRead += u.cacheReadInputTokens || 0;
    run.cacheWrite += u.cacheCreationInputTokens || 0;
  }
  // A crashed turn can report zeros; it does not undo what was already spent.
  const s = storedSpend(sessionId);
  if (run.cost < s.run.cost) return;
  setSetting(spendKey(), { sessionId, base: s.base, run });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('buddy-spend-changed', managerSpend(sessionId));
  }
}

ipcMain.handle('buddy-spend', () => managerSpend(chatAgent.current().sessionId));

// What a person calls an editor, and what macOS calls it. Anything not listed
// is passed to `open -a` as typed, which is right for an app we have not heard
// of and wrong for nothing.
const APP_NAMES = {
  zed: 'Zed',
  phpstorm: 'PhpStorm',
  webstorm: 'WebStorm',
  pycharm: 'PyCharm',
  intellij: 'IntelliJ IDEA',
  'intellij idea': 'IntelliJ IDEA',
  goland: 'GoLand',
  rubymine: 'RubyMine',
  code: 'Visual Studio Code',
  vscode: 'Visual Studio Code',
  'vs code': 'Visual Studio Code',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  sublime: 'Sublime Text',
  'sublime text': 'Sublime Text',
  nova: 'Nova',
  xcode: 'Xcode',
  finder: 'Finder',
  preview: 'Preview',
  safari: 'Safari',
  chrome: 'Google Chrome',
  firefox: 'Firefox',
};

// Editors whose command line takes a line number, and how they take it.
const LINE_ARG = {
  Zed: (file, line) => [`${file}:${line}`],
  'Visual Studio Code': (file, line) => ['--goto', `${file}:${line}`],
  Cursor: (file, line) => ['--goto', `${file}:${line}`],
  PhpStorm: (file, line) => ['--line', String(line), file],
  WebStorm: (file, line) => ['--line', String(line), file],
  PyCharm: (file, line) => ['--line', String(line), file],
  GoLand: (file, line) => ['--line', String(line), file],
  'IntelliJ IDEA': (file, line) => ['--line', String(line), file],
  'Sublime Text': (file, line) => [`${file}:${line}`],
};

// Which of the assistant's own tools run, ask first, or are not given at all.
// The defaults live in tool-policy.js; Settings → Assistant overrides them per
// tool, stored as `mcpTools`.
function managerToolPolicy() {
  return toolPolicy(wootonMcp.TOOL_NAMES, (getSetting('global') || {}).mcpTools);
}
// Manual, fixed — the composer shows it without a picker, and
// sdk-set-permission-mode refuses anything else for this session.
const MANAGER_PERMISSION_MODE = 'default';
const MANAGER_DEFAULT_MODEL = 'haiku';

async function ensureManagerChat() {
  const chat = chatAgent.current();
  if (sdkSession.isSdkSession(chat.sessionId)) return { ok: true, ...chat, running: true };

  // The composer reads the folder's effective settings to show what the session
  // runs on, and for this folder those would be the global ones. Pinned as a
  // project setting so the composer tells the truth:
  //
  //   - permission mode: always Manual ('default'). Its own tools are
  //     pre-approved and everything else must ask — auto-accepting or bypass
  //     would let delete_session through unasked. Not the user's to change
  //     here; see MANAGER_PERMISSION_MODE.
  //   - model: Haiku unless someone picked another. Managing sessions is list,
  //     summarise and brief — fast and cheap is the right default.
  const projectKey = 'project:' + chat.projectPath;
  const projectSettings = getSetting(projectKey) || {};
  const model = projectSettings.model || MANAGER_DEFAULT_MODEL;
  if (projectSettings.permissionMode !== MANAGER_PERMISSION_MODE || !projectSettings.model) {
    setSetting(projectKey, {
      ...projectSettings,
      permissionMode: MANAGER_PERMISSION_MODE,
      dangerouslySkipPermissions: false,
      model,
    });
  }

  // This process's running total starts at zero; bank the last one's first.
  bankManagerSpend(chat.sessionId);

  // Pre-approved, asked about, or withheld — see tool-policy.js. A tool that
  // asks is simply not pre-approved: the ordinary permission dialog does the
  // rest.
  const rules = sdkToolRules(managerToolPolicy());

  // The user may rewrite the role and the response style (Settings →
  // Assistant); an empty setting is "use the default", so an improved default
  // reaches everyone who never edited it.
  const global = getSetting('global') || {};
  const prompt = chatAgent.composeSystemPrompt(global.managerChatPrompt, global.managerChatStyle);
  // Memory is the CLI's own auto-memory; the side panel shows its files.
  watchBuddyMemory();

  const result = await startSdkSessionFor(chat.sessionId, chat.projectPath, chat.isNew, {
    mode: 'sdk',
    permissionMode: MANAGER_PERMISSION_MODE,
    model,
    mcpServers: { wooton: await wootonMcp.wootonMcpServer() },
    allowedTools: rules.allowed,
    // What the prompt asks, the toolset guarantees: the assistant manages work
    // and does none of it, so it has nothing to edit a file or run a command
    // with. Kept out of the editable prompt on purpose — rewriting the text in
    // Settings must not be a way to turn the manager into a coder.
    disallowedTools: [...chatAgent.FORBIDDEN_TOOLS, ...rules.disallowed],
    systemPrompt: { type: 'preset', preset: 'claude_code', append: prompt },
    // The CLI's auto-memory is written with Write and Edit; those work in its
    // memory folder and nowhere else. Decided in the PreToolUse hook because
    // Read never reaches a permission prompt.
    preToolUse: (_id, input) => chatAgent.fileToolVerdict(input?.tool_name, input?.tool_input),
  });
  if (!result.ok) return result;
  return { ok: true, ...chat, running: true };
}

ipcMain.handle('manager-chat-ensure', () => ensureManagerChat().catch(err => ({ ok: false, error: err.message })));

// --- Buddy's memory, as files ---
// The side panel shows the real auto-memory folder. Buddy writes it with the
// CLI's own Write and Edit, so the app hears about a change by watching the
// folder, not from a tool of its own.
let buddyMemoryWatch = null;
let buddyMemoryTimer = null;

function watchBuddyMemory() {
  const dir = chatAgent.memoryDir();
  if (!dir) return;
  if (buddyMemoryWatch?.dir === dir) return;
  try { buddyMemoryWatch?.watcher.close(); } catch {}
  buddyMemoryWatch = null;
  try {
    fs.mkdirSync(hostPath(dir), { recursive: true });
    const watcher = fs.watch(hostPath(dir), () => {
      clearTimeout(buddyMemoryTimer);
      buddyMemoryTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('buddy-memory-changed');
      }, 250);
    });
    buddyMemoryWatch = { dir, watcher };
  } catch (err) {
    log.warn(`[chat] cannot watch memory folder ${dir}: ${err.message}`);
  }
}

ipcMain.handle('buddy-memory', () => {
  watchBuddyMemory();
  return chatAgent.listMemory();
});

// --- Dev: the assistant's toolset, inspectable ---
// Settings → Assistant lists every wooton tool in a development build, and can
// run the read-only ones against the live app — so "what can it do" and "what
// does this tool actually return" have answers without spending a turn.
ipcMain.handle('wooton-mcp-tools', () => {
  const policy = managerToolPolicy();
  const defaults = toolPolicy(wootonMcp.TOOL_NAMES);
  return {
    dev: !app.isPackaged,
    tools: wootonMcp.describeTools().map(t => ({
      ...t,
      state: policy[t.name],
      defaultState: defaults[t.name],
    })),
    forbidden: chatAgent.FORBIDDEN_TOOLS,
    instructions: wootonMcp.INSTRUCTIONS,
  };
});

ipcMain.handle('wooton-mcp-run', async (_event, name, args) => {
  if (app.isPackaged) return { ok: false, error: 'Only available in development builds' };
  // Anything that writes stays with the assistant, where it has a transcript
  // and a permission flow; a debugging form is not the place to start sessions.
  if (!wootonMcp.READ_ONLY_TOOLS.has(name)) return { ok: false, error: 'Only read-only tools can be run from here' };
  return wootonMcp.runTool(name, args);
});

ipcMain.handle('manager-chat-default-prompt', () => chatAgent.systemPromptAppend().trim());
ipcMain.handle('manager-chat-default-style', () => chatAgent.responseStyle().trim());

/** Stop the assistant's process, if any, without forgetting the conversation. */
function stopManagerChat(reason) {
  const chat = chatAgent.current();
  if (!sdkSession.isSdkSession(chat.sessionId)) return;
  denyPending(chat.sessionId, reason);
  sessionStatus.remove(chat.sessionId);
  sdkSession.stopSdkSession(chat.sessionId);
}

// Same conversation, new instructions: a system prompt is fixed for the life of
// the process, so an edited one only lands on a restart. The transcript is
// resumed — nothing the user said to the assistant is lost.
ipcMain.handle('manager-chat-restart', async () => {
  stopManagerChat('The assistant was restarted');
  // The stream's own teardown runs on the next tick; starting again under the
  // same id before it has finished would be refused as already running.
  await new Promise(r => setTimeout(r, 300));
  return ensureManagerChat().catch(err => ({ ok: false, error: err.message }));
});

ipcMain.handle('manager-chat-reset', async () => {
  stopManagerChat('The conversation was reset');
  chatAgent.reset();
  return ensureManagerChat().catch(err => ({ ok: false, error: err.message }));
});

// Both views of the tree in one answer. The renderer needs the archive-filtered
// list and the unfiltered one together on every refresh, and it used to ask for
// them separately — two whole-table scans, two readdirs and two payloads for a
// difference of one filter. See buildProjectSets.
ipcMain.handle('get-project-sets', () => {
  try {
    const needsPopulate = !isCachePopulated(getActiveAccount().id) || !isSearchIndexPopulated();

    if (needsPopulate) {
      populateCacheViaWorker();
      return { visible: [], all: [] };
    }

    return buildProjectSets();
  } catch (err) {
    console.error('Error listing projects:', err);
    return { visible: [], all: [] };
  }
});

// --- IPC: get-plans ---
ipcMain.handle('get-plans', () => {
  try {
    const plansDir = activePlansDir();
    if (!fs.existsSync(plansDir)) return [];
    const files = fs.readdirSync(plansDir).filter(f => f.endsWith('.md'));
    // A plan records no project of its own, so the projects it belongs to are
    // the ones it names: a plan for a repository quotes paths inside it. Good
    // enough to offer a session's own plans beside its notes, and wrong only
    // in the direction of showing one plan in two places.
    const projectPaths = [...new Set([...getAllFolderMeta().values()]
      .map(m => m.projectPath).filter(Boolean))];
    const plans = [];
    for (const file of files) {
      const filePath = path.join(plansDir, file);
      try {
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        const firstLine = content.split('\n').find(l => l.trim());
        const title = firstLine && firstLine.startsWith('# ')
          ? firstLine.slice(2).trim()
          : file.replace(/\.md$/, '');
        plans.push({
          filename: file,
          title,
          modified: stat.mtime.toISOString(),
          projects: projectPaths.filter(p => content.includes(p)),
        });
      } catch {}
    }
    plans.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    // Index plans for FTS
    try {
      deleteSearchType('plan');
      upsertSearchEntries(plans.map(p => ({
        id: p.filename, type: 'plan', folder: null,
        title: p.title,
        body: fs.readFileSync(path.join(plansDir, p.filename), 'utf8'),
      })));
    } catch {}

    return plans;
  } catch (err) {
    console.error('Error reading plans:', err);
    return [];
  }
});

// --- IPC: get-plans-dir ---
// The plans list is account-scoped; the renderer needs the resolved path so an
// empty list can say which directory it actually looked in.
ipcMain.handle('get-plans-dir', () => {
  const account = getActiveAccount();
  const dir = activePlansDir();
  return { dir, exists: fs.existsSync(dir), accountName: account.name, accountId: account.id };
});

// --- IPC: read-plan ---
ipcMain.handle('read-plan', (_event, filename) => {
  try {
    const filePath = path.join(activePlansDir(), path.basename(filename));
    const content = fs.readFileSync(filePath, 'utf8');
    return { content, filePath };
  } catch (err) {
    console.error('Error reading plan:', err);
    return { content: '', filePath: '' };
  }
});

// --- IPC: save-plan ---
ipcMain.handle('save-plan', (_event, filePath, content) => {
  try {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(activePlansDir())) {
      return { ok: false, error: 'path outside plans directory' };
    }
    fs.writeFileSync(resolved, content, 'utf8');
    return { ok: true };
  } catch (err) {
    console.error('Error saving plan:', err);
    return { ok: false, error: err.message };
  }
});

// --- IPC: account notes ---
// Free-form notes and TODO lists. They sit in the account's Claude home next
// to its plans, so they follow the account rather than any one checkout — a
// note can name a project without living inside it.
function activeNotesDir() {
  return path.join(activeConfigDir(), 'notes');
}

ipcMain.handle('get-notes', () => accountNotes.listNotes(activeNotesDir()));

ipcMain.handle('read-note', (_event, filename) => accountNotes.readNote(activeNotesDir(), filename));

ipcMain.handle('save-note', (_event, filePath, content) => accountNotes.saveNote(activeNotesDir(), filePath, content));

ipcMain.handle('create-note', (_event, options) => {
  try {
    return accountNotes.createNote(activeNotesDir(), options || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('delete-note', (_event, filename) => accountNotes.deleteNote(activeNotesDir(), filename));

ipcMain.handle('toggle-note-todo', (_event, filename, index) =>
  accountNotes.toggleTodo(activeNotesDir(), filename, index));

ipcMain.handle('set-note-projects', (_event, filename, projectPaths) =>
  accountNotes.setNoteProjects(activeNotesDir(), filename, projectPaths));

// Due dates: one item's (a `due:` token on its line) or the whole list's (a
// `due:` frontmatter key). A null date clears it. See todo-due.js.
ipcMain.handle('set-note-todo-due', (_event, filename, index, due) =>
  accountNotes.setTodoDue(activeNotesDir(), filename, index, due || null));

ipcMain.handle('set-note-due', (_event, filename, due) =>
  accountNotes.setNoteDue(activeNotesDir(), filename, due || null));

ipcMain.handle('set-note-archived', (_event, filename, archived) =>
  accountNotes.setNoteArchived(activeNotesDir(), filename, !!archived));

// Stats for one account: its own rows in the session cache, enriched with the
// stats-cache.json `claude /stats` wrote into that account's config dir. The
// accounts panel is the only reader — there is one stats data path.
function buildStatsForAccount(account) {
  const dbStats = computeStatsFromDb(account.id);
  try {
    const statsPath = path.join(account.configDir, 'stats-cache.json');
    if (fs.existsSync(statsPath)) {
      const fileStats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
      // Prefer file stats (has rich token data) but fall back to DB for activity data
      if (!fileStats.dailyActivity?.length && dbStats.dailyActivity.length) {
        fileStats.dailyActivity = dbStats.dailyActivity;
      }
      if (!fileStats.totalSessions) fileStats.totalSessions = dbStats.totalSessions;
      if (!fileStats.totalMessages) fileStats.totalMessages = dbStats.totalMessages;
      return fileStats;
    }
  } catch (err) {
    console.error('Error reading stats cache:', err);
  }
  // No file cache — return DB-computed stats so charts always render
  return dbStats;
}

// --- IPC: refresh-stats (run /stats + /usage via PTY) ---
ipcMain.handle('refresh-stats', async () => {
  // For stats, use the configured shell profile — unless the account lives in a
  // distribution, in which case that is where its `claude` binary and its
  // credentials are, and a Windows shell could reach neither.
  const globalSettings = getSetting('global') || {};
  const statsDistro = activeWslDistro();
  const statsProfileId = globalSettings.shellProfile || SETTING_DEFAULTS.shellProfile;
  const statsShellProfile = resolveShell(statsDistro ? 'wsl:' + statsDistro : statsProfileId);
  const statsShell = statsShellProfile.path;
  const statsShellExtraArgs = statsShellProfile.args || [];
  const statsInWsl = isWslShell(statsShell);
  if (statsDistro && !statsInWsl) {
    // Same shape as the handler's other failure path — the renderer reads
    // .stats/.usage and would silently ignore anything else.
    log.error(`[stats] WSL distribution "${statsDistro}" is not available`);
    return { stats: null, usage: {} };
  }
  const configDir = activeConfigDir();
  const ptyEnv = {
    ...cleanPtyEnv,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'iTerm.app',
    TERM_PROGRAM_VERSION: '3.6.6',
    FORCE_COLOR: '3',
    // No ITERM_SESSION_ID: without it Claude CLI won't try to reach iTerm2 via AppleScript,
    // which avoids the macOS "would like to access data from other apps" permission prompt.
    // CLAUDE_CONFIG_DIR is skipped for a WSL account: its configDir is the
    // Windows view of a home that is already the default inside the distro.
    ...(configDir !== DEFAULT_CLAUDE_DIR && !statsDistro ? { CLAUDE_CONFIG_DIR: configDir } : {}),
  };
  if (statsInWsl) {
    Object.assign(ptyEnv, withWslEnv(ptyEnv, [
      'TERM', 'COLORTERM', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'FORCE_COLOR',
    ]));
  }

  // Helper: spawn claude with args, collect output, auto-accept trust, kill when idle
  // waitFor: optional regex tested against stripped output — finish only when matched
  function runClaude(args, { timeoutMs = 15000, waitFor = null } = {}) {
    return new Promise((resolve) => {
      let output = '';
      let settled = false;
      let trustAccepted = false;
      // Track idle: ✳ in OSC title means Claude is idle and waiting for input
      let sawActivity = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        try { p.kill(); } catch {}
        resolve(output);
      };

      const claudeCmd = `claude ${args}`;
      const p = pty.spawn(statsShell, shellArgs(statsShell, claudeCmd, statsShellExtraArgs), {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: os.homedir(),
        env: ptyEnv,
      });

      const strip = (s) => s
        .replace(/\x1b\[[^@-~]*[@-~]/g, '')
        .replace(/\x1b\][^\x07]*\x07/g, '')
        .replace(/\x1b[^[\]].?/g, '');

      p.onData((data) => {
        output += data;

        // Auto-accept trust directory prompt (Enter selects "1. Yes")
        if (!trustAccepted) {
          if (/trust\s*this\s*folder/i.test(strip(output))) {
            trustAccepted = true;
            try { p.write('\r'); } catch {}
            return;
          }
        }

        // If waitFor is set, finish when that pattern appears in stripped output
        if (waitFor) {
          if (waitFor.test(strip(output))) {
            finish();
          }
          return;
        }

        // Default: detect busy→idle transition via OSC title containing ✳
        if (!sawActivity) {
          const oscTitle = data.match(/\x1b\]0;([^\x07\x1b]*)/);
          if (oscTitle) {
            const first = oscTitle[1].charAt(0);
            if (first.charCodeAt(0) >= 0x2800 && first.charCodeAt(0) <= 0x28FF) {
              sawActivity = true;
            }
          }
        } else if (data.includes('\u2733')) {
          finish();
        }
      });

      p.onExit(() => finish());
      setTimeout(finish, timeoutMs);
    });
  }

  try {
    // Run /stats via PTY (for heatmap/chart data) and fetch usage via API in parallel
    const [, usage] = await Promise.all([
      runClaude('"/stats"', { waitFor: /streak/i, timeoutMs: 10000 }),
      fetchAndTransformUsage(configDir).catch(() => ({})),
    ]);

    // Read refreshed stats cache (written to active account's config dir)
    const activeAccount = getActiveAccount();
    const dbStats = computeStatsFromDb(activeAccount.id);
    let stats = dbStats;
    try {
      const statsPath = path.join(configDir, 'stats-cache.json');
      if (fs.existsSync(statsPath)) {
        const fileStats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        if (!fileStats.dailyActivity?.length && dbStats.dailyActivity.length) {
          fileStats.dailyActivity = dbStats.dailyActivity;
        }
        if (!fileStats.totalSessions) fileStats.totalSessions = dbStats.totalSessions;
        if (!fileStats.totalMessages) fileStats.totalMessages = dbStats.totalMessages;
        stats = fileStats;
      }
    } catch {}

    return { stats, usage: usage || {} };
  } catch (err) {
    log.error('Error refreshing stats:', err);
    return { stats: null, usage: {} };
  }
});

// --- IPC: get-memories ---
function folderToShortPath(folder) {
  // Convert "-Users-home-dev-MyClaude" → "dev/MyClaude"
  const parts = folder.replace(/^-/, '').split('-');
  const meaningful = parts.filter(Boolean);
  return meaningful.slice(-2).join('/');
}

/** Scan a directory for .md files (non-recursive). Returns array of { filename, filePath, modified }. */
// `dir` is canonical: a Windows path, or the POSIX path of a WSL-backed
// project. Reported filePaths keep that same flavour; only the fs calls are
// translated.
function scanMdFiles(dir) {
  const results = [];
  try {
    if (!fs.existsSync(hostPath(dir))) return results;
    const entries = fs.readdirSync(hostPath(dir), { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.md')) {
        const fp = projectJoin(dir, e.name);
        const content = fs.readFileSync(hostPath(fp), 'utf8').trim();
        if (content) {
          const stat = fs.statSync(hostPath(fp));
          results.push({ filename: e.name, filePath: fp, modified: stat.mtime.toISOString() });
        }
      }
    }
  } catch {}
  return results;
}

ipcMain.handle('get-memories', () => {
  const global = getSetting('global') || {};
  const hiddenProjects = new Set(global.hiddenProjects || []);

  // --- Global files ---
  // The active account's Claude home, not the Windows one: a WSL account's
  // global CLAUDE.md lives inside the distribution.
  const globalFiles = scanMdFiles(activeConfigDir()).map(f => ({ ...f, displayPath: '~/.claude' }));

  // --- Per-project files ---
  const projects = [];
  try {
    const memoriesProjectsDir = activeProjectsDir();
    if (fs.existsSync(memoriesProjectsDir)) {
      const folders = fs.readdirSync(memoriesProjectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== '.git')
        .map(d => d.name);

      for (const folder of folders) {
        const folderPath = path.join(memoriesProjectsDir, folder);
        const projectPath = deriveProjectPath(folderPath, folder);
        if (projectPath && hiddenProjects.has(projectPath)) continue;

        // Use same 2-deep short path as Sessions tab (e.g. "dev/MyClaude")
        const shortName = projectPath
          ? projectPath.split('/').filter(Boolean).slice(-2).join('/')
          : folderToShortPath(folder);
        const files = [];
        const seenPaths = new Set();

        // 1. ~/.claude/projects/{folder}/ — claude-home .md files
        const claudeHomeFiles = scanMdFiles(folderPath);
        for (const f of claudeHomeFiles) {
          files.push({ ...f, displayPath: '~/.claude', source: 'claude-home' });
          seenPaths.add(f.filePath);
        }
        // memory/MEMORY.md
        const memoryDir = path.join(folderPath, 'memory');
        const memoryFiles = scanMdFiles(memoryDir);
        for (const f of memoryFiles) {
          files.push({ ...f, displayPath: '~/.claude', source: 'claude-home' });
          seenPaths.add(f.filePath);
        }

        // 2. {projectPath}/ — project root CLAUDE.md, agents.md
        if (projectPath) {
          for (const name of ['CLAUDE.md', 'GEMINI.md', 'agents.md']) {
            const fp = projectJoin(projectPath, name);
            try {
              if (fs.existsSync(hostPath(fp))) {
                const content = fs.readFileSync(hostPath(fp), 'utf8').trim();
                if (content && !seenPaths.has(fp)) {
                  const stat = fs.statSync(hostPath(fp));
                  files.push({ filename: name, filePath: fp, modified: stat.mtime.toISOString(), displayPath: shortName + '/', source: 'project' });
                  seenPaths.add(fp);
                }
              }
            } catch {}
          }

          // 3. {projectPath}/.claude/ — commands/*.md and other .md files
          const dotClaudeDir = projectJoin(projectPath, '.claude');
          const dotClaudeFiles = scanMdFiles(dotClaudeDir);
          for (const f of dotClaudeFiles) {
            if (!seenPaths.has(f.filePath)) {
              files.push({ ...f, displayPath: shortName + '/.claude/', source: 'project' });
              seenPaths.add(f.filePath);
            }
          }
          // commands/*.md
          const commandsDir = projectJoin(dotClaudeDir, 'commands');
          const commandFiles = scanMdFiles(commandsDir);
          for (const f of commandFiles) {
            if (!seenPaths.has(f.filePath)) {
              files.push({ ...f, displayPath: shortName + '/.claude/commands/', source: 'project' });
              seenPaths.add(f.filePath);
            }
          }
        }

        if (files.length > 0) {
          projects.push({ folder, projectPath: projectPath || '', shortName, files });
        }
      }
    }
  } catch (err) {
    console.error('Error scanning memories:', err);
  }

  // Sort projects by most recent file modified date
  projects.sort((a, b) => {
    const aMax = Math.max(...a.files.map(f => new Date(f.modified).getTime()));
    const bMax = Math.max(...b.files.map(f => new Date(f.modified).getTime()));
    return bMax - aMax;
  });

  const result = { global: { files: globalFiles }, projects };

  // Index all files for FTS
  try {
    deleteSearchType('memory');
    const allFiles = [
      ...globalFiles.map(f => ({ ...f, label: 'Global' })),
      ...projects.flatMap(p => p.files.map(f => ({ ...f, label: p.shortName }))),
    ];
    // filePath is canonical; one unreadable file would otherwise throw out of
    // the whole batch and leave memory search unindexed entirely.
    upsertSearchEntries(allFiles.map(f => {
      let body = '';
      try { body = fs.readFileSync(hostPath(f.filePath), 'utf8'); } catch {}
      return {
        id: f.filePath, type: 'memory', folder: null,
        title: f.label + ' ' + f.filename,
        body,
      };
    }));
  } catch {}

  return result;
});

// --- IPC: search ---
ipcMain.handle('search', (_event, type, query, titleOnly) => {
  return searchByType(type, query, 50, !!titleOnly);
});

// --- IPC: settings ---
ipcMain.handle('get-setting', (_event, key) => {
  return getSetting(key);
});

ipcMain.handle('set-setting', (_event, key, value) => {
  const before = key === 'global' ? JSON.stringify((getSetting('global') || {}).mcpTools || {}) : null;
  setSetting(key, value);
  if (key === 'global') {
    // The menu-bar light follows its setting at once, not at the next launch.
    applyTraySetting(); trayMenuKey = ''; scheduleTrayUpdate();
    // Which tools the assistant has is fixed when its session starts, so a
    // change to that only means anything after a restart. Stopping it here is
    // enough: the Chat tab brings it back on the next message.
    if (JSON.stringify(value?.mcpTools || {}) !== before) {
      stopManagerChat('Tool permissions changed — the assistant restarts with them');
    }
  }
  return { ok: true };
});

// --- Multi-account IPCs ---

ipcMain.handle('get-accounts', () => getAccounts());

ipcMain.handle('create-account', (_event, name) => {
  const { randomUUID } = require('crypto');
  const id = 'acc-' + randomUUID().replace(/-/g, '').slice(0, 12);
  const configDir = path.join(os.homedir(), '.wootonpad', 'accounts', id);
  fs.mkdirSync(configDir, { recursive: true });
  const account = { id, name, configDir };
  const existing = getAccounts();
  setSetting('accounts', [...existing, account]);
  return account;
});

// Distributions that hold a reachable Claude home, for the "add account" UI.
ipcMain.handle('discover-wsl-claude-homes', async () => {
  try { return await discoverWslClaudeHomes(); } catch { return []; }
});

// Attach an account to the Claude home inside a WSL distribution. Additive:
// accounts without `wslDistro` keep behaving exactly as before.
ipcMain.handle('create-wsl-account', async (_event, distro, name) => {
  const existingForDistro = getAccounts().find(a => a.wslDistro === distro);
  if (existingForDistro) return existingForDistro;
  const probe = await probeWslClaudeHome(distro);
  if (!probe) return { error: `No reachable Claude home in WSL distribution "${distro}"` };
  const { randomUUID } = require('crypto');
  const id = 'wsl-' + randomUUID().replace(/-/g, '').slice(0, 12);
  const account = {
    id,
    name: name || `WSL — ${distro}`,
    configDir: probe.configDir,
    wslDistro: probe.distro,
    wslUncPrefix: probe.uncPrefix,
    wslHome: probe.home,
  };
  setSetting('accounts', [...getAccounts(), account]);
  return account;
});

ipcMain.handle('rename-account', (_event, id, name) => {
  const updated = getAccounts().map(a => a.id === id ? { ...a, name } : a);
  setSetting('accounts', updated);
  return { ok: true };
});

ipcMain.handle('delete-account', (_event, id) => {
  if (id === 'default') return { ok: false };
  const updated = getAccounts().filter(a => a.id !== id);
  setSetting('accounts', updated);
  return { ok: true };
});

ipcMain.handle('get-homedir', () => os.homedir());

ipcMain.handle('get-active-account-id', () => {
  return (getSetting('global') || {}).activeAccountId || 'default';
});

ipcMain.handle('set-active-account-id', (_event, accountId) => {
  const global = getSetting('global') || {};
  global.activeAccountId = accountId;
  setSetting('global', global);

  // Re-init session cache for new account and trigger re-scan. Fork/plan-accept
  // detection holds its own copy of the projects directory, so it has to be
  // re-pointed too — otherwise it keeps watching the previous account's folder.
  initSessionCache();
  require('./session-transitions').init({
    PROJECTS_DIR: activeProjectsDir(), activeSessions, getMainWindow: () => mainWindow, log, rekeyMcpServer,
  });
  restartProjectsWatcher();
  populateCacheViaWorker();
  return { ok: true };
});

ipcMain.handle('get-accounts-usage', async () => {
  const accounts = getAccounts();
  const results = {};
  await Promise.all(accounts.map(async (account) => {
    const cacheKey = 'usage:' + account.id;
    try {
      const usage = await fetchAndTransformUsage(account.configDir);
      if (usage && !usage._error && !usage._rateLimited && Object.keys(usage).length) {
        setSetting(cacheKey, usage);
        results[account.id] = usage;
      } else {
        const cached = getSetting(cacheKey);
        results[account.id] = cached ? { ...cached, _cached: true } : (usage || {});
      }
    } catch {
      const cached = getSetting(cacheKey);
      results[account.id] = cached ? { ...cached, _cached: true } : {};
    }
  }));
  return results;
});

// --- Account detail panel ---
// Everything below reads one account's own Claude home. An account's configDir
// is already host-usable (the WSL flavour stores the UNC view), so plain fs
// calls are correct here — but nothing composes a project path, and nothing
// builds a shell string, so rules 2 and 3 of the WSL contract stay intact.

// Files the panel is willing to open, all directly inside configDir. This is an
// allowlist, not a hint: `.credentials.json` deliberately never appears, and no
// name here contains a separator. `.claude.json` only lives in configDir for a
// non-default account — for the default one Claude keeps it at ~/.claude.json,
// outside the config dir, so it is surfaced as a path and never read here.
const ACCOUNT_CONFIG_FILES = ['settings.json', 'settings.local.json', '.claude.json', '.mcp.json'];
const ACCOUNT_FILE_MAX_BYTES = 2 * 1024 * 1024;

function findAccount(accountId) {
  return getAccounts().find(a => a.id === accountId) || null;
}

// Resolve `name` inside the account's config dir, or null if it escapes it.
// The allowlist already forbids separators; the resolve check is the backstop
// that makes that guarantee independent of the list.
function resolveAccountFile(account, name) {
  if (!ACCOUNT_CONFIG_FILES.includes(name)) return null;
  const root = path.resolve(account.configDir);
  const resolved = path.resolve(root, name);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function statAccountFile(account, name) {
  const filePath = resolveAccountFile(account, name);
  if (!filePath) return null;
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile()) return null;
    return { name, path: filePath, size: st.size, mtime: st.mtime.toISOString() };
  } catch {
    return null;
  }
}

// The OAuth record, minus anything secret. accessToken/refreshToken never leave
// the main process — the renderer only needs to know a token is there and when
// it lapses.
function accountTokenInfo(account) {
  let oauth = null;
  try { oauth = getOAuthToken(account.configDir); } catch { oauth = null; }
  if (!oauth?.accessToken) return { present: false };
  const expiresAt = typeof oauth.expiresAt === 'number'
    ? (oauth.expiresAt > 1e12 ? oauth.expiresAt : oauth.expiresAt * 1000)
    : null;
  return {
    present: true,
    // Where the credential came from, so the panel can explain a missing file.
    source: fs.existsSync(path.join(account.configDir, '.credentials.json'))
      ? 'credentials file'
      : (process.platform === 'darwin' ? 'macOS Keychain' : 'credentials file'),
    expiresAt,
    expired: expiresAt != null ? expiresAt <= Date.now() : false,
    scopes: Array.isArray(oauth.scopes) ? oauth.scopes : [],
    subscriptionType: oauth.subscriptionType || null,
  };
}

// One round trip for the panel's static half: paths, which config files exist,
// whether a token is on file, and the last usage figures already in the DB.
// Nothing here touches the network.
// Resolving `claude` to an absolute path is not optional. An app launched from
// Finder or the Dock inherits launchd's minimal PATH — /usr/bin:/bin:/usr/sbin:
// /sbin — not the shell's, so `spawn('claude')` fails with ENOENT in a packaged
// build while working fine under `npm start`, which is launched from a terminal.
// Same reason DOCKER_ENV exists above.
//
// Order: ask a login shell first, since that is where nvm/mise/asdf/bun put the
// binary, then fall back to the locations the installers actually use.
const CLAUDE_EXTRA_PATH = [
  path.join(os.homedir(), '.local', 'bin'),
  path.join(os.homedir(), '.claude', 'local'),
  path.join(os.homedir(), '.bun', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
];

let _claudeBinary;
function resolveClaudeBinary() {
  if (_claudeBinary !== undefined) return _claudeBinary;
  const { execFileSync } = require('child_process');
  const opts = { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] };
  _claudeBinary = null;

  if (process.platform === 'win32') {
    try {
      const out = execFileSync('where', ['claude'], opts);
      _claudeBinary = out.split(/\r?\n/).map(s => s.trim()).find(Boolean) || null;
    } catch {}
  } else {
    // -l so the profile that sets up the version manager is sourced. SHELL can
    // be absent under launchd, hence the explicit default.
    for (const args of [['-lc', 'command -v claude'], ['-c', 'command -v claude']]) {
      try {
        const out = execFileSync(process.env.SHELL || '/bin/zsh', args, opts);
        const hit = out.split('\n').map(s => s.trim()).find(Boolean);
        if (hit && fs.existsSync(hit)) { _claudeBinary = hit; break; }
      } catch {}
    }
    if (!_claudeBinary) {
      for (const dir of CLAUDE_EXTRA_PATH) {
        const candidate = path.join(dir, 'claude');
        try { fs.accessSync(candidate, fs.constants.X_OK); _claudeBinary = candidate; break; } catch {}
      }
    }
  }

  // Nothing found: keep the bare name so the failure is an honest ENOENT rather
  // than a path we invented.
  if (!_claudeBinary) _claudeBinary = 'claude';
  return _claudeBinary;
}

// The CLI shells out to git, node and friends, which are equally missing from
// launchd's PATH.
function claudeChildPath() {
  const extra = process.platform === 'win32' ? [] : CLAUDE_EXTRA_PATH;
  return [process.env.PATH || '', ...extra].filter(Boolean).join(path.delimiter);
}

// The SDK would otherwise use the `claude` it bundles — a second copy of the
// CLI, on its own release cadence, resolving its own account. Point it at the
// same binary every PTY session already runs.
sdkSession.configure({ log, resolveClaudeBinary, claudeChildPath });

function posixQuote(value) {
  return /^[A-Za-z0-9_./:@%+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

// Mirrors what the PTY spawn actually does (see the CLAUDE_CONFIG_DIR block in
// open-terminal): inside a WSL distribution that home is already the default
// and the Windows view of it is not a path Claude could resolve there.
function accountLaunchCommand(account) {
  const distro = accountWslDistro(account);
  if (distro) return `wsl.exe -d ${distro} -- claude`;
  return `CLAUDE_CONFIG_DIR=${posixQuote(account.configDir)} ${posixQuote(resolveClaudeBinary())}`;
}

ipcMain.handle('get-account-detail', (_event, accountId) => {
  const account = findAccount(accountId);
  if (!account) return { ok: false, error: 'unknown account' };

  let configDirExists = false;
  try { configDirExists = fs.statSync(account.configDir).isDirectory(); } catch {}

  const files = ACCOUNT_CONFIG_FILES.map(n => statAccountFile(account, n)).filter(Boolean);

  // ~/.claude.json for the default account: outside configDir, so read-only as
  // a path. Offered because it is the file people actually want to point at.
  const externalFiles = [];
  if (account.configDir === DEFAULT_CLAUDE_DIR) {
    const homeJson = path.join(os.homedir(), '.claude.json');
    try {
      const st = fs.statSync(homeJson);
      if (st.isFile()) {
        externalFiles.push({ name: '.claude.json', path: homeJson, size: st.size, mtime: st.mtime.toISOString() });
      }
    } catch {}
  }

  const cached = getSetting('usage:' + account.id);

  return {
    ok: true,
    account: {
      id: account.id,
      name: account.name,
      configDir: account.configDir,
      wslDistro: account.wslDistro || null,
      wslHome: account.wslHome || null,
    },
    isActive: getActiveAccount().id === account.id,
    configDirExists,
    launchCommand: accountLaunchCommand(account),
    files,
    externalFiles,
    token: accountTokenInfo(account),
    usage: cached ? { ...cached, _cached: true } : {},
  };
});

// Read one allowlisted config file out of the account's own config dir.
ipcMain.handle('read-account-config-file', (_event, accountId, name) => {
  const account = findAccount(accountId);
  if (!account) return { ok: false, error: 'unknown account' };
  const filePath = resolveAccountFile(account, name);
  if (!filePath) return { ok: false, error: 'file not readable for this account' };
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile()) return { ok: false, error: 'not a file' };
    const truncated = st.size > ACCOUNT_FILE_MAX_BYTES;
    const content = truncated
      ? fs.readFileSync(filePath, 'utf8').slice(0, ACCOUNT_FILE_MAX_BYTES)
      : fs.readFileSync(filePath, 'utf8');
    return { ok: true, name, path: filePath, size: st.size, truncated, content };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// "Am I still signed in?" — asks the usage API and reports what the status code
// means. 401/403 is the reachable case the CLI logs today: the token is on disk
// but the server has stopped accepting it.
ipcMain.handle('check-account-auth', async (_event, accountId) => {
  const account = findAccount(accountId);
  if (!account) return { ok: false, state: 'unknown', message: 'unknown account' };
  try {
    const probe = await probeUsage(account.configDir);
    if (!probe.tokenPresent) {
      return { ok: true, state: 'missing', status: 0, message: 'No OAuth token found for this account.' };
    }
    if (probe.ok) {
      const usage = probe.usage || {};
      if (Object.keys(usage).length) setSetting('usage:' + account.id, usage);
      return { ok: true, state: 'authorized', status: probe.status, message: 'Token accepted by the usage API.', usage };
    }
    if (probe.status === 401 || probe.status === 403) {
      return { ok: true, state: 'expired', status: probe.status, message: 'The API rejected this token — sign in again with `claude` in this account.' };
    }
    if (probe.status === 429) {
      const mins = Math.ceil((probe.retryAfterSeconds || 0) / 60);
      return {
        ok: true,
        state: 'rate-limited',
        status: 429,
        message: mins > 0 ? `Usage API rate limited — retry in ~${mins} min.` : 'Usage API rate limited — retry later.',
      };
    }
    return { ok: true, state: 'error', status: probe.status, message: `Usage API returned ${probe.status}.` };
  } catch (err) {
    return { ok: true, state: 'network', status: 0, message: err.message || 'Could not reach the usage API.' };
  }
});

// Same stats data path as the active-account Stats tab, pointed at one account.
ipcMain.handle('get-account-stats', (_event, accountId) => {
  const account = findAccount(accountId);
  if (!account) return null;
  return buildStatsForAccount(account);
});

// --- Account MCP servers and plugins ---
// Claude keeps user-scoped state in .claude.json, which for the default
// account sits beside the config dir rather than inside it. mcp-inventory is
// told which, instead of guessing from a path.
function accountUserConfigPath(account) {
  return account.configDir === DEFAULT_CLAUDE_DIR
    ? path.join(os.homedir(), '.claude.json')
    : path.join(account.configDir, '.claude.json');
}

function accountInventoryArgs(account) {
  return {
    configDir: account.configDir,
    userConfigPath: accountUserConfigPath(account),
    // Bound to this account rather than the selected one: the inventory is
    // read for whichever account the panel is showing.
    hostPath: p => accountHostPath(account, p),
  };
}

// Rule 3 of the WSL contract: a stdio server configured in a distribution's
// Claude home is a command that only exists inside that distribution, so the
// probe has to run there too.
function accountWrapArgv(account) {
  const distro = accountWslDistro(account);
  if (!distro) return null;
  return (argv) => ['wsl.exe', wslExecArgs(distro, account.wslHome || null, argv)];
}

ipcMain.handle('get-account-mcp', (_event, accountId) => {
  const account = findAccount(accountId);
  if (!account) return { ok: false, error: 'unknown account' };
  try {
    return { ok: true, ...mcpInventory.readMcpInventory(accountInventoryArgs(account)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Probes one configured server. The renderer sends the inventory id; the
// command or URL behind it is read back out of the account's own files, so
// nothing the renderer says decides what gets spawned or fetched.
ipcMain.handle('check-account-mcp', async (_event, accountId, id) => {
  const account = findAccount(accountId);
  if (!account) return { state: 'error', message: 'unknown account' };
  const config = mcpInventory.resolveServerConfig({ ...accountInventoryArgs(account), id });
  if (!config) return { state: 'error', message: 'Server is no longer in this account’s configuration.' };
  try {
    return await probeMcpServer(config, {
      wrapArgv: accountWrapArgv(account),
      // Same PATH the CLI's own children get: a stdio server launched via npx
      // or a version-managed node is not on launchd's PATH.
      env: { PATH: claudeChildPath() },
    });
  } catch (err) {
    return { state: 'error', message: err.message || 'Check failed.' };
  }
});

ipcMain.handle('add-account-mcp', (_event, accountId, definition) => {
  const account = findAccount(accountId);
  if (!account) return { ok: false, error: 'unknown account' };
  try {
    const added = mcpInventory.addMcpServer({ configDir: account.configDir, definition });
    log.info('[mcp] added server', added.name, 'to', added.path);
    return { ok: true, ...added };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('remove-account-mcp', (_event, accountId, name) => {
  const account = findAccount(accountId);
  if (!account) return { ok: false, error: 'unknown account' };
  try {
    const removed = mcpInventory.removeMcpServer({ configDir: account.configDir, name });
    log.info('[mcp] removed server', removed.name, 'from', removed.path);
    return { ok: true, ...removed };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// --- Plugin marketplaces ---
// Browsing is a read of the marketplace checkouts already on disk. Installing
// is the CLI's job: it resolves the source, clones it, and may run a command
// the marketplace declares — reimplementing that here would be a second,
// divergent installer.
const PLUGIN_COMMAND_TIMEOUT_MS = 180000;

// `claude` as one account, in that account's own Claude home rather than in a
// project. The WSL flavour runs inside the distribution, where both the home
// and the binary actually live — its Windows configDir would mean nothing
// there, so CLAUDE_CONFIG_DIR is left off, exactly as the PTY spawn does.
//
// `cwd` is for the commands that are about a checkout rather than the account:
// `plugin enable --scope project` writes into the project the CLI finds from
// where it is standing, so it has to stand in the right one.
function runAccountClaude(account, argv, { timeoutMs = PLUGIN_COMMAND_TIMEOUT_MS, cwd = null } = {}) {
  const { spawn } = require('child_process');
  const distro = accountWslDistro(account);
  const [file, args, options] = distro
    ? ['wsl.exe', wslExecArgs(distro, cwd || account.wslHome || null, ['claude', ...argv]), {}]
    : [resolveClaudeBinary(), argv, {
      cwd: (cwd && accountHostPath(account, cwd)) || os.homedir(),
      env: {
        ...process.env,
        PATH: claudeChildPath(),
        // A marketplace clone that needs credentials would otherwise sit on a
        // password prompt no one can see until the timeout expires.
        GIT_TERMINAL_PROMPT: '0',
        ...(account.configDir === DEFAULT_CLAUDE_DIR ? {} : { CLAUDE_CONFIG_DIR: account.configDir }),
      },
    }];

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(file, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      resolve({ ok: false, error: err.message });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ ok: false, error: `Timed out after ${Math.round(timeoutMs / 1000)}s.`, output: stdout.trim() });
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.code === 'ENOENT' ? 'The claude CLI was not found.' : err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
      resolve(code === 0
        ? { ok: true, output }
        : { ok: false, error: stderr.trim() || stdout.trim() || `claude exited with code ${code}.`, output });
    });
  });
}

ipcMain.handle('get-plugin-catalog', (_event, accountId, options) => {
  const account = findAccount(accountId);
  if (!account) return { ok: false, error: 'unknown account' };
  try {
    // What is already installed comes from the same inventory the panel shows,
    // so "Installed" cannot disagree between the two lists.
    const installedKeys = mcpInventory
      .readMcpInventory(accountInventoryArgs(account))
      .plugins.map(p => p.key);
    const result = pluginCatalog.searchCatalog(account.configDir, { ...(options || {}), installedKeys });
    return { ok: true, official: pluginCatalog.OFFICIAL_MARKETPLACE, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// The checkout a project- or local-scoped command is about. Looked up in the
// inventory rather than taken from the renderer: the cwd decides which
// settings file the CLI rewrites, and it should only ever be a directory this
// account already has that plugin installed against.
function pluginProjectCwd(account, options) {
  const scope = options?.scope;
  if (scope !== 'project' && scope !== 'local') return null;
  const key = String(options?.plugin || '');
  if (!key) return null;
  try {
    const row = mcpInventory.readMcpInventory(accountInventoryArgs(account))
      .plugins.find(p => p.key === key && p.projectPath);
    return row?.projectPath || null;
  } catch {
    return null;
  }
}

// install / uninstall / enable / disable / add-marketplace. The argv is built
// and validated in plugin-catalog; nothing from the renderer reaches execFile
// unchecked, and there is no shell in the path.
ipcMain.handle('plugin-command', async (_event, accountId, action, options) => {
  const account = findAccount(accountId);
  if (!account) return { ok: false, error: 'unknown account' };
  let argv;
  try {
    argv = pluginCatalog.pluginCommandArgv(action, options || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const cwd = action === 'add-marketplace' ? null : pluginProjectCwd(account, options);
  log.info('[plugins]', account.id, argv.join(' '), cwd ? `(in ${cwd})` : '');
  const result = await runAccountClaude(account, argv, { cwd });
  if (!result.ok) log.warn('[plugins] failed:', result.error);
  return result;
});

// --- Scheduled tasks ---
const scheduleIpc = require('./schedule-ipc');

const COMMIT_MSG_PROMPT_DEFAULT = `Write a concise git commit message (max 72 chars for first line) for these changes. Use conventional commit format (feat/fix/refactor/docs/chore). Output ONLY the commit message, no explanation:`;

const SETTING_DEFAULTS = {
  permissionMode: null,
  // What a new session starts on. Both are per-project with a global fallback,
  // like everything else here — a repo you plan in and a repo you grind in want
  // different answers. null means "whatever the CLI picks", which is what the
  // app did before these existed.
  model: null,
  effort: null,
  dangerouslySkipPermissions: false,
  worktree: false,
  worktreeName: '',
  chrome: false,
  preLaunchCmd: '',
  addDirs: '',
  visibleSessionCount: 5,
  sidebarWidth: 340,
  terminalTheme: 'wootonpadDark',
  mcpEmulation: false,
  shellProfile: 'auto',
  showAvatars: true,
  commitMessagePrompt: '',
  // 'pty'  — spawn the CLI in a terminal, the way this app always has.
  // 'sdk'  — drive the same CLI through the Agent SDK and render the
  //          conversation as structured messages. Same account, same
  //          transcript on disk; different transport and different view.
  sessionMode: 'pty',
  // Stills the board's card flight. The OS-level prefers-reduced-motion is
  // honoured on its own; this is for people whose system says nothing but who
  // still want the movement gone.
  reduceMotion: false,
  // The language board and session summaries are written in, as a plain
  // language name the prompt can carry. Empty means the model answers in
  // whatever the transcript is in.
  summaryLanguage: '',
  // Unread counters on session rows, Buddy and the tabs. Off unless asked for:
  // a number on every row is a lot of new ink for someone who did not want it.
  unreadCounters: false,
  // Five strings, or fewer: the buttons over Buddy's chat. A blank one is the
  // default (src/vue/buddy-suggestions.js).
  buddyPrompts: [],
  // Which robot the mascot is — src/vue/buddy-designs.js.
  buddyDesign: 'classic',
  // Per-tool overrides for Buddy's own tools: name → 'auto' | 'ask' | 'off'.
  // Only what differs from tool-policy.js's defaults is stored.
  mcpTools: {},
  // System notifications — see session-alerts.js. A finished turn notifies
  // only past notifyMinWorkSeconds; a session waiting on you always does, with
  // a sound unless notifySound is off.
  notifyEnabled: true,
  notifyMinWorkSeconds: 3,
  notifySound: true,
  // The menu-bar status light (macOS) — see tray-status.js.
  trayIcon: true,
};

ipcMain.handle('get-shell-profiles', () => {
  _shellProfiles = null; // refresh on each request
  return getShellProfiles();
});

ipcMain.handle('get-effective-settings', (_event, projectPath) => {
  const global = getSetting('global') || {};
  const project = projectPath ? (getSetting('project:' + projectPath) || {}) : {};
  const effective = { ...SETTING_DEFAULTS };
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    if (global[key] !== undefined && global[key] !== null) {
      effective[key] = global[key];
    }
    if (project[key] !== undefined && project[key] !== null) {
      effective[key] = project[key];
    }
  }
  return effective;
});

// --- IPC: get-active-sessions ---
ipcMain.handle('get-active-sessions', () => {
  const active = [];
  for (const [sessionId, session] of activeSessions) {
    // Ephemeral shells belong to the session side panel, which owns their whole
    // lifecycle. They are not sessions the sidebar or the grid may know about.
    if (!session.exited && !session.isEphemeral) active.push(sessionId);
  }
  // SDK sessions are just as live; the sidebar's green dot must not depend on
  // which transport a session happens to use.
  for (const id of sdkSession.activeSdkSessions()) {
    if (!active.includes(id)) active.push(id);
  }
  return active;
});

// --- IPC: get-session-statuses ---
// Status lives in the main process, so a renderer reload can recover it instead
// of starting blank and waiting for the next lifecycle event — which, for a
// session sitting idle, may never come.
ipcMain.handle('get-session-statuses', () => sessionStatus.all());

// --- IPC: get-active-terminals --- (plain terminal sessions for renderer restore)
ipcMain.handle('get-active-terminals', () => {
  const terminals = [];
  for (const [sessionId, session] of activeSessions) {
    if (!session.exited && session.isPlainTerminal && !session.isEphemeral) {
      terminals.push({ sessionId, projectPath: session.projectPath });
    }
  }
  return terminals;
});

// --- IPC: stop-session ---
ipcMain.handle('stop-session', (_event, sessionId) => {
  if (sdkSession.isSdkSession(sessionId)) {
    denyPending(sessionId, 'The session was stopped');
    sessionStatus.remove(sessionId);
    return sdkSession.stopSdkSession(sessionId);
  }
  const session = activeSessions.get(sessionId);
  if (!session || session.exited) return { ok: false, error: 'not running' };
  session.pty.kill();
  return { ok: true };
});

// --- IPC: toggle-star ---
ipcMain.handle('toggle-star', (_event, sessionId) => {
  const starred = toggleStar(sessionId);
  return { starred };
});

// --- IPC: rename-session ---
ipcMain.handle('rename-session', (_event, sessionId, name) => {
  setName(sessionId, name || null);
  // Update search index title to include the new name
  const cached = getCachedSession(sessionId);
  const summary = cached?.summary || '';
  updateSearchTitle(sessionId, 'session', (name ? name + ' ' : '') + summary);
  return { name: name || null };
});

// --- IPC: archive-session ---
ipcMain.handle('read-session-jsonl', (_event, sessionId) => {
  const folder = getCachedFolder(sessionId);
  if (!folder) return { error: 'Session not found in cache' };
  const jsonlPath = path.join(activeProjectsDir(), folder, sessionId + '.jsonl');
  try {
    const content = fs.readFileSync(jsonlPath, 'utf-8');
    const entries = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try { entries.push(JSON.parse(line)); } catch {}
    }
    return { entries };
  } catch (err) {
    return { error: err.message };
  }
});

// --- IPC: sub-agents ---
// A session's Task calls each get their own transcript in a folder beside the
// session's own. Neither the sidebar nor the board lists them — they are not
// sessions — so the side panel is where they surface.
function sessionTranscriptPaths(sessionId) {
  const folder = getCachedFolder(sessionId);
  if (!folder) return null;
  const base = path.join(activeProjectsDir(), folder);
  return { sessionDir: path.join(base, sessionId), parentPath: path.join(base, sessionId + '.jsonl') };
}

ipcMain.handle('get-session-subagents', (_event, sessionId) => {
  const paths = sessionTranscriptPaths(sessionId);
  if (!paths) return [];
  try {
    // Its agents live and die with the session's process — see listSubagents.
    return subagentTasks.listSubagents(paths.sessionDir, paths.parentPath, {
      parentLive: liveSessionIds().has(sessionId),
    });
  } catch (err) {
    log.warn('[subagents] list failed:', err.message);
    return [];
  }
});

// --- Live sub-agent updates ---
// The Background tasks pane used to poll, and a list that moves every few
// seconds reads as stale while an agent is visibly busy. While the pane is
// open the renderer asks for a watch on the session's subagents folder (new
// agents, every line an agent writes) and on its transcript (a background
// agent's completion lands there as a <task-notification>), and hears
// `subagents-changed` a moment after either moves. Coalesced, because an agent
// writes several records per message.
//
// fs.watch is silent over the 9p share a WSL account lives on (see CLAUDE.md),
// so the pane keeps a slow poll behind this; here it is best effort.
const subagentWatches = new Map();   // sessionId → { watchers, timer, refs, retry }

function notifySubagents(sessionId) {
  const w = subagentWatches.get(sessionId);
  if (!w || w.timer) return;
  w.timer = setTimeout(() => {
    w.timer = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('subagents-changed', sessionId);
  }, 250);
}

function armSubagentWatchers(sessionId) {
  const w = subagentWatches.get(sessionId);
  const paths = sessionTranscriptPaths(sessionId);
  if (!w || !paths) return;
  const targets = [subagentTasks.subagentsDir(paths.sessionDir), paths.parentPath];
  for (const target of targets) {
    if (w.watchers.has(target)) continue;
    try {
      const watcher = fs.watch(target, { persistent: false }, () => notifySubagents(sessionId));
      watcher.on('error', () => { try { watcher.close(); } catch {} w.watchers.delete(target); });
      w.watchers.set(target, watcher);
    } catch {
      // Not there yet — a session with no agents has no subagents folder until
      // its first Task call. Looked for again below.
    }
  }
  // Until both exist, check back: the folder appears with the first agent.
  clearTimeout(w.retry);
  if (w.watchers.size < targets.length) w.retry = setTimeout(() => armSubagentWatchers(sessionId), 2000);
}

ipcMain.handle('watch-subagents', (_event, sessionId) => {
  if (!sessionId) return { ok: false };
  let w = subagentWatches.get(sessionId);
  if (!w) {
    w = { watchers: new Map(), timer: null, refs: 0, retry: null };
    subagentWatches.set(sessionId, w);
  }
  w.refs++;
  armSubagentWatchers(sessionId);
  return { ok: true };
});

ipcMain.handle('unwatch-subagents', (_event, sessionId) => {
  const w = subagentWatches.get(sessionId);
  if (!w) return { ok: true };
  if (--w.refs > 0) return { ok: true };
  clearTimeout(w.timer);
  clearTimeout(w.retry);
  for (const watcher of w.watchers.values()) { try { watcher.close(); } catch {} }
  subagentWatches.delete(sessionId);
  return { ok: true };
});

// Running counts for the sidebar rows and the board cards. The renderer only
// asks about sessions that are actually running — an agent cannot outlive the
// CLI process that spawned it — and the count itself skips the expensive read
// for any session whose agent files have gone quiet.
ipcMain.handle('get-subagent-counts', (_event, sessionIds) => {
  const counts = {};
  for (const sessionId of (Array.isArray(sessionIds) ? sessionIds : []).slice(0, 40)) {
    const paths = sessionTranscriptPaths(sessionId);
    if (!paths) continue;
    try {
      const running = subagentTasks.countRunningSubagents(paths.sessionDir, paths.parentPath);
      if (running) counts[sessionId] = running;
    } catch {}
  }
  return counts;
});

ipcMain.handle('read-subagent-jsonl', (_event, sessionId, agentId) => {
  const paths = sessionTranscriptPaths(sessionId);
  if (!paths) return { error: 'Session not found in cache' };
  return subagentTasks.readSubagentEntries(paths.sessionDir, agentId);
});

// --- IPC: read-session-transcript ---
// The windowed read behind the chat view. `read-session-jsonl` above hands over
// the whole transcript, which is what the raw viewer wants and what the chat
// must not do — see transcript-window.js for the cost and for how a compact
// boundary floors a window.
ipcMain.handle('read-session-transcript', (_event, sessionId, opts) => {
  const folder = getCachedFolder(sessionId);
  if (!folder) return { error: 'Session not found in cache' };
  const jsonlPath = path.join(activeProjectsDir(), folder, sessionId + '.jsonl');
  try {
    return readTranscriptWindow(jsonlPath, {
      before: opts?.before ?? null,
      limit: opts?.limit ?? 50,
    });
  } catch (err) {
    return { error: err.message };
  }
});

// --- IPC: session-record-at ---
// Where a moment in time sits in the file. The chat drops its oldest messages
// from the DOM once they are far enough above the viewport, and then has to say
// what its top is now: the nodes it kept carry the timestamps they were drawn
// with, and this turns one of those back into a record index to page from.
ipcMain.handle('session-record-at', (_event, sessionId, ms) => {
  const folder = getCachedFolder(sessionId);
  if (!folder) return { ok: false, index: 0, total: 0 };
  const jsonlPath = path.join(activeProjectsDir(), folder, sessionId + '.jsonl');
  try {
    return { ok: true, ...recordIndexAtTime(jsonlPath, Number(ms)) };
  } catch {
    return { ok: false, index: 0, total: 0 };
  }
});

// --- IPC: session-landmarks ---
// Compacts, errors, day changes and turn ends, for the chat's timeline rail.
// Reuses the same cached line index the windowed read builds — see
// transcript-window.js for why none of this parses the whole file.
ipcMain.handle('session-landmarks', (_event, sessionId) => {
  const folder = getCachedFolder(sessionId);
  if (!folder) return { ok: false, total: 0, marks: [] };
  const jsonlPath = path.join(activeProjectsDir(), folder, sessionId + '.jsonl');
  try {
    return { ok: true, ...readSessionLandmarks(jsonlPath) };
  } catch {
    // A session with no transcript yet is the normal case for a new one.
    return { ok: false, total: 0, marks: [] };
  }
});

ipcMain.handle('archive-session', (_event, sessionId, archived) => {
  const val = archived ? 1 : 0;
  setArchived(sessionId, val);
  return { archived: val };
});

// --- IPC: get-session-meta ---
// Everything about a session that is worth knowing but not worth caching: the
// session menu asks for it when it opens, once per session. Reading the whole
// .jsonl here rather than widening session_cache keeps this out of the indexer
// and off the startup path — nothing on screen depends on it.
ipcMain.handle('get-session-meta', (_event, sessionId) => {
  const folder = getCachedFolder(sessionId);
  // Not an error the user can act on: a session that has not written its
  // first turn yet is not in the index, and saying so in the index's own
  // vocabulary reads like corruption.
  if (!folder) return { ok: false, error: 'No transcript yet — this session has not written its first turn.' };
  // activeProjectsDir() is already the host's view of the account's home — for
  // a WSL account, the UNC path. Same composition read-session-jsonl uses.
  const jsonlPath = path.join(activeProjectsDir(), folder, sessionId + '.jsonl');
  let content, stat;
  try {
    stat = fs.statSync(jsonlPath);
    content = fs.readFileSync(jsonlPath, 'utf-8');
  } catch (err) {
    return { ok: false, error: err.message };
  }

  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreateTokens = 0;
  let userTurns = 0, assistantTurns = 0, toolCalls = 0;
  let firstTimestamp = null, lastTimestamp = null;
  let firstPrompt = '', gitBranch = null, cwd = null, version = null, effort = null;
  let costUSD = 0;
  const models = new Set();
  const tools = new Map();
  const touchedFiles = new Set();
  let linesAdded = 0, linesRemoved = 0;

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.timestamp) {
      if (!firstTimestamp) firstTimestamp = entry.timestamp;
      lastTimestamp = entry.timestamp;
    }
    if (entry.gitBranch) gitBranch = entry.gitBranch;
    if (entry.cwd) cwd = entry.cwd;
    if (entry.version) version = entry.version;
    if (entry.effort) effort = entry.effort;
    // Written at the end of a stretch and not always present — taken as the
    // best available figure rather than the authority. See read-session-file.js.
    if (entry.type === 'cost-state' && typeof entry.totalCostUSD === 'number') costUSD = entry.totalCostUSD;

    const isUser = entry.type === 'user' || (entry.type === 'message' && entry.role === 'user');
    const isAssistant = entry.type === 'assistant' || (entry.type === 'message' && entry.role === 'assistant');
    if (isUser) userTurns++;
    if (isAssistant) assistantTurns++;

    const msg = entry.message;
    if (msg && typeof msg === 'object') {
      if (msg.model) models.add(msg.model);
      const u = msg.usage;
      if (u) {
        inputTokens += u.input_tokens || 0;
        outputTokens += u.output_tokens || 0;
        cacheReadTokens += u.cache_read_input_tokens || 0;
        cacheCreateTokens += u.cache_creation_input_tokens || 0;
      }
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block?.type !== 'tool_use') continue;
          toolCalls++;
          tools.set(block.name, (tools.get(block.name) || 0) + 1);
          if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(block.name)) {
            const target = block.input?.file_path || block.input?.notebook_path;
            if (target) touchedFiles.add(target);
          }
        }
      }
    }

    const result = entry.toolUseResult;
    if (result && typeof result === 'object') {
      if (Array.isArray(result.structuredPatch) && result.structuredPatch.length) {
        for (const hunk of result.structuredPatch) {
          for (const patchLine of hunk.lines || []) {
            if (patchLine.startsWith('+')) linesAdded++;
            else if (patchLine.startsWith('-')) linesRemoved++;
          }
        }
      } else if (typeof result.content === 'string' && result.filePath) {
        linesAdded += result.content.split('\n').length;
      }
    }

    if (!firstPrompt && isUser) {
      const text = typeof msg === 'string' ? msg
        : (typeof msg?.content === 'string' ? msg.content : (msg?.content?.[0]?.text || ''));
      if (text && !/<bash-input>|<bash-stdout>|<local-command-caveat>/.test(text)) {
        firstPrompt = text.slice(0, 600);
      }
    }
  }

  return {
    ok: true,
    sessionId,
    projectPath: getCachedSession(sessionId)?.projectPath || null,
    created: firstTimestamp || stat.birthtime.toISOString(),
    lastActivity: lastTimestamp || stat.mtime.toISOString(),
    userTurns, assistantTurns, toolCalls,
    topTools: [...tools.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    inputTokens, outputTokens, cacheReadTokens, cacheCreateTokens,
    costUSD,
    models: [...models],
    effort, version, gitBranch, cwd,
    changedFiles: touchedFiles.size, linesAdded, linesRemoved,
    fileBytes: stat.size,
  };
});

// --- IPC: delete-session ---
// Removes the transcript itself, not just the row: a session deleted here is
// gone from ~/.claude/projects too, so the next scan cannot bring it back.
// Destructive and unrecoverable — the renderer confirms before calling.
ipcMain.handle('delete-session', async (_event, sessionId, projectPath) => {
  // The cache is not the only place a session can exist. One launched a moment
  // ago has no .jsonl yet, so nothing indexed it — and refusing to delete it
  // left the row in the sidebar with no way to get rid of it. The renderer
  // knows which project it is in; that is enough to name the file.
  const folder = getCachedFolder(sessionId) || (projectPath ? encodeProjectPath(projectPath) : null);

  // A live PTY holds the file open and would keep writing to it.
  const live = activeSessions.get(sessionId);
  if (live && !live.exited) {
    try { live.pty.kill(); } catch {}
    await new Promise(r => setTimeout(r, 150));
  }

  const jsonlPath = folder ? path.join(activeProjectsDir(), folder, sessionId + '.jsonl') : null;
  if (jsonlPath) {
    try {
      fs.unlinkSync(jsonlPath);
    } catch (err) {
      // Already gone on disk is not a failure — the cache rows still have to go.
      if (err.code !== 'ENOENT') return { ok: false, error: err.message };
    }
    forgetTranscript(jsonlPath);
  }
  deleteCachedSession(sessionId);
  deleteSearchSession(sessionId);
  deleteSessionMeta(sessionId);
  return { ok: true };
});

// --- IPC: open-terminal ---
ipcMain.handle('open-terminal', async (_event, sessionId, projectPath, isNew, sessionOptions) => {
  if (!mainWindow) return { ok: false, error: 'no window' };

  // An SDK session has no PTY and no terminal to reattach to — the renderer
  // rebuilds its view from the transcript, which is the same .jsonl the cache
  // already indexes. Reattaching is therefore a no-op that must not fall
  // through into the spawn path below and start a second one.
  if (sdkSession.isSdkSession(sessionId)) {
    return { ok: true, mode: 'sdk', reattached: true };
  }

  // A group session is always a chat and always carries its projects with it.
  // Decided here rather than in the renderer: the membership lives in the
  // group's manifest, and a resumed session has to pick up whatever it says
  // *now* — including projects added since the session was started.
  //
  // Claude sessions only. A shell opened in the group's folder — the side
  // panel's scratch terminal, a plain terminal from the + — is still a shell:
  // forced onto the SDK it is handed to the CLI as a session whose id is not a
  // UUID, and the CLI refuses it.
  const isShell = sessionOptions?.type === 'terminal' || !!sessionOptions?.ephemeral;
  const groupId = isShell ? null : sessionGroups.groupIdFromPath(activeGroupsRoot(), projectPath);
  if (groupId) {
    const group = sessionGroups.readGroup(activeGroupsRoot(), groupId, hostPath);
    const options = {
      ...sessionOptions,
      mode: 'sdk',
      additionalDirectories: (group?.projects || []).filter(p => fs.existsSync(hostPath(p))),
    };
    const result = await startSdkSessionFor(sessionId, projectPath, isNew, options);
    return result.ok ? { ok: true, mode: 'sdk', group } : result;
  }

  if (sessionOptions?.mode === 'sdk' && !sessionOptions?.isPlainTerminal) {
    const result = await startSdkSessionFor(sessionId, projectPath, isNew, sessionOptions);
    return result.ok ? { ok: true, mode: 'sdk' } : result;
  }

  // Reattach to existing session
  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    session.rendererAttached = true;
    session.firstResize = !session.isPlainTerminal;

    // If TUI is in alternate screen mode, send escape to switch into it
    if (session.altScreen && !session.isPlainTerminal) {
      mainWindow.webContents.send('terminal-data', sessionId, '\x1b[?1049h');
    }

    // Send buffered output for reattach
    for (const chunk of session.outputBuffer) {
      mainWindow.webContents.send('terminal-data', sessionId, chunk);
    }

    if (!session.isPlainTerminal) {
      // Hide cursor after buffer replay — the live PTY stream or resize nudge
      // will re-show it at the correct position, avoiding a stale cursor artifact
      mainWindow.webContents.send('terminal-data', sessionId, '\x1b[?25l');
    }

    return { ok: true, reattached: true, mcpActive: !!session.mcpServer };
  }

  // Spawn new PTY
  if (!fs.existsSync(hostPath(projectPath))) {
    return { ok: false, error: `project directory no longer exists: ${projectPath}` };
  }

  const isPlainTerminal = sessionOptions?.type === 'terminal';
  // A pane's scratch shell: created when the pane opens, killed when it closes.
  // Exactly one may exist per slot, so re-opening a pane reaps whatever it left
  // behind. Slot-scoped on purpose — the session side panel and the project
  // page's Terminal tab each own one and can be open at the same time, so a
  // blanket reap would have the newer pane kill the other one's live shell.
  // A renderer reload is covered separately, by the sweep on did-finish-load.
  const isEphemeral = !!sessionOptions?.ephemeral;
  const ephemeralSlot = isEphemeral ? (sessionOptions.ephemeralSlot || 'panel') : null;
  if (isEphemeral) {
    for (const [, s] of activeSessions) {
      if (s.isEphemeral && s.ephemeralSlot === ephemeralSlot && !s.exited) {
        try { s.pty.kill(); } catch {}
      }
    }
  }

  // Resolve shell profile from effective settings
  const effectiveProfileId = (() => {
    const global = getSetting('global') || {};
    const project = projectPath ? (getSetting('project:' + projectPath) || {}) : {};
    let profileId = SETTING_DEFAULTS.shellProfile;
    if (global.shellProfile !== undefined && global.shellProfile !== null) profileId = global.shellProfile;
    if (project.shellProfile !== undefined && project.shellProfile !== null) profileId = project.shellProfile;
    return profileId;
  })();
  const activeAccount = getActiveAccount();
  const accountDistro = accountWslDistro(activeAccount);

  // A WSL-backed account holds both Claude and the projects inside the
  // distribution, so its sessions must run there whatever shell the settings
  // name — a Windows shell cannot even chdir into a POSIX project path.
  const requestedProfile = resolveShell(accountDistro ? 'wsl:' + accountDistro : effectiveProfileId);
  if (accountDistro && !isWslShell(requestedProfile.path)) {
    return { ok: false, error: `WSL distribution "${accountDistro}" is not available` };
  }
  const shellProfile = (!accountDistro && isWslShell(requestedProfile.path) && !isPlainTerminal)
    ? resolveShell('auto')
    : requestedProfile;
  const shell = shellProfile.path;
  const shellExtraArgs = [...(shellProfile.args || [])];
  const isWsl = isWslShell(shell);
  // --cd takes the path as the distribution sees it: already POSIX for a
  // WSL-backed project, /mnt/<drive>/… for one on a Windows volume. The spawn
  // cwd itself must stay a valid Windows path, for wsl.exe rather than for the
  // shell inside it.
  if (isWsl) {
    shellExtraArgs.unshift('--cd', isPosixAbsolutePath(projectPath) ? projectPath : windowsToWslPath(projectPath));
  }
  log.info(`[shell] profile=${shellProfile.id} shell=${shell} args=${JSON.stringify(shellExtraArgs)}`);

  let knownJsonlFiles = new Set();
  let sessionSlug = null;
  let projectFolder = null;

  if (!isPlainTerminal) {
    // Snapshot existing .jsonl files before spawning (for new session + fork/plan detection)
    projectFolder = encodeProjectPath(projectPath);
    const claudeProjectDir = path.join(getProjectsDir(activeAccount), projectFolder);
    if (fs.existsSync(claudeProjectDir)) {
      try {
        knownJsonlFiles = new Set(
          fs.readdirSync(claudeProjectDir).filter(f => f.endsWith('.jsonl'))
        );
      } catch {}
    }

    // Read slug from the session's jsonl file (for plan-accept detection)
    if (!isNew) {
      try {
        const jsonlPath = path.join(claudeProjectDir, sessionId + '.jsonl');
        const head = fs.readFileSync(jsonlPath, 'utf8').slice(0, 8000);
        const firstLines = head.split('\n').filter(Boolean);
        for (const line of firstLines) {
          const entry = JSON.parse(line);
          if (entry.slug) { sessionSlug = entry.slug; break; }
        }
      } catch {}
    }
  }

  let ptyProcess;
  let mcpServer = null;
  try {
    if (isPlainTerminal) {
      // Plain terminal: interactive login shell, no claude command
      // Inject a shell function to override `claude` with a helpful message
      const claudeShim = 'claude() { echo "\\033[33mTo start a Claude session, use the + button in the sidebar.\\033[0m"; return 1; }; export -f claude 2>/dev/null;';
      ptyProcess = pty.spawn(shell, shellArgs(shell, undefined, shellExtraArgs), {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: isWsl ? os.homedir() : projectPath,
        env: {
          ...cleanPtyEnv,
          TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '3.6.6', FORCE_COLOR: '3', ITERM_SESSION_ID: '1',
          CLAUDECODE: '1',
          // ZDOTDIR trick won't work reliably; instead inject via ENV (sh/bash) or precmd
          ENV: claudeShim,
          BASH_ENV: claudeShim,
        },
      });
      // For zsh, ENV/BASH_ENV don't apply — write the function after shell starts
      setTimeout(() => {
        if (!ptyProcess._isDisposed) {
          try {
            ptyProcess.write(claudeShim + ' clear\n');
          } catch {}
        }
      }, 300);
    } else {
      // Build claude command with session options
      let claudeCmd;
      if (sessionOptions?.forkFrom) {
        claudeCmd = `claude --resume "${sessionOptions.forkFrom}" --fork-session`;
      } else if (isNew) {
        claudeCmd = `claude --session-id "${sessionId}"`;
      } else {
        claudeCmd = `claude --resume "${sessionId}"`;
      }

      if (sessionOptions) {
        if (sessionOptions.dangerouslySkipPermissions) {
          claudeCmd += ' --dangerously-skip-permissions';
        } else if (sessionOptions.permissionMode) {
          claudeCmd += ` --permission-mode "${sessionOptions.permissionMode}"`;
        }
        if (sessionOptions.worktree) {
          // Ensure .claude/worktrees/ is in .gitignore so worktree dirs aren't tracked
          try {
            const gitignorePath = hostPath(projectJoin(projectPath, '.gitignore'));
            const entry = '.claude/worktrees/';
            let content = '';
            try { content = fs.readFileSync(gitignorePath, 'utf8'); } catch {}
            const lines = content.split('\n').map(l => l.trim());
            const alreadyCovered = lines.some(l => l === entry || l === '.claude/' || l === '.claude');
            if (!alreadyCovered) {
              const addition = (content.length && !content.endsWith('\n') ? '\n' : '') + entry + '\n';
              fs.appendFileSync(gitignorePath, addition, 'utf8');
            }
          } catch {}
          claudeCmd += ' --worktree';
          if (sessionOptions.worktreeName) {
            claudeCmd += ` "${sessionOptions.worktreeName}"`;
          }
        }
        if (sessionOptions.chrome) {
          claudeCmd += ' --chrome';
        }
        if (sessionOptions.addDirs) {
          const dirs = sessionOptions.addDirs.split(',').map(d => d.trim()).filter(Boolean);
          for (const dir of dirs) {
            claudeCmd += ` --add-dir "${dir}"`;
          }
        }
      }

      if (sessionOptions?.appendSystemPrompt) {
        // Write to a temp file and use shell substitution to avoid quoting issues.
        // The `cat` runs inside the distribution for a WSL session, so it needs
        // the /mnt/<drive>/… view of the Windows temp file.
        const tmpPrompt = path.join(os.tmpdir(), `wootonpad-prompt-${sessionId}.md`);
        fs.writeFileSync(tmpPrompt, sessionOptions.appendSystemPrompt);
        const promptPathForShell = isWsl ? windowsToWslPath(tmpPrompt) : tmpPrompt;
        claudeCmd += ` --append-system-prompt "$(cat '${promptPathForShell}')"`;
      }

      // Subscribe this session to lifecycle hooks. `--settings` loads in
      // addition to the user's own settings files rather than replacing them,
      // so nothing the user owns is touched and there is no cleanup that has to
      // survive a crash. The temp file mirrors the --append-system-prompt
      // pattern above, including the /mnt/<drive>/… view a WSL session needs.
      try {
        const hooks = await hookServer();
        const hookUrl = hooks.urlFor(isWsl);
        if (hookUrl) {
          const tmpSettings = path.join(os.tmpdir(), `wootonpad-hooks-${sessionId}.json`);
          fs.writeFileSync(tmpSettings, JSON.stringify(buildHookSettings({ url: hookUrl, token: hooks.token })));
          const settingsPathForShell = isWsl ? windowsToWslPath(tmpSettings) : tmpSettings;
          claudeCmd += ` --settings '${settingsPathForShell}'`;
        } else {
          // WSL with no reachable vEthernet address. Rather than hand the CLI a
          // URL that will time out on every event, leave the session on the OSC
          // fallback — SessionStatusTracker keeps honouring it while no hook
          // has ever arrived.
          log.warn(`[hooks] session=${sessionId} no reachable host address for WSL — falling back to OSC detection`);
        }
      } catch (err) {
        log.error(`[hooks] session=${sessionId} could not start hook server: ${err.message}`);
      }

      if (sessionOptions?.preLaunchCmd) {
        claudeCmd = sessionOptions.preLaunchCmd + ' ' + claudeCmd;
      }

      // Start MCP server for this session so Claude CLI sends diffs/file opens to WootonPad
      // (skip if user disabled IDE emulation in global settings)
      if (sessionOptions?.mcpEmulation !== false) {
        try {
          // From inside a distribution the CLI resolves the IDE host itself: it
          // reads `runningInWindows` from the lock file, takes the default
          // gateway from `ip route show` and TCP-probes it. So the workspace
          // folder is reported the way a Windows IDE would (UNC), and the
          // server binds somewhere that gateway actually reaches.
          mcpServer = await startMcpServer(sessionId, [hostPath(projectPath)], mainWindow, log, {
            runningInWindows: isWsl,
            // File paths arrive from the CLI in the distribution's own form.
            // Bound to the account this session was launched under: the session
            // keeps running across an account switch, and a diff arriving after
            // one must still resolve against its own distribution.
            hostPath: (p) => accountHostPath(activeAccount, p),
          });
          claudeCmd += ' --ide';
        } catch (err) {
          log.error(`[mcp] Failed to start MCP server for ${sessionId}: ${err.message}`);
        }
      }

      const ptyEnv = {
        ...cleanPtyEnv,
        TERM: 'xterm-256color', COLORTERM: 'truecolor',
        TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '3.6.6', FORCE_COLOR: '3', ITERM_SESSION_ID: '1',
      };
      // A WSL account's configDir is the Windows view of ~/.claude inside the
      // distribution — meaningless as CLAUDE_CONFIG_DIR there, where that home
      // is already the default. Setting it would point Claude at a path it
      // cannot resolve.
      if (activeAccount.id !== 'default' && !accountWslDistro(activeAccount)) {
        ptyEnv.CLAUDE_CONFIG_DIR = activeAccount.configDir;
      }
      if (mcpServer) {
        ptyEnv.CLAUDE_CODE_SSE_PORT = String(mcpServer.port);
      }
      // wsl.exe hands nothing but WSLENV-listed variables to the distribution,
      // so everything the CLI reads is named there explicitly — the IDE port,
      // and the terminal identification Claude checks before emitting OSC 9
      // notifications, which would otherwise be silently dropped at the
      // boundary. USERPROFILE is deliberately absent: the CLI only scans the
      // Windows %USERPROFILE%\.claude\ide for lock files while it is unset.
      if (isWsl) {
        Object.assign(ptyEnv, withWslEnv(ptyEnv, [
          'CLAUDE_CODE_SSE_PORT',
          'TERM', 'COLORTERM', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'FORCE_COLOR', 'ITERM_SESSION_ID',
        ]));
      }

      ptyProcess = pty.spawn(shell, shellArgs(shell, claudeCmd, shellExtraArgs), {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: isWsl ? os.homedir() : projectPath,
        // TERM_PROGRAM=iTerm.app: Claude Code checks this to decide whether to emit
        // OSC 9 notifications (e.g. "needs your attention"). Without it, the packaged
        // app's minimal Electron environment won't trigger those sequences.
        env: ptyEnv,
      });

    }
  } catch (err) {
    return { ok: false, error: `Error spawning PTY: ${err.message}` };
  }

  const session = {
    pty: ptyProcess, rendererAttached: true, exited: false,
    outputBuffer: [], outputBufferSize: 0, altScreen: false,
    projectPath, firstResize: true,
    projectFolder, knownJsonlFiles, sessionSlug,
    isPlainTerminal, isEphemeral, ephemeralSlot, forkFrom: sessionOptions?.forkFrom || null,
    mcpServer, _openedAt: Date.now(),
  };
  activeSessions.set(sessionId, session);
  // The CLI is at its prompt, not mid-turn. Say so before any terminal output
  // can suggest otherwise — see SessionStatusTracker#seed.
  if (!isPlainTerminal) sessionStatus.seed(sessionId);

  ptyProcess.onData(data => {
    const currentId = session.realSessionId || sessionId;

    // Parse OSC sequences (title changes, progress, notifications, etc.)
    //
    // The PTY hands over arbitrary chunks, so a sequence can be split across
    // two of them. Matching per chunk dropped those silently — and since the
    // ✳ title was the only signal that could return a session to idle, one
    // unlucky split left a spinner running forever. Carry the trailing
    // fragment over to the next chunk instead.
    if (data.includes('\x1b]') || session._oscCarry) {
      const stream = (session._oscCarry || '') + data;
      session._oscCarry = '';
      const lastStart = stream.lastIndexOf('\x1b]');
      if (lastStart !== -1) {
        const tail = stream.slice(lastStart);
        // No terminator yet: hold it back, capped so a stream that never
        // terminates one cannot grow without bound.
        if (!tail.includes('\x07') && !tail.includes('\x1b\\')) {
          session._oscCarry = tail.length > 4096 ? '' : tail;
        }
      }
      const oscMatches = stream.matchAll(/\x1b\](\d+);([^\x07\x1b]*)(?:\x07|\x1b\\)/g);
      for (const m of oscMatches) {
        const code = m[1];
        const payload = m[2].slice(0, 120);
        // Detect Claude CLI busy state from OSC 0 title (spinner chars = busy, ✳ = idle)
        if (code === '0') {
          const firstChar = payload.charAt(0);
          const isBusy = firstChar.charCodeAt(0) >= 0x2800 && firstChar.charCodeAt(0) <= 0x28FF;
          const isIdle = firstChar === '\u2733'; // ✳
          log.debug(`[OSC 0] session=${currentId} char=U+${firstChar.charCodeAt(0).toString(16).toUpperCase()} busy=${isBusy} idle=${isIdle}`);
          // Fallback only, and the only fallback: unlike OSC 9;4 below, this
          // signal is symmetric — it can return a session to idle as well as
          // mark it busy. The tracker ignores it the moment a real hook
          // arrives for the session.
          if (isBusy) sessionStatus.applyOsc(currentId, true);
          else if (isIdle) sessionStatus.applyOsc(currentId, false);
        }
      }
      // Parse iTerm2 OSC 9 sequences (terminated by BEL \x07 or ST \x1b\\).
      // Same carried stream: an attention notification split across chunks was
      // being dropped for the same reason.
      const osc9Matches = stream.matchAll(/\x1b\]9;([^\x07\x1b]*)(?:\x07|\x1b\\)/g);
      for (const osc9 of osc9Matches) {
        const payload = osc9[1];
        // OSC 9;4 progress: 4;0; = clear/done, 4;1;N = running at N%, 4;2;N = error, 4;3; = indeterminate
        if (payload.startsWith('4;')) {
          const level = payload.split(';')[1];
          if (level === '0') continue; // 4;0 is also used for clearing, making it unreliable as an idle signal
          // Logged, not acted on. This branch can only ever *set* busy — 4;0
          // is documented as unreliable for the clear, so it is skipped above,
          // leaving no path back to idle. A session that emitted one of these
          // and then never took a turn stayed "In progress" forever, because
          // hooks are turn-scoped and had nothing to correct it with.
          // OSC 0 is the only symmetric fallback signal, so it is the only one.
          log.debug(`[OSC 9;4] session=${currentId} level=${level} payload="${payload}" (not used for status)`);
        } else {
          // Regular notification (attention, permission, etc.)
          log.info(`[OSC 9] session=${currentId} message="${payload}"`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal-notification', currentId, payload);
          }
        }
      }
    }

    // Standalone BEL (not part of an OSC sequence)
    if (data.includes('\x07') && !data.includes('\x1b]')) {
      log.info(`[BEL] session=${currentId}`);
    }

    // Track alternate screen mode (only if data contains the marker)
    if (data.includes('\x1b[?')) {
      if (data.includes('\x1b[?1049h') || data.includes('\x1b[?47h')) {
        session.altScreen = true;
        log.info(`[altscreen] session=${currentId} ON`);
      }
      if (data.includes('\x1b[?1049l') || data.includes('\x1b[?47l')) {
        session.altScreen = false;
        log.info(`[altscreen] session=${currentId} OFF`);
      }
    }

    // Buffer output (skip resize-triggered redraws for plain terminals)
    if (!session._suppressBuffer) {
      session.outputBuffer.push(data);
      session.outputBufferSize += data.length;
      while (session.outputBufferSize > MAX_BUFFER_SIZE && session.outputBuffer.length > 1) {
        session.outputBufferSize -= session.outputBuffer.shift().length;
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-data', currentId, data);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    session.exited = true;
    // Clean up MCP server
    const mcpId = session.realSessionId || sessionId;
    shutdownMcpServer(mcpId);
    session.mcpServer = null;

    const realId = session.realSessionId || sessionId;
    // The old pipeline never cleared busy on exit — it left that to the
    // renderer's 3s poll, which only reaches sessions the sidebar has currently
    // rendered. A session that exited while its row was scrolled out kept its
    // spinner indefinitely.
    sessionStatus.remove(realId);
    if (realId !== sessionId) sessionStatus.remove(sessionId);
    try { fs.unlinkSync(path.join(os.tmpdir(), `wootonpad-hooks-${sessionId}.json`)); } catch {}
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process-exited', realId, exitCode);
      // If a fork/plan-accept transition re-keyed this session under realId
      // but the PTY exited before transition detection ran, also notify the
      // renderer for the original sessionId so it doesn't stay stuck as "Running".
      if (realId !== sessionId && activeSessions.has(sessionId)) {
        mainWindow.webContents.send('process-exited', sessionId, exitCode);
      }
    }
    activeSessions.delete(realId);
    // Clean up the original key too in case transition detection hasn't run yet
    activeSessions.delete(sessionId);
  });

  if (sessionOptions?.forkFrom) {
    log.info(`[fork-spawn] tempId=${sessionId} forkFrom=${sessionOptions.forkFrom} folder=${projectFolder} knownFiles=${knownJsonlFiles.size}`);
  }

  return { ok: true, reattached: false, mcpActive: !!mcpServer };
});

// --- IPC: terminal-input (fire-and-forget) ---
ipcMain.on('terminal-input', (_event, sessionId, data) => {
  // An SDK session takes whole prompts, not keystrokes: there is no terminal
  // to echo into and no line discipline to run. The renderer's composer sends
  // one message per submit.
  if (sdkSession.isSdkSession(sessionId)) {
    sdkSession.sendSdkInput(sessionId, data);
    return;
  }
  const session = activeSessions.get(sessionId);
  if (session && !session.exited) {
    session.pty.write(data);
  }
});

// --- IPC: sdk-send-prompt ---
// A whole prompt for an SDK session, as text or as Messages API content blocks.
// `terminal-input` cannot carry the second shape: it is the PTY's keystroke
// channel, and a session that is not SDK-backed would hand the array straight
// to `pty.write`. Request-response rather than fire-and-forget, because a
// prompt carrying an attachment has ways to be refused that typing does not.
ipcMain.handle('sdk-send-prompt', (_event, sessionId, content) => {
  return sdkSession.sendSdkInput(sessionId, content);
});

// --- IPC: sdk-interrupt ---
// The Escape key of an SDK session: stops the turn, keeps the session.
ipcMain.handle('sdk-interrupt', async (_event, sessionId) => {
  return sdkSession.interruptSdkSession(sessionId);
});

// --- IPC: sdk-set-permission-mode ---
ipcMain.handle('sdk-set-permission-mode', async (_event, sessionId, mode) => {
  // The Chat tab's assistant stays on Manual whatever the composer sends —
  // see ensureManagerChat. The picker is hidden there; this is the other half.
  if (sessionId === chatAgent.current().sessionId && mode !== MANAGER_PERMISSION_MODE) {
    return { ok: false, error: "The assistant's permission mode is fixed to Manual" };
  }
  return sdkSession.setSdkPermissionMode(sessionId, mode);
});

// --- IPC: sdk session controls (model / effort / context) ---
ipcMain.handle('sdk-commands', (_event, sessionId) => sdkSession.listSdkCommands(sessionId));
ipcMain.handle('sdk-models', (_event, sessionId) => sdkSession.listSdkModels(sessionId));
ipcMain.handle('sdk-set-model', (_event, sessionId, model) => sdkSession.setSdkModel(sessionId, model));
ipcMain.handle('sdk-set-effort', (_event, sessionId, effort) => sdkSession.setSdkEffort(sessionId, effort));
ipcMain.handle('sdk-context-usage', (_event, sessionId) => sdkSession.getSdkContextUsage(sessionId));

// --- IPC: terminal-resize (fire-and-forget) ---
ipcMain.on('terminal-resize', (_event, sessionId, cols, rows) => {
  const session = activeSessions.get(sessionId);
  if (session && !session.exited) {
    // For plain terminals, suppress buffering during resize to avoid
    // accumulating prompt redraws that pollute reattach replay
    if (session.isPlainTerminal) session._suppressBuffer = true;

    session.pty.resize(cols, rows);

    if (session.isPlainTerminal) {
      setTimeout(() => { session._suppressBuffer = false; }, 200);
    }

    // First resize: nudge to force TUI redraw on reattach (skip for plain terminals — causes duplicate prompts)
    if (session.firstResize && !session.isPlainTerminal) {
      session.firstResize = false;
      setTimeout(() => {
        try {
          session.pty.resize(cols + 1, rows);
          setTimeout(() => {
            try { session.pty.resize(cols, rows); } catch {}
          }, 50);
        } catch {}
      }, 50);
    }
  }
});

// --- IPC: close-terminal ---
ipcMain.on('close-terminal', (_event, sessionId) => {
  // Closing the view does not end an SDK session, exactly as it does not kill
  // a PTY: stop-session is what ends either of them.
  if (sdkSession.isSdkSession(sessionId)) return;
  const session = activeSessions.get(sessionId);
  if (session) {
    session.rendererAttached = false;
    if (session.exited) {
      activeSessions.delete(sessionId);
    }
  }
});

// Session transitions → session-transitions.js
const sessionTransitions = require('./session-transitions');
sessionTransitions.init({
  PROJECTS_DIR: activeProjectsDir(), activeSessions, getMainWindow: () => mainWindow, log,
  // A fork or a plan-accept gives the session a new UUID. The tracker has to
  // follow it, or it keeps reporting under an id the renderer has retired —
  // and the hooks arriving from the forked CLI would open a second entry.
  rekeyMcpServer: (oldId, newId) => {
    rekeyMcpServer(oldId, newId);
    sessionStatus.rekey(oldId, newId);
    sessionAlerts.rekey(oldId, newId);
  },
});
const { detectSessionTransitions } = sessionTransitions;

// --- fs.watch on projects directory ---
let projectsWatcher = null;
let projectsPoller = null;

// How often the polling fallback sweeps the projects directory. Only used when
// a recursive fs.watch cannot be trusted — see startProjectsWatcher.
const PROJECTS_POLL_MS = 5000;

// A WSL account's projects directory is reached over the 9p share, which does
// not deliver Windows change notifications: fs.watch there succeeds and then
// stays silent, so the absence of events is not something we can detect. Sweep
// folder mtimes instead, reusing the same signal the incremental cache uses.
function startProjectsPolling(watchDir, queueFolder) {
  const { getFolderIndexMtimeMs } = require('./folder-index-state');
  let previous = null;
  let warnedSlow = false;

  const sweep = () => {
    const startedAt = Date.now();
    const current = new Map();
    let entries;
    try {
      entries = fs.readdirSync(watchDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.git') continue;
      current.set(entry.name, getFolderIndexMtimeMs(path.join(watchDir, entry.name)));
    }

    if (previous) {
      for (const [folder, mtime] of current) {
        if (previous.get(folder) !== mtime) queueFolder(folder);
      }
      for (const folder of previous.keys()) {
        if (!current.has(folder)) queueFolder(folder);
      }
    }
    previous = current;

    // The per-folder cost over 9p is the open question here; report it once
    // instead of assuming the interval is comfortable.
    const elapsed = Date.now() - startedAt;
    if (!warnedSlow && elapsed > PROJECTS_POLL_MS / 2) {
      warnedSlow = true;
      log.warn(`[watcher] polling sweep of ${current.size} folders took ${elapsed}ms (interval ${PROJECTS_POLL_MS}ms)`);
    }
  };

  // The seeding sweep is deferred rather than run inline: it stats every folder
  // over the 9p share, and startProjectsWatcher is called during app startup.
  setTimeout(sweep, 0);
  return setInterval(sweep, PROJECTS_POLL_MS);
}

function startProjectsWatcher() {
  const watchDir = activeProjectsDir();
  if (!fs.existsSync(watchDir)) return;

  const pendingFolders = new Set();
  let debounceTimer = null;

  function flushChanges() {
    debounceTimer = null;
    const folders = new Set(pendingFolders);
    pendingFolders.clear();

    let changed = false;
    for (const folder of folders) {
      const folderPath = path.join(watchDir, folder);
      if (fs.existsSync(folderPath)) {
        detectSessionTransitions(folder);
        refreshFolder(folder);
      } else {
        deleteCachedFolder(folder, getActiveAccount().id);
      }
      changed = true;
    }

    if (changed) {
      notifyRendererProjectsChanged();
    }
  }

  function queueFolder(folder) {
    if (!folder || folder === '.git') return;
    pendingFolders.add(folder);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushChanges, 500);
  }

  if (activeWslDistro()) {
    projectsPoller = startProjectsPolling(watchDir, queueFolder);
    log.info(`[watcher] WSL-backed account: polling ${watchDir} every ${PROJECTS_POLL_MS}ms`);
    return;
  }

  try {
    projectsWatcher = fs.watch(watchDir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;

      // filename is relative, e.g. "folder-name/sessions-index.json" or "folder-name/abc.jsonl"
      const parts = filename.split(path.sep);
      const folder = parts[0];

      // Only care about .jsonl changes or top-level folder add/remove
      const basename = parts[parts.length - 1];
      if (parts.length !== 1 && !basename.endsWith('.jsonl')) return;

      queueFolder(folder);
    });

    projectsWatcher.on('error', (err) => {
      console.error('Projects watcher error:', err);
      if (!projectsPoller) projectsPoller = startProjectsPolling(watchDir, queueFolder);
    });
  } catch (err) {
    console.error('Failed to start projects watcher:', err);
    projectsPoller = startProjectsPolling(watchDir, queueFolder);
  }
}

function restartProjectsWatcher() {
  if (projectsWatcher) {
    projectsWatcher.close();
    projectsWatcher = null;
  }
  if (projectsPoller) {
    clearInterval(projectsPoller);
    projectsPoller = null;
  }
  startProjectsWatcher();
}

// --- IPC: app version ---
ipcMain.handle('get-app-version', () => app.getVersion());

// --- IPC: auto-updater ---
ipcMain.handle('updater-check', () => {
  if (!autoUpdater) return { available: false, dev: true };
  return autoUpdater.checkForUpdates();
});
ipcMain.handle('updater-install', () => {
  if (!autoUpdater) return;
  autoUpdater.quitAndInstall();
});

// --- App lifecycle ---
app.whenReady().then(() => {
  buildMenu();
  createWindow();
  applyTraySetting();
  startProjectsWatcher();
  startActiveProjectPolling();

  // Both schedule modules resolve their directories per call, so schedules
  // follow the active account instead of the Windows home, and project paths
  // recorded inside a distribution are translated before any fs call. This has
  // to happen before the first use below, which writes the creator command.
  const scheduleDirs = {
    getProjectsDir: () => activeProjectsDir(),
    getCommandsDir: () => path.join(activeConfigDir(), 'commands'),
    hostPath,
    projectJoin,
  };
  scheduleIpc.configure(scheduleDirs);
  require('./schedule-runner').configure(scheduleDirs);

  scheduleIpc.ensureScheduleCreatorCommand();

  // Shared runCommand for both cron scheduler and manual "run now"
  const { spawn: cpSpawn } = require('child_process');
  function runScheduleCommand(cmd, cwd, name, onDone) {
    const globalSettings = getSetting('global') || {};
    const profileId = globalSettings.shellProfile || SETTING_DEFAULTS.shellProfile;
    // A scheduled command belongs to its project, so one in a distribution runs
    // there — the shell setting cannot chdir into a POSIX path from Windows.
    const distro = activeWslDistro();
    const inWsl = Boolean(distro) && isPosixAbsolutePath(cwd);
    const profile = resolveShell(inWsl ? 'wsl:' + distro : profileId);
    const shell = profile.path;
    const extraArgs = [...(profile.args || [])];
    if (inWsl) extraArgs.unshift('--cd', cwd);
    const args = shellArgs(shell, cmd, extraArgs);

    log.info(`[schedule] Running: ${shell} ${args.join(' ')}`);
    const child = cpSpawn(shell, args, {
      cwd: inWsl ? os.homedir() : cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...cleanPtyEnv, FORCE_COLOR: '0' },
    });

    let stderr = '';
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('exit', (code) => {
      if (stderr.trim()) log.error(`[schedule] ${name} stderr:\n${stderr.trim()}`);
      log.info(`[schedule] ${name} finished (exit ${code})`);
      if (onDone) onDone();
    });

    child.on('error', (err) => {
      log.error(`[schedule] ${name} error:`, err.message);
      if (onDone) onDone();
    });
  }

  scheduleIpc.init(log, runScheduleCommand);
  startScheduler(log, runScheduleCommand);

  // Re-index search if FTS table was recreated (e.g. tokenizer config change)
  if (searchFtsRecreated) populateCacheViaWorker();

  // Check for updates after launch
  if (autoUpdater) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(e => log.error('[updater] check failed:', e?.message || String(e))), 5000);
    // Re-check every 4 hours for long-running sessions
    setInterval(() => autoUpdater.checkForUpdates().catch(e => log.error('[updater] check failed:', e?.message || String(e))), 4 * 60 * 60 * 1000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // Shut down all MCP servers
  shutdownAllMcp();
  stopHookServer();
  sdkSession.stopAllSdkSessions();

  // Close filesystem watcher
  if (projectsWatcher) {
    projectsWatcher.close();
    projectsWatcher = null;
  }


  // Kill all PTY processes on quit
  for (const [, session] of activeSessions) {
    if (!session.exited) {
      try { session.pty.kill(); } catch {}
    }
  }
});

// Close SQLite after all windows are closed to avoid "connection is not open" errors
app.on('will-quit', () => {
  closeDb();
});
