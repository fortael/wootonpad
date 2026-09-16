// What MCP servers and plugins an account actually has.
//
// Claude spreads this over four files inside a Claude home plus one per
// installed plugin, and each of them means something different — a server in
// settings.json applies to every project on the account, one under
// projects[path] in .claude.json applies to that checkout only. The accounts
// panel shows all of them with the file they came from, so "why is this server
// here" has an answer.
//
// Reading only, with one exception: settings.json (see addMcpServer /
// removeMcpServer). It lives inside the config dir, it is small, and it is not
// the file a running CLI rewrites on every startup — unlike .claude.json,
// which carries per-project state and would be a clobber risk.

const fs = require('fs');
const path = require('path');

// Values worth hiding when the panel prints a server's env or headers. The
// panel is a window onto files that hold bearer tokens (an Authorization
// header is the normal way to configure a remote MCP server), and a token on
// screen is a token in a screenshot.
const SECRET_KEY_RE = /(token|secret|password|passwd|key|auth|credential|cookie|session)/i;

const MASK = '••••••••';

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

// stdio is the shape without a url; everything else declares its own type.
function transportOf(config) {
  const declared = typeof config?.type === 'string' ? config.type.toLowerCase() : null;
  if (declared === 'stdio' || declared === 'http' || declared === 'sse') return declared;
  if (config?.command) return 'stdio';
  if (config?.url) return declared === 'ws' ? 'ws' : 'http';
  return 'unknown';
}

function maskValue(key, value) {
  const text = value == null ? '' : String(value);
  if (!text) return { value: '', secret: false };
  if (SECRET_KEY_RE.test(String(key))) return { value: MASK, secret: true };
  return { value: text, secret: false };
}

function pairs(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).map(([key, raw]) => {
    const { value, secret } = maskValue(key, raw);
    return { key, value, secret };
  });
}

// A URL can carry the credential in the query string (`?key=…`), so the panel
// gets a printable copy with those values blanked.
function maskUrl(url) {
  if (typeof url !== 'string' || !url) return '';
  try {
    const parsed = new URL(url);
    let touched = false;
    for (const key of [...parsed.searchParams.keys()]) {
      if (SECRET_KEY_RE.test(key)) { parsed.searchParams.set(key, MASK); touched = true; }
    }
    return touched ? parsed.toString() : url;
  } catch {
    return url;
  }
}

// `id` is what the renderer sends back to probe or remove a server: the name
// alone is ambiguous once project scopes are in the list. JSON rather than a
// joined string — a project path can hold whatever character a separator
// would use.
function serverId(scope, qualifier, name) {
  return JSON.stringify([scope, qualifier || '', name]);
}

function parseServerId(id) {
  try {
    const parts = JSON.parse(String(id));
    if (!Array.isArray(parts) || parts.length !== 3) return null;
    const [scope, qualifier, name] = parts.map(p => String(p ?? ''));
    return scope && name ? { scope, qualifier, name } : null;
  } catch {
    return null;
  }
}

// One server, stripped of anything secret, tagged with where it came from.
function describeServer({ name, config, scope, scopeLabel, sourcePath, writable, disabled, projectPath, plugin }) {
  return {
    id: serverId(scope, projectPath || plugin, name),
    name,
    scope,
    scopeLabel,
    sourcePath,
    writable: !!writable,
    disabled: !!disabled,
    projectPath: projectPath || null,
    plugin: plugin || null,
    transport: transportOf(config),
    command: typeof config?.command === 'string' ? config.command : '',
    args: Array.isArray(config?.args) ? config.args.map(String) : [],
    url: maskUrl(config?.url),
    env: pairs(config?.env),
    headers: pairs(config?.headers),
  };
}

function collect(target, servers, meta, disabledNames) {
  if (!servers || typeof servers !== 'object') return;
  for (const [name, config] of Object.entries(servers)) {
    if (!config || typeof config !== 'object') continue;
    target.push(describeServer({ ...meta, name, config, disabled: disabledNames.has(name) }));
  }
}

function disabledSet(...lists) {
  const set = new Set();
  for (const list of lists) {
    if (Array.isArray(list)) for (const name of list) set.add(String(name));
  }
  return set;
}

