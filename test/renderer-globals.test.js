const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The renderer scripts in public/ are classic <script> tags sharing one global
// scope, deliberately (see tsconfig.json: "the rest of the renderer is plain JS
// and stays that way"). Nothing type-checks them, so a name that stops existing
// in one file keeps parsing fine in every other, and only throws when the line
// is finally reached.
//
// That is not hypothetical. `gridViewerCount` was a DOM element declared in
// app.js. The Vue migration (bd36dbd) turned it into a store field and
// converted app.js's own two uses; terminal-manager.js's third one kept
// assigning `.textContent` to a global that no longer existed, and threw on
// every first show of a session in grid mode — taking the rest of showSession
// and the openSession that called it down with it. Sessions silently stopped
// opening in grid view, and the board's preview pane came up blank. It sat
// there for months because the throw is on a path no other path depends on.
//
// These are targeted guards, not a linter: one per fact that now has a single
// owner, asserting the other files go through that owner.

const PUBLIC = path.join(__dirname, '..', 'public');

/** Every hand-written renderer script. The bundles are outputs, not sources. */
function rendererSources() {
  return fs.readdirSync(PUBLIC)
    .filter(f => f.endsWith('.js'))
    .filter(f => f !== 'vue-bundle.js' && f !== 'codemirror-bundle.js')
    .map(f => [f, fs.readFileSync(path.join(PUBLIC, f), 'utf8')]);
}

test('the renderer scripts are all present and non-empty', () => {
  const files = rendererSources().map(([name]) => name);
  for (const required of ['app.js', 'grid-view.js', 'terminal-manager.js']) {
    assert.ok(files.includes(required), `${required} is missing`);
  }
});

// The general form of the bug, rather than one guard per name.
//
// tsc is run over public/*.js purely to resolve identifiers — see
// tsconfig.renderer.json for why that is not the same as type-checking them.
// Only the undefined-name codes are read; the config reports a few hundred
// type complaints the renderer has no interest in, and its exit status is
// therefore meaningless here.
//
// TS2304 "Cannot find name 'X'" and TS2552, which is the same thing with a
// suggestion attached. Between them they found all three of the bugs above.
test('no renderer script reads a name that does not exist', () => {
  const { execFileSync } = require('node:child_process');
  const root = path.join(__dirname, '..');

  // The compiler is run through node against its own entry point rather than
  // through npx: on Windows `npx` is a .cmd, which execFileSync cannot spawn
  // without a shell (ENOENT), and the shell would then have to be trusted with
  // quoting. typescript is a dev dependency, so the path is always there.
  const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

  let out = '';
  try {
    out = execFileSync(process.execPath, [tsc, '-p', 'tsconfig.renderer.json'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    // Expected: tsc exits non-zero for the type errors this pass ignores.
    out = `${err.stdout || ''}${err.stderr || ''}`;
    if (!out) throw err;   // it failed for some other reason — say so
  }

  const undefinedNames = out.split('\n').filter(l => /error TS(2304|2552):/.test(l));
  assert.deepEqual(
    undefinedNames, [],
    'a renderer script references a name nothing declares. If the name is real '
    + '— a <script> library, or something App.vue puts on window — declare it in '
    + 'public/renderer-globals.d.ts. Otherwise it is a bug:\n' + undefinedNames.join('\n'),
  );
});

test('the grid count sentence is written in exactly one place', () => {
  let sites = 0;
  for (const [, source] of rendererSources()) {
    sites += (source.match(/' session' \+ \(/g) || []).length;
  }
  assert.equal(sites, 1, 'the count label is spelled out in more than one file');
});

test('every writer of the grid count goes through setGridViewerCount', () => {
  const byName = Object.fromEntries(rendererSources());
  assert.match(byName['grid-view.js'], /function setGridViewerCount\(/, 'the helper is gone');
  for (const name of ['app.js', 'terminal-manager.js']) {
    assert.match(byName[name], /setGridViewerCount\(/, `${name} no longer calls the helper`);
  }
});

// The second half of the same bug: the grid branch of showSession never
// un-hid the main area, so a session shown while grid mode was on inherited
// whatever the previous tab had left there — and the board tab sets
// `display: none` on #terminal-area inline, which no CSS rule can beat.
test('showSession clears the main area before either view draws', () => {
  const source = fs.readFileSync(path.join(PUBLIC, 'terminal-manager.js'), 'utf8');
  const start = source.indexOf('function showSession(');
  assert.ok(start !== -1, 'showSession is gone');
  const body = source.slice(start, source.indexOf('\n}', start));

  const hide = body.indexOf('hidePlanViewer()');
  const gridBranch = body.indexOf('if (gridViewActive)');
  assert.ok(hide !== -1, 'showSession no longer clears the main area');
  assert.ok(gridBranch !== -1, 'the grid branch is gone');
  assert.ok(hide < gridBranch, 'the main area is cleared in one branch only, not both');
});

// The grid is a mode of the sessions tab. It used to survive a tab switch —
// and localStorage carried it across restarts — so the board's preview pane
// drew the grid of every open session instead of the card you clicked, and a
// chat session got a read-only card where the conversation should be.
test('the grid is taken down when the tab is not sessions', () => {
  const grid = fs.readFileSync(path.join(PUBLIC, 'grid-view.js'), 'utf8');
  const app = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');

  assert.match(grid, /function suspendGridView\(/, 'suspendGridView is gone');
  assert.match(grid, /function resumeGridView\(/, 'resumeGridView is gone');
  assert.match(
    app,
    /tabName === 'sessions'\s*\?\s*resumeGridView\(\)|if \(tabName === 'sessions'\) resumeGridView\(\); else suspendGridView\(\)/,
    'onTabChange no longer suspends or resumes the grid',
  );
});

// #terminals carries margin-right: -20px to hide xterm's own scrollbar gutter,
// which is right while it is only a terminal host. In grid mode it is the
// scrolling element, and the shift put its scrollbar 20px past the right edge —
// underneath the session side panel.
test('grid mode drops the xterm gutter compensation', () => {
  const css = fs.readFileSync(path.join(PUBLIC, 'style.css'), 'utf8');
  const start = css.indexOf('#terminals.grid-layout {');
  assert.ok(start !== -1, 'the grid layout rule is gone');
  const rule = css.slice(start, css.indexOf('}', start));
  assert.match(rule, /margin-right:\s*0/, 'the grid scroller is shifted off its own scrollbar again');
});

// Suspension must not look like the user turning the grid off, or leaving the
// board once would silently lose the preference for good.
test('suspending the grid does not rewrite the stored preference', () => {
  const grid = fs.readFileSync(path.join(PUBLIC, 'grid-view.js'), 'utf8');
  assert.match(grid, /hideGridView\(\{ remember: false \}\)/, 'suspend forgets the preference');
  assert.match(grid, /showGridView\(\{ remember: false \}\)/, 'resume rewrites the preference');
  assert.match(grid, /if \(remember\) localStorage\.setItem\('gridViewActive', '1'\)/);
  assert.match(grid, /if \(remember\) localStorage\.setItem\('gridViewActive', '0'\)/);
});
