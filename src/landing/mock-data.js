const now = Date.now();
const mins = (n) => new Date(now - n * 60 * 1000).toISOString();
const hours = (n) => new Date(now - n * 60 * 60 * 1000).toISOString();
const days = (n) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();

// Live PTYs. Three of the projects below own at least one, so UnreadRail
// renders a row per project and CollapsedRailApp has avatars to show.
export const MOCK_ACTIVE_PTY_IDS = new Set(['sess-001', 'sess-004', 'sess-006', 'sess-003', 'sess-term']);
// One project per rail status: wooton-pad waits on input, my-api is working,
// blog-redesign has a reply ready.
export const MOCK_WAITING_PTY_IDS = new Set(['sess-003']);
export const MOCK_RESPONSE_READY_PTY_IDS = new Set(['sess-006']);
// Deliberately NOT every live PTY. SessionBoardApp's columnFor() ranks busy
// above response-ready, so marking sess-006 busy would empty the DONE column
// and the board would demo three states instead of four.
export const MOCK_BUSY_PTY_IDS = new Set(['sess-001', 'sess-004']);

// Session the demo opens with — drives SessionHeaderApp and the fake terminal.
export const MOCK_SELECTED_SESSION_ID = 'sess-001';

// `contextTokens` drives SessionCard's UsageRing and `linesAdded`/`linesRemoved`
// its churn row — both are board-card features, so every session carries them.
//
// Every session also carries its own `projectPath`, which is not redundant
// with the project it sits under: session-cache.js puts it on the row, and
// components handed a bare session (the board's cards, the summary list) read
// it from there rather than walking back up to the project.
const withProjectPaths = (projects) => projects.map(project => ({
  ...project,
  sessions: project.sessions.map(s => ({ projectPath: project.projectPath, ...s })),
}));

export const MOCK_PROJECTS = withProjectPaths([
  {
    projectPath: '/Users/demo/Projects/wooton-pad',
    sessions: [
      {
        sessionId: 'sess-001',
        name: 'Add landing page + interactive demo',
        aiTitle: 'GitHub Pages marketing site with Vue components',
        modified: mins(28),
        messageCount: 62,
        contextTokens: 84_000, linesAdded: 412, linesRemoved: 96, changedFiles: 7,
        starred: false, archived: false, type: 'claude', slug: null,
      },
      {
        sessionId: 'sess-term',
        name: 'Terminal',
        aiTitle: '',
        modified: mins(5),
        messageCount: 0,
        starred: false, archived: false, type: 'terminal', slug: null,
      },
      {
        sessionId: 'sess-002',
        name: 'Fix session fork detection',
        aiTitle: 'Session transition JSONL matching logic',
        modified: days(2),
        messageCount: 38,
        contextTokens: 51_000, linesAdded: 88, linesRemoved: 41, changedFiles: 3,
        starred: true, archived: false, type: 'claude', slug: null,
      },
      {
        sessionId: 'sess-003',
        name: 'OAuth integration refactor',
        aiTitle: 'Multi-account credential separation',
        modified: days(4),
        messageCount: 94,
        contextTokens: 148_000, linesAdded: 233, linesRemoved: 187, changedFiles: 11,
        starred: false, archived: false, type: 'claude', slug: null,
      },
    ],
  },
  {
    projectPath: '/Users/demo/Projects/my-api',
    sessions: [
      {
        sessionId: 'sess-004',
        name: 'Add rate limiting middleware',
        aiTitle: 'Token bucket algorithm for Express.js routes',
        modified: mins(51),
        messageCount: 29,
        contextTokens: 37_000, linesAdded: 168, linesRemoved: 12, changedFiles: 4,
        starred: false, archived: false, type: 'claude', slug: null,
      },
      {
        sessionId: 'sess-005',
        name: 'Database migration for v2',
        aiTitle: 'PostgreSQL schema migration with zero downtime',
        modified: hours(26),
        messageCount: 115,
        contextTokens: 172_000, linesAdded: 604, linesRemoved: 58, changedFiles: 9,
        starred: false, archived: false, type: 'claude', slug: null,
      },
    ],
  },
  {
    projectPath: '/Users/demo/Projects/blog-redesign',
    sessions: [
      {
        sessionId: 'sess-006',
        name: 'Homepage hero section',
        aiTitle: 'Responsive hero with animated gradient background',
        modified: hours(2),
        messageCount: 47,
        contextTokens: 66_000, linesAdded: 197, linesRemoved: 74, changedFiles: 5,
        starred: true, archived: false, type: 'claude', slug: null,
      },
      {
        sessionId: 'sess-007',
        name: 'Mobile navigation menu',
        aiTitle: 'Accessible hamburger menu with CSS animations',
        modified: days(2),
        messageCount: 33,
        contextTokens: 44_000, linesAdded: 121, linesRemoved: 19, changedFiles: 3,
        starred: false, archived: false, type: 'claude', slug: null,
      },
      // Archived, so the Archived filter tab has something the other tabs hide.
      {
        sessionId: 'sess-008',
        name: 'Newsletter signup form',
        aiTitle: 'Double opt-in flow with Mailchimp webhook',
        modified: days(9),
        messageCount: 21,
        contextTokens: 29_000, linesAdded: 64, linesRemoved: 8, changedFiles: 2,
        starred: false, archived: true, type: 'claude', slug: null,
      },
    ],
  },
]);