// ── Plugins ─────────────────────────────────────────────────────────
// installed_plugins.json records what is on disk; settings.json's
// enabledPlugins records what Claude actually loads. Both are needed: a plugin
// can be installed and switched off, and an entry can stay enabled in settings
// long after its install was removed.
function pluginProvides(installPath) {
  const provides = {};
  for (const dir of ['skills', 'commands', 'agents']) {
    try {
      const entries = fs.readdirSync(path.join(installPath, dir));
      if (entries.length) provides[dir] = entries.length;
    } catch {}
  }
  const manifest = readJson(path.join(installPath, '.claude-plugin', 'plugin.json'));
  if (manifest?.hooks) provides.hooks = Object.keys(manifest.hooks).length;
  const mcp = readJson(path.join(installPath, '.mcp.json'))?.mcpServers
    || (manifest?.mcpServers && typeof manifest.mcpServers === 'object' ? manifest.mcpServers : null);
  if (mcp) provides.mcpServers = Object.keys(mcp).length;
  return { provides, manifest, mcpServers: mcp || null };
}

// Where a project- or local-scoped install records that it is switched on:
// `<projectPath>/.claude/settings.json`, and its .local sibling. `claude plugin
// install --scope project` writes the enable there and not into the account, so
// reading the account's settings.json alone reported every project-scoped
// plugin as disabled while Claude was loading it on every session — and the
// Enable button then came back with "already enabled".
const PROJECT_SETTINGS_FILES = ['settings.json', 'settings.local.json'];

function projectEnabledPlugins(projectPath, toHost, cache) {
  if (cache.has(projectPath)) return cache.get(projectPath);
  const dir = path.join(toHost(projectPath), '.claude');
  const merged = {};
  for (const file of PROJECT_SETTINGS_FILES) {
    Object.assign(merged, readJson(path.join(dir, file))?.enabledPlugins || {});
  }
  cache.set(projectPath, merged);
  return merged;
}

// Settings precedence, the CLI's own: the checkout decides for a plugin it
// mentions, the account decides for everything else. An account-level `false`
// does not switch off a plugin a project turned on.
function pluginEnabled(key, record, enabledMap, toHost, cache) {
  const projectPath = record?.projectPath;
  if (projectPath && (record?.scope === 'project' || record?.scope === 'local')) {
    const inProject = projectEnabledPlugins(projectPath, toHost, cache);
    if (key in inProject) return inProject[key] === true;
  }
  return enabledMap[key] === true;
}

function readPlugins(configDir, enabledMap, toHost = (p => p)) {
  const installed = readJson(path.join(configDir, 'plugins', 'installed_plugins.json'));
  const marketplaces = readJson(path.join(configDir, 'plugins', 'known_marketplaces.json')) || {};
  const rows = [];
  const pluginServers = [];
  const seen = new Set();
  const projectCache = new Map();

  for (const [key, records] of Object.entries(installed?.plugins || {})) {
    const list = Array.isArray(records) ? records : [records];
    const [shortName, marketplace] = String(key).split('@');
    for (const record of list) {
      const installPath = record?.installPath || '';
      const { provides, manifest, mcpServers } = installPath
        ? pluginProvides(installPath)
        : { provides: {}, manifest: null, mcpServers: null };
      seen.add(key);
      const enabled = pluginEnabled(key, record, enabledMap, toHost, projectCache);
      rows.push({
        id: serverId('plugin', record?.projectPath || record?.scope || '', key),
        key,
        name: shortName || key,
        marketplace: marketplace || null,
        marketplaceSource: marketplaces[marketplace]?.source?.repo
          || marketplaces[marketplace]?.source?.source || null,
        version: record?.version && record.version !== 'unknown' ? record.version : null,
        scope: record?.scope || 'user',
        projectPath: record?.projectPath || null,
        installPath,
        installed: !installPath || exists(installPath),
        enabled,
        description: manifest?.description || '',
        provides,
      });
      // A plugin's own MCP servers, named the way the CLI names them, so a
      // "needs auth" line in Claude's own output points at the same row here.
      if (mcpServers && enabled) {
        for (const [name, config] of Object.entries(mcpServers)) {
          if (!config || typeof config !== 'object') continue;
          pluginServers.push(describeServer({
            name: `plugin:${shortName}:${name}`,
            config,
            scope: 'plugin',
            scopeLabel: `plugin · ${key}`,
            sourcePath: path.join(installPath, '.mcp.json'),
            writable: false,
            disabled: false,
            plugin: key,
          }));
        }
      }
    }
  }

  // Enabled in settings, absent from installed_plugins.json — Claude will try
  // to load it and fail, so it is worth showing rather than silently dropping.
  for (const [key, on] of Object.entries(enabledMap)) {
    if (seen.has(key) || on !== true) continue;
    const [shortName, marketplace] = String(key).split('@');
    rows.push({
      id: serverId('plugin', 'missing', key),
      key,
      name: shortName || key,
      marketplace: marketplace || null,
      marketplaceSource: null,
      version: null,
      scope: 'user',
      projectPath: null,
      installPath: '',
      installed: false,
      enabled: true,
      description: '',
      provides: {},
    });
  }

  rows.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.key.localeCompare(b.key));
  return { plugins: rows, pluginServers };
}

