// Integration test for WSL-backed accounts.
//
// The unit tests cover the pure path helpers; this one covers the wiring, which
// is where every defect in this feature actually lived. It loads the real
// main.js on a simulated Windows host with a WSL account active, stubbing only
// what cannot run here — electron, node-pty, ws and the DB — and then drives the
// real IPC handlers, asserting on what reaches the filesystem and the spawner.
//
// Node's test runner gives each file its own process, so overriding
// process.platform here does not leak into the other suites.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const realPath = require('path');
const os = require('os');
const fs = require('fs');

Object.defineProperty(process, 'platform', { value: 'win32' });

const HOME = fs.mkdtempSync(realPath.join(os.tmpdir(), 'wootonpad-wsl-'));
os.homedir = () => HOME;

// The simulated host must not inherit the Claude environment of whoever runs the
// suite: main.js snapshots process.env at load to build the PTY environment, and
// what that environment carries is one of the things asserted below.
delete process.env.CLAUDE_CONFIG_DIR;

const DISTRO = 'Ubuntu';
const PROJECT_POSIX = '/home/delirus/work/proj';
const PROJECT_UNC = '\\\\wsl.localhost\\Ubuntu\\home\\delirus\\work\\proj';

const calls = { readdirSync: [], existsSync: [], readFileSync: [], statSync: [], spawn: [] };
const settings = new Map([
  ['accounts', [
    { id: 'default', name: 'Default', configDir: realPath.join(HOME, '.claude') },
    {
      id: 'wsl-test', name: 'WSL — Ubuntu',
      configDir: '\\\\wsl.localhost\\Ubuntu\\home\\delirus\\.claude',
      wslDistro: DISTRO, wslUncPrefix: '\\\\wsl.localhost\\', wslHome: '/home/delirus',
    },
  ]],
  ['global', { activeAccountId: 'wsl-test' }],
]);

const handlers = new Map();
const noop = () => {};
const permissive = (base = {}) => new Proxy(base, { get: (t, k) => (k in t ? t[k] : noop) });

const stubs = {
  electron: {
    app: permissive({
      isPackaged: false, getVersion: () => '0.0.0', getPath: () => HOME,
      whenReady: () => Promise.resolve(), requestSingleInstanceLock: () => true,
    }),
    BrowserWindow: Object.assign(function () {
      return permissive({
        webContents: permissive({ send: noop }),
        isDestroyed: () => false,
        getBounds: () => ({ x: 0, y: 0, width: 1200, height: 800 }),
        isMinimized: () => false,
      });
    }, { getAllWindows: () => [] }),
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    ipcMain: { handle: (channel, fn) => handlers.set(channel, fn), on: noop, removeHandler: noop },
    Menu: permissive({ buildFromTemplate: () => permissive() }),
    screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
    shell: permissive(),
    nativeTheme: permissive(),
  },
  'node-pty': {
    spawn: (file, args, opts) => {
      calls.spawn.push({ file, args, opts });
      return permissive({ pid: 1 });
    },
  },
  'electron-log': permissive({ transports: { file: {}, console: {} } }),
  './db': permissive({
    getSetting: (k) => settings.get(k),
    setSetting: (k, v) => settings.set(k, v),
    deleteSetting: (k) => settings.delete(k),
    searchFtsRecreated: false,
  }),
  ws: { WebSocketServer: function () { return permissive(); } },
  // Dev hot-reload. Both watch the source tree, and the watchers they leave
  // behind are handles nothing here can reach to close — they are what kept this
  // process alive after the last subtest until CI cancelled the job.
  chokidar: { watch: () => permissive() },
  'electron-reloader': () => {},
  // Everything the handlers shell out to. Unstubbed, the suite runs real
  // commands on whatever host it lands on — `du -sk`, `docker compose ps`, and
  // any wsl.exe that happens to be on PATH — so it passed or failed by accident
  // of where it ran. The distribution list is answered, since that is what makes
  // an account's shell resolvable; every other command fails carrying its argv,
  // which is the shape the handlers report and these tests assert on.
  child_process: {
    execFileSync: (file, args = []) => {
      if (file === 'wsl.exe' && args[0] === '--list') return `${DISTRO}\r\n`;
      throw new Error(`Command failed: ${file} ${args.join(' ')}`);
    },
    execFile: (file, args, options, callback) => {
      const done = typeof options === 'function' ? options : callback;
      if (done) setImmediate(() => done(new Error(`Command failed: ${file} ${args.join(' ')}`), '', ''));
      return permissive({ pid: 1 });
    },
    spawn: () => permissive({ pid: 1 }),
    spawnSync: (file, args = []) => ({ status: 1, stdout: '', stderr: `Command failed: ${file} ${args.join(' ')}` }),
  },
};

const originalLoad = Module._load;
Module._load = function (request) {
  return stubs[request] || originalLoad.apply(this, arguments);
};

