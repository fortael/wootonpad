// Browsing and installing Claude Code plugins for one account.
//
// The marketplaces Claude knows about are cached on disk — each one is a git
// checkout under `<configDir>/plugins/marketplaces/<name>` with a
// `.claude-plugin/marketplace.json` listing everything it offers. That file is
// the catalogue; there is no network call here and no second index to keep in
// sync with the CLI's.
//
// Installing is the CLI's job (`claude plugin install`), because an install
// resolves a source, clones it and may run a marketplace-declared command.
// This module only builds the argv; main.js runs it as the right account.

const fs = require('fs');
const path = require('path');

// Anthropic's own marketplace, which the CLI ships pointing at. Offered as a
// link so a plugin can be found in a browser, and as a one-click "add" for an
// account whose Claude home has never seen it.
const OFFICIAL_MARKETPLACE = {
  name: 'claude-plugins-official',
  repo: 'anthropics/claude-plugins-official',
  url: 'https://github.com/anthropics/claude-plugins-official',
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function marketplacesFile(configDir) {
  return path.join(configDir, 'plugins', 'known_marketplaces.json');
}

// The manifest, wherever this marketplace keeps it. Both layouts are in the
// wild: the documented `.claude-plugin/` directory, and a bare file at the
// root of a small hand-written marketplace.
function readManifest(installLocation) {
  if (!installLocation) return null;
  return readJson(path.join(installLocation, '.claude-plugin', 'marketplace.json'))
    || readJson(path.join(installLocation, 'marketplace.json'));
}

function sourceLabel(source) {
  if (!source || typeof source !== 'object') return typeof source === 'string' ? source : '';
  if (source.repo) return source.repo;
  if (source.url) return source.url;
  if (source.path) return source.path;
  return source.source || '';
}

function sourceUrl(source) {
  if (!source || typeof source !== 'object') return '';
  if (source.source === 'github' && source.repo) return `https://github.com/${source.repo}`;
  if (typeof source.url === 'string' && /^https?:\/\//.test(source.url)) {
    return source.url.replace(/\.git$/, '');
  }
  return '';
}

function readMarketplaces(configDir) {
  const known = readJson(marketplacesFile(configDir)) || {};
  const rows = [];
  for (const [name, entry] of Object.entries(known)) {
    const installLocation = entry?.installLocation || '';
    const manifest = readManifest(installLocation);
    rows.push({
      name,
      label: sourceLabel(entry?.source),
      url: sourceUrl(entry?.source),
      installLocation,
      cached: !!manifest,
      description: manifest?.description || '',
      owner: manifest?.owner?.name || '',
      pluginCount: Array.isArray(manifest?.plugins) ? manifest.plugins.length : 0,
      lastUpdated: entry?.lastUpdated || null,
      official: name === OFFICIAL_MARKETPLACE.name,
    });
  }
  rows.sort((a, b) => Number(b.official) - Number(a.official) || a.name.localeCompare(b.name));
  return rows;
}

function matches(plugin, terms) {
  if (!terms.length) return true;
  const haystack = [plugin.name, plugin.description, plugin.category, plugin.author]
    .filter(Boolean).join('\n').toLowerCase();
  return terms.every(term => haystack.includes(term));
}

// Everything on offer across this account's marketplaces, filtered by a query
// and capped — the official marketplace alone carries a couple of hundred
// entries, and the panel is a picker, not a directory listing.
function searchCatalog(configDir, { query = '', marketplace = '', limit = 60, installedKeys = [] } = {}) {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const installed = new Set(installedKeys);
  const marketplaces = readMarketplaces(configDir);
  const plugins = [];
  let total = 0;

  for (const mkt of marketplaces) {
    if (marketplace && mkt.name !== marketplace) continue;
    const manifest = readManifest(mkt.installLocation);
    for (const entry of (Array.isArray(manifest?.plugins) ? manifest.plugins : [])) {
      const name = entry?.name;
      if (!name) continue;
      const row = {
        key: `${name}@${mkt.name}`,
        name,
        marketplace: mkt.name,
        description: entry.description || '',
        category: entry.category || '',
        author: entry.author?.name || entry.author || '',
        homepage: entry.homepage || '',
        version: entry.version || entry.source?.ref || '',
        sourceLabel: sourceLabel(entry.source),
        sourceUrl: sourceUrl(entry.source) || entry.homepage || '',
        installed: installed.has(`${name}@${mkt.name}`),
      };
      if (!matches(row, terms)) continue;
      total++;
      if (plugins.length < limit) plugins.push(row);
    }
  }

  // Already-installed ones sink: the list is for finding something new.
  plugins.sort((a, b) => Number(a.installed) - Number(b.installed) || a.name.localeCompare(b.name));
  return { marketplaces, plugins, total, truncated: total > plugins.length };
}

const PLUGIN_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(@[A-Za-z0-9][A-Za-z0-9._-]*)?$/;
// A marketplace source is `owner/repo`, an https URL, or an absolute path.
const MARKETPLACE_SOURCE_RE = /^([A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*|https:\/\/[^\s]+|\/[^\s]+)$/;
const SCOPES = ['user', 'project', 'local'];

// The argv for one plugin operation. Validated here rather than at the call
// site: these strings come from the renderer and end up in an execFile, so a
// name that is not a plugin reference must not get that far.
function pluginCommandArgv(action, options = {}) {
  const scope = options.scope && SCOPES.includes(options.scope) ? options.scope : 'user';

  if (action === 'add-marketplace') {
    const source = String(options.source || '').trim();
    if (!MARKETPLACE_SOURCE_RE.test(source)) {
      throw new Error('Use owner/repo, an https:// URL, or an absolute path.');
    }
    return ['plugin', 'marketplace', 'add', source];
  }

  const plugin = String(options.plugin || '').trim();
  if (!PLUGIN_REF_RE.test(plugin)) throw new Error('Expected a plugin name, or name@marketplace.');

  switch (action) {
    case 'install':
      // -y because there is no TTY here: without it the CLI refuses any
      // install whose marketplace declares a command. The renderer asks first.
      return ['plugin', 'install', plugin, '--scope', scope, '--yes'];
    case 'uninstall':
      return ['plugin', 'uninstall', plugin, '--scope', scope];
    case 'enable':
      return ['plugin', 'enable', plugin];
    case 'disable':
      return ['plugin', 'disable', plugin];
    default:
      throw new Error(`Unknown plugin action: ${action}`);
  }
}

module.exports = {
  readMarketplaces,
  searchCatalog,
  pluginCommandArgv,
  OFFICIAL_MARKETPLACE,
  PLUGIN_REF_RE,
  MARKETPLACE_SOURCE_RE,
};