export const MOCK_ACCOUNTS = [
  { id: 'default', name: 'Personal', configDir: '~/.claude (default)' },
  { id: 'work', name: 'Work', configDir: '~/.claude-work' },
];

export const MOCK_ACTIVE_ACCOUNT_ID = 'default';

// Usage quota behind the account chip in the top nav ("42% 5h").
export const MOCK_USAGE = {
  default: { session: 42, weekAll: 68, sessionResetIn: '3h', weekAllResetIn: '2d' },
  work: { session: 15, weekAll: 31, sessionResetIn: '4h', weekAllResetIn: '5d' },
};

export const MOCK_PLANS = [
  {
    filename: 'implement-rate-limiting.md',
    title: 'Implement rate limiting middleware',
    modified: hours(3),
  },
  {
    filename: 'database-migration-plan.md',
    title: 'Zero-downtime PostgreSQL migration',
    modified: days(1),
  },
  {
    filename: 'landing-live-demo.md',
    title: 'Drive the landing demo off the app’s own components',
    modified: hours(9),
  },
];

// ── Notes & TODO ─────────────────────────────────────────────────────────
// The second block on the Plans tab. Account-scoped Markdown with checkboxes,
// the shape account-notes.js `summarize()` returns.
const todo = (index, done, text) => ({ index, done, text, line: index });

export const MOCK_NOTES = [
  {
    filename: '2026-09-11-beta-checklist.md',
    filePath: '/Users/demo/.claude/notes/2026-09-11-beta-checklist.md',
    title: 'Public beta checklist',
    projects: ['/Users/demo/Projects/my-api'],
    pinned: true,
    modified: hours(6),
    todos: [
      todo(0, true, 'Rate limit the public routes'),
      todo(1, true, 'Rehearse the migration on a staging dump'),
      todo(2, false, 'Alert on replication lag during backfill'),
      todo(3, false, 'Mail the beta list'),
    ],
    blocks: [],
    done: 2,
    total: 4,
    preview: 'Everything that has to be true before the beta list goes out.',
  },
  {
    filename: '2026-09-04-landing.md',
    filePath: '/Users/demo/.claude/notes/2026-09-04-landing.md',
    title: 'Landing page notes',
    projects: ['/Users/demo/Projects/wooton-pad'],
    pinned: false,
    modified: days(3),
    todos: [
      todo(0, true, 'Mount the app’s own components, not screenshots'),
      todo(1, false, 'Light theme for the whole page, terminal included'),
    ],
    blocks: [],
    done: 1,
    total: 2,
    preview: 'The demo is the pitch — everything else is captioning.',
  },
];

// The notes' own Markdown, for when one is clicked open. `read-note` returns
// this shape; the pane is the same one plans use.
export const MOCK_NOTE_FILES = {
  '2026-09-11-beta-checklist.md': {
    ok: true,
    filePath: '/Users/demo/.claude/notes/2026-09-11-beta-checklist.md',
    content: `# Public beta checklist

Everything that has to be true before the beta list goes out.

- [x] Rate limit the public routes
- [x] Rehearse the migration on a staging dump
- [ ] Alert on replication lag during backfill
- [ ] Mail the beta list

Notes live in the account's Claude home, not in a repository — so they
survive switching projects and still say which project they are about.
`,
  },
  '2026-09-04-landing.md': {
    ok: true,
    filePath: '/Users/demo/.claude/notes/2026-09-04-landing.md',
    content: `# Landing page notes

The demo is the pitch — everything else is captioning.

- [x] Mount the app's own components, not screenshots
- [ ] Light theme for the whole page, terminal included
`,
  },
};

// Sub-agents the selected session has out working. Badges the rail's
// Background-tasks button and fills that pane.
export const MOCK_SUBAGENTS = {
  'sess-001': [
    { id: 'agent-1', name: 'Explore', description: 'Find every stylesheet public/index.html loads', running: true, startedAt: mins(4) },
    { id: 'agent-2', name: 'general-purpose', description: 'Check the demo against the app’s component list', running: false, startedAt: mins(19) },
  ],
  'sess-004': [
    { id: 'agent-3', name: 'Explore', description: 'Locate the Express route table', running: false, startedAt: mins(58) },
  ],
};