// main.js starts the watcher poll, the scheduler and the updater interval, none
// of which are reachable to clear from here. Unref them as they are created so
// the process ends on its own — exiting from a hook instead would swallow the
// subtest results and could mask a failure as a pass.
for (const name of ['setInterval', 'setTimeout']) {
  const original = global[name];
  global[name] = (...args) => {
    const handle = original(...args);
    if (handle && typeof handle.unref === 'function') handle.unref();
    return handle;
  };
}

require('../main.js');

// Interception starts after load so Node's own module loader is untouched.
// Anything naming the distribution is answered as if it existed; every other
// path falls through to the real filesystem.
for (const name of ['readdirSync', 'existsSync', 'readFileSync', 'statSync', 'mkdirSync', 'writeFileSync', 'appendFileSync']) {
  const original = fs[name];
  fs[name] = function (p, ...rest) {
    const asString = String(p);
    if (!asString.includes('wsl.localhost')) return original.call(fs, p, ...rest);
    if (calls[name]) calls[name].push(asString);
    if (name === 'existsSync') return true;
    if (name === 'readdirSync') return [];
    if (name === 'statSync') return { isDirectory: () => true, mtime: new Date(0), mtimeMs: 0 };
    return '';
  };
}

test('every handler that touches a project file gets the UNC translation', async () => {
  calls.readdirSync.length = 0;
  await handlers.get('get-file-tree')({}, PROJECT_POSIX);
  assert.equal(calls.readdirSync[0], PROJECT_UNC);

  calls.existsSync.length = 0;
  await handlers.get('get-project-info')({}, PROJECT_POSIX);
  assert.equal(calls.existsSync[0], PROJECT_UNC);

  calls.readFileSync.length = 0;
  await handlers.get('read-file-for-panel')({}, PROJECT_POSIX + '/README.md');
  assert.equal(calls.readFileSync[0], PROJECT_UNC + '\\README.md');
});

test('a folder picked as UNC is stored POSIX and encodes the folder Claude creates', async () => {
  const result = await handlers.get('add-project')({}, PROJECT_UNC);
  assert.equal(result.projectPath, PROJECT_POSIX);
  assert.equal(result.folder, '-home-delirus-work-proj');
});

test('a folder from another distribution is refused with the account to switch to', async () => {
  const result = await handlers.get('add-project')({}, '\\\\wsl.localhost\\Debian\\home\\d\\p');
  assert.match(result.error, /Debian/);
});

test('a command that runs in the project is routed into the distribution', async () => {
  const result = await handlers.get('git-branches')({}, PROJECT_POSIX);
  // git is not installed in the simulated distro, so this fails — but on the
  // command it actually tried to run, which is what is under test.
  assert.equal(result.ok, false);
  assert.match(result.error, /wsl\.exe -d Ubuntu --cd \/home\/delirus\/work\/proj/);
});

test('a Claude session for a WSL account is spawned inside the distribution', async () => {
  calls.spawn.length = 0;
  const result = await handlers.get('open-terminal')({}, 'sess-1', PROJECT_POSIX, true, { mcpEmulation: false });
  assert.equal(result.ok, true);

  const [spawned] = calls.spawn;
  assert.equal(spawned.file, 'wsl.exe');
  assert.deepEqual(spawned.args.slice(0, 4), ['--cd', PROJECT_POSIX, '-d', DISTRO]);
  // wsl.exe itself is a Windows process, so its own cwd must stay a Windows path
  assert.equal(realPath.win32.isAbsolute(spawned.opts.cwd) || spawned.opts.cwd === HOME, true);
  // Setting this would point Claude at a path it cannot resolve inside the distro
  assert.equal(spawned.opts.env.CLAUDE_CONFIG_DIR, undefined);
});

test('IDE emulation publishes the contract the CLI parses, and the port crosses', async () => {
  calls.spawn.length = 0;
  const result = await handlers.get('open-terminal')({}, 'sess-2', PROJECT_POSIX, true, {});
  assert.equal(result.mcpActive, true);

  const [spawned] = calls.spawn;
  assert.match(spawned.args[spawned.args.length - 1], /--ide$/);
  const port = spawned.opts.env.CLAUDE_CODE_SSE_PORT;
  assert.ok(port, 'the CLI needs the port to accept the lock without workspace matching');
  // wsl.exe passes nothing but WSLENV-listed names into the distribution
  assert.match(spawned.opts.env.WSLENV, /CLAUDE_CODE_SSE_PORT/);

  const lockPath = realPath.join(HOME, '.claude', 'ide', `${port}.lock`);
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  // The CLI reads the port from the file name and these fields from the body.
  assert.equal(lock.runningInWindows, true, 'this is what makes the CLI resolve the host instead of using loopback');
  assert.equal(lock.transport, 'ws');
  assert.deepEqual(lock.workspaceFolders, [PROJECT_UNC]);
  assert.ok(lock.authToken);
});
