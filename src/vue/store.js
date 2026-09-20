import { reactive } from 'vue';

export const store = reactive({
  // Project/session data. `projects` is what the sidebar's filter tab selected
  // — archived sessions are simply absent while the Archived tab is not the
  // one showing. `allProjects` is the unfiltered set, for views that are not
  // downstream of that filter (a project's own page).
  projects: [],
  allProjects: [],

  // Session runtime state
  activePtyIds: new Set(),
  // Sessions driven by the Agent SDK rather than a PTY. They carry the same
  // conversation and write the same transcript; only the transport and the
  // component that renders them differ. app.js records this from what
  // open-terminal reports.
  sdkSessionIds: new Set(),
  activeSessionId: null,
  sessionBusyState: new Map(),
  // sessionId → { totalTokens, maxTokens } — what the context holds, as the
  // composer's ring last read it (SessionSdkApp.vue). Buddy's brain reads it
  // too, so the two never disagree.
  contextUsage: new Map(),
  // Settings → Buddy: what the buttons over its chat say. Blank entries fall
  // back to the defaults in buddy-suggestions.js.
  buddyPrompts: [],
  // Settings → Buddy: which robot the mascot is (src/vue/buddy-designs.js).
  buddyDesign: 'classic',
  attentionSessions: new Set(),
  responseReadySessions: new Set(),
  // Sessions whose finished turn the user has already seen but not yet left.
  // The sidebar's blue dot clears the instant you click a session, so
  // responseReadySessions alone would yank a board card out of DONE under the
  // cursor. app.js parks the id here instead and drops it when focus moves to
  // another session or the view is closed — the two gestures that mean "done
  // with it".
  readPendingSessions: new Set(),
  lastActivityTime: new Map(),
  pendingSessions: new Set(),

  // Filter state
  showStarredOnly: false,
  showRunningOnly: false,
  showTodayOnly: false,
  showArchived: false,
  searchMatchIds: null,
  searchMatchProjectPaths: null,

  // Visibility settings
  visibleSessionCount: 10,
  sessionMaxAgeDays: 3,

  // Header state (active session context)
  headerSession: null,
  headerPtyTitle: null,
  headerShellProfile: null,
  headerAccount: null,
  headerAccounts: [],

  // App layout state
  activeTab: 'sessions',
  sidebarCollapsed: false,
  theme: 'dark',                 // 'dark' | 'light' — mirrored onto <html data-theme>
  // Board cards fly between columns unless this, or the OS setting, says no.
  reduceMotion: false,
  // Unread counters — see unread.js. Off unless the setting is on.
  unreadCounters: false,
  // sessionId → how many of its messages from Claude were on screen last time.
  unreadSeen: {},
  // Buddy's own, counted from its live stream while its tab is not showing.
  buddyUnread: 0,
  sessionFilterTab: 'recent',    // FilterTabs selection: recent | running | pinned
  sidebarViewMode: 'list',       // 'list' | 'grid'
  attentionProject: null,        // projectPath highlighted in the active-sessions rail
  loadingStatus: '',
  accountSwitching: false,
  searchQuery: '',
  // ⌘K palette — SpotlightApp.vue. Toggled from the shell (the + beside the
  // search field, the ⌘K chip) as well as by the shortcut itself.
  spotlightOpen: false,

  // The plan's 5-hour and 7-day meters, as last reported by a `rate_limit_event`
  // — see rate-limits.js. Per account rather than per session, which is why it
  // lives here and not in the chat component that receives the event.
  rateLimits: null,

  // Settings panel
  settingsOpen: false,
  settingsScope: 'global',       // 'global' | 'project'
  settingsProjectPath: null,

  // Main area panel visibility (Vue-owned — do not touch via innerHTML/style directly)
  showBoard: false,
  // Session previewed in the board's bottom split — the real terminal, not a
  // copy. null = board full height.
  boardPreviewId: null,
  // Fade session cards by how long ago they last did anything. One flag, not
  // one per view: the board and a project's Sessions tab show the same button
  // with the same label over the same ladder (freshness.js), so remembering two
  // different answers for it would only ever read as a bug. Persisted into
  // `ui_state` — see the watcher in App.vue.
  highlightFresh: true,
  // sessionId → 1..3, from the last Summarize run: where the model says the
  // work is worth looking at next. The board draws a flag and an outline off
  // it. Deliberately not persisted — it describes a set of transcripts as they
  // were at one moment, and a stale flag is worse than none.
  boardFocus: new Map(),
  boardSplitHeight: 380,          // px, height of the session pane under the board
  // projectPath the board is scoped to, or null for every project. It lives
  // here rather than in SessionBoardApp because the control is in the board's
  // sidebar and the rendering is in the board — two siblings, one truth.
  boardProjectFilter: null,
  showJsonl: false,
  // A sub-agent's transcript, open in the main area. It is not a session — it
  // has no row and no card — so this is its only presence in the app's state.
  subagentViewOpen: false,
  // sessionId → number of sub-agents still working, for the sidebar rows and
  // the board cards. Only running sessions are ever polled: an agent cannot
  // outlive the CLI process that spawned it.
  subagentCounts: new Map(),
  // Bumped whenever a note is written — created, edited, ticked off, deleted.
  // The notes themselves live in files and are re-read by whoever is showing
  // them; this is for the things that only show a *number* derived from them,
  // which would otherwise have no way of knowing the number had moved. The
  // side panel's TODO badge was the case: ticking an item off updated the list
  // under your cursor and left the count beside it saying the old figure until
  // the session was reopened.
  notesRevision: 0,
  planViewerOpen: false,
  // What the Markdown pane is currently showing: 'plan' or 'note'. The two
  // come from different directories with different write guards, so the save
  // needs to know which one it is looking at.
  planViewerKind: 'plan',
  // The file the Markdown pane has open — a note's is what its bar edits.
  planViewerPath: '',
  gridViewActive: false,
  gridViewerCount: '',
  accountViewerOpen: false,      // Accounts tab detail panel in the main area
  accountViewerId: null,         // which account it is showing

  // Session side panel — uncommitted changes / containers / scratch shell for
  // the session that is open in the main area. Scoped to that session's own
  // projectPath, which may be a worktree the Projects tab is not showing.
  //
  // One pane at a time, named rather than a boolean: the tab is what persists
  // across a session switch. Keeping the shell open and stepping through
  // sessions is the point — the pane stays, its contents re-scope to whatever
  // session is now in front. null means closed.
  sidePanelTab: null,            // null | 'group' | 'changes' | 'todos' | 'tasks' | 'containers' | 'shell'
  // The same panel beside the Chat tab's assistant, with its own open pane —
  // see side-panel-tabs.js. Only 'todos' and 'tasks' apply there.
  chatSidePanelTab: null,
  sidePanelWidth: 380,
  // Last get-project-detail the panel loaded, published so the rail can badge
  // its buttons without issuing a second call — get-project-detail broadcasts
  // `projects-changed`, which re-renders the whole sidebar, so it is not free.
  sidePanelDetail: null,
  // An absolute path the panel is showing read-only, over whatever pane is
  // open. Set by clicking an `@file` mention in the chat — the answer to "what
  // is in that file" belongs beside the conversation, not in place of it.
  sidePanelFile: null,

  // Mirrored out of the tab panels that own them, because the collapsed rail
  // draws the same lists while those panels are folded away. The panels stay
  // the source of truth — these are written on their way in.
  plans: [],
  accounts: [],
  activeAccountId: 'default',

  // Project avatars: projectPath → data: URL string
  avatarDataUrls: {},

  // The Chat tab's assistant — see chat-agent.js. Not a row in any list: it
  // has no project the user works in, so this is its only presence in the
  // renderer. null until the tab is first opened.
  chatSession: null,
  // Bumped when Buddy rewrites its MEMORY.md, so the Memory pane re-reads it.
  buddyMemoryRevision: 0,
  // sessionId → a first prompt to send once that session's chat view is up.
  // Written by whoever starts a session with a prompt already in hand (the
  // new group session dialog), consumed by SessionSdkApp on mount.
  pendingPrompts: new Map(),
  chatStarting: false,
  chatError: '',
});