// The plan files themselves. `window.api.readPlan` answers out of this map, so
// clicking a row in the Plans tab opens the same Markdown pane the app opens —
// not a stub that says "download the app to read this".
export const MOCK_PLAN_FILES = {
  'implement-rate-limiting.md': {
    filePath: '/Users/demo/.claude/plans/implement-rate-limiting.md',
    content: `# Implement rate limiting middleware

Protect the public API routes with a per-IP token bucket before the beta
opens up. Nothing here should need a Redis hop on the happy path.

## Why now

Two scrapers took \`/v1/search\` to 40 req/s last week and the Postgres
connection pool ran dry. The fix has to land before the beta list is mailed.

## Approach

1. \`rate-limiter-flexible\` in memory, one limiter per key.
2. Key on \`req.ip\`, falling back to \`anonymous\` behind the proxy.
3. 100 points / 60s by default; \`/v1/search\` gets its own 20/60s bucket.
4. On rejection answer \`429\` with a \`retryAfter\` the client can read.

## Files

| File | Change |
| --- | --- |
| \`src/middleware/rate-limit.js\` | new — the middleware factory |
| \`src/routes/api.js\` | mount it ahead of the handlers |
| \`test/rate-limit.test.js\` | new — burst, refill and per-key isolation |

\`\`\`js
module.exports = function rateLimit({ points = 100, duration = 60 } = {}) {
  return async (req, res, next) => {
    const key = req.ip ?? 'anonymous';
    if (!limiters.has(key)) {
      limiters.set(key, new RateLimiterMemory({ points, duration }));
    }
    try {
      await limiters.get(key).consume(key);
      next();
    } catch {
      res.status(429).json({ error: 'Too many requests', retryAfter: duration });
    }
  };
};
\`\`\`

## Open questions

- [x] In-memory is fine for one process — confirmed, we run a single node.
- [ ] Do we exempt authenticated traffic, or give it a larger bucket?
- [ ] Emit a metric per rejection so the dashboard can show the shape.

## Not doing

Distributed limiting across replicas. There is one replica. When there are
two, this moves behind Redis and the interface does not change.
`,
  },

  'database-migration-plan.md': {
    filePath: '/Users/demo/.claude/plans/database-migration-plan.md',
    content: `# Zero-downtime PostgreSQL migration

Split \`users.profile\` (jsonb) into real columns without taking the API
down and without a long lock on a 50M-row table.

## Phases

1. **Expand** — add the new columns, nullable, no default. Cheap on PG 14.
2. **Backfill** — 10k-row batches, throttled to keep replication lag under 2s.
3. **Dual write** — the app writes both shapes; reads still come from jsonb.
4. **Flip reads** — behind \`USERS_READ_COLUMNS\`, one deploy, reversible.
5. **Contract** — drop the jsonb column a week after the flip holds.

## Rollback

Every phase before the contract is reversible by flipping the flag back.
The rehearsal on the staging dump took 41 minutes end to end and the
rollback took 90 seconds.

\`\`\`sql
ALTER TABLE users
  ADD COLUMN display_name text,
  ADD COLUMN locale       text,
  ADD COLUMN avatar_url   text;
\`\`\`

## Checklist

- [x] Rehearse on a staging copy of production
- [x] Backfill script with a resumable cursor
- [ ] Alert on replication lag during the backfill window
- [ ] Schedule the contract phase for the week after the flip
`,
  },

  'landing-live-demo.md': {
    filePath: '/Users/demo/.claude/plans/landing-live-demo.md',
    content: `# Drive the landing demo off the app’s own components

The marketing page should not own a second copy of the UI. It mounts the
same Vue components the Electron renderer mounts and feeds them mock data.

## Rules

- Nothing under \`src/vue/**\` may be landing-aware.
- Everything Electron-shaped is stubbed at the boundary: \`window.api\`,
  \`window.__sb\`, the CodeMirror viewers, the PTY.
- A component that gains a stylesheet in the app gains it here too, or it
  renders unstyled in the demo and nobody notices until it ships.

## What is mocked

| Surface | Stub |
| --- | --- |
| IPC | \`window.api\` Proxy in \`src/landing/main.js\` |
| Renderer bridge | \`window.__sb\` against the mock store |
| Terminal | a static transcript, not xterm |
| Diff viewer | a one-column \`+\` renderer |

> The point is that clicking around the page is clicking around the app.
`,
  },
};

