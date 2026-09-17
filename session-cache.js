const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');
const { getFolderIndexMtimeMs } = require('./folder-index-state');
const { deriveProjectPath } = require('./derive-project-path');
const { readSessionFile, readSessionFileIncremental } = require('./read-session-file');
const { encodeProjectPath } = require('./encode-project-path');

/**
 * Session cache module.
 * Call init(ctx) once with the shared context object.
 */
let PROJECTS_DIR, accountId, activeSessions, getMainWindow, log;
let deleteCachedFolder, getCachedByFolder, upsertCachedSessions, deleteCachedSession;
let deleteSearchFolder, deleteSearchSession, upsertSearchEntries;
let setFolderMeta, getFolderMeta, getAllFolderMeta, getAllMeta, getAllCached, getSetting, getMeta, setName, getAllProjectGitCounts;

function init(ctx) {
  // Switching accounts points this module at another projects directory, and
  // the fold state of the one it is leaving is dead weight from that moment on.
  foldState.clear();
  PROJECTS_DIR = ctx.PROJECTS_DIR;
  accountId = ctx.accountId || 'default';
  activeSessions = ctx.activeSessions;
  getMainWindow = ctx.getMainWindow;
  log = ctx.log;
  // DB functions
  deleteCachedFolder = ctx.db.deleteCachedFolder;
  getCachedByFolder = ctx.db.getCachedByFolder;
  upsertCachedSessions = ctx.db.upsertCachedSessions;
  deleteCachedSession = ctx.db.deleteCachedSession;
  deleteSearchFolder = ctx.db.deleteSearchFolder;
  deleteSearchSession = ctx.db.deleteSearchSession;
  upsertSearchEntries = ctx.db.upsertSearchEntries;
  setFolderMeta = ctx.db.setFolderMeta;
  getFolderMeta = ctx.db.getFolderMeta;
  getAllFolderMeta = ctx.db.getAllFolderMeta;
  getAllMeta = ctx.db.getAllMeta;
  getAllCached = ctx.db.getAllCached;
  getSetting = ctx.db.getSetting;
  getMeta = ctx.db.getMeta;
  setName = ctx.db.setName;
  getAllProjectGitCounts = ctx.db.getAllProjectGitCounts;
}

// readSessionFile is imported from read-session-file.js (shared with worker)

/**
 * Per-transcript fold state, so a change re-reads only what was appended.
 *
 * Keyed by path and held only in memory: losing it costs one full read, which
 * is what every read used to be. The watcher fires on every write a live
 * session makes, and a full re-read of a long transcript is 150–190ms of
 * blocked main thread each time — see readSessionFileIncremental.
 */
const foldState = new Map();

/** Forget a transcript's fold state — it is gone, or its folder is. */
function forgetFoldState(filePath) {
  foldState.delete(filePath);
}

/** Read one folder from filesystem by scanning .jsonl files directly */
function readFolderFromFilesystem(folder) {
  const folderPath = path.join(PROJECTS_DIR, folder);
  const projectPath = deriveProjectPath(folderPath, folder);
  if (!projectPath) return { projectPath: null, sessions: [] };
  const sessions = [];

  try {
    const jsonlFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.jsonl'));
    for (const file of jsonlFiles) {
      const s = readSessionFile(path.join(folderPath, file), folder, projectPath);
      if (s) sessions.push(s);
    }
  } catch {}

  return { projectPath, sessions };
}

