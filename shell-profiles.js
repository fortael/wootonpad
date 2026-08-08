const path = require('path');
const fs = require('fs');

// --- Cross-platform shell resolution ---
const isWindows = process.platform === 'win32';

// Discover available shell profiles on this system.
// Returns an array of { id, name, path, args? } objects.
function discoverShellProfiles() {
  const profiles = [];

  if (isWindows) {
    // CMD
    const comspec = process.env.COMSPEC || 'C:\\WINDOWS\\system32\\cmd.exe';
    if (fs.existsSync(comspec)) {
      profiles.push({ id: 'cmd', name: 'Command Prompt', path: comspec });
    }

    // PowerShell 7+ (pwsh)
    const pwshCandidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7-preview', 'pwsh.exe'),
    ];
    for (const p of pwshCandidates) {
      if (fs.existsSync(p)) {
        profiles.push({ id: 'pwsh', name: 'PowerShell 7', path: p });
        break;
      }
    }

    // Windows PowerShell 5.x
    const ps5 = path.join(process.env.SystemRoot || 'C:\\WINDOWS', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    if (fs.existsSync(ps5)) {
      profiles.push({ id: 'powershell', name: 'Windows PowerShell', path: ps5 });
    }

    // Git Bash
    const gitBashCandidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
    ];
    for (const p of gitBashCandidates) {
      if (p && fs.existsSync(p)) {
        profiles.push({ id: 'git-bash', name: 'Git Bash', path: p });
        break;
      }
    }

    // MSYS2
    if (fs.existsSync('C:\\msys64\\usr\\bin\\bash.exe')) {
      profiles.push({ id: 'msys2', name: 'MSYS2', path: 'C:\\msys64\\usr\\bin\\bash.exe' });
    }

    // WSL distributions
    for (const distro of listWslDistros()) {
      profiles.push({ id: 'wsl:' + distro, name: 'WSL — ' + distro, path: 'wsl.exe', args: ['-d', distro] });
    }
  } else {
    // macOS / Linux: read /etc/shells for the canonical list
    const seen = new Set();
    const shellNames = {
      'zsh': 'Zsh', 'bash': 'Bash', 'sh': 'POSIX Shell',
      'fish': 'Fish', 'nu': 'Nushell', 'pwsh': 'PowerShell',
      'dash': 'Dash', 'ksh': 'Korn Shell', 'tcsh': 'tcsh', 'csh': 'C Shell',
    };
    try {
      const lines = fs.readFileSync('/etc/shells', 'utf8').split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      for (const shellPath of lines) {
        if (!fs.existsSync(shellPath)) continue;
        const base = path.basename(shellPath);
        // Deduplicate by basename (e.g. /bin/bash and /usr/bin/bash)
        if (seen.has(base)) continue;
        seen.add(base);
        const name = shellNames[base] || base;
        profiles.push({ id: base, name, path: shellPath });
      }
    } catch {
      // Fallback if /etc/shells is unreadable
      for (const [id, name, p] of [
        ['zsh', 'Zsh', '/bin/zsh'],
        ['bash', 'Bash', '/bin/bash'],
        ['sh', 'POSIX Shell', '/bin/sh'],
      ]) {
        if (fs.existsSync(p)) {
          profiles.push({ id, name, path: p });
        }
      }
    }
  }

  return profiles;
}

// Cache profiles (discovered once on startup, refreshed via IPC if needed)
let _shellProfiles = null;
function getShellProfiles() {
  if (!_shellProfiles) _shellProfiles = discoverShellProfiles();
  return _shellProfiles;
}

function resolveShell(profileId) {
  // If a profile is selected, use it
  if (profileId && profileId !== 'auto') {
    const profiles = getShellProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (profile && (profile.path === 'wsl.exe' || fs.existsSync(profile.path))) {
      return profile;
    }
  }

  // Auto: original detection logic
  // 1. Respect explicit SHELL env (set by Git Bash, MSYS2, WSL, etc.)
  if (process.env.SHELL && fs.existsSync(process.env.SHELL)) {
    return { id: 'auto', name: 'Auto', path: process.env.SHELL };
  }

  if (isWindows) {
    // 2. Look for Git Bash in common locations
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
      'C:\\msys64\\usr\\bin\\bash.exe',
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return { id: 'auto', name: 'Auto', path: c };
    }
    // 3. Fall back to PowerShell / cmd
    return { id: 'auto', name: 'Auto', path: process.env.COMSPEC || 'powershell.exe' };
  }

  // Unix fallback chain
  for (const s of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (fs.existsSync(s)) return { id: 'auto', name: 'Auto', path: s };
  }
  return { id: 'auto', name: 'Auto', path: '/bin/sh' };
}