// ── Inventory ───────────────────────────────────────────────────────
// `userConfigPath` is passed in rather than derived: for the default account
// Claude keeps .claude.json in the home directory, for every other one it sits
// inside the config dir, and only the caller knows which account this is.
//
// `hostPath` is rule 2 of the WSL contract: a project path recorded by the CLI
// is POSIX, and reading a file under it on Windows needs the UNC view. Bound to
// this account by the caller, not to whichever is selected.
function readMcpInventory({ configDir, userConfigPath, maxProjectServers = 200, hostPath }) {
  const settingsPath = path.join(configDir, 'settings.json');
  const localSettingsPath = path.join(configDir, 'settings.local.json');
  const mcpJsonPath = path.join(configDir, '.mcp.json');

  const settings = readJson(settingsPath) || {};
  const localSettings = readJson(localSettingsPath) || {};
  const userConfig = userConfigPath ? (readJson(userConfigPath) || {}) : {};
  const mcpJson = readJson(mcpJsonPath) || {};

  const globallyDisabled = disabledSet(
    settings.disabledMcpServers,
    localSettings.disabledMcpServers,
    userConfig.disabledMcpServers,
  );

  const servers = [];

  collect(servers, settings.mcpServers, {
    scope: 'settings',
    scopeLabel: 'settings.json',
    sourcePath: settingsPath,
    writable: true,
  }, globallyDisabled);

  collect(servers, localSettings.mcpServers, {
    scope: 'settings-local',
    scopeLabel: 'settings.local.json',
    sourcePath: localSettingsPath,
    writable: false,
  }, globallyDisabled);

  collect(servers, userConfig.mcpServers, {
    scope: 'user',
    scopeLabel: 'user (.claude.json)',
    sourcePath: userConfigPath || '',
    writable: false,
  }, globallyDisabled);

  collect(servers, mcpJson.mcpServers, {
    scope: 'mcp-json',
    scopeLabel: '.mcp.json',
    sourcePath: mcpJsonPath,
    writable: false,
  }, globallyDisabled);

  // Project-scoped servers (`claude mcp add -s local`). Capped: a long-lived
  // .claude.json holds hundreds of projects, and the panel is not a project
  // browser.
  let projectServers = 0;
  let projectServersTruncated = false;
  for (const [projectPath, entry] of Object.entries(userConfig.projects || {})) {
    const own = entry?.mcpServers;
    if (!own || typeof own !== 'object' || !Object.keys(own).length) continue;
    if (projectServers >= maxProjectServers) { projectServersTruncated = true; break; }
    const disabled = disabledSet(entry.disabledMcpServers, [...globallyDisabled]);
    const before = servers.length;
    collect(servers, own, {
      scope: 'project',
      scopeLabel: 'project',
      sourcePath: userConfigPath || '',
      writable: false,
      projectPath,
    }, disabled);
    projectServers += servers.length - before;
  }

  const enabledMap = { ...(settings.enabledPlugins || {}), ...(localSettings.enabledPlugins || {}) };
  const { plugins, pluginServers } = readPlugins(configDir, enabledMap, hostPath);
  servers.push(...pluginServers);

  const rank = s => (s.scope === 'project' ? 2 : s.scope === 'plugin' ? 1 : 0);
  servers.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  return {
    servers,
    plugins,
    projectServersTruncated,
    files: [
      { name: 'settings.json', path: settingsPath, exists: exists(settingsPath) },
      { name: 'settings.local.json', path: localSettingsPath, exists: exists(localSettingsPath) },
      { name: '.mcp.json', path: mcpJsonPath, exists: exists(mcpJsonPath) },
      ...(userConfigPath ? [{ name: '.claude.json', path: userConfigPath, exists: exists(userConfigPath) }] : []),
    ],
    // The file "Add MCP" writes into, so the panel can say so before saving.
    writeTarget: settingsPath,
  };
}

// ── Writing ─────────────────────────────────────────────────────────

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const BAD_KEY_RE = /[\s:=]/;

function asStringMap(value, label) {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!key || BAD_KEY_RE.test(key)) throw new Error(`Invalid ${label} name: ${key}`);
    out[key] = String(raw ?? '');
  }
  return Object.keys(out).length ? out : undefined;
}