// One entry per project, not just the one the Projects window opens: the
// session side panel is scoped to the OPEN SESSION's project, so a demo that
// only knew my-api would show an empty Changes pane for the selected session.
// `unpushedCommits` + `upstream` are what the Commits sub-tab and its Push
// button read.
export const MOCK_PROJECT_DETAIL = {
  '/Users/demo/Projects/wooton-pad': {
    branch: 'feat/landing-refresh',
    upstream: 'origin/feat/landing-refresh',
    totalAdded: 412,
    totalDeleted: 96,
    changedFiles: [
      { file: 'src/landing/LandingApp.vue', added: 186, deleted: 61 },
      { file: 'src/landing/landing.css', added: 104, deleted: 22 },
      { file: 'src/landing/mock-data.js', added: 88, deleted: 9 },
      { file: 'src/landing/main.js', added: 31, deleted: 4 },
      { file: 'docs/index.html', added: 3, deleted: 0 },
    ],
    commits: [
      { hash: '9164def', message: 'feat(session): add session card component', author: 'demo', date: '4h ago' },
      { hash: '56b1034', message: 'feat(board): implement session board view', author: 'demo', date: '1d ago' },
      { hash: '5b368ad', message: 'fix: resolve absolute path for claude binary', author: 'demo', date: '2d ago' },
      { hash: '8f038a5', message: 'chore(release): bump version to 0.6.0', author: 'demo', date: '3d ago' },
    ],
    unpushedCommits: [
      { hash: '9164def', message: 'feat(session): add session card component', author: 'demo', date: '4h ago' },
      { hash: '56b1034', message: 'feat(board): implement session board view', author: 'demo', date: '1d ago' },
    ],
    // The demo opens on a session in this project, so its Containers pane is
    // the one a visitor is most likely to click — it should not be empty.
    containers: [
      { name: 'wooton-pad-docs-1', state: 'running', status: 'Up 12 minutes', ports: '3000→3000' },
      { name: 'wooton-pad-e2e-1', state: 'exited', status: 'Exited (0) 1h ago' },
    ],
    worktreePaths: [],
    readmePath: null,
  },
  '/Users/demo/Projects/my-api': {
    branch: 'feat/rate-limiting',
    upstream: 'origin/feat/rate-limiting',
    totalAdded: 168,
    totalDeleted: 12,
    changedFiles: [
      { file: 'src/middleware/rate-limit.js', added: 89, deleted: 0 },
      { file: 'src/routes/api.js', added: 12, deleted: 3 },
      { file: 'test/rate-limit.test.js', added: 65, deleted: 0 },
      { file: 'package.json', added: 2, deleted: 1 },
    ],
    commits: [
      { hash: 'a3f8c21', message: 'feat: add token bucket rate limiter', author: 'demo', date: '2d ago' },
      { hash: 'b91e4f7', message: 'feat: add middleware scaffolding', author: 'demo', date: '3d ago' },
      { hash: 'c45d2a9', message: 'chore: initial Express setup', author: 'demo', date: '5d ago' },
      { hash: 'd73e1b4', message: 'docs: add README and contributing guide', author: 'demo', date: '6d ago' },
    ],
    unpushedCommits: [
      { hash: 'a3f8c21', message: 'feat: add token bucket rate limiter', author: 'demo', date: '2d ago' },
    ],
    containers: [
      { name: 'my-api-postgres-1', state: 'running', status: 'Up 2 hours', ports: '5432→5432' },
      { name: 'my-api-redis-1', state: 'running', status: 'Up 2 hours', ports: '6379→6379' },
      { name: 'my-api-worker-1', state: 'exited', status: 'Exited (0) 20m ago' },
    ],
    worktreePaths: [],
    readmePath: null,
  },
  '/Users/demo/Projects/blog-redesign': {
    branch: 'feat/homepage-hero',
    upstream: null,
    totalAdded: 197,
    totalDeleted: 74,
    changedFiles: [
      { file: 'src/pages/index.astro', added: 121, deleted: 58 },
      { file: 'src/styles/global.css', added: 76, deleted: 16 },
    ],
    commits: [
      { hash: 'e11a730', message: 'style: tune hero gradient stops', author: 'demo', date: '5h ago' },
      { hash: 'f2c9b88', message: 'feat: scaffold homepage hero', author: 'demo', date: '1d ago' },
    ],
    unpushedCommits: [],
    containers: [],
    worktreePaths: [],
    readmePath: null,
  },
};

// Scratch-shell pane of the session side panel. No PTY on a landing page, so
// window.createPanelTerminal renders this transcript instead of an xterm.
export const MOCK_PANEL_SHELL_LINES = [
  { t: 'sh-prompt', cwd: '~/Projects/wooton-pad', branch: 'feat/landing-refresh' },
  { t: 'sh-cmd', v: 'git status -sb' },
  { t: 'sh-out', v: '## feat/landing-refresh...origin/feat/landing-refresh [ahead 2]' },
  { t: 'sh-out', v: ' M src/landing/LandingApp.vue' },
  { t: 'sh-out', v: ' M src/landing/landing.css' },
  { t: 'sh-prompt', cwd: '~/Projects/wooton-pad', branch: 'feat/landing-refresh' },
  { t: 'sh-cursor' },
];

