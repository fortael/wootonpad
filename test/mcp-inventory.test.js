const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  readMcpInventory, resolveServerConfig, addMcpServer, removeMcpServer, normalizeServerDefinition,
} = require('../mcp-inventory');

function makeHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-mcp-'));
  const configDir = path.join(dir, '.claude');
  fs.mkdirSync(configDir, { recursive: true });
  return { dir, configDir, userConfigPath: path.join(dir, '.claude.json') };
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

test('every place Claude can define an MCP server is listed, tagged with its scope', () => {
  const home = makeHome();
  try {
    write(path.join(home.configDir, 'settings.json'), {
      mcpServers: { fromSettings: { type: 'sse', url: 'http://127.0.0.1:1/sse' } },
      disabledMcpServers: ['fromMcpJson'],
    });
    write(path.join(home.configDir, '.mcp.json'), {
      mcpServers: { fromMcpJson: { command: 'run-me' } },
    });
    write(home.userConfigPath, {
      mcpServers: { fromUser: { type: 'http', url: 'https://example.com/mcp' } },
      projects: {
        '/some/project': { mcpServers: { fromProject: { command: 'local-server' } } },
      },
    });

    const inv = readMcpInventory({ configDir: home.configDir, userConfigPath: home.userConfigPath });
    const byName = Object.fromEntries(inv.servers.map(s => [s.name, s]));

    assert.deepEqual(Object.keys(byName).sort(), ['fromMcpJson', 'fromProject', 'fromSettings', 'fromUser']);
    assert.equal(byName.fromSettings.scope, 'settings');
    assert.equal(byName.fromSettings.writable, true, 'settings.json is the file the panel can write');
    assert.equal(byName.fromUser.scope, 'user');
    assert.equal(byName.fromUser.writable, false);
    assert.equal(byName.fromMcpJson.transport, 'stdio', 'a command with no type is stdio');
    assert.equal(byName.fromMcpJson.disabled, true, 'disabledMcpServers is honoured across files');
    assert.equal(byName.fromProject.projectPath, '/some/project');
  } finally {
    fs.rmSync(home.dir, { recursive: true, force: true });
  }
});

test('secrets in headers, env and query strings never leave the main process', () => {
  const home = makeHome();
  try {
    write(path.join(home.configDir, 'settings.json'), {
      mcpServers: {
        remote: {
          type: 'http',
          url: 'https://example.com/mcp?api_key=super-secret&page=2',
          headers: { Authorization: 'Bearer super-secret', 'X-Region': 'eu' },
        },
        local: { command: 'server', env: { API_TOKEN: 'super-secret', NODE_ENV: 'production' } },
      },
    });

    const inv = readMcpInventory({ configDir: home.configDir, userConfigPath: home.userConfigPath });
    const flat = JSON.stringify(inv);
    assert.ok(!flat.includes('super-secret'), 'no secret value survives into the inventory');

    const remote = inv.servers.find(s => s.name === 'remote');
    assert.ok(remote.url.includes('page=2'), 'non-secret query parameters stay readable');
    assert.deepEqual(remote.headers.find(h => h.key === 'X-Region'), { key: 'X-Region', value: 'eu', secret: false });

    const local = inv.servers.find(s => s.name === 'local');
    assert.equal(local.env.find(e => e.key === 'NODE_ENV').value, 'production');
    assert.equal(local.env.find(e => e.key === 'API_TOKEN').secret, true);

    // The probe still needs the real thing — it reads the file itself.
    const raw = resolveServerConfig({ configDir: home.configDir, userConfigPath: home.userConfigPath, id: remote.id });
    assert.equal(raw.headers.Authorization, 'Bearer super-secret');
  } finally {
    fs.rmSync(home.dir, { recursive: true, force: true });
  }
});

test('an inventory id survives a project path that contains spaces', () => {
  const home = makeHome();
  try {
    write(home.userConfigPath, {
      projects: { '/Users/me/My Projects/app': { mcpServers: { neuroman: { type: 'sse', url: 'http://x/sse' } } } },
    });
    const inv = readMcpInventory({ configDir: home.configDir, userConfigPath: home.userConfigPath });
    const [server] = inv.servers;
    const raw = resolveServerConfig({ configDir: home.configDir, userConfigPath: home.userConfigPath, id: server.id });
    assert.equal(raw.url, 'http://x/sse');
  } finally {
    fs.rmSync(home.dir, { recursive: true, force: true });
  }
});

