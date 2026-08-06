const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  WSL_UNC_PREFIXES, wslToWindowsPath, windowsToWslPath, isPosixAbsolutePath, wslExecArgs,
  withWslEnv, wslHostAddressFrom, wslDistroFromUncPath, wslClaudeHomeFrom, projectJoin,
} = require('../shell-profiles');
const { encodeProjectPath } = require('../encode-project-path');

test('POSIX path inside a distribution becomes a UNC path', () => {
  assert.equal(
    wslToWindowsPath('/home/delirus/work/wootonpad', 'Ubuntu'),
    '\\\\wsl.localhost\\Ubuntu\\home\\delirus\\work\\wootonpad'
  );
});

test('a /mnt/ path resolves to its Windows volume, not to UNC', () => {
  assert.equal(wslToWindowsPath('/mnt/c/Users/foo', 'Ubuntu'), 'C:\\Users\\foo');
  assert.equal(wslToWindowsPath('/mnt/d/data', 'Ubuntu'), 'D:\\data');
});

test('a bare drive mount keeps its trailing separator', () => {
  assert.equal(wslToWindowsPath('/mnt/c', 'Ubuntu'), 'C:\\');
});

test('the legacy wsl$ prefix can be selected', () => {
  assert.equal(
    wslToWindowsPath('/home/u/p', 'Ubuntu', WSL_UNC_PREFIXES[1]),
    '\\\\wsl$\\Ubuntu\\home\\u\\p'
  );
});

test('distribution names containing spaces survive translation', () => {
  assert.equal(
    wslToWindowsPath('/home/u', 'Ubuntu 24.04'),
    '\\\\wsl.localhost\\Ubuntu 24.04\\home\\u'
  );
});

test('without a distribution a POSIX path is left alone', () => {
  assert.equal(wslToWindowsPath('/home/u/p', null), '/home/u/p');
});

test('non-absolute and empty input pass through untouched', () => {
  assert.equal(wslToWindowsPath('relative/path', 'Ubuntu'), 'relative/path');
  assert.equal(wslToWindowsPath('C:\\already\\windows', 'Ubuntu'), 'C:\\already\\windows');
  assert.equal(wslToWindowsPath('', 'Ubuntu'), '');
  assert.equal(wslToWindowsPath(null, 'Ubuntu'), null);
});

test('windowsToWslPath round-trips a UNC translation of a mounted path', () => {
  const win = 'C:\\Users\\foo\\proj';
  const posix = windowsToWslPath(win);
  assert.equal(posix, '/mnt/c/Users/foo/proj');
  assert.equal(wslToWindowsPath(posix, 'Ubuntu'), win);
});

// A project on a Windows volume opened from inside a distribution is recorded
// as /mnt/c/… — a Windows fs call cannot open that either, so it must be
// flagged for translation just like a distribution-local path.
test('every POSIX absolute path is flagged for translation, /mnt/ included', () => {
  assert.equal(isPosixAbsolutePath('/home/delirus/work'), true);
  assert.equal(isPosixAbsolutePath('/mnt/c/Users/foo'), true);
  assert.equal(isPosixAbsolutePath('C:\\Users\\foo'), false);
  assert.equal(isPosixAbsolutePath('\\\\wsl.localhost\\Ubuntu\\home'), false);
  assert.equal(isPosixAbsolutePath('relative/path'), false);
  assert.equal(isPosixAbsolutePath(''), false);
  assert.equal(isPosixAbsolutePath(undefined), false);
});

test('a /mnt/ project translates to its drive letter, not to UNC', () => {
  // What hostPath() ends up doing for a project on C: opened from the distro.
  assert.equal(wslToWindowsPath('/mnt/c/work/proj', 'Ubuntu'), 'C:\\work\\proj');
});