// Canned answers for the board sidebar's Summarize button — in the app this is
// one headless `claude` call over the last message of each board session.
//
// `importance` is the 0-3 rating the real prompt asks for (board-importance.js):
// the board draws a flag and an outline off it, and the summary text says why.
// The caps hold here too — at most two of each level — because a board where
// everything is flagged says exactly as much as one where nothing is.
export const MOCK_BOARD_SUMMARIES = {
  'sess-002': {
    summary: 'Fixed fork detection by matching parentSessionId in the JSONL — all 14 tests pass and the linter is clean. Nothing left but the commit.',
    importance: 3,
  },
  'sess-006': {
    summary: 'Finished the animated gradient hero, screenshotted both breakpoints, and is waiting for review. Reads as done.',
    importance: 3,
  },
  'sess-004': {
    summary: 'Added a token-bucket rate limiter and its tests; 168 lines across four files and the suite is running now.',
    importance: 2,
  },
  'sess-005': {
    summary: 'Wrote the zero-downtime migration plus a 50M-row backfill script and rehearsed the rollback — a couple of iterations left on the lag alert.',
    importance: 2,
  },
  'sess-003': {
    summary: 'Blocked: waiting on a decision about where refresh tokens live before the multi-account refactor can continue.',
    importance: 1,
  },
  'sess-001': {
    summary: 'Rebuilt the landing demo around the session panel rail and wired the board tab into the shell.',
    importance: 1,
  },
  'sess-007': {
    summary: 'Shipped an accessible hamburger menu with a focus trap and a pure-CSS slide animation.',
    importance: 0,
  },
  'sess-term': {
    summary: 'Plain shell — ran the test suite, nothing outstanding.',
    importance: 0,
  },
};

// Commit messages the "Generate with Claude" buttons produce in the demo.
export const MOCK_COMMIT_MESSAGES = {
  short: 'feat(landing): catch the demo up to the session panel rail and board',
  descriptive: `feat(landing): catch the demo up to the session panel rail and board

- Render SessionPanelRail over the terminal instead of header buttons
- Add the Board tab and its sidebar to the live demo shell
- Drop the removed Agent Files and Stats tabs
- Load board-view, side-panel and controls CSS alongside the rest`,
};

export const MOCK_PROJECT_INFO = {
  '/Users/demo/Projects/my-api': {
    branch: 'feat/rate-limiting',
    added: 47,
    deleted: 12,
    sizeMb: 2.4,
    containers: [
      { name: 'my-api-postgres-1', state: 'running', status: 'Up 2 hours' },
      { name: 'my-api-redis-1', state: 'running', status: 'Up 2 hours' },
      { name: 'my-api-app-1', state: 'running', status: 'Up 1 hour' },
    ],
  },
  '/Users/demo/Projects/wooton-pad': {
    branch: 'main',
    added: 128,
    deleted: 34,
    sizeMb: 8.1,
    containers: [],
  },
  '/Users/demo/Projects/blog-redesign': {
    branch: 'feat/homepage-hero',
    added: 22,
    deleted: 5,
    sizeMb: 0.8,
    containers: [],
  },
};

const AVATAR_PALETTE = ['#e05c3b', '#5b9dff', '#34d399', '#f0b429', '#b48cf2', '#f68b86', '#38bdf8', '#fb923c'];

export function getProjectAvatar(projectPath) {
  // ProjectAvatar declares projectPath required, but a component that has not
  // resolved one yet still renders — so this has to survive undefined.
  const path = projectPath || '';
  const name = path.split('/').filter(Boolean).pop() || '?';
  const initials = name.slice(0, 2).toUpperCase();
  let hash = 0;
  for (const ch of path) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  const color = AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  return { initials, color };
}