/** Refresh a single folder incrementally: only re-read changed/new .jsonl files */
function refreshFolder(folder) {
  const folderPath = path.join(PROJECTS_DIR, folder);
  if (!fs.existsSync(folderPath)) {
    deleteCachedFolder(folder, accountId);
    return;
  }

  const projectPath = deriveProjectPath(folderPath, folder);
  if (!projectPath) {
    // Keep whatever mapping is already recorded rather than writing null over
    // it: add-project stores the path it was handed, and a folder that cannot
    // name itself — no transcripts, or only the stub the CLI leaves behind —
    // would otherwise lose it and take the project out of the sidebar.
    const known = getFolderMeta?.(folder)?.projectPath || null;
    setFolderMeta(folder, known, getFolderIndexMtimeMs(folderPath));
    return;
  }

  // Get what's currently cached for this folder
  const cachedSessions = getCachedByFolder(folder, accountId);
  const cachedMap = new Map(); // sessionId → modified ISO string
  // sessionId → the `custom-title` this session's transcript carried last time
  // we looked. What makes "the user just ran /rename" answerable — see below.
  const lastCustomTitle = new Map();
  for (const row of cachedSessions) {
    cachedMap.set(row.sessionId, row.modified);
    lastCustomTitle.set(row.sessionId, row.customTitle || null);
  }

  // Scan current .jsonl files
  let jsonlFiles;
  try {
    jsonlFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.jsonl'));
  } catch { return; }

  const currentIds = new Set();
  let changed = false;

  // Collect all changes first, then batch DB writes to minimize lock duration
  const sessionsToUpsert = [];
  const searchEntriesToUpsert = [];
  const namesToSet = [];
  const sessionsToDelete = [];

  for (const file of jsonlFiles) {
    const filePath = path.join(folderPath, file);
    const sessionId = path.basename(file, '.jsonl');
    currentIds.add(sessionId);

    // Check if file mtime changed
    let fileMtime;
    try { fileMtime = fs.statSync(filePath).mtime.toISOString(); } catch { continue; }

    if (cachedMap.has(sessionId) && cachedMap.get(sessionId) === fileMtime) {
      continue; // unchanged, skip
    }

    // File is new or modified — fold in whatever was appended since last time.
    const { session: s, state } = readSessionFileIncremental(
      filePath, folder, projectPath, foldState.get(filePath),
    );
    if (state) foldState.set(filePath, state);
    else foldState.delete(filePath);
    if (s) {
      sessionsToUpsert.push(s);
      // A name the user typed lives in session_meta.name, whichever door they
      // typed it at: the rename dialog in this app, or `/rename` in the CLI —
      // which writes a `custom-title` record into the transcript. AI titles are
      // never promoted; they stay in session_cache.aiTitle and lose to a name.
      //
      // The test is whether the record *changed*, not whether it exists. It
      // stays in the file forever, so "this transcript has a custom-title" was
      // true long after the rename that wrote it, and re-applying it on every
      // rescan is how a name typed in this app minutes ago got wiped back to
      // one set last week. A value we have not seen before is a rename that has
      // just happened, and that is the only one worth acting on.
      // NULL is "we have never recorded one", not "there was none": the column
      // was added to a database full of rows, and a session indexed before it
      // existed has no before-value however many times it has been scanned. Only
      // a title we have actually written down can be compared against.
      const previous = lastCustomTitle.get(s.sessionId);
      const recorded = previous !== undefined && previous !== null;
      const existingName = getMeta(s.sessionId)?.name;
      const renamedInCli = recorded
        ? !!s.customTitle && s.customTitle !== previous
        // Nothing to compare against, so fall back to the conservative rule:
        // take the record only where nothing else has named the session. The
        // upsert below records it, and every scan after this one can tell.
        : !!s.customTitle && !existingName;
      if (renamedInCli) namesToSet.push({ id: s.sessionId, name: s.customTitle });
      // Search titles follow the same order, with the record itself still a
      // fallback: a session whose meta name was cleared but whose transcript
      // carries a title is better found by that title than by nothing.
      const name = (renamedInCli ? s.customTitle : existingName) || s.customTitle || s.aiTitle || '';
      searchEntriesToUpsert.push({
        id: s.sessionId, type: 'session', folder: s.folder,
        title: (name ? name + ' ' : '') + s.summary, body: s.textContent,
      });
    }
    changed = true;
  }

  // Remove sessions whose .jsonl files were deleted
  for (const sessionId of cachedMap.keys()) {
    if (!currentIds.has(sessionId)) {
      sessionsToDelete.push(sessionId);
      forgetFoldState(path.join(folderPath, sessionId + '.jsonl'));
      changed = true;
    }
  }

  // Batch all DB writes to reduce lock contention
  if (sessionsToUpsert.length > 0) {
    upsertCachedSessions(sessionsToUpsert, accountId);
  }
  for (const entry of searchEntriesToUpsert) {
    deleteSearchSession(entry.id);
  }
  if (searchEntriesToUpsert.length > 0) {
    upsertSearchEntries(searchEntriesToUpsert);
  }
  for (const { id, name } of namesToSet) {
    setName(id, name);
  }
  for (const sessionId of sessionsToDelete) {
    deleteCachedSession(sessionId);
    deleteSearchSession(sessionId);
  }

  // Update folder mtime
  setFolderMeta(folder, projectPath, getFolderIndexMtimeMs(folderPath));
}

/** Populate entire cache from filesystem (cold start) */
function populateCacheFromFilesystem() {
  try {
    const folders = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '.git')
      .map(d => d.name);

    for (const folder of folders) {
      refreshFolder(folder);
    }
  } catch (err) {
    console.error('Error populating cache:', err);
  }
}

/**
 * Everything a build reads that does not depend on the archive filter.
 *
 * Two whole-table scans, the settings row, the git counts and a readdir of the
 * projects directory — the same answers for the archived view and the
 * unarchived one. The renderer needs both lists on every refresh, and asking
 * twice meant doing all of this twice for a difference of one `continue`.
 */
