<template>
  <div class="acct-viewer">
    <div class="acct-viewer__header">
      <SbIcon name="users" :size="14" tone="muted" />
      <span class="acct-viewer__title">{{ account?.name || 'Account' }}</span>
      <span v-if="detail?.isActive" class="acct-chip acct-chip--ok">Active</span>
      <span v-if="account?.wslDistro" class="acct-chip">WSL · {{ account.wslDistro }}</span>
      <span class="acct-viewer__spacer"></span>
      <button
        v-if="detail && !detail.isActive"
        class="acct-btn"
        @click="useAccount"
      >Use this account</button>
      <button
        class="acct-icon-btn"
        :class="{ 'acct-icon-btn--spin': loading }"
        data-tooltip="Reload"
        aria-label="Reload account"
        @click="reload"
      >
        <SbIcon name="refresh-cw" :size="13" tone="muted" />
      </button>
    </div>

    <div class="acct-viewer__body">
      <div v-if="!detail && !loading" class="acct-empty">Select an account in the sidebar.</div>
      <div v-else-if="!detail" class="acct-empty">Loading account…</div>

      <template v-else>
        <!-- ── Paths ─────────────────────────────────────────────── -->
        <section class="acct-section">
          <h3 class="acct-section__title">
            <SbIcon name="folder-open" :size="14" tone="muted" />
            Config directory
          </h3>
          <p class="acct-section__hint">
            Point another Claude instance at this account by setting
            <code class="acct-code">CLAUDE_CONFIG_DIR</code> to this path.
          </p>
          <div class="acct-path acct-path--primary">
            <span class="acct-path__value" :title="account.configDir">{{ account.configDir }}</span>
            <span v-if="!detail.configDirExists" class="acct-chip acct-chip--warn">missing</span>
            <button
              class="acct-copy"
              :class="{ 'acct-copy--done': copied === 'configDir' }"
              @click="copy('configDir', account.configDir)"
            >
              <SbIcon :name="copied === 'configDir' ? 'check' : 'copy'" :size="13" />
              {{ copied === 'configDir' ? 'Copied' : 'Copy' }}
            </button>
          </div>

          <div v-if="detail.launchCommand" class="acct-launch">
            <span class="acct-launch__label">Run the CLI as this account</span>
            <div class="acct-path acct-path--command">
              <code class="acct-path__value acct-path__value--mono" :title="detail.launchCommand">{{ detail.launchCommand }}</code>
              <button
                class="acct-copy"
                :class="{ 'acct-copy--done': copied === 'launch' }"
                @click="copy('launch', detail.launchCommand)"
              >
                <SbIcon :name="copied === 'launch' ? 'check' : 'copy'" :size="13" />
                {{ copied === 'launch' ? 'Copied' : 'Copy' }}
              </button>
            </div>
            <p v-if="account.wslDistro" class="acct-section__hint">
              Inside the distribution this home is already the default, so the command
              does not set <code class="acct-code">CLAUDE_CONFIG_DIR</code> — the Windows
              view of the path would not resolve there.
            </p>
          </div>

          <!-- The per-file paths live in Configuration below, next to the file
               they belong to; repeating them here was pure duplication. -->
        </section>

        <!-- ── Authorization ─────────────────────────────────────── -->
        <section class="acct-section">
          <h3 class="acct-section__title">
            <SbIcon name="key-round" :size="14" tone="muted" />
            Authorization
          </h3>
          <div class="acct-auth">
            <div class="acct-auth__row">
              <span class="acct-chip" :class="tokenChipClass">
                {{ detail.token.present ? 'Token on file' : 'No token' }}
              </span>
              <span v-if="detail.token.present && detail.token.source" class="acct-auth__meta">
                from {{ detail.token.source }}
              </span>
              <span v-if="detail.token.subscriptionType" class="acct-auth__meta">
                · {{ detail.token.subscriptionType }}
              </span>
              <span v-if="detail.token.expiresAt" class="acct-auth__meta">
                · {{ detail.token.expired ? 'expired' : 'expires' }} {{ formatWhen(detail.token.expiresAt) }}
              </span>
              <span class="acct-viewer__spacer"></span>
              <button class="acct-btn" :disabled="checking" @click="check">
                {{ checking ? 'Checking…' : 'Check' }}
              </button>
            </div>
            <div v-if="authResult" class="acct-auth__result" :class="'acct-auth__result--' + authTone">
              <SbIcon :name="authIcon" :size="14" />
              <span class="acct-auth__state">{{ AUTH_LABELS[authResult.state] || authResult.state }}</span>
              <span class="acct-auth__msg">{{ authResult.message }}</span>
            </div>
            <p v-else class="acct-section__hint">
              A token can sit on disk long after the API stops accepting it — check to be sure.
            </p>
          </div>
        </section>

        <!-- ── MCP servers ───────────────────────────────────────── -->
        <section class="acct-section">
          <h3 class="acct-section__title">
            <SbIcon name="plug" :size="14" tone="muted" />
            MCP servers
            <span v-if="allServers.length" class="acct-chip">{{ allServers.length }}</span>
            <span class="acct-viewer__spacer"></span>
            <button
              class="acct-btn"
              :disabled="checkingAll || !accountServers.length"
              data-tooltip="Run the MCP initialize handshake against every account-wide server"
              @click="checkAll"
            >{{ checkingAll ? 'Checking…' : 'Check all' }}</button>
            <button class="acct-btn" @click="addOpen = !addOpen">
              {{ addOpen ? 'Cancel' : 'Add MCP' }}
            </button>
          </h3>

          <!-- Add form. Writes to settings.json — see the hint: it is the one
               file in the config dir the app owns, and unlike .claude.json no
               running CLI rewrites it underneath us. -->
          <div v-if="addOpen" class="acct-form">
            <div class="acct-form__row">
              <input v-model="form.name" class="acct-input" placeholder="Server name (e.g. linear)" />
              <select v-model="form.type" class="acct-input acct-input--select">
                <option value="stdio">stdio (local command)</option>
                <option value="http">http</option>
                <option value="sse">sse</option>
              </select>
            </div>

            <template v-if="form.type === 'stdio'">
              <input v-model="form.command" class="acct-input" placeholder="Command, e.g. npx -y @acme/mcp-server --port 3000" />
              <textarea
                v-model="form.env"
                class="acct-input acct-input--area"
                rows="2"
                placeholder="Environment, one KEY=value per line (optional)"
              ></textarea>
            </template>
            <template v-else>
              <input v-model="form.url" class="acct-input" placeholder="https://example.com/mcp" />
              <textarea
                v-model="form.headers"
                class="acct-input acct-input--area"
                rows="2"
                placeholder="Headers, one Name: value per line (optional)"
              ></textarea>
            </template>

            <div class="acct-form__row">
              <p class="acct-section__hint acct-form__hint">
                Saved to <code class="acct-code">settings.json</code> in this account's config
                directory, so it applies to every project this account opens.
              </p>
              <button class="acct-btn" :disabled="saving" @click="saveServer">
                {{ saving ? 'Saving…' : 'Save server' }}
              </button>
            </div>
            <div v-if="formError" class="acct-file-error">{{ formError }}</div>
          </div>

          <p v-if="!allServers.length" class="acct-section__hint">
            No MCP servers configured for this account. Add one here, or with
            <code class="acct-code">claude mcp add</code>.
          </p>

          <div v-if="accountServers.length" class="acct-mcp-list">
            <div v-for="s in accountServers" :key="s.id" class="acct-mcp">
              <div class="acct-mcp__head">
                <span class="acct-mcp__name">{{ s.name }}</span>
                <span class="acct-chip">{{ s.transport }}</span>
                <span class="acct-chip">{{ s.scopeLabel }}</span>
                <span v-if="s.disabled" class="acct-chip acct-chip--warn">disabled</span>
                <span class="acct-viewer__spacer"></span>
                <span v-if="statuses[s.id]" class="acct-chip" :class="statusChip(statuses[s.id])">
                  {{ MCP_LABELS[statuses[s.id].state] || statuses[s.id].state }}
                </span>
                <button class="acct-btn" :disabled="!!checking_[s.id]" @click="checkServer(s)">
                  {{ checking_[s.id] ? 'Checking…' : 'Check' }}
                </button>
                <button
                  v-if="s.writable"
                  class="acct-icon-btn"
                  data-tooltip="Remove from settings.json"
                  aria-label="Remove server"
                  @click="removeServer(s)"
                ><SbIcon name="trash-2" :size="13" tone="muted" /></button>
              </div>
              <div class="acct-mcp__target" :title="serverTarget(s)">{{ serverTarget(s) }}</div>
              <div v-if="s.env.length || s.headers.length" class="acct-mcp__meta">
                <span v-for="p in [...s.headers, ...s.env]" :key="p.key" class="acct-mcp__pair">
                  {{ p.key }}<span class="acct-mcp__pair-value">={{ p.value }}</span>
                </span>
              </div>
              <div
                v-if="statuses[s.id]"
                class="acct-mcp__status"
                :class="'acct-mcp__status--' + statusTone(statuses[s.id])"
              >
                {{ statuses[s.id].message }}
                <span v-if="statuses[s.id].durationMs != null" class="acct-mcp__meta">
                  · {{ statuses[s.id].durationMs }} ms
                </span>
              </div>
            </div>
          </div>

          <!-- Project-scoped servers (`claude mcp add -s local`) belong to one
               checkout, not to the account, so they stay folded away. -->
          <template v-if="projectServers.length">
            <button class="acct-btn acct-btn--wide" @click="showProjectServers = !showProjectServers">
              {{ showProjectServers ? 'Hide' : 'Show' }} {{ projectServers.length }} project-scoped
              server{{ projectServers.length === 1 ? '' : 's' }}
            </button>
            <div v-if="showProjectServers" class="acct-mcp-list">
              <div v-for="s in projectServers" :key="s.id" class="acct-mcp">
                <div class="acct-mcp__head">
                  <span class="acct-mcp__name">{{ s.name }}</span>
                  <span class="acct-chip">{{ s.transport }}</span>
                  <span class="acct-viewer__spacer"></span>
                  <span v-if="statuses[s.id]" class="acct-chip" :class="statusChip(statuses[s.id])">
                    {{ MCP_LABELS[statuses[s.id].state] || statuses[s.id].state }}
                  </span>
                  <button class="acct-btn" :disabled="!!checking_[s.id]" @click="checkServer(s)">
                    {{ checking_[s.id] ? 'Checking…' : 'Check' }}
                  </button>
                </div>
                <div class="acct-mcp__target" :title="serverTarget(s)">{{ serverTarget(s) }}</div>
                <div class="acct-mcp__meta" :title="s.projectPath">{{ s.projectPath }}</div>
                <div
                  v-if="statuses[s.id]"
                  class="acct-mcp__status"
                  :class="'acct-mcp__status--' + statusTone(statuses[s.id])"
                >{{ statuses[s.id].message }}</div>
              </div>
            </div>
            <p v-if="mcp?.projectServersTruncated" class="acct-section__hint">
              Only the first project-scoped servers are listed.
            </p>
          </template>
        </section>

        <!-- ── Plugins ───────────────────────────────────────────── -->
        <section class="acct-section">
          <h3 class="acct-section__title">
            <SbIcon name="puzzle" :size="14" tone="muted" />
            Plugins
            <span v-if="plugins.length" class="acct-chip">{{ plugins.length }}</span>
            <span class="acct-viewer__spacer"></span>
            <button
              class="acct-btn"
              data-tooltip="Open Anthropic's plugin marketplace on GitHub"
              @click="openMarketplace"
            >
              Browse marketplace
              <SbIcon name="square-arrow-out-up-right" :size="11" />
            </button>
            <button class="acct-btn" @click="toggleCatalog">
              {{ catalogOpen ? 'Cancel' : 'Add plugin' }}
            </button>
          </h3>

          <!-- Catalogue: the marketplaces this account has already fetched,
               read straight out of their checkouts. Installing shells out to
               `claude plugin install` as this account — one installer, not
               two. -->
          <div v-if="catalogOpen" class="acct-form">
            <div class="acct-form__row">
              <input
                v-model="catalogQuery"
                class="acct-input"
                placeholder="Search plugins by name, description or category"
                @input="scheduleCatalogSearch"
              />
              <select v-model="catalogMarketplace" class="acct-input acct-input--select" @change="loadCatalog">
                <option value="">All marketplaces</option>
                <option v-for="m in marketplaces" :key="m.name" :value="m.name">
                  {{ m.name }} ({{ m.pluginCount }})
                </option>
              </select>
            </div>

            <div class="acct-form__row">
              <input
                v-model="marketplaceSource"
                class="acct-input"
                placeholder="Add a marketplace: owner/repo, https:// URL or path"
                @keydown.enter.prevent="addMarketplace"
              />
              <button class="acct-btn" :disabled="!!busy" @click="addMarketplace">
                {{ busy === 'marketplace' ? 'Adding…' : 'Add marketplace' }}
              </button>
            </div>

            <p v-if="!marketplaces.length" class="acct-section__hint">
              This account has no marketplaces yet. Add
              <code class="acct-code">{{ officialRepo }}</code> to get Anthropic's catalogue.
            </p>

            <div v-if="catalogLoading" class="acct-section__hint">Reading marketplaces…</div>

            <div v-else-if="catalog.length" class="acct-mcp-list">
              <div v-for="c in catalog" :key="c.key" class="acct-mcp">
                <div class="acct-mcp__head">
                  <span class="acct-mcp__name">{{ c.name }}</span>
                  <span v-if="c.category" class="acct-chip">{{ c.category }}</span>
                  <span class="acct-chip">{{ c.marketplace }}</span>
                  <span class="acct-viewer__spacer"></span>
                  <button
                    v-if="c.sourceUrl"
                    class="acct-icon-btn"
                    data-tooltip="Open the plugin's source"
                    aria-label="Open plugin source"
                    @click="openUrl(c.sourceUrl)"
                  ><SbIcon name="square-arrow-out-up-right" :size="12" tone="muted" /></button>
                  <span v-if="c.installed" class="acct-chip acct-chip--ok">installed</span>
                  <button
                    v-else
                    class="acct-btn"
                    :disabled="!!busy"
                    @click="installPlugin(c)"
                  >{{ busy === c.key ? 'Installing…' : 'Install' }}</button>
                </div>
                <div v-if="c.description" class="acct-mcp__target acct-mcp__target--text">{{ c.description }}</div>
                <div class="acct-mcp__meta">
                  {{ c.author || 'unknown author' }}<template v-if="c.sourceLabel"> · {{ c.sourceLabel }}</template>
                </div>
              </div>
            </div>

            <p v-else class="acct-section__hint">Nothing matches “{{ catalogQuery }}”.</p>

            <p v-if="catalogTruncated" class="acct-section__hint">
              Showing {{ catalog.length }} of {{ catalogTotal }} matches — narrow the search to see the rest.
            </p>
          </div>

          <div v-if="pluginResult" class="acct-mcp__status" :class="'acct-mcp__status--' + (pluginResult.ok ? 'ok' : 'bad')">
            {{ pluginResult.message }}
          </div>

          <p v-if="!plugins.length" class="acct-section__hint">
            No plugins installed for this account — add one above, or run
            <code class="acct-code">claude plugin install</code>.
          </p>

          <div v-else class="acct-mcp-list">
            <div v-for="p in plugins" :key="p.id" class="acct-mcp">
              <div class="acct-mcp__head">
                <span class="acct-mcp__name">{{ p.name }}</span>
                <span class="acct-chip" :class="p.enabled ? 'acct-chip--ok' : ''">
                  {{ p.enabled ? 'enabled' : 'disabled' }}
                </span>
                <span v-if="!p.installed" class="acct-chip acct-chip--warn">not on disk</span>
                <span v-if="p.version" class="acct-chip">v{{ p.version }}</span>
                <span class="acct-viewer__spacer"></span>
                <span v-if="p.marketplace" class="acct-mcp__meta" :title="p.marketplaceSource || ''">
                  {{ p.marketplace }}
                </span>
                <button class="acct-btn" :disabled="!!busy" @click="setPluginEnabled(p, !p.enabled)">
                  {{ busy === p.key ? 'Working…' : (p.enabled ? 'Disable' : 'Enable') }}
                </button>
                <button
                  class="acct-icon-btn"
                  data-tooltip="Uninstall plugin"
                  aria-label="Uninstall plugin"
                  :disabled="!!busy"
                  @click="uninstallPlugin(p)"
                ><SbIcon name="trash-2" :size="13" tone="muted" /></button>
              </div>
              <div v-if="p.description" class="acct-mcp__target acct-mcp__target--text">{{ p.description }}</div>
              <div class="acct-mcp__meta">
                {{ providesText(p) }}<template v-if="p.projectPath"> · {{ p.projectPath }}</template>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Usage ─────────────────────────────────────────────── -->
        <section v-if="usageCards.length" class="acct-section">
          <h3 class="acct-section__title">
            <SbIcon name="chart-no-axes-column" :size="14" tone="muted" />
            Rate limits
            <span v-if="usage._cached" class="acct-chip">cached</span>
          </h3>
          <div class="acct-usage">
            <div v-for="item in usageCards" :key="item.key" class="acct-usage__card">
              <div class="acct-usage__head">
                <span class="acct-usage__label">{{ item.label }}</span>
                <span class="acct-usage__pct">{{ item.pct }}%</span>
              </div>
              <div class="acct-usage__track">
                <div
                  class="acct-usage__fill"
                  :class="{ 'acct-usage__fill--high': item.pct >= 80 }"
                  :style="{ width: Math.max(Math.min(item.pct, 100), 1) + '%' }"
                ></div>
              </div>
              <div v-if="item.reset" class="acct-usage__reset">Resets {{ item.reset }}</div>
            </div>
          </div>
        </section>

        <!-- ── Activity ──────────────────────────────────────────────
             Everything the Stats tab used to show, scoped to this account
             instead of to whichever one happens to be active. -->
        <section class="acct-section">
          <h3 class="acct-section__title">
            <SbIcon name="chart-no-axes-column" :size="14" tone="muted" />
            Activity
            <span class="acct-viewer__spacer"></span>
            <!-- `claude /stats` runs as the active account, so this is only
                 offered on the account it would actually refresh. -->
            <button
              v-if="detail.isActive"
              class="acct-btn"
              :disabled="refreshingStats"
              data-tooltip="Runs claude /stats and /usage to rebuild the cache"
              @click="refreshFromCli"
            >{{ refreshingStats ? 'Refreshing…' : 'Refresh from CLI' }}</button>
          </h3>

          <div v-if="statCards.length" class="acct-stats">
            <div v-for="card in statCards" :key="card.label" class="acct-stats__card">
              <span class="acct-stats__value">{{ card.value }}</span>
              <span class="acct-stats__label">{{ card.label }}</span>
            </div>
          </div>

          <ActivityHeatmap v-if="hasActivity" :daily-map="messageMap" />

          <div v-if="dailyCols.length" class="daily-chart-container">
            <div class="daily-chart-title">Last 30 days</div>
            <div class="daily-chart">
              <div
                v-for="col in dailyCols"
                :key="col.dateStr"
                class="daily-chart-col"
                :title="col.tooltip"
              >
                <div class="daily-chart-bar" :style="{ height: col.tokenPct + '%' }"></div>
                <div class="daily-chart-bar-msgs" :style="{ height: col.msgPct + '%' }"></div>
                <div class="daily-chart-label">{{ col.dayNum }}</div>
              </div>
            </div>
            <div class="daily-chart-legend">
              <span class="daily-chart-legend-dot tokens"></span> Tokens
              <span class="daily-chart-legend-dot msgs"></span> Messages
            </div>
          </div>

          <p v-if="!statCards.length" class="acct-section__hint">No recorded activity for this account yet.</p>
          <p v-else-if="stats?.lastComputedDate" class="acct-section__hint">
            Data sourced from Claude’s stats cache (last updated {{ stats.lastComputedDate }}).
          </p>
        </section>

        <!-- ── Config files ──────────────────────────────────────── -->
        <section class="acct-section">
          <h3 class="acct-section__title">
            <SbIcon name="file-json" :size="14" tone="muted" />
            Configuration
          </h3>

          <p v-if="!detail.files.length" class="acct-section__hint">
            No settings files in this config directory yet — Claude writes them on first run.
          </p>

          <template v-else>
            <div class="acct-tabs">
              <button
                v-for="f in detail.files"
                :key="f.name"
                class="acct-tabs__tab"
                :class="{ 'is-active': f.name === activeFile }"
                @click="openFile(f.name)"
              >
                {{ f.name }}
                <span class="acct-tabs__size">{{ formatBytes(f.size) }}</span>
              </button>
            </div>

            <div v-if="fileError" class="acct-file-error">{{ fileError }}</div>

            <div v-else-if="fileContent !== null" class="acct-file">
              <div class="acct-file__bar">
                <span class="acct-file__path" :title="filePath">{{ filePath }}</span>
                <span v-if="fileTruncated" class="acct-chip acct-chip--warn">truncated</span>
                <button
                  class="acct-copy"
                  :class="{ 'acct-copy--done': copied === 'json' }"
                  @click="copy('json', prettyJson)"
                >
                  <SbIcon :name="copied === 'json' ? 'check' : 'copy'" :size="13" />
                  {{ copied === 'json' ? 'Copied' : 'Copy JSON' }}
                </button>
              </div>
              <pre class="acct-json" v-html="highlightedJson"></pre>
              <button v-if="jsonClipped" class="acct-btn acct-btn--wide" @click="showAllJson = true">
                Show all {{ jsonLineCount.toLocaleString() }} lines
              </button>
            </div>
          </template>

          <!-- Files Claude keeps beside the home directory rather than inside
               the config dir. No tab: the guarded IPC deliberately refuses to
               read outside configDir, so only the path is offered. -->
          <div v-if="externalRows.length" class="acct-path-list">
            <div v-for="row in externalRows" :key="row.path" class="acct-path">
              <span class="acct-path__name">{{ row.name }}</span>
              <span class="acct-path__value" :title="row.path">{{ row.path }}</span>
              <span class="acct-path__meta" title="Outside the config directory — WootonPad offers the path but does not read it.">outside config dir</span>
              <span class="acct-path__meta">{{ formatBytes(row.size) }}</span>
              <button
                class="acct-copy"
                :class="{ 'acct-copy--done': copied === row.path }"
                @click="copy(row.path, row.path)"
              >
                <SbIcon :name="copied === row.path ? 'check' : 'copy'" :size="13" />
                {{ copied === row.path ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import SbIcon from './SbIcon.vue';
import ActivityHeatmap from './ActivityHeatmap.vue';

// ── State ─────────────────────────────────────────────────────────
const accountId = ref(null);
const detail = ref(null);
const stats = ref(null);
const loading = ref(false);
const checking = ref(false);
const refreshingStats = ref(false);
const authResult = ref(null);
const copied = ref(null);
let copyTimer = null;

const activeFile = ref(null);
const fileContent = ref(null);
const filePath = ref('');
const fileTruncated = ref(false);
const fileError = ref('');
const showAllJson = ref(false);

const JSON_PREVIEW_LINES = 500;

// MCP servers and plugins for this account, plus the per-server probe results.
// `statuses` is keyed by inventory id, which is what the check IPC takes.
const mcp = ref(null);
const statuses = ref({});
const checking_ = ref({});
const checkingAll = ref(false);
const showProjectServers = ref(false);
const addOpen = ref(false);
const saving = ref(false);
const formError = ref('');
const form = ref({ name: '', type: 'stdio', command: '', url: '', env: '', headers: '' });

const MCP_LABELS = {
  ok: 'Available',
  auth: 'Needs auth',
  unreachable: 'Unreachable',
  'not-found': 'Not found',
  timeout: 'Timed out',
  error: 'Error',
  unsupported: 'Not checkable',
};

const AUTH_LABELS = {
  authorized: 'Authorized',
  expired: 'Signed out',
  missing: 'No token',
  'rate-limited': 'Rate limited',
  network: 'Network error',
  error: 'API error',
  unknown: 'Unknown',
};

const account = computed(() => detail.value?.account || null);
const usage = computed(() => detail.value?.usage || {});

// ── Paths ─────────────────────────────────────────────────────────
// Files in the config dir, then the ones that live outside it (the default
// account's ~/.claude.json) — copyable either way, readable only inside.
const externalRows = computed(() => detail.value?.externalFiles || []);

// ── Auth ──────────────────────────────────────────────────────────
// A stored expiry in the past is not proof of being signed out — the CLI
// refreshes with the refresh token — so a lapsed token is amber, not green,
// and Check is what settles it.
const tokenChipClass = computed(() => {
  const t = detail.value?.token;
  if (!t?.present) return 'acct-chip--warn';
  return t.expired ? 'acct-chip--warn' : 'acct-chip--ok';
});

const authTone = computed(() => {
  const s = authResult.value?.state;
  if (s === 'authorized') return 'ok';
  if (s === 'expired' || s === 'missing') return 'bad';
  return 'warn';
});

const authIcon = computed(() => (authTone.value === 'ok' ? 'circle-check' : 'triangle-alert'));

// ── MCP servers and plugins ───────────────────────────────────────
const allServers = computed(() => mcp.value?.servers || []);
// Account-wide first: those are the ones "connected to this account" means.
const accountServers = computed(() => allServers.value.filter(s => s.scope !== 'project'));
const projectServers = computed(() => allServers.value.filter(s => s.scope === 'project'));
const plugins = computed(() => mcp.value?.plugins || []);

function serverTarget(s) {
  if (s.url) return s.url;
  return [s.command, ...(s.args || [])].filter(Boolean).join(' ');
}

function statusTone(result) {
  if (result?.state === 'ok') return 'ok';
  if (result?.state === 'auth' || result?.state === 'timeout' || result?.state === 'unsupported') return 'warn';
  return 'bad';
}

function statusChip(result) {
  const tone = statusTone(result);
  return tone === 'ok' ? 'acct-chip--ok' : tone === 'warn' ? 'acct-chip--warn' : 'acct-chip--bad';
}

function providesText(p) {
  const parts = Object.entries(p.provides || {}).map(([what, n]) => `${n} ${what}`);
  if (!parts.length) parts.push('no bundled components');
  return `${p.scope} scope · ${parts.join(', ')}`;
}

async function checkServer(s) {
  if (checking_.value[s.id]) return;
  checking_.value = { ...checking_.value, [s.id]: true };
  try {
    const res = await window.api.checkAccountMcp(accountId.value, s.id);
    statuses.value = { ...statuses.value, [s.id]: res || { state: 'error', message: 'No response.' } };
  } catch (err) {
    statuses.value = { ...statuses.value, [s.id]: { state: 'error', message: err?.message || 'Check failed.' } };
  } finally {
    const { [s.id]: _done, ...rest } = checking_.value;
    checking_.value = rest;
  }
}

// Account-wide servers only, and serially: a probe can spawn a process, and a
// dozen at once on a laptop is a stampede for no gain.
async function checkAll() {
  if (checkingAll.value) return;
  checkingAll.value = true;
  try {
    for (const s of accountServers.value) {
      if (accountId.value == null) break;
      await checkServer(s);
    }
  } finally {
    checkingAll.value = false;
  }
}

// KEY=value / Name: value, one per line — the two shapes people already have
// in front of them when copying a server's setup instructions.
function parsePairs(text, separator) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf(separator);
    if (at <= 0) throw new Error(`Expected "name${separator}value" — got "${trimmed}".`);
    out[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim();
  }
  return out;
}

// Whitespace split, honouring quotes: `npx -y "@acme/mcp server"` is one flag
// and one argument, not three. Nothing here reaches a shell — the parts become
// argv entries.
function splitCommand(text) {
  const parts = String(text || '').match(/"[^"]*"|'[^']*'|\S+/g) || [];
  return parts.map(p => (/^".*"$|^'.*'$/.test(p) ? p.slice(1, -1) : p));
}

async function saveServer() {
  if (saving.value) return;
  formError.value = '';
  const f = form.value;
  let definition;
  try {
    if (f.type === 'stdio') {
      const [command, ...args] = splitCommand(f.command);
      definition = { name: f.name.trim(), type: 'stdio', command: command || '', args, env: parsePairs(f.env, '=') };
    } else {
      definition = { name: f.name.trim(), type: f.type, url: f.url.trim(), headers: parsePairs(f.headers, ':') };
    }
  } catch (err) {
    formError.value = err.message;
    return;
  }

  saving.value = true;
  try {
    const res = await window.api.addAccountMcp(accountId.value, definition);
    if (!res?.ok) {
      formError.value = res?.error || 'Could not save the server.';
      return;
    }
    addOpen.value = false;
    form.value = { name: '', type: 'stdio', command: '', url: '', env: '', headers: '' };
    await loadMcp(accountId.value);
    const added = allServers.value.find(s => s.name === definition.name && s.scope === 'settings');
    if (added) checkServer(added);
  } finally {
    saving.value = false;
  }
}

async function removeServer(s) {
  if (!confirm(`Remove MCP server "${s.name}" from settings.json?`)) return;
  const res = await window.api.removeAccountMcp(accountId.value, s.name);
  if (!res?.ok) {
    alert(res?.error || 'Could not remove the server.');
    return;
  }
  const { [s.id]: _gone, ...rest } = statuses.value;
  statuses.value = rest;
  await loadMcp(accountId.value);
}

// ── Plugin marketplaces ───────────────────────────────────────────
const catalogOpen = ref(false);
const catalogLoading = ref(false);
const catalog = ref([]);
const catalogTotal = ref(0);
const catalogTruncated = ref(false);
const catalogQuery = ref('');
const catalogMarketplace = ref('');
const marketplaces = ref([]);
const marketplaceSource = ref('');
const officialRepo = ref('anthropics/claude-plugins-official');
const officialUrl = ref('https://github.com/anthropics/claude-plugins-official');
// One in flight at a time, keyed by what it is working on: an install clones a
// repository, and two of them racing on the same Claude home is not a state
// worth reasoning about.
const busy = ref(null);
const pluginResult = ref(null);
let catalogTimer = null;

function openUrl(url) {
  if (url) window.api.openExternal(url);
}

function openMarketplace() {
  openUrl(officialUrl.value);
}

async function toggleCatalog() {
  catalogOpen.value = !catalogOpen.value;
  if (catalogOpen.value && !catalog.value.length) await loadCatalog();
}

async function loadCatalog() {
  if (!accountId.value) return;
  catalogLoading.value = true;
  try {
    const res = await window.api.getPluginCatalog(accountId.value, {
      query: catalogQuery.value.trim(),
      marketplace: catalogMarketplace.value,
    });
    if (!res?.ok) return;
    catalog.value = res.plugins || [];
    catalogTotal.value = res.total || 0;
    catalogTruncated.value = !!res.truncated;
    marketplaces.value = res.marketplaces || [];
    if (res.official) {
      officialRepo.value = res.official.repo;
      officialUrl.value = res.official.url;
    }
  } finally {
    catalogLoading.value = false;
  }
}

// Typing filters a couple of hundred entries per keystroke otherwise.
function scheduleCatalogSearch() {
  clearTimeout(catalogTimer);
  catalogTimer = setTimeout(loadCatalog, 200);
}

async function runPluginCommand(key, action, options, describe) {
  if (busy.value) return null;
  busy.value = key;
  pluginResult.value = null;
  try {
    const res = await window.api.pluginCommand(accountId.value, action, options);
    pluginResult.value = res?.ok
      ? { ok: true, message: `${describe} — restart Claude sessions to pick it up.` }
      : { ok: false, message: res?.error || `${describe} failed.` };
    await loadMcp(accountId.value);
    if (catalogOpen.value) await loadCatalog();
    return res;
  } finally {
    busy.value = null;
  }
}

// An install clones a marketplace's source and can run a command the
// marketplace declares, so the source is named before anything runs.
function installPlugin(entry) {
  const where = entry.sourceLabel || entry.marketplace;
  if (!confirm(`Install "${entry.name}" from ${entry.marketplace}?\n\nSource: ${where}\n\nThe Claude CLI will fetch and install it for this account.`)) return;
  return runPluginCommand(entry.key, 'install', { plugin: entry.key, scope: 'user' }, `Installed ${entry.name}`);
}

function uninstallPlugin(p) {
  if (!confirm(`Uninstall "${p.name}" from this account?`)) return;
  return runPluginCommand(p.key, 'uninstall', { plugin: p.key, scope: p.scope }, `Uninstalled ${p.name}`);
}

function setPluginEnabled(p, enabled) {
  return runPluginCommand(
    p.key,
    enabled ? 'enable' : 'disable',
    { plugin: p.key },
    `${enabled ? 'Enabled' : 'Disabled'} ${p.name}`,
  );
}

async function addMarketplace() {
  const source = marketplaceSource.value.trim();
  if (!source) return;
  const res = await runPluginCommand('marketplace', 'add-marketplace', { source }, `Added ${source}`);
  if (res?.ok) marketplaceSource.value = '';
}

async function loadMcp(id) {
  try {
    const res = await window.api.getAccountMcp(id);
    if (accountId.value !== id) return;
    mcp.value = res?.ok ? res : null;
  } catch {
    if (accountId.value === id) mcp.value = null;
  }
}

// ── Usage ─────────────────────────────────────────────────────────
const USAGE_ITEMS = [
  { key: 'session', label: 'Current session', resetKey: 'sessionReset' },
  { key: 'weekAll', label: 'Week (all models)', resetKey: 'weekAllReset' },
  { key: 'weekSonnet', label: 'Week (Sonnet)', resetKey: 'weekSonnetReset' },
  { key: 'weekOpus', label: 'Week (Opus)', resetKey: 'weekOpusReset' },
];

const usageCards = computed(() => {
  const u = usage.value;
  if (!u || u._error || u._rateLimited) return [];
  return USAGE_ITEMS
    .filter(item => u[item.key] !== undefined && u[item.key] !== null)
    .map(item => ({ key: item.key, label: item.label, pct: u[item.key], reset: u[item.resetKey] || null }));
});

// ── Stats ─────────────────────────────────────────────────────────
// Same shape get-stats returns, so the two readings of "how much has this
// account been used" cannot drift apart.
function dailyMessageMap(s) {
  const raw = s?.dailyActivity || {};
  const map = {};
  if (Array.isArray(raw)) {
    for (const e of raw) map[e.date] = e.messageCount || 0;
  } else {
    for (const [date, data] of Object.entries(raw)) {
      map[date] = typeof data === 'number' ? data : (data?.messageCount || data?.messages || data?.count || 0);
    }
  }
  return map;
}

// Both figures in one pass over the year: the run ending today, and the
// longest run anywhere in it.
function streaks(map) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  let current = null;
  let longest = 0;
  let run = 0;
  for (let i = 0; i < 365; i++) {
    if (map[toDateStr(d)] > 0) {
      run++;
    } else {
      if (current === null) current = run;
      if (run > longest) longest = run;
      run = 0;
    }
    d.setDate(d.getDate() - 1);
  }
  if (run > longest) longest = run;
  if (current === null) current = run;
  return { current, longest };
}

function compactTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

const messageMap = computed(() => (stats.value ? dailyMessageMap(stats.value) : {}));
const hasActivity = computed(() => Object.values(messageMap.value).some(n => n > 0));

const statCards = computed(() => {
  const s = stats.value;
  if (!s) return [];
  const map = messageMap.value;
  let messages = 0;
  for (const n of Object.values(map)) messages += n;
  if (s.totalMessages && s.totalMessages > messages) messages = s.totalMessages;
  const sessions = s.totalSessions || Object.keys(map).length;
  if (!sessions && !messages) return [];
  const { current, longest } = streaks(map);
  const cards = [
    { value: sessions.toLocaleString(), label: 'Sessions' },
    { value: messages.toLocaleString(), label: 'Messages' },
    { value: current + 'd', label: 'Current streak' },
    { value: longest + 'd', label: 'Longest streak' },
    { value: Object.keys(map).length.toLocaleString(), label: 'Active days' },
  ];
  // Per-model token totals, only present when `claude /stats` has written its
  // cache — the DB-computed fallback has no token breakdown.
  for (const [model, mu] of Object.entries(s.modelUsage || {})) {
    const shortName = model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
    const tokens = (mu?.inputTokens || 0) + (mu?.outputTokens || 0);
    cards.push({ value: compactTokens(tokens), label: shortName + ' tokens' });
  }
  return cards;
});

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Tokens and messages on the same 30 days, each scaled to its own maximum —
// they differ by three orders of magnitude, so one shared axis would flatten
// the message bars to nothing.
const dailyCols = computed(() => {
  const s = stats.value;
  if (!s) return [];
  const map = messageMap.value;

  const tokenMap = {};
  for (const entry of (Array.isArray(s.dailyModelTokens) ? s.dailyModelTokens : [])) {
    let total = 0;
    for (const count of Object.values(entry.tokensByModel || {})) total += count;
    tokenMap[entry.date] = total;
  }
  const toolMap = {};
  for (const entry of (Array.isArray(s.dailyActivity) ? s.dailyActivity : [])) {
    toolMap[entry.date] = entry.toolCallCount || 0;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(toDateStr(d));
  }

  const tokenValues = days.map(d => tokenMap[d] || 0);
  const msgValues = days.map(d => map[d] || 0);
  if (!msgValues.some(v => v > 0) && !tokenValues.some(v => v > 0)) return [];
  const maxTokens = Math.max(...tokenValues, 1);
  const maxMsgs = Math.max(...msgValues, 1);

  return days.map((dateStr, i) => {
    const d = new Date(dateStr + 'T00:00:00');
    const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return {
      dateStr,
      dayNum: String(d.getDate()),
      tokenPct: Math.max((tokenValues[i] / maxTokens) * 100, tokenValues[i] > 0 ? 3 : 0),
      msgPct: Math.max((msgValues[i] / maxMsgs) * 100, msgValues[i] > 0 ? 3 : 0),
      tooltip: `${dayLabel}\n${compactTokens(tokenValues[i])} tokens\n${msgValues[i]} messages\n${toolMap[dateStr] || 0} tool calls`,
    };
  });
});