// Everything the renderer sends passes through here before it reaches a file —
// the definition is spawned or fetched later, so a malformed one is rejected at
// the boundary rather than at use.
function normalizeServerDefinition(def) {
  const name = String(def?.name || '').trim();
  if (!NAME_RE.test(name)) {
    throw new Error('Name must be 1–64 characters: letters, digits, dot, dash or underscore.');
  }
  const type = String(def?.type || '').trim().toLowerCase();
  if (!['stdio', 'http', 'sse'].includes(type)) throw new Error('Type must be stdio, http or sse.');

  if (type === 'stdio') {
    const command = String(def?.command || '').trim();
    if (!command) throw new Error('A stdio server needs a command.');
    const args = Array.isArray(def?.args) ? def.args.map(a => String(a)) : [];
    const env = asStringMap(def?.env, 'env');
    const config = { type: 'stdio', command };
    if (args.length) config.args = args;
    if (env) config.env = env;
    return { name, config };
  }

  const url = String(def?.url || '').trim();
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Enter a valid URL.'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must be http:// or https://.');
  }
  const headers = asStringMap(def?.headers, 'headers');
  const config = { type, url };
  if (headers) config.headers = headers;
  return { name, config };
}

// Rewrite through a temp file in the same directory: a half-written
// settings.json is a Claude that will not start.
function writeJsonAtomic(file, data) {
  const tmp = `${file}.wootonpad-${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

function addMcpServer({ configDir, definition }) {
  const { name, config } = normalizeServerDefinition(definition);
  const settingsPath = path.join(configDir, 'settings.json');
  const settings = readJson(settingsPath) || {};
  const servers = (settings.mcpServers && typeof settings.mcpServers === 'object') ? settings.mcpServers : {};
  if (servers[name] && !definition.overwrite) {
    throw new Error(`"${name}" already exists in settings.json.`);
  }
  settings.mcpServers = { ...servers, [name]: config };
  writeJsonAtomic(settingsPath, settings);
  return { name, path: settingsPath };
}

// Only settings.json entries can be removed here — that is the one file this
// module owns. Anything else is refused so the panel can say where the server
// actually lives instead of pretending to delete it.
function removeMcpServer({ configDir, name }) {
  const settingsPath = path.join(configDir, 'settings.json');
  const settings = readJson(settingsPath);
  if (!settings?.mcpServers || !(name in settings.mcpServers)) {
    throw new Error(`"${name}" is not defined in settings.json.`);
  }
  const { [name]: _removed, ...rest } = settings.mcpServers;
  // Removing the last server takes the key with it: an empty `mcpServers: {}`
  // left behind is a diff in the user's settings that says nothing.
  if (Object.keys(rest).length) settings.mcpServers = rest;
  else delete settings.mcpServers;
  writeJsonAtomic(settingsPath, settings);
  return { name, path: settingsPath };
}

// The raw (unmasked) config behind one inventory id, for probing. Resolved
// from the files again rather than trusted from the renderer: the renderer
// never gets to name a command this process will run.
function resolveServerConfig({ configDir, userConfigPath, id }) {
  const parsed = parseServerId(id);
  if (!parsed) return null;
  const { scope, qualifier, name } = parsed;

  const fromFile = (file) => readJson(file)?.mcpServers?.[name] || null;

  switch (scope) {
    case 'settings':
      return fromFile(path.join(configDir, 'settings.json'));
    case 'settings-local':
      return fromFile(path.join(configDir, 'settings.local.json'));
    case 'user':
      return userConfigPath ? fromFile(userConfigPath) : null;
    case 'mcp-json':
      return fromFile(path.join(configDir, '.mcp.json'));
    case 'project':
      return readJson(userConfigPath)?.projects?.[qualifier]?.mcpServers?.[name] || null;
    case 'plugin': {
      const installed = readJson(path.join(configDir, 'plugins', 'installed_plugins.json'));
      const records = installed?.plugins?.[qualifier];
      const list = Array.isArray(records) ? records : (records ? [records] : []);
      const bare = name.replace(/^plugin:[^:]*:/, '');
      for (const record of list) {
        if (!record?.installPath) continue;
        const mcp = readJson(path.join(record.installPath, '.mcp.json'))?.mcpServers
          || readJson(path.join(record.installPath, '.claude-plugin', 'plugin.json'))?.mcpServers;
        if (mcp?.[bare]) return mcp[bare];
      }
      return null;
    }
    default:
      return null;
  }
}

module.exports = {
  readMcpInventory,
  resolveServerConfig,
  addMcpServer,
  removeMcpServer,
  normalizeServerDefinition,
  parseServerId,
  transportOf,
  SECRET_KEY_RE,
};