// Convert a Windows path to the path a distribution sees.
//   C:\Users\foo                        → /mnt/c/Users/foo
//   \\wsl.localhost\Ubuntu\home\u\proj  → /home/u/proj
// The UNC case is what a Windows folder picker returns for a directory living
// inside a distribution; the POSIX form it maps to is the one Claude records
// and the one the project folder name is encoded from.
function windowsToWslPath(winPath) {
  if (!winPath) return winPath;
  const unc = winPath.match(/^\\\\wsl(?:\.localhost|\$)\\[^\\]+(\\.*)?$/);
  if (unc) return (unc[1] || '\\').replace(/\\/g, '/');
  const normalized = winPath.replace(/\\/g, '/');
  const match = normalized.match(/^([A-Za-z]):(\/.*)/);
  if (match) return '/mnt/' + match[1].toLowerCase() + match[2];
  return normalized;
}

// The distribution a WSL UNC path belongs to, or null if it is not one.
function wslDistroFromUncPath(winPath) {
  const match = typeof winPath === 'string' && winPath.match(/^\\\\wsl(?:\.localhost|\$)\\([^\\]+)/);
  return match ? match[1] : null;
}

// --- WSL-backed accounts -------------------------------------------------
// Claude running inside a distribution writes POSIX paths into its .jsonl
// files, and those paths are what the project folder name is encoded from.
// So the POSIX form stays canonical everywhere in the app, and is translated
// only at the moment a Windows API has to touch the file.

// Host prefixes that expose a distribution's filesystem. `wsl.localhost` is the
// current one; `wsl$` is kept for older Windows 10 builds. Which one resolves
// is probed rather than assumed.
const WSL_UNC_PREFIXES = ['\\\\wsl.localhost\\', '\\\\wsl$\\'];