// ── JSON rendering ────────────────────────────────────────────────
const prettyJson = computed(() => {
  if (fileContent.value == null) return '';
  try {
    return JSON.stringify(JSON.parse(fileContent.value), null, 2);
  } catch {
    // Not valid JSON (or truncated mid-file) — show it verbatim rather than
    // pretending the file is fine.
    return fileContent.value;
  }
});

const jsonLineCount = computed(() => (prettyJson.value ? prettyJson.value.split('\n').length : 0));
const jsonClipped = computed(() => !showAllJson.value && jsonLineCount.value > JSON_PREVIEW_LINES);

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Token classes only — every value is escaped before a span is wrapped round it.
const JSON_TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

const highlightedJson = computed(() => {
  let text = prettyJson.value;
  if (!text) return '';
  if (jsonClipped.value) {
    text = text.split('\n').slice(0, JSON_PREVIEW_LINES).join('\n') + '\n…';
  }
  return escapeHtml(text).replace(JSON_TOKEN, (m) => {
    let cls = 'num';
    if (m.startsWith('"')) cls = m.endsWith(':') ? 'key' : 'str';
    else if (m === 'true' || m === 'false') cls = 'bool';
    else if (m === 'null') cls = 'null';
    return `<span class="acct-json__${cls}">${m}</span>`;
  });
});

