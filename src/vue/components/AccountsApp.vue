<template>
  <!-- The shared sidebar block — css/sidebar-blocks.css. The two .project-group
       headers here used to pretend Accounts and Add account were projects; they
       are the block's own title now, the same one every other tab uses. -->
  <div class="sbx-blockpanel">
    <section class="sbx-block sbx-block--fill">
      <header class="sbx-block__head">
        <SbIcon name="users" :size="13" tone="muted" />
        <span class="sbx-block__title">Accounts</span>
        <span class="sbx-block__count">{{ visibleAccounts.length }}</span>
      </header>
      <div class="sbx-block__body sbx-block__body--scroll">
        <!-- Same hint box the projects tab uses for the same situation. -->
        <div v-if="searchQuery && !visibleAccounts.length" class="projects-empty-hint">
          No accounts match “{{ searchQuery }}”.
        </div>
        <div
          v-for="acc in visibleAccounts"
          :key="acc.id"
          class="session-item account-item"
          :class="{ active: acc.id === activeAccountId, 'account-item--selected': acc.id === store.accountViewerId }"
          @click="onSelect(acc)"
        >
          <div class="session-row">
            <div class="account-name-row">
              <template v-if="editingId === acc.id">
                <input
                  class="account-row-name-input"
                  v-model="editName"
                  :ref="el => { if (el) activeEditInput = el }"
                  @blur="saveEdit(acc)"
                  @keydown.enter.prevent="saveEdit(acc)"
                  @keydown.escape="cancelEdit"
                  @click.stop
                />
              </template>
              <template v-else>
                <div class="session-summary" @dblclick.stop="startEdit(acc)">{{ acc.name }}</div>
              </template>
              <div class="account-card-actions">
                <button
                  v-if="editingId !== acc.id"
                  class="account-edit-btn"
                  data-tooltip="Rename"
                  @click.stop="startEdit(acc)"
                ><SbIcon name="pencil" :size="13" tone="muted" /></button>
                <button
                  v-if="acc.id !== activeAccountId"
                  class="account-open-btn"
                  data-tooltip="Make this the active account"
                  @click.stop="onSwitch(acc)"
                >Use</button>
                <button
                  class="account-open-btn"
                  data-tooltip="Open Claude session in home directory"
                  @click.stop="onOpenClaude(acc)"
                >Open Claude</button>
                <button
                  v-if="acc.id !== 'default'"
                  class="account-row-del"
                  data-tooltip="Remove account"
                  @click.stop="onDelete(acc)"
                ><SbIcon name="trash-2" :size="13" tone="muted" /></button>
              </div>
            </div>
            <div class="session-subtitle">{{ acc.configDir || '~/.claude (default)' }}</div>
            <div v-if="hasUsage(acc.id)" class="account-usage-block">
              <div v-for="row in usageRows(acc.id)" :key="row.key" class="account-usage-row">
                <span class="account-usage-label">{{ row.label }}</span>
                <div class="account-usage-bar">
                  <div
                    class="account-usage-bar-fill"
                    :class="{ danger: row.pct >= 90, warn: row.pct >= 70 && row.pct < 90 }"
                    :style="{ width: Math.min(row.pct, 100) + '%' }"
                  ></div>
                </div>
                <span class="account-usage-info">{{ row.pct }}%{{ row.resetIn ? `  · resets in ${row.resetIn}~` : '' }}</span>
              </div>
              <div v-if="usage[acc.id]?._cached" class="account-usage-cached-note">cached data</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="sbx-block sbx-block--fit" :class="{ 'is-collapsed': !addOpen }">
      <header
        class="sbx-block__head sbx-block__head--toggle"
        role="button"
        tabindex="0"
        :aria-expanded="addOpen"
        @click="addOpen = !addOpen"
        @keydown.enter.prevent="addOpen = !addOpen"
        @keydown.space.prevent="addOpen = !addOpen"
      >
        <SbIcon
          name="chevron-down"
          :size="12"
          tone="muted"
          class="sbx-block__chevron"
          :class="{ 'is-collapsed': !addOpen }"
        />
        <span class="sbx-block__title">Add account</span>
      </header>
      <div v-show="addOpen" class="sbx-block__body sbx-block__body--scroll accounts-add-section">
        <p class="accounts-add-desc">Each account uses its own Claude credentials and session history. Add a second account to switch between personal and work Claude Pro plans, or any two separate logins.</p>
        <div class="accounts-add-form">
          <input
            v-model="newName"
            placeholder="Account name (e.g. Work / Personal)"
            @keydown.enter="addAccount"
          />
          <div class="text-center">
            <button class="btn-green" :disabled="adding" @click="addAccount">
              {{ adding ? 'Adding…' : 'Add account' }}
            </button>
          </div>
        </div>

        <div v-if="wslHomes.length" class="accounts-add-form accounts-wsl-section">
          <p class="accounts-add-desc">
            Claude also runs inside WSL. Attach an account to a distribution to browse
            the sessions it stores there, alongside the ones on Windows.
          </p>
          <div v-for="home in wslHomes" :key="home.distro" class="accounts-wsl-row">
            <span class="accounts-wsl-name">{{ home.distro }}</span>
            <span class="accounts-wsl-path">{{ home.claudePosix }}</span>
            <button
              class="btn-green"
              :disabled="addingWsl === home.distro || hasWslAccount(home.distro)"
              @click="addWslAccount(home)"
            >
              {{ hasWslAccount(home.distro) ? 'Added' : (addingWsl === home.distro ? 'Adding…' : 'Attach') }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue';
import { store } from '../store.js';
import SbIcon from './SbIcon.vue';

const props = defineProps({
  callbacks: { type: Object, required: true },
});

const accounts = ref([]);
const searchQuery = ref('');

// An account is a name over a config directory, and both are on the row — so
// both are what the command bar searches here. Nothing else about an account
// is text.
const visibleAccounts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return accounts.value;
  return accounts.value.filter(acc =>
    String(acc.name || '').toLowerCase().includes(q)
    || String(acc.configDir || '').toLowerCase().includes(q)
  );
});
const activeAccountId = ref('default');
const usage = ref({});
const editingId = ref(null);
const editName = ref('');
let activeEditInput = null;
const newName = ref('');
const adding = ref(false);
const addOpen = ref(false);
// Distributions holding a reachable Claude home. Empty off Windows, and empty
// when no distribution has one — the section stays hidden in both cases.
const wslHomes = ref([]);
const addingWsl = ref(null);
// Probing starts a distribution, so it happens once per window rather than on
// every accounts refresh — including when the answer is "none".
let wslHomesLoaded = false;