// ── Project avatars ──────────────────────────────────────────────────────
// In the app these come from GitLab (or the generated initials ProjectAvatar
// falls back to). A landing page has neither a token nor a network hop worth
// spending, so each project gets a hand-drawn SVG served as a data: URL —
// exactly the shape ProjectAvatar reads out of store.avatarDataUrls, so no
// component learns that these are fake.
const svgAvatar = (body) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`
  );

const AVATAR_ART = {
  // wooton-pad — a terminal prompt, the thing the app is a window onto.
  '/Users/demo/Projects/wooton-pad': `
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#b91c1c"/>
    </linearGradient></defs>
    <rect width="64" height="64" rx="14" fill="url(#g)"/>
    <path d="M18 23l9 9-9 9" fill="none" stroke="#fff" stroke-width="5"
          stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>
    <rect x="32" y="37" width="15" height="5" rx="2.5" fill="#fff" opacity=".95"/>`,

  // my-api — stacked database platters.
  '/Users/demo/Projects/my-api': `
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#1d4ed8"/>
    </linearGradient></defs>
    <rect width="64" height="64" rx="14" fill="url(#g)"/>
    <g fill="none" stroke="#fff" stroke-width="4" opacity=".95">
      <ellipse cx="32" cy="21" rx="14" ry="6"/>
      <path d="M18 21v11c0 3.3 6.3 6 14 6s14-2.7 14-6V21"/>
      <path d="M18 32v11c0 3.3 6.3 6 14 6s14-2.7 14-6V32"/>
    </g>`,

  // blog-redesign — a nib over a page.
  '/Users/demo/Projects/blog-redesign': `
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#db2777"/>
    </linearGradient></defs>
    <rect width="64" height="64" rx="14" fill="url(#g)"/>
    <path d="M40 15l9 9-21 21-11 2 2-11z" fill="#fff" opacity=".95"/>
    <path d="M17 49h30" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>`,
};

export const MOCK_PROJECT_AVATARS = Object.fromEntries(
  Object.entries(AVATAR_ART).map(([path, art]) => [path, svgAvatar(art)])
);

// ── Account page ─────────────────────────────────────────────────────────
// What get-account-detail and get-account-stats answer in the app, for the
// two demo accounts. AccountViewerApp reads nothing else, so the whole page —
// paths, token state, quota meters, heatmap, 30-day chart — comes from here.
const iso = (d) => d.toISOString().slice(0, 10);

// A year of plausible activity: busier on weekdays, a quiet fortnight in the
// middle so the heatmap has a gap to show, and a warmer last month.
function buildDailyActivity(seed, scale) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let h = seed;
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const r = (h >>> 8) % 100;
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const holiday = i > 150 && i < 168;
    const recent = i < 30 ? 1.5 : 1;
    let messages = 0;
    if (!holiday && r > (weekend ? 74 : 26)) {
      messages = Math.round(((r % 34) + 4) * scale * recent);
    }
    // Today always counts. The "current streak" card reads back from today,
    // so a quiet last cell would show 0d next to a year of green.
    if (i <= 1 && !messages) messages = Math.round(22 * scale);
    if (!messages) continue;
    out.push({
      date: iso(d),
      messageCount: messages,
      toolCallCount: Math.round(messages * 2.6),
      sessionCount: Math.max(1, Math.round(messages / 14)),
    });
  }
  return out;
}

// Tokens for the last 30 days only — the same window the chart under the
// heatmap draws, and the only one `claude /stats` writes a breakdown for.
function buildDailyTokens(activity) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 29);
  return activity
    .filter(e => new Date(e.date) >= cutoff)
    .map(e => ({
      date: e.date,
      tokensByModel: {
        'claude-opus-4-8': e.messageCount * 5400,
        'claude-haiku-4-5': e.messageCount * 900,
      },
    }));
}

function buildStats(seed, scale, modelUsage) {
  const dailyActivity = buildDailyActivity(seed, scale);
  let messages = 0;
  let sessions = 0;
  for (const e of dailyActivity) { messages += e.messageCount; sessions += e.sessionCount; }
  return {
    lastComputedDate: iso(new Date()),
    totalMessages: messages,
    totalSessions: sessions,
    dailyActivity,
    dailyModelTokens: buildDailyTokens(dailyActivity),
    modelUsage,
  };
}

export const MOCK_ACCOUNT_STATS = {
  default: buildStats(20260913, 1, {
    'claude-opus-4-8': { inputTokens: 41_800_000, outputTokens: 2_140_000 },
    'claude-haiku-4-5': { inputTokens: 7_300_000, outputTokens: 410_000 },
  }),
  work: buildStats(770419, 0.55, {
    'claude-opus-4-8': { inputTokens: 12_600_000, outputTokens: 690_000 },
  }),
};

const ACCOUNT_FILES = {
  default: [
    { name: 'settings.json', path: '/Users/demo/.claude/settings.json', size: 1_284 },
    { name: 'CLAUDE.md', path: '/Users/demo/.claude/CLAUDE.md', size: 3_970 },
    { name: '.claude.json', path: '/Users/demo/.claude.json', size: 18_402 },
  ],
  work: [
    { name: 'settings.json', path: '/Users/demo/.claude-work/settings.json', size: 902 },
    { name: 'CLAUDE.md', path: '/Users/demo/.claude-work/CLAUDE.md', size: 1_446 },
  ],
};

export const MOCK_ACCOUNT_FILE_CONTENT = {
  'settings.json': `{
  "model": "opus",
  "permissions": {
    "allow": ["Bash(npm run test:*)", "Bash(git status)", "Read", "Edit"],
    "deny": ["Bash(rm -rf:*)"]
  },
  "env": { "DISABLE_TELEMETRY": "1" },
  "statusLine": { "type": "command", "command": "~/.claude/statusline.sh" }
}`,
  'CLAUDE.md': `# Global instructions