function readProjectsSnapshot() {
  let dirs = [];
  try {
    dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '.git')
      .map(d => d.name);
  } catch { /* no projects directory yet */ }

  return {
    metaMap: getAllMeta(),
    cachedRows: getAllCached(accountId),
    global: getSetting('global') || {},
    gitCounts: getAllProjectGitCounts?.() || new Map(),
    folderMeta: getAllFolderMeta(),
    dirs,
  };
}

/** Build projects response from cached data */
function buildProjectsFromCache(showArchived, snapshot = readProjectsSnapshot()) {
  const { metaMap, cachedRows, global, gitCounts } = snapshot;
  const hiddenProjects = new Set(global.hiddenProjects || []);

  // Group by projectPath, not on-disk folder name. Multiple ~/.claude/projects/<folder>/
  // directories can resolve to the same projectPath (Claude Code's folder-name encoding
  // scheme has changed over time, leaving legacy stragglers around), so we merge them into
  // a single sidebar group to avoid duplicate-id collisions in the morphdom render.
  // Only insert a project entry once we have a session that survives the archive filter —
  // otherwise folders whose sessions are all archived would appear in the sidebar as
  // undismissable phantom entries.
  const projectMap = new Map();
  for (const row of cachedRows) {
    if (!row.projectPath) continue;
    if (hiddenProjects.has(row.projectPath)) continue;
    const meta = metaMap.get(row.sessionId);
    const s = {
      sessionId: row.sessionId,
      summary: row.summary,
      firstPrompt: row.firstPrompt,
      created: row.created,
      modified: row.modified,
      messageCount: row.messageCount,
      projectPath: row.projectPath,
      slug: row.slug || null,
      aiTitle: row.aiTitle || null,
      contextTokens: row.contextTokens || 0,
      contextLimit: row.contextLimit || 0,
      changedFiles: row.changedFiles || 0,
      linesAdded: row.linesAdded || 0,
      linesRemoved: row.linesRemoved || 0,
      name: meta?.name || null,
      starred: meta?.starred || 0,
      archived: meta?.archived || 0,
      accountId: row.accountId || 'default',
    };
    if (!showArchived && s.archived) continue;
    if (!projectMap.has(row.projectPath)) {
      projectMap.set(row.projectPath, {
        folder: encodeProjectPath(row.projectPath),
        projectPath: row.projectPath,
        sessions: [],
      });
    }
    projectMap.get(row.projectPath).sessions.push(s);
  }

  // Include empty project directories (no sessions yet). Resolve folder→projectPath
  // through cache_meta (populated by the indexer) instead of re-reading a JSONL off
  // disk for every directory on every render. Fall back to deriveProjectPath only
  // for folders the indexer hasn't seen yet, and backfill cache_meta so subsequent
  // renders are pure DB reads.
  try {
    const { folderMeta, dirs } = snapshot;
    for (const name of dirs) {
      let projectPath = folderMeta.get(name)?.projectPath;
      if (!projectPath) {
        projectPath = deriveProjectPath(path.join(PROJECTS_DIR, name), name);
        if (projectPath) {
          setFolderMeta(name, projectPath, 0);
          // Written back into the snapshot as well, so a second build over the
          // same one does not re-derive it off disk.
          folderMeta.set(name, { projectPath });
        }
      }
      if (!projectPath) continue;
      if (hiddenProjects.has(projectPath)) continue;
      if (!projectMap.has(projectPath)) {
        projectMap.set(projectPath, {
          folder: encodeProjectPath(projectPath),
          projectPath,
          sessions: [],
        });
      }
    }
  } catch {}

  // Inject active plain terminal sessions so they participate in sorting
  for (const [sessionId, session] of activeSessions) {
    if (session.exited || !session.isPlainTerminal) continue;
    if (!session.projectPath) continue;
    if (hiddenProjects.has(session.projectPath)) continue;
    if (!projectMap.has(session.projectPath)) {
      projectMap.set(session.projectPath, {
        folder: encodeProjectPath(session.projectPath),
        projectPath: session.projectPath,
        sessions: [],
      });
    }
    const proj = projectMap.get(session.projectPath);
    if (!proj.sessions.some(s => s.sessionId === sessionId)) {
      proj.sessions.push({
        sessionId, summary: 'Terminal', firstPrompt: '', projectPath: session.projectPath,
        name: null, starred: 0, archived: 0, messageCount: 0,
        modified: new Date(session._openedAt).toISOString(),
        created: new Date(session._openedAt).toISOString(),
        type: 'terminal',
      });
    }
  }

  const projects = [];
  for (const proj of projectMap.values()) {
    proj.sessions.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    const gc = gitCounts.get(proj.projectPath);
    if (gc) {
      proj.unpushedCount = gc.unpushedCount || 0;
      proj.changedCount = gc.changedCount || 0;
    }
    projects.push(proj);
  }

  projects.sort((a, b) => {
    // Empty projects go to the bottom
    if (a.sessions.length === 0 && b.sessions.length > 0) return 1;
    if (b.sessions.length === 0 && a.sessions.length > 0) return -1;
    const aName = a.projectPath.split('/').filter(Boolean).pop() || a.projectPath;
    const bName = b.projectPath.split('/').filter(Boolean).pop() || b.projectPath;
    return aName.localeCompare(bName);
  });

  return projects;
}