// Convert a POSIX path inside a distribution to the Windows path reaching it.
//   /home/u/proj   → \\wsl.localhost\<distro>\home\u\proj
//   /mnt/c/Users/u → C:\Users\u          (already on a Windows volume)
// Non-absolute input and paths that are already Windows-shaped pass through.
function wslToWindowsPath(posixPath, distro, uncPrefix = WSL_UNC_PREFIXES[0]) {
  if (!posixPath || !posixPath.startsWith('/')) return posixPath;
  const mounted = posixPath.match(/^\/mnt\/([a-zA-Z])(\/.*)?$/);
  if (mounted) {
    return mounted[1].toUpperCase() + ':' + (mounted[2] || '/').replace(/\//g, '\\');
  }
  if (!distro) return posixPath;
  return uncPrefix + distro + posixPath.replace(/\//g, '\\');
}

// True for a POSIX absolute path — the form every path recorded inside a
// distribution takes, whether it lives on the distribution's own filesystem or
// on a mounted Windows volume. Both need translating before a Windows fs call
// and both are resolved by the distribution when a command runs there, so the
// two cases are not distinguished here; wslToWindowsPath maps each to its own
// Windows form.
function isPosixAbsolutePath(p) {
  return typeof p === 'string' && p.startsWith('/');
}

// Join inside a project while keeping the flavour of its root. path.join is
// platform-specific: on Windows it would rewrite a POSIX project path with
// backslashes, and the folder name the app looks for is encoded from that path,
// so the rewrite would silently point at a project folder that does not exist.
function projectJoin(projectPath, ...parts) {
  return isPosixAbsolutePath(projectPath)
    ? path.posix.join(projectPath, ...parts)
    : path.join(projectPath, ...parts);
}

// Installed distributions. `wsl.exe --list` emits UTF-16LE, hence the NUL strip.
function listWslDistros() {
  if (!isWindows) return [];
  try {
    const { execFileSync } = require('child_process');
    const raw = execFileSync('wsl.exe', ['--list', '--quiet'], {
      timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    return raw.replace(/\0/g, '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// Turn a resolved $HOME into the account fields, choosing the UNC prefix that
// actually resolves. Returns null when the distribution has no Claude home.
function wslClaudeHomeFrom(distro, home) {
  if (!home || !home.startsWith('/')) return null;
  const claudePosix = home + '/.claude';
  for (const prefix of WSL_UNC_PREFIXES) {
    const configDir = wslToWindowsPath(claudePosix, distro, prefix);
    if (fs.existsSync(path.join(configDir, 'projects'))) {
      return { distro, home, claudePosix, configDir, uncPrefix: prefix };
    }
  }
  return null;
}

// Resolve $HOME inside a distribution and the Windows path of its ~/.claude.
// Async: starting a distribution can take seconds, and this runs in the main
// process where a synchronous wait would freeze the window.
async function probeWslClaudeHome(distro) {
  if (!isWindows || !distro) return null;
  const { execFile } = require('child_process');
  const home = await new Promise((resolve) => {
    execFile('wsl.exe', ['-d', distro, '--exec', 'sh', '-c', 'printf %s "$HOME"'], {
      timeout: 10000, encoding: 'utf8',
    }, (err, stdout) => resolve(err ? null : (stdout || '').replace(/\0/g, '').trim()));
  });
  return wslClaudeHomeFrom(distro, home);
}

// Distributions that actually hold a Claude home worth attaching an account to.
// Probed concurrently so several distributions cost one wait, not N.
async function discoverWslClaudeHomes() {
  const probes = await Promise.all(listWslDistros().map(probeWslClaudeHome));
  return probes.filter(Boolean);
}

// Build the argv that runs `argv` inside `distro`, with `cwd` as the working
// directory. Kept as an argv array rather than a shell string so no quoting of
// the project path is involved.
function wslExecArgs(distro, cwd, argv) {
  const args = ['-d', distro];
  if (cwd) args.push('--cd', cwd);
  return args.concat(['--exec', ...argv]);
}

// wsl.exe passes a variable into the distribution only if it is listed in
// WSLENV. Returns the patch to apply to `env`; names already listed are not
// duplicated, and existing entries (with their /p, /l … flags) are preserved.
function withWslEnv(env, names) {
  const existing = (env.WSLENV || '').split(':').filter(Boolean);
  const present = new Set(existing.map(entry => entry.split('/')[0]));
  const added = names.filter(name => env[name] !== undefined && !present.has(name));
  if (!added.length) return {};
  return { WSLENV: [...existing, ...added].join(':') };
}

// The host address a distribution can reach the app on. Under the default NAT
// networking the CLI finds this same address as its default gateway, so binding
// to it is what makes the IDE socket reachable — while still not exposing it to
// the wider network the way 0.0.0.0 would. Under mirrored networking there is
// no WSL adapter and loopback is shared, so 127.0.0.1 is both correct and the
// address the CLI falls back to.
function wslHostAddressFrom(interfaces) {
  for (const [name, addresses] of Object.entries(interfaces || {})) {
    if (!/vEthernet \(WSL/i.test(name)) continue;
    for (const address of addresses || []) {
      const family = address.family;
      if ((family === 'IPv4' || family === 4) && !address.internal) return address.address;
    }
  }
  return null;
}

function isWslShell(shellPath) {
  const base = path.basename(shellPath).toLowerCase();
  return base === 'wsl.exe' || base === 'wsl';
}

// Returns spawn args appropriate for the resolved shell
function shellArgs(shellPath, cmd, extraArgs) {
  const base = path.basename(shellPath).toLowerCase();
  const isBashLike = base.includes('bash') || base.includes('zsh') || base === 'sh';
  const isFish = base === 'fish';
  const isNushell = base === 'nu';

  // WSL: pass command via -- to the distribution shell
  // cwd is handled separately via --cd in the spawn call
  if (isWslShell(shellPath)) {
    if (cmd) return [...(extraArgs || []), '--', 'bash', '-l', '-i', '-c', cmd];
    return [...(extraArgs || []), '--', 'bash', '-l', '-i'];
  }

  if (cmd) {
    if (isBashLike) return ['-l', '-i', '-c', cmd];
    if (isFish) return ['-l', '-c', cmd];
    if (isNushell) return ['-l', '-c', cmd];
    if (base.includes('powershell') || base.includes('pwsh')) return ['-NoLogo', '-Command', cmd];
    return ['/C', cmd];
  }
  if (isBashLike) return ['-l', '-i'];
  if (isFish) return ['-l', '-i'];
  if (isNushell) return ['-l', '-i'];
  if (base.includes('powershell') || base.includes('pwsh')) return ['-NoLogo', '-NoExit'];
  return [];
}

module.exports = {
  discoverShellProfiles, getShellProfiles, resolveShell, isWindows, isWslShell,
  windowsToWslPath, shellArgs,
  WSL_UNC_PREFIXES, wslToWindowsPath, isPosixAbsolutePath, listWslDistros,
  probeWslClaudeHome, discoverWslClaudeHomes, wslClaudeHomeFrom, wslExecArgs, projectJoin,
  withWslEnv, wslHostAddressFrom, wslDistroFromUncPath,
};
