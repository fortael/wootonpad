<template>
  <button class="account-btn-vue" data-tooltip="Switch account" @click.stop="toggle">
    <span class="account-btn-dot"></span>
    <span class="account-btn-name">{{ activeName }}</span>
    <span class="account-btn-chips">
      <span v-for="chip in activeChips" :key="chip.key" class="account-chip">
        <UsageRing v-if="chip.pct != null" :value="chip.pct" :size="12" :label="chip.title" />
        {{ chip.text }}
      </span>
    </span>
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 1l4 4 4-4"/>
    </svg>
  </button>

  <div v-if="open" class="account-dropdown-vue">
    <div
      v-for="acc in accounts"
      :key="acc.id"
      class="acct-dd-item"
      :class="{ active: acc.id === activeAccountId }"
      @click="onSwitch(acc.id)"
    >
      <span class="acct-dd-dot"></span>
      <span class="acct-dd-name">{{ acc.name }}</span>
      <span class="acct-dd-chips">
        <span v-for="chip in chips(acc.id)" :key="chip.key" class="account-chip">
          <UsageRing v-if="chip.pct != null" :value="chip.pct" :size="12" :label="chip.title" />
          {{ chip.text }}
        </span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import UsageRing from './UsageRing.vue';
import { store } from '../store.js';
import { resetsIn, WINDOW_LABEL, WINDOWS } from '../rate-limits.js';

const props = defineProps({
  callbacks: { type: Object, required: true },
});

const accounts = ref([]);
const activeAccountId = ref('default');
const usage = ref({});
const open = ref(false);

const activeName = computed(() => {
  const acc = accounts.value.find(a => a.id === activeAccountId.value);
  return acc?.name ?? 'Default';
});

const activeChips = computed(() => chips(activeAccountId.value));

// [{ key, text, pct, title }] — pct drives the ring, text stays so the exact
// number is readable without hovering.
//
// The plan's own windows come first when they are known: they are what the CLI
// itself reports (see rate-limits.js) and they cover both the 5-hour and the
// 7-day limit, where the cached `usage` only ever knew the 5-hour one and only
// as of the last time `claude /stats` was run.
//
// Only for the active account — a limit is reported by a session, and only the
// active account has any.
function chips(id) {
  if (id === activeAccountId.value) {
    const live = planChips.value;
    if (live.length) return live;
  }
  const u = usage.value[id];
  if (!u || u._error || u._rateLimited) return [];
  const out = [];
  if (u.session != null) {
    out.push({
      key: 'session',
      text: `${u.session}% 5h`,
      pct: u.session,
      title: `${u.session}% of the 5-hour limit used`,
    });
  }
  return out;
}

/** One chip per window, tightest first — the one you will hit is the one to read. */
const planChips = computed(() => {
  const limits = store.rateLimits;
  const windows = limits?.windows;
  if (!windows) return [];
  const taken = new Date(limits.updatedAt).toLocaleTimeString();
  return WINDOWS
    .filter(name => windows[name])
    .map((name) => {
      const w = windows[name];
      const left = resetsIn(w.resetsAt);
      const full = name === 'five_hour' ? '5-hour' : '7-day';
      return {
        key: name,
        text: `${w.utilization}% ${WINDOW_LABEL[name]}`,
        pct: w.utilization,
        title: `${w.utilization}% of the ${full} limit used`
          + (left ? `, resets in ${left}` : '')
          + `\nAs of ${taken}`,
      };
    })
    .sort((a, b) => b.pct - a.pct);
});

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

async function onSwitch(id) {
  close();
  if (id !== activeAccountId.value) {
    await props.callbacks.switchAccount?.(id);
  }
}

function onDocumentClick() {
  close();
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
});

defineExpose({
  setAccounts(list, activeId, usageObj) {
    accounts.value = list;
    if (activeId !== undefined) activeAccountId.value = activeId;
    if (usageObj !== undefined) usage.value = usageObj;
  },
  setActiveAccount(id) { activeAccountId.value = id; },
  setUsage(usageObj) { usage.value = { ...usageObj }; },
  close,
});
</script>