function hasUsage(id) {
  const u = usage.value[id];
  if (!u || u._error || u._rateLimited) return false;
  return u.session != null || u.weekAll != null;
}

function usageRows(id) {
  const u = usage.value[id] || {};
  const rows = [];
  if (u.session != null) rows.push({ key: 'session', label: '5h', pct: u.session, resetIn: u.sessionResetIn });
  if (u.weekAll != null) rows.push({ key: 'weekAll', label: '7d', pct: u.weekAll, resetIn: u.weekAllResetIn });
  return rows;
}

async function startEdit(acc) {
  editingId.value = acc.id;
  editName.value = acc.name;
  activeEditInput = null;
  await nextTick();
  activeEditInput?.focus();
  activeEditInput?.select();
}

async function saveEdit(acc) {
  if (editingId.value !== acc.id) return;
  editingId.value = null;
  const newN = editName.value.trim() || acc.name;
  if (newN !== acc.name) {
    acc.name = newN;
    await props.callbacks.renameAccount?.(acc.id, newN);
  }
}

function cancelEdit() {
  editingId.value = null;
}

// Picking a row opens its detail panel in the main area. Switching the active
// account re-scans every project, so it stays an explicit action ("Use") rather
// than a side effect of looking at an account.
function onSelect(acc) {
  props.callbacks.openAccountViewer?.(acc.id);
}

async function onSwitch(acc) {
  if (acc.id !== activeAccountId.value) {
    await props.callbacks.switchAccount?.(acc.id);
  }
}

function onOpenClaude(acc) {
  props.callbacks.openAccountHomeSession?.(acc);
}

async function onDelete(acc) {
  if (!confirm(`Remove account "${acc.name}"?`)) return;
  props.callbacks.deleteAccount?.(acc.id);
}

async function addAccount() {
  const name = newName.value.trim();
  if (!name) return;
  adding.value = true;
  const newAcc = await props.callbacks.createAccount?.(name);
  adding.value = false;
  if (newAcc) newName.value = '';
}

function hasWslAccount(distro) {
  return accounts.value.some(a => a.wslDistro === distro);
}

async function addWslAccount(home) {
  addingWsl.value = home.distro;
  try {
    const created = await props.callbacks.createWslAccount?.(home.distro);
    if (created?.error) alert(created.error);
  } finally {
    addingWsl.value = null;
  }
}

async function loadWslHomes() {
  if (wslHomesLoaded) return;
  wslHomesLoaded = true;
  try {
    wslHomes.value = (await props.callbacks.discoverWslClaudeHomes?.()) || [];
  } catch {
    wslHomes.value = [];
  }
}

defineExpose({
  setAccounts(list, activeId) {
    accounts.value = list;
    store.accounts = list || [];
    if (activeId !== undefined) {
      activeAccountId.value = activeId;
      store.activeAccountId = activeId;
    }
    loadWslHomes();
  },
  setActiveAccount(id) { activeAccountId.value = id; store.activeAccountId = id; },
  setUsage(usageObj) { usage.value = { ...usageObj }; },
  setSearch(q) { searchQuery.value = q || ''; },
});

</script>
