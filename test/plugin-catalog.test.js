const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  readMarketplaces, searchCatalog, pluginCommandArgv, OFFICIAL_MARKETPLACE,
} = require('../plugin-catalog');

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function makeHome() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-catalog-'));
  const official = path.join(configDir, 'plugins', 'marketplaces', OFFICIAL_MARKETPLACE.name);
  const other = path.join(configDir, 'plugins', 'marketplaces', 'acme');

  write(path.join(configDir, 'plugins', 'known_marketplaces.json'), {
    [OFFICIAL_MARKETPLACE.name]: {
      source: { source: 'github', repo: OFFICIAL_MARKETPLACE.repo },
      installLocation: official,
    },
    acme: { source: { source: 'github', repo: 'acme/plugins' }, installLocation: other },
  });

  write(path.join(official, '.claude-plugin', 'marketplace.json'), {
    name: OFFICIAL_MARKETPLACE.name,
    description: 'Directory of popular extensions',
    owner: { name: 'Anthropic' },
    plugins: [
      {
        name: 'frontend-design',
        description: 'Design help for web UIs',
        category: 'design',
        author: { name: 'Anthropic' },
        source: { source: 'git-subdir', url: 'https://github.com/anthropics/x.git', path: 'plugins/fd' },
      },
      { name: 'api-security', description: 'Audit OpenAPI specs', category: 'security' },
    ],
  });

  // A marketplace keeping its manifest at the root rather than in
  // .claude-plugin/ — both layouts exist.
  write(path.join(other, 'marketplace.json'), {
    name: 'acme',
    plugins: [{ name: 'acme-tools', description: 'Internal tooling' }],
  });

  return configDir;
}

test('marketplaces are read from their checkouts, official first', () => {
  const configDir = makeHome();
  try {
    const rows = readMarketplaces(configDir);
    assert.equal(rows[0].name, OFFICIAL_MARKETPLACE.name);
    assert.equal(rows[0].official, true);
    assert.equal(rows[0].url, OFFICIAL_MARKETPLACE.url);
    assert.equal(rows[0].pluginCount, 2);
    assert.equal(rows[0].owner, 'Anthropic');

    const acme = rows.find(r => r.name === 'acme');
    assert.equal(acme.cached, true, 'a root-level marketplace.json is still a catalogue');
    assert.equal(acme.pluginCount, 1);
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});

test('a marketplace that was never fetched is listed but empty, not an error', () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-catalog-'));
  try {
    write(path.join(configDir, 'plugins', 'known_marketplaces.json'), {
      ghost: { source: { source: 'github', repo: 'ghost/plugins' }, installLocation: '/nope' },
    });
    const [row] = readMarketplaces(configDir);
    assert.equal(row.cached, false);
    assert.equal(row.pluginCount, 0);
    assert.deepEqual(searchCatalog(configDir).plugins, []);
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});

test('the catalogue searches every marketplace and marks what is installed', () => {
  const configDir = makeHome();
  try {
    const all = searchCatalog(configDir, { installedKeys: [`frontend-design@${OFFICIAL_MARKETPLACE.name}`] });
    assert.equal(all.total, 3);
    assert.equal(all.plugins.at(-1).name, 'frontend-design', 'installed entries sink to the bottom');
    assert.equal(all.plugins.at(-1).installed, true);

    const security = searchCatalog(configDir, { query: 'openapi' });
    assert.deepEqual(security.plugins.map(p => p.name), ['api-security'], 'the description is searched');

    const scoped = searchCatalog(configDir, { marketplace: 'acme' });
    assert.deepEqual(scoped.plugins.map(p => p.key), ['acme-tools@acme']);

    const capped = searchCatalog(configDir, { limit: 1 });
    assert.equal(capped.plugins.length, 1);
    assert.equal(capped.truncated, true);
    assert.equal(capped.total, 3);
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});

test('a plugin command is an argv, and only for arguments that are plugin references', () => {
  assert.deepEqual(
    pluginCommandArgv('install', { plugin: 'frontend-design@claude-plugins-official' }),
    ['plugin', 'install', 'frontend-design@claude-plugins-official', '--scope', 'user', '--yes'],
  );
  assert.deepEqual(
    pluginCommandArgv('uninstall', { plugin: 'demo@mkt', scope: 'project' }),
    ['plugin', 'uninstall', 'demo@mkt', '--scope', 'project'],
  );
  assert.deepEqual(pluginCommandArgv('disable', { plugin: 'demo@mkt' }), ['plugin', 'disable', 'demo@mkt']);
  assert.deepEqual(
    pluginCommandArgv('add-marketplace', { source: 'anthropics/claude-plugins-official' }),
    ['plugin', 'marketplace', 'add', 'anthropics/claude-plugins-official'],
  );

  assert.throws(() => pluginCommandArgv('install', { plugin: 'demo; rm -rf /' }), /plugin name/);
  assert.throws(() => pluginCommandArgv('install', { plugin: '--help' }), /plugin name/);
  assert.throws(() => pluginCommandArgv('add-marketplace', { source: 'rm -rf /' }), /owner\/repo/);
  assert.throws(() => pluginCommandArgv('add-marketplace', { source: 'file:///etc' }), /owner\/repo/);
  assert.throws(() => pluginCommandArgv('sudo', { plugin: 'demo' }), /Unknown plugin action/);

  // An unknown scope falls back to user rather than reaching the CLI.
  assert.deepEqual(
    pluginCommandArgv('install', { plugin: 'demo', scope: 'root' }),
    ['plugin', 'install', 'demo', '--scope', 'user', '--yes'],
  );
});