// ── Formatting ────────────────────────────────────────────────────
function formatBytes(n) {
  if (n == null) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatWhen(ms) {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── Actions ───────────────────────────────────────────────────────
async function copy(key, text) {
  try {
    await navigator.clipboard.writeText(text || '');
    copied.value = key;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copied.value = null; }, 1600);
  } catch {}
}

function useAccount() {
  if (account.value) window.__sb?.switchAccount?.(account.value.id);
}

async function openFile(name) {
  activeFile.value = name;
  fileContent.value = null;
  fileError.value = '';
  fileTruncated.value = false;
  showAllJson.value = false;
  const res = await window.api.readAccountConfigFile(accountId.value, name);
  if (activeFile.value !== name) return;
  if (!res?.ok) {
    fileError.value = res?.error ? `Could not read ${name}: ${res.error}` : `Could not read ${name}.`;
    return;
  }
  filePath.value = res.path;
  fileTruncated.value = !!res.truncated;
  fileContent.value = res.content;
}

async function load(id) {
  if (!id) return;
  const changed = id !== accountId.value;
  accountId.value = id;
  if (changed) {
    detail.value = null;
    stats.value = null;
    authResult.value = null;
    activeFile.value = null;
    fileContent.value = null;
    fileError.value = '';
    // Probe results belong to the account they were run against.
    mcp.value = null;
    statuses.value = {};
    checking_.value = {};
    addOpen.value = false;
    formError.value = '';
    showProjectServers.value = false;
    // So does the catalogue: marketplaces are per Claude home.
    catalogOpen.value = false;
    catalog.value = [];
    marketplaces.value = [];
    pluginResult.value = null;
  }
  loading.value = true;
  try {
    const [d, s] = await Promise.all([
      window.api.getAccountDetail(id).catch(() => null),
      window.api.getAccountStats(id).catch(() => null),
      loadMcp(id),
    ]);
    if (accountId.value !== id) return;
    detail.value = d?.ok ? d : null;
    stats.value = s || null;
    const files = detail.value?.files || [];
    if (files.length && !files.some(f => f.name === activeFile.value)) {
      await openFile(files[0].name);
    }
  } finally {
    if (accountId.value === id) loading.value = false;
  }
}

function reload() {
  const id = accountId.value;
  accountId.value = null;
  load(id);
}

// Rebuilds this account's stats-cache.json by running the CLI, then re-reads
// it. Only offered on the active account: `claude /stats` runs as whoever is
// active, so on any other one it would refresh the wrong cache.
async function refreshFromCli() {
  if (refreshingStats.value || !detail.value?.isActive) return;
  refreshingStats.value = true;
  try {
    const result = await window.api.refreshStats();
    if (result?.stats) stats.value = result.stats;
    if (result?.usage && Object.keys(result.usage).length && detail.value) {
      detail.value = { ...detail.value, usage: result.usage };
    }
  } catch {}
  refreshingStats.value = false;
}

async function check() {
  if (!accountId.value || checking.value) return;
  checking.value = true;
  authResult.value = null;
  try {
    const res = await window.api.checkAccountAuth(accountId.value);
    authResult.value = res || { state: 'error', message: 'No response.' };
    if (res?.usage && Object.keys(res.usage).length && detail.value) {
      detail.value = { ...detail.value, usage: res.usage };
    }
  } catch (err) {
    authResult.value = { state: 'network', message: err?.message || 'Check failed.' };
  }
  checking.value = false;
}

defineExpose({ load, reload });
</script>
