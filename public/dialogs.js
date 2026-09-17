// --- Dialogs & session launch helpers ---
// Depends on globals: launchNewSession, cachedProjects, cachedAllProjects, sessionMap,
// pendingSessions, openSessions, activePtyIds, refreshSidebar, pollActiveSessions (app.js)

// --- New session dialog ---
async function resolveDefaultSessionOptions(project) {
  const effective = await window.api.getEffectiveSettings(project.projectPath);
  const options = {};
  if (effective.dangerouslySkipPermissions) {
    options.dangerouslySkipPermissions = true;
  } else if (effective.permissionMode) {
    options.permissionMode = effective.permissionMode;
  }
  if (effective.worktree) {
    options.worktree = true;
    if (effective.worktreeName) options.worktreeName = effective.worktreeName;
  }
  // Only meaningful to an SDK session; a terminal one takes its model from the
  // CLI's own flags. Passed regardless — main.js ignores what it cannot use.
  if (effective.model) options.model = effective.model;
  if (effective.effort) options.effort = effective.effort;
  if (effective.chrome) options.chrome = true;
  if (effective.preLaunchCmd) options.preLaunchCmd = effective.preLaunchCmd;
  if (effective.addDirs) options.addDirs = effective.addDirs;
  if (effective.mcpEmulation === false) options.mcpEmulation = false;
  // Which transport starts the session. main.js reads this and reports back
  // which one it actually used; the renderer picks the view from that.
  if (effective.sessionMode === 'sdk') options.mode = 'sdk';
  return options;
}

async function forkSession(session, project) {
  const options = await resolveDefaultSessionOptions(project);
  options.forkFrom = session.sessionId;
  launchNewSession(project, options);
}

async function showNewSessionPopover(project, anchorEl) {
  const callbacks = {
    onClaude: async (proj) => { launchNewSession(proj, await resolveDefaultSessionOptions(proj)); },
    onClaudeConfig: (proj) => showNewSessionDialog(proj),
    onTerminal: (proj) => launchTerminalSession(proj),
  };
  window.vueDialogs?.openPopover(project, anchorEl, callbacks);
}

async function launchTerminalSession(project) {
  const sessionId = crypto.randomUUID();
  const projectPath = project.projectPath;
  const session = {
    sessionId,
    summary: 'Terminal',
    firstPrompt: '',
    projectPath,
    name: null,
    starred: 0,
    archived: 0,
    messageCount: 0,
    modified: new Date().toISOString(),
    created: new Date().toISOString(),
    type: 'terminal',
  };

  // Track as pending
  const folder = encodeProjectPath(projectPath);
  pendingSessions.set(sessionId, { session, projectPath, folder });

  // Inject into cached project data
  sessionMap.set(sessionId, session);
  for (const projList of [cachedProjects, cachedAllProjects]) {
    let proj = projList.find(p => p.projectPath === projectPath);
    if (!proj) {
      proj = { folder, projectPath, sessions: [] };
      projList.unshift(proj);
    }
    proj.sessions.unshift(session);
  }
  refreshSidebar();

  const entry = createTerminalEntry(session);

  const result = await window.api.openTerminal(sessionId, projectPath, true, { type: 'terminal' });
  if (!result.ok) {
    entry.terminal.write(`\r\nError: ${result.error}\r\n`);
    entry.closed = true;
    return;
  }

  showSession(sessionId);
  pollActiveSessions();
}

async function showNewSessionDialog(project) {
  const effective = await window.api.getEffectiveSettings(project.projectPath);
  window.vueDialogs?.openNewSession(project, effective, (options) => launchNewSession(project, options));
}

// The dialog owns four things — permission mode, Chrome, the pre-launch command
// and the extra directories — and nothing else. Everything else a session needs
// to start comes from the project's defaults, and building the option set by
// hand from the dialog alone dropped the rest: without `mode` the CLI came back
// as a terminal rather than as the chat this session had been, and the model
// and effort went with it.
async function showResumeSessionDialog(session) {
  const effective = await window.api.getEffectiveSettings(session.projectPath);
  window.vueDialogs?.openResumeSession(session, effective, async (answers) => {
    const options = await resolveDefaultSessionOptions({ projectPath: session.projectPath });
    // Resuming never makes a worktree: the session already lives somewhere.
    delete options.worktree;
    delete options.worktreeName;
    // The dialog's answer replaces the default for everything it asked about,
    // including "off" — which is why these go before the merge rather than
    // being conditionally assigned after it.
    delete options.permissionMode;
    delete options.dangerouslySkipPermissions;
    delete options.chrome;
    delete options.preLaunchCmd;
    openSession(session, Object.assign(options, answers));
  });
}

function showAddProjectDialog() {
  window.vueDialogs?.openAddProject(async () => { await loadProjects(); });
}