test('plugins are listed with what they provide, and enabled-but-missing ones are not hidden', () => {
  const home = makeHome();
  try {
    const installPath = path.join(home.configDir, 'plugins', 'cache', 'mkt', 'demo', '1.0.0');
    fs.mkdirSync(path.join(installPath, 'skills', 'one'), { recursive: true });
    fs.mkdirSync(path.join(installPath, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(installPath, 'commands', 'go.md'), '# go', 'utf8');
    write(path.join(installPath, '.claude-plugin', 'plugin.json'), {
      name: 'demo',
      description: 'A demo plugin',
      hooks: { SessionStart: [] },
    });
    write(path.join(installPath, '.mcp.json'), { mcpServers: { api: { type: 'http', url: 'https://demo/mcp' } } });

    write(path.join(home.configDir, 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: { 'demo@mkt': [{ scope: 'user', installPath, version: '1.0.0' }] },
    });
    write(path.join(home.configDir, 'plugins', 'known_marketplaces.json'), {
      mkt: { source: { source: 'github', repo: 'acme/mkt' } },
    });
    write(path.join(home.configDir, 'settings.json'), {
      enabledPlugins: { 'demo@mkt': true, 'ghost@mkt': true },
    });

    const inv = readMcpInventory({ configDir: home.configDir, userConfigPath: home.userConfigPath });
    const demo = inv.plugins.find(p => p.key === 'demo@mkt');
    assert.equal(demo.enabled, true);
    assert.equal(demo.installed, true);
    assert.equal(demo.marketplaceSource, 'acme/mkt');
    assert.deepEqual(demo.provides, { skills: 1, commands: 1, hooks: 1, mcpServers: 1 });

    const ghost = inv.plugins.find(p => p.key === 'ghost@mkt');
    assert.equal(ghost.installed, false, 'enabled in settings but absent from disk');

    // An enabled plugin's own servers show up in the server list too.
    const pluginServer = inv.servers.find(s => s.scope === 'plugin');
    assert.equal(pluginServer.name, 'plugin:demo:api');
    const raw = resolveServerConfig({ configDir: home.configDir, userConfigPath: home.userConfigPath, id: pluginServer.id });
    assert.equal(raw.url, 'https://demo/mcp');
  } finally {
    fs.rmSync(home.dir, { recursive: true, force: true });
  }
});

test('adding a server writes settings.json without disturbing the rest of it', () => {
  const home = makeHome();
  try {
    write(path.join(home.configDir, 'settings.json'), { model: 'opus', permissions: { allow: ['Bash'] } });

    addMcpServer({
      configDir: home.configDir,
      definition: { name: 'linear', type: 'http', url: 'https://mcp.linear.app/mcp' },
    });

    const after = JSON.parse(fs.readFileSync(path.join(home.configDir, 'settings.json'), 'utf8'));
    assert.equal(after.model, 'opus');
    assert.deepEqual(after.permissions, { allow: ['Bash'] });
    assert.deepEqual(after.mcpServers.linear, { type: 'http', url: 'https://mcp.linear.app/mcp' });

    assert.throws(
      () => addMcpServer({ configDir: home.configDir, definition: { name: 'linear', type: 'http', url: 'https://mcp.linear.app/mcp' } }),
      /already exists/,
    );

    removeMcpServer({ configDir: home.configDir, name: 'linear' });
    const removed = JSON.parse(fs.readFileSync(path.join(home.configDir, 'settings.json'), 'utf8'));
    assert.ok(!('mcpServers' in removed), 'the last server takes the empty key with it');
    assert.equal(removed.model, 'opus');

    assert.throws(() => removeMcpServer({ configDir: home.configDir, name: 'linear' }), /not defined/);
  } finally {
    fs.rmSync(home.dir, { recursive: true, force: true });
  }
});

test('a definition from the renderer is validated before it can reach a file', () => {
  assert.throws(() => normalizeServerDefinition({ name: 'bad name', type: 'stdio', command: 'x' }), /Name must be/);
  assert.throws(() => normalizeServerDefinition({ name: 'ok', type: 'telnet', url: 'http://x' }), /stdio, http or sse/);
  assert.throws(() => normalizeServerDefinition({ name: 'ok', type: 'stdio', command: '  ' }), /needs a command/);
  assert.throws(() => normalizeServerDefinition({ name: 'ok', type: 'http', url: 'file:///etc/passwd' }), /http:\/\/ or https:\/\//);
  assert.throws(() => normalizeServerDefinition({ name: 'ok', type: 'http', url: 'https://x', headers: { 'has space': 'v' } }), /Invalid headers name/);

  const { name, config } = normalizeServerDefinition({
    name: 'demo', type: 'stdio', command: 'npx', args: ['-y', 'pkg'], env: { TOKEN: 1 },
  });
  assert.equal(name, 'demo');
  assert.deepEqual(config, { type: 'stdio', command: 'npx', args: ['-y', 'pkg'], env: { TOKEN: '1' } });
});