/**
 * Both views of the tree, from one pass over the cache.
 *
 * The sidebar needs the list its archive filter selected and the unfiltered one
 * at the same time — a project's own page shows archived sessions whether or
 * not the sidebar is. They cannot be derived from one another in the renderer:
 * a project whose folder is gone from disk but whose archived sessions are
 * still cached belongs in `all` and not in `visible`, and nothing in the
 * payload says which projects are still on disk.
 */
function buildProjectSets() {
  const snapshot = readProjectsSnapshot();
  return {
    visible: buildProjectsFromCache(false, snapshot),
    all: buildProjectsFromCache(true, snapshot),
  };
}

function notifyRendererProjectsChanged() {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('projects-changed');
  }
}

// The scan used to narrate itself into a status bar in the renderer. The bar is
// gone; the narration is still the only trace a slow first index leaves, so it
// stays as a log line.
function logStatus(text, type) {
  log.info(`[status] (${type || 'info'}) ${text}`);
}

// --- Worker-based cache population (non-blocking) ---
let populatingCache = false;

function populateCacheViaWorker() {
  if (populatingCache) return;
  populatingCache = true;
  logStatus('Scanning projects\u2026', 'active');

  const worker = new Worker(path.join(__dirname, 'workers', 'scan-projects.js'), {
    workerData: { projectsDir: PROJECTS_DIR, accountId },
  });

  worker.on('message', (msg) => {
    // Progress updates from worker
    if (msg.type === 'progress') {
      logStatus(msg.text, 'active');
      return;
    }

    if (!msg.ok) {
      console.error('Worker scan error:', msg.error);
      logStatus('Scan failed: ' + msg.error, 'error');
      populatingCache = false;
      return;
    }

    logStatus(`Indexing ${msg.results.length} projects\u2026`, 'active');

    // Write results to DB on main thread (fast)
    const currentAccountId = msg.accountId || accountId;
    let sessionCount = 0;
    for (const { folder, projectPath, sessions, indexMtimeMs } of msg.results) {
      deleteCachedFolder(folder, currentAccountId);
      deleteSearchFolder(folder);
      if (sessions.length > 0) {
        sessionCount += sessions.length;
        upsertCachedSessions(sessions, currentAccountId);
        for (const s of sessions) {
          // Only JSONL custom-title (a genuine user title) promotes to the DB
          // name column. AI titles must not — see refreshFolder.
          //
          // And only where nothing has named the session already. This is the
          // first index of a folder, so there is no "what did it say last
          // time" to compare against — but session_meta survives a cache
          // rebuild, so a name typed in this app can be sitting there with an
          // older `/rename` still in the file. The live path in refreshFolder
          // is the one that can tell a new rename from an old record.
          if (s.customTitle && !getMeta(s.sessionId)?.name) setName(s.sessionId, s.customTitle);
        }
        upsertSearchEntries(sessions.map(s => {
          // Search title precedence matches the sidebar: user rename > custom-title > ai-title.
          const name = getMeta(s.sessionId)?.name || s.customTitle || s.aiTitle || '';
          return {
            id: s.sessionId, type: 'session', folder: s.folder,
            title: (name ? name + ' ' : '') + s.summary,
            body: s.textContent,
          };
        }));
      }
      setFolderMeta(folder, projectPath, indexMtimeMs);
    }

    populatingCache = false;
    logStatus(`Indexed ${sessionCount} sessions across ${msg.results.length} projects`, 'done');
    notifyRendererProjectsChanged();
  });

  worker.on('error', (err) => {
    console.error('Worker error:', err);
    logStatus('Worker error: ' + err.message, 'error');
    populatingCache = false;
  });

  // If the worker exits abnormally (SIGSEGV, OOM, uncaught exception) without
  // sending a message, neither the 'message' nor 'error' handler will fire.
  // Reset the flag here to prevent a permanent lockout where the session list
  // stays empty because populateCacheViaWorker() returns immediately.
  worker.on('exit', (code) => {
    if (populatingCache) {
      populatingCache = false;
      if (code !== 0) {
        logStatus('Scan worker exited unexpectedly', 'error');
      }
    }
  });
}

module.exports = {
  init,
  readSessionFile,
  readFolderFromFilesystem,
  refreshFolder,
  populateCacheFromFilesystem,
  buildProjectSets,
  notifyRendererProjectsChanged,
  populateCacheViaWorker,
};