- Never commit or push unless I ask.
- Prefer the repository's own test runner over adding a framework.
- When a change spans more than three files, say what the plan is first.
`,
  '.claude.json': `{
  "numStartups": 1284,
  "mcpServers": {
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] },
    "sentry":     { "type": "http", "url": "https://mcp.sentry.dev/mcp" }
  }
}`,
};

const day = 24 * 60 * 60 * 1000;

export const MOCK_ACCOUNT_DETAIL = {
  default: {
    ok: true,
    account: {
      id: 'default', name: 'Personal',
      configDir: '/Users/demo/.claude', wslDistro: null, wslHome: null,
    },
    isActive: true,
    configDirExists: true,
    launchCommand: 'claude',
    files: ACCOUNT_FILES.default.map(f => ({ ...f, mtime: new Date(now - 2 * 60 * 60 * 1000).toISOString() })),
    externalFiles: [],
    token: {
      present: true,
      source: 'macOS Keychain',
      subscriptionType: 'Claude Max',
      expiresAt: new Date(now + 21 * day).toISOString(),
      expired: false,
    },
    usage: { session: 42, weekAll: 68, sessionResetIn: '3h', weekAllResetIn: '2d' },
  },
  work: {
    ok: true,
    account: {
      id: 'work', name: 'Work',
      configDir: '/Users/demo/.claude-work', wslDistro: null, wslHome: null,
    },
    isActive: false,
    configDirExists: true,
    launchCommand: 'CLAUDE_CONFIG_DIR=/Users/demo/.claude-work claude',
    files: ACCOUNT_FILES.work.map(f => ({ ...f, mtime: new Date(now - 3 * day).toISOString() })),
    externalFiles: [],
    token: {
      present: true,
      source: '.credentials.json',
      subscriptionType: 'Claude Team',
      expiresAt: new Date(now + 4 * day).toISOString(),
      expired: false,
    },
    usage: { session: 15, weekAll: 31, sessionResetIn: '4h', weekAllResetIn: '5d' },
  },
};

// The MCP inventory behind the account page's "MCP servers" section. One flat
// `servers` list, the way mcp-inventory answers it: the component splits
// account-scoped from project-scoped on `scope` itself.
const mcpServer = (s) => ({ env: [], headers: [], args: [], writable: false, disabled: false, ...s });

export const MOCK_ACCOUNT_MCP = {
  default: {
    ok: true,
    servers: [
      mcpServer({
        id: 'user:playwright', name: 'playwright', scope: 'user', scopeLabel: 'user',
        transport: 'stdio', command: 'npx', args: ['@playwright/mcp@latest'], writable: true,
      }),
      mcpServer({
        id: 'user:sentry', name: 'sentry', scope: 'user', scopeLabel: 'user',
        transport: 'http', url: 'https://mcp.sentry.dev/mcp',
        headers: [{ key: 'Authorization', value: 'Bearer •••••' }], writable: true,
      }),
      mcpServer({
        id: 'project:postgres', name: 'postgres', scope: 'project', scopeLabel: 'project',
        transport: 'stdio', command: 'npx', args: ['@modelcontextprotocol/server-postgres'],
        projectPath: '/Users/demo/Projects/my-api',
      }),
    ],
  },
  work: {
    ok: true,
    servers: [
      mcpServer({
        id: 'user:jira', name: 'jira', scope: 'user', scopeLabel: 'user',
        transport: 'http', url: 'https://mcp.atlassian.com/v1/sse',
      }),
    ],
  },
};

const LOGO = [' ▐▛███▜▌  ', '▝▜█████▛▘', '  ▘▘ ▝▝ '];

export const MOCK_TERMINAL_LINES = {
  'sess-001': [
    { t: 'logo', logo: LOGO, info: ['Claude Code v2.1.177', 'Opus 4.8 · Claude Max', '~/Projects/wooton-pad'] },
    { t: 'blank' },
    { t: 'sep', v: '─'.repeat(44) },
    { t: 'ok', v: '✓ Read src/landing/LandingApp.vue' },
    { t: 'ok', v: '✓ Read src/landing/mock-data.js' },
    { t: 'ok', v: '✓ Updated MOCK_TERMINAL_LINES' },
    { t: 'spin', v: 'Writing animation CSS…' },
    { t: 'sep', v: '─'.repeat(44) },
    { t: 'hint', v: '? for shortcuts · ← for agents' },
  ],
  'sess-004': [
    { t: 'logo', logo: LOGO, info: ['Claude Code v2.1.177', 'Opus 4.8 · Claude Max', '~/Projects/my-api'] },
    { t: 'blank' },
    { t: 'sep', v: '─'.repeat(44) },
    { t: 'ok', v: '✓ Read src/middleware/auth.js' },
    { t: 'ok', v: '✓ Created src/middleware/rate-limit.js' },
    { t: 'ok', v: '✓ Updated src/routes/api.js' },
    { t: 'spin', v: 'Running test suite…' },
    { t: 'sep', v: '─'.repeat(44) },
    { t: 'hint', v: '? for shortcuts · ← for agents' },
  ],
  'sess-002': [
    { t: 'logo', logo: LOGO, info: ['Claude Code v2.1.177', 'Opus 4.8 · Claude Max', '~/Projects/wooton-pad'] },
    { t: 'blank' },
    { t: 'sep', v: '─'.repeat(44) },
    { t: 'ok', v: '✓ Read session-transitions.js' },
    { t: 'ok', v: '✓ Fixed fork detection logic' },
    { t: 'ok', v: '✓ Updated JSONL parent matching' },
    { t: 'ok', v: '✓ All 14 tests passed' },
    { t: 'done', v: '● Session ended · 38 messages' },
  ],
  'sess-003': [
    { t: 'logo', logo: LOGO, info: ['Claude Code v2.1.177', 'Opus 4.8 · Claude Max', '~/Projects/wooton-pad'] },
    { t: 'blank' },
    { t: 'sep', v: '─'.repeat(56) },
    { t: 'todo', v: '☐ OAuth integration refactor' },
    { t: 'blank' },
    { t: 'question', v: 'Where should refresh_token be stored for multi-account?' },
    { t: 'blank' },
    { t: 'opt-sel', v: ' 1. File system' },
    { t: 'opt-sub', v: '     ~/.claude/credentials/<account>.json — current approach.' },
    { t: 'opt', v: '  2. System keychain' },
    { t: 'opt-sub', v: '     macOS Keychain — secure, no CLI access needed.' },
    { t: 'opt', v: '  3. Environment variables' },
    { t: 'opt-sub', v: '     OAUTH_REFRESH_TOKEN — simple, but not persistent.' },
    { t: 'opt', v: '  4. Not sure' },
    { t: 'opt-sub', v: '     Show me options to determine the current state.' },
    { t: 'opt', v: '  5. Type something.' },
    { t: 'sep', v: '─'.repeat(56) },
    { t: 'opt', v: '  6. Chat about this' },
    { t: 'blank' },
    { t: 'nav', v: 'Enter to select · ↑/↓ to navigate · Esc to cancel' },
  ],
  'sess-005': [
    { t: 'logo', logo: LOGO, info: ['Claude Code v2.1.177', 'Opus 4.8 · Claude Max', '~/Projects/my-api'] },
    { t: 'blank' },
    { t: 'sep', v: '─'.repeat(44) },
    { t: 'ok', v: '✓ Created migration 0042_user_schema.sql' },
    { t: 'ok', v: '✓ Added backfill script for 50M rows' },
    { t: 'ok', v: '✓ Tested with pg_dump rollback' },
    { t: 'done', v: '● Session ended · 115 messages' },
  ],
  'sess-006': [
    { t: 'logo', logo: LOGO, info: ['Claude Code v2.1.177', 'Opus 4.8 · Claude Max', '~/Projects/blog-redesign'] },
    { t: 'blank' },
    { t: 'sep', v: '─'.repeat(44) },
    { t: 'ok', v: '✓ Read src/pages/index.astro' },
    { t: 'ok', v: '✓ Read src/styles/global.css' },
    { t: 'ok', v: '✓ Designed hero layout with CSS Grid' },
    { t: 'spin', v: 'Writing animated gradient background…' },
    { t: 'sep', v: '─'.repeat(44) },
    { t: 'hint', v: '? for shortcuts · ← for agents' },
  ],
  'sess-term': [
    { t: 'sh-prompt', cwd: '~/Projects/wooton-pad', branch: 'main' },
    { t: 'sh-cmd', v: 'git log --oneline -4' },
    { t: 'sh-out', v: 'b9241113 feat: add refresh stats to project viewer' },
    { t: 'sh-out', v: '7b1a8eb7 chore(ci): upgrade actions to v5' },
    { t: 'sh-out', v: '9163ad2a chore: bump version to 0.2.0' },
    { t: 'sh-out', v: 'b7c4c6b3 feat: add project avatar and multi-account UI' },
    { t: 'sh-prompt', cwd: '~/Projects/wooton-pad', branch: 'main' },
    { t: 'sh-cmd', v: 'npm test' },
    { t: 'blank' },
    { t: 'sh-out', v: '> wootonpad@0.2.0 test' },
    { t: 'sh-out', v: '> node --test' },
    { t: 'blank' },
    { t: 'sh-out-ok', v: '✔ folder-index-state (1.8s)' },
    { t: 'sh-out-ok', v: '✔ session-cache (0.7s)' },
    { t: 'sh-out-ok', v: '✔ session-transitions (0.4s)' },
    { t: 'blank' },
    { t: 'sh-prompt', cwd: '~/Projects/wooton-pad', branch: 'main' },
    { t: 'sh-cursor' },
  ],
  'sess-007': [
    { t: 'logo', logo: LOGO, info: ['Claude Code v2.1.177', 'Opus 4.8 · Claude Max', '~/Projects/blog-redesign'] },
    { t: 'blank' },
    { t: 'sep', v: '─'.repeat(44) },
    { t: 'ok', v: '✓ Built accessible hamburger menu' },
    { t: 'ok', v: '✓ Added focus-trap for keyboard nav' },
    { t: 'ok', v: '✓ CSS slide animation (no JS)' },
    { t: 'done', v: '● Session ended · 33 messages' },
  ],
  'sess-008': [
    { t: 'logo', logo: LOGO, info: ['Claude Code v2.1.177', 'Opus 4.8 · Claude Max', '~/Projects/blog-redesign'] },
    { t: 'blank' },
    { t: 'sep', v: '─'.repeat(44) },
    { t: 'ok', v: '✓ Added double opt-in confirmation step' },
    { t: 'ok', v: '✓ Wired Mailchimp webhook handler' },
    { t: 'done', v: '● Session ended · 21 messages' },
  ],
};