// hostPath's whole job is to hand fs something Windows can open. Asserting the
// output under win32 semantics catches a translation that looks plausible as a
// string but that CreateFile would reject — checked with path.win32 explicitly
// so it holds when the suite runs on Linux too.
test('translation output is an absolute path by Windows rules', () => {
  assert.equal(path.win32.isAbsolute(wslToWindowsPath('/home/delirus/work', 'Ubuntu')), true);
  assert.equal(path.win32.isAbsolute(wslToWindowsPath('/mnt/c/work', 'Ubuntu')), true);
  assert.equal(path.win32.isAbsolute(wslToWindowsPath('/', 'Ubuntu')), true);
});

test('joining below a translated root keeps it a UNC path', () => {
  const root = wslToWindowsPath('/home/delirus/work', 'Ubuntu');
  const child = path.win32.join(root, 'src', 'main.js');
  assert.equal(child, '\\\\wsl.localhost\\Ubuntu\\home\\delirus\\work\\src\\main.js');
  assert.equal(path.win32.isAbsolute(child), true);
});

// The most fragile invariant in the feature, and the one plain path.join would
// break: on Windows path.join rewrites a POSIX root with backslashes, and the
// project folder name is encoded from that path — so the rewrite would point at
// a folder that does not exist. These assertions only bite on Windows, which is
// where the unit-test job in the PR workflow runs them.
test('joining a POSIX project path never yields a backslash', () => {
  const joined = projectJoin('/home/delirus/work/wootonpad', '.claude', 'commands');
  assert.equal(joined, '/home/delirus/work/wootonpad/.claude/commands');
  assert.ok(!joined.includes('\\'), 'a backslash here would break folder-name encoding');
});

test('the joined path still encodes to the folder Claude would create', () => {
  const root = '/home/delirus/work/proj';
  assert.equal(encodeProjectPath(projectJoin(root, 'sub')), encodeProjectPath(root + '/sub'));
});

test('a /mnt/ project root is joined POSIX-style too', () => {
  assert.equal(projectJoin('/mnt/c/work/proj', 'src', 'main.js'), '/mnt/c/work/proj/src/main.js');
});

test('a relative or Windows root is left to the platform join', () => {
  assert.equal(projectJoin('relative', 'a'), path.join('relative', 'a'));
  assert.equal(projectJoin('C:\\work', 'a'), path.join('C:\\work', 'a'));
});

test('wslExecArgs builds an argv with no shell quoting involved', () => {
  assert.deepEqual(
    wslExecArgs('Ubuntu', '/home/u/my project', ['git', 'rev-parse', '--abbrev-ref', 'HEAD']),
    ['-d', 'Ubuntu', '--cd', '/home/u/my project', '--exec', 'git', 'rev-parse', '--abbrev-ref', 'HEAD']
  );
});

test('wslExecArgs omits --cd when no working directory is given', () => {
  assert.deepEqual(
    wslExecArgs('Ubuntu', null, ['sh', '-c', 'printf %s "$HOME"']),
    ['-d', 'Ubuntu', '--exec', 'sh', '-c', 'printf %s "$HOME"']
  );
});

// What a Windows folder picker hands back for a directory inside a
// distribution. Storing that verbatim would encode the wrong project folder.
test('a WSL UNC path normalises back to the POSIX path Claude records', () => {
  assert.equal(
    windowsToWslPath('\\\\wsl.localhost\\Ubuntu\\home\\delirus\\work\\wootonpad'),
    '/home/delirus/work/wootonpad'
  );
  assert.equal(windowsToWslPath('\\\\wsl$\\Ubuntu\\home\\u'), '/home/u');
});

test('the distribution root normalises to /', () => {
  assert.equal(windowsToWslPath('\\\\wsl.localhost\\Ubuntu'), '/');
  assert.equal(windowsToWslPath('\\\\wsl.localhost\\Ubuntu\\'), '/');
});

test('UNC normalisation round-trips with the forward translation', () => {
  const posix = '/home/delirus/work/wootonpad';
  assert.equal(windowsToWslPath(wslToWindowsPath(posix, 'Ubuntu')), posix);
});

test('the distribution is read off a UNC path, and only off a UNC path', () => {
  assert.equal(wslDistroFromUncPath('\\\\wsl.localhost\\Ubuntu\\home\\u'), 'Ubuntu');
  assert.equal(wslDistroFromUncPath('\\\\wsl$\\Ubuntu 24.04\\home'), 'Ubuntu 24.04');
  assert.equal(wslDistroFromUncPath('C:\\Users\\foo'), null);
  assert.equal(wslDistroFromUncPath('/home/u'), null);
  assert.equal(wslDistroFromUncPath(undefined), null);
});

test('an ordinary UNC share is not mistaken for a distribution', () => {
  assert.equal(wslDistroFromUncPath('\\\\fileserver\\share\\dir'), null);
  assert.equal(windowsToWslPath('\\\\fileserver\\share\\dir'), '//fileserver/share/dir');
});

test('a home that is not an absolute POSIX path yields no account', () => {
  assert.equal(wslClaudeHomeFrom('Ubuntu', null), null);
  assert.equal(wslClaudeHomeFrom('Ubuntu', ''), null);
  assert.equal(wslClaudeHomeFrom('Ubuntu', 'C:\\Users\\foo'), null);
});

test('WSLENV names the variables that must cross into the distribution', () => {
  const env = { CLAUDE_CODE_SSE_PORT: '54321' };
  assert.deepEqual(withWslEnv(env, ['CLAUDE_CODE_SSE_PORT']), { WSLENV: 'CLAUDE_CODE_SSE_PORT' });
});

test('WSLENV appends without dropping existing entries or their flags', () => {
  const env = { WSLENV: 'FOO/p:BAR', CLAUDE_CODE_SSE_PORT: '54321' };
  assert.deepEqual(
    withWslEnv(env, ['CLAUDE_CODE_SSE_PORT']),
    { WSLENV: 'FOO/p:BAR:CLAUDE_CODE_SSE_PORT' }
  );
});

test('WSLENV does not duplicate a name already listed, flags and all', () => {
  const env = { WSLENV: 'CLAUDE_CODE_SSE_PORT/p', CLAUDE_CODE_SSE_PORT: '1' };
  assert.deepEqual(withWslEnv(env, ['CLAUDE_CODE_SSE_PORT']), {});
});

test('WSLENV skips variables that are not set', () => {
  assert.deepEqual(withWslEnv({}, ['CLAUDE_CODE_SSE_PORT']), {});
});

test('the WSL adapter address is preferred over other interfaces', () => {
  const interfaces = {
    'Ethernet': [{ family: 'IPv4', internal: false, address: '192.168.1.10' }],
    'vEthernet (WSL (Hyper-V firewall))': [
      { family: 'IPv6', internal: false, address: 'fe80::1' },
      { family: 'IPv4', internal: false, address: '172.27.192.1' },
    ],
  };
  assert.equal(wslHostAddressFrom(interfaces), '172.27.192.1');
});

test('no WSL adapter means no address — mirrored networking, loopback is shared', () => {
  assert.equal(wslHostAddressFrom({ 'Ethernet': [{ family: 'IPv4', internal: false, address: '192.168.1.10' }] }), null);
  assert.equal(wslHostAddressFrom({}), null);
  assert.equal(wslHostAddressFrom(undefined), null);
});

test('an internal-only WSL adapter is not offered as a bind address', () => {
  const interfaces = {
    'vEthernet (WSL)': [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
  };
  assert.equal(wslHostAddressFrom(interfaces), null);
});

// The project folder name Claude writes is encoded from the path it saw, which
// inside a distribution is the POSIX one. Encoding the translated Windows path
// would look for a folder that does not exist — this pins the canonical form.
test('the POSIX form is what encodes to the folder Claude creates', () => {
  const posix = '/home/delirus/work/wootonpad';
  assert.equal(encodeProjectPath(posix), '-home-delirus-work-wootonpad');
  assert.notEqual(
    encodeProjectPath(wslToWindowsPath(posix, 'Ubuntu')),
    encodeProjectPath(posix)
  );
});
