<template>
  <div class="us" :class="{ 'us--project': projectMode }">
    <div class="us-toolbar">
      <div class="us-seg" role="tablist" aria-label="Range">
        <button
          v-for="r in RANGES"
          :key="r.id"
          type="button"
          class="us-seg__btn"
          :class="{ 'is-on': range === r.id }"
          @click="setRange(r.id)"
        >{{ r.label }}</button>
      </div>
      <select v-if="!projectMode" v-model="filterKey" class="us-select" aria-label="Project">
        <option value="">All projects</option>
        <option v-for="p in rankedProjects" :key="p.key" :value="p.key">{{ labelOf(p.key) }}</option>
      </select>
      <span class="us-spacer"></span>
      <span v-if="loading && data" class="us-status">Updating…</span>
      <button
        type="button"
        class="us-icon-btn"
        :class="{ 'is-spinning': loading }"
        data-tooltip="Re-read transcripts and the plan's meters"
        aria-label="Refresh usage"
        @click="load"
      ><SbIcon name="refresh-cw" :size="13" tone="muted" /></button>
    </div>

    <div v-if="error" class="us-note us-note--error">Could not read usage: {{ error }}</div>
    <div v-else-if="!data" class="us-note">Reading transcripts…</div>

    <template v-else>
      <!-- ── Totals ──────────────────────────────────────────── -->
      <div class="us-cards">
        <div class="us-cards__card" :data-tooltip="tokenBreakdown">
          <span class="us-cards__value">{{ compactTokens(shown.tokens) }}</span>
          <span class="us-cards__label">Tokens</span>
        </div>
        <div class="us-cards__card" data-tooltip="Estimated: percentage points of 5-hour windows. 250% is two and a half windows' worth.">
          <span class="us-cards__value">{{ hasReadings ? pct(shown.fiveHour) : '—' }}</span>
          <span class="us-cards__label">5h limit used</span>
        </div>
        <div class="us-cards__card" data-tooltip="Estimated: percentage points of the weekly limit.">
          <span class="us-cards__value">{{ hasReadings ? pct(shown.sevenDay) : '—' }}</span>
          <span class="us-cards__label">Weekly limit used</span>
        </div>
        <div class="us-cards__card" data-tooltip="What these tokens would cost at API prices — also the weight each message gets when a rise of the meter is split between projects.">
          <span class="us-cards__value">{{ dollars(shown.cost) }}</span>
          <span class="us-cards__label">API-equivalent</span>
        </div>
        <div class="us-cards__card">
          <span class="us-cards__value">{{ shownSessions.toLocaleString() }}</span>
          <span class="us-cards__label">Sessions · {{ shown.messages.toLocaleString() }} replies</span>
        </div>
      </div>

      <!-- ── Limit over time ─────────────────────────────────── -->
      <div class="us-card">
        <div class="us-card__head">
          <span class="us-card__title">{{ windowKind === 'five_hour' ? '5-hour limit over time' : 'Weekly limit over time' }}</span>
          <span class="us-spacer"></span>
          <div class="us-seg us-seg--small">
            <button type="button" class="us-seg__btn" :class="{ 'is-on': windowKind === 'five_hour' }" @click="setWindow('five_hour')">5-hour</button>
            <button type="button" class="us-seg__btn" :class="{ 'is-on': windowKind === 'seven_day' }" @click="setWindow('seven_day')">Weekly</button>
          </div>
        </div>
        <p class="us-hint">
          Observed percentage used across the account. Select a point to see which sessions moved it.
          Gaps and resets are not joined.
          <template v-if="activeKey">
            <span class="us-legend-dot" :style="{ background: colorOf(activeKey) }"></span>
            is {{ labelOf(activeKey) }}’s estimated share of each window.
          </template>
        </p>

        <UsageTimeline
          v-if="points.length"
          :points="points"
          :from="data.from"
          :to="data.to"
          :project-key="activeKey"
          :project-label="labelOf(activeKey)"
          :project-color="colorOf(activeKey)"
          :selected-ts="selected?.ts || 0"
          @select="selectPoint"
        />
        <div v-else class="us-note">
          No readings of this limit in this range.
          <template v-if="!data.observedSince">They are recorded while WootonPad runs — the plan API keeps no history.</template>
        </div>

        <!-- What moved the meter between two readings -->
        <div v-if="selected" class="us-detail">
          <div class="us-detail__head">
            <span>{{ dateTime(selected.from) }} → {{ timeOfDay(selected.ts) }}</span>
            <b>+{{ pct(selected.delta) }}</b>
            <span class="us-muted">now {{ pct(selected.utilization) }}</span>
            <span class="us-spacer"></span>
            <button type="button" class="us-icon-btn" aria-label="Close" @click="selected = null">
              <SbIcon name="x" :size="12" tone="muted" />
            </button>
          </div>
          <div v-if="intervalLoading" class="us-muted">Loading…</div>
          <template v-else>
            <div
              v-for="s in intervalRows"
              :key="s.sessionId || s.key"
              class="us-detail__row"
              :class="{ 'is-link': canOpen(s) }"
              @click="openSession(s)"
            >
              <span class="us-legend-dot" :style="{ background: colorOf(s.key) }"></span>
              <span class="us-detail__title">{{ s.title || 'Untitled session' }}</span>
              <span class="us-muted">{{ labelOf(s.key) }}</span>
              <span class="us-spacer"></span>
              <span class="us-num">{{ compactTokens(s.tokens) }} tok</span>
              <span class="us-num us-num--strong">≈+{{ pct(s.share * selected.delta) }}</span>
            </div>
            <div v-if="selectedElsewhere" class="us-detail__row">
              <span class="us-legend-dot" :style="{ background: ELSEWHERE_COLOR }"></span>
              <span class="us-detail__title">Outside this app</span>
              <span class="us-muted">claude.ai, another machine</span>
              <span class="us-spacer"></span>
              <span class="us-num us-num--strong">+{{ pct(selectedElsewhere) }}</span>
            </div>
            <div v-if="!intervalRows.length && !selectedElsewhere" class="us-muted">
              {{ selected.delta > 0 ? 'Nothing was sent from here in this interval.' : 'The meter did not move.' }}
            </div>
          </template>
        </div>
      </div>

      <!-- ── Per day / hour ──────────────────────────────────── -->
      <div class="us-card">
        <div class="us-card__head">
          <span class="us-card__title">{{ data.bucket === 'hour' ? 'By hour' : 'By day' }}</span>
          <span class="us-spacer"></span>
          <div class="us-seg us-seg--small">
            <button
              v-for="(m, id) in METRICS"
              :key="id"
              type="button"
              class="us-seg__btn"
              :class="{ 'is-on': metric === id }"
              @click="setMetric(id)"
            >{{ m.label }}</button>
          </div>
        </div>
        <UsageBars
          :buckets="data.buckets"
          :bucket="data.bucket"
          :series="barSeries"
          :format="METRICS[metric].format"
          :selected-index="selectedBucket"
          @select="selectedBucket = $event"
        />
        <div v-if="!projectMode && !activeKey && barSeries.length > 1" class="us-legend">
          <span v-for="s in barSeries" :key="s.key" class="us-legend__item">
            <span class="us-legend-dot" :style="{ background: s.color }"></span>{{ s.label }}
          </span>
        </div>
        <p v-if="METRICS[metric].limit && !hasReadings" class="us-hint">
          No limit readings yet for this account — they start with the first one WootonPad takes.
        </p>
      </div>

      <!-- ── Projects ─────────────────────────────────────────── -->
      <div v-if="!projectMode" class="us-card">
        <div class="us-card__head">
          <span class="us-card__title">Projects</span>
          <span v-if="selectedBucket >= 0" class="us-chip">
            {{ bucketLabel(selectedBucket) }}
            <button type="button" aria-label="Whole range" @click="selectedBucket = -1">×</button>
          </span>
        </div>
        <table class="us-table">
          <thead>
            <tr>
              <th>Project</th>
              <th class="us-num">Tokens</th>
              <th class="us-num">5h limit</th>
              <th class="us-num">Weekly</th>
              <th class="us-num">API cost</th>
              <th class="us-num">Sessions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in projectRows"
              :key="row.key"
              class="is-link"
              :class="{ 'is-active': row.key === filterKey }"
              @click="filterKey = row.key === filterKey ? '' : row.key"
            >
              <td>
                <span class="us-legend-dot" :style="{ background: colorOf(row.key) }"></span>
                <span class="us-table__name" :title="data.labels[row.key]?.path || ''">{{ labelOf(row.key) }}</span>
                <span v-if="kindOf(row.key) !== 'project'" class="us-kind">{{ kindOf(row.key) }}</span>
              </td>
              <td class="us-num">{{ compactTokens(row.t.tokens) }}</td>
              <td class="us-num">{{ hasReadings ? pct(row.t.fiveHour) : '—' }}</td>
              <td class="us-num">{{ hasReadings ? pct(row.t.sevenDay) : '—' }}</td>
              <td class="us-num">{{ dollars(row.t.cost) }}</td>
              <td class="us-num">{{ row.sessions ?? '' }}</td>
            </tr>
            <tr v-if="elsewhereRow" class="us-table__muted">
              <td>
                <span class="us-legend-dot" :style="{ background: ELSEWHERE_COLOR }"></span>
                <span class="us-table__name">Outside this app</span>
              </td>
              <td class="us-num">—</td>
              <td class="us-num">{{ pct(elsewhereRow.fiveHour) }}</td>
              <td class="us-num">{{ pct(elsewhereRow.sevenDay) }}</td>
              <td class="us-num">—</td>
              <td class="us-num"></td>
            </tr>
            <tr v-if="!projectRows.length">
              <td colspan="6" class="us-muted">Nothing sent in this range.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── Sessions ─────────────────────────────────────────── -->
      <div v-if="projectMode || activeKey" class="us-card">
        <div class="us-card__head">
          <span class="us-card__title">Sessions</span>
          <span class="us-muted">in the whole range</span>
        </div>
        <table class="us-table">
          <thead>
            <tr>
              <th>Session</th>
              <th class="us-num">Tokens</th>
              <th class="us-num">5h limit</th>
              <th class="us-num">Weekly</th>
              <th class="us-num">API cost</th>
              <th class="us-num">Last reply</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in sessionRows"
              :key="s.sessionId"
              :class="{ 'is-link': canOpen(s) }"
              @click="openSession(s)"
            >
              <td><span class="us-table__name">{{ s.title || 'Untitled session' }}</span></td>
              <td class="us-num">{{ compactTokens(s.totals.tokens) }}</td>
              <td class="us-num">{{ hasReadings ? pct(s.totals.fiveHour) : '—' }}</td>
              <td class="us-num">{{ hasReadings ? pct(s.totals.sevenDay) : '—' }}</td>
              <td class="us-num">{{ dollars(s.totals.cost) }}</td>
              <td class="us-num us-muted">{{ dateTime(s.lastTs) }}</td>
            </tr>
            <tr v-if="!sessionRows.length">
              <td colspan="6" class="us-muted">No sessions in this range.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="us-hint us-footnote">
        Tokens come from the session transcripts, subagents included. Limit shares are estimates: each rise of the
        meter is split between the replies sent since the previous reading, weighted by API price.
        <template v-if="data.observedSince">Readings recorded since {{ dateTime(data.observedSince) }}.</template>
      </p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import SbIcon from './SbIcon.vue';
import UsageTimeline from './UsageTimeline.vue';
import UsageBars from './UsageBars.vue';
import {
  compactTokens, pct, dollars, dateTime, timeOfDay, dayLabel,
  SERIES_COLORS, OTHER_COLOR, ELSEWHERE_COLOR, ELSEWHERE_KEY, METRICS,
} from '../usage-format.js';
import { projectKeyFor } from '../../../usage-ledger.js';

const props = defineProps({
  // null = the active account
  accountId: { type: String, default: null },
  // Set on a project page: everything is about this one project.
  projectPath: { type: String, default: '' },
  // Whether a session row opens the session — only the active account's can.
  sessionsOpenable: { type: Boolean, default: true },
});

const RANGES = [
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
];

function remembered(key, fallback, allowed) {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function remember(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

const projectMode = computed(() => Boolean(props.projectPath));
const range = ref(remembered('usageStats.range', '7d', RANGES.map(r => r.id)));
const windowKind = ref(remembered('usageStats.window', 'five_hour', ['five_hour', 'seven_day']));
const metric = ref(remembered('usageStats.metric', 'tokens', Object.keys(METRICS)));
const filterKey = ref('');
const data = ref(null);
const loading = ref(false);
const error = ref('');
const selected = ref(null);
const selectedBucket = ref(-1);
const interval = ref(null);
const intervalLoading = ref(false);

let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  loading.value = true;
  error.value = '';
  try {
    const res = await window.api.getUsageStats(props.accountId || null, { range: range.value });
    if (seq !== loadSeq) return;
    if (!res?.ok) {
      error.value = res?.error || 'unknown error';
      return;
    }
    data.value = res;
    // A point or bucket from the previous answer may not exist in this one.
    selected.value = null;
    selectedBucket.value = -1;
  } catch (err) {
    if (seq === loadSeq) error.value = err?.message || String(err);
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

onMounted(load);
watch(() => props.accountId, () => {
  data.value = null;
  filterKey.value = '';
  load();
});

function setRange(id) {
  if (range.value === id) return;
  range.value = id;
  remember('usageStats.range', id);
  load();
}
function setWindow(kind) {
  windowKind.value = kind;
  remember('usageStats.window', kind);
  selected.value = null;
}
function setMetric(id) {
  metric.value = id;
  remember('usageStats.metric', id);
}

// ── Keys, labels, colours ─────────────────────────────────────────
// On a project page the key is the project itself. Worktrees are folded into
// the project they came from on the main side, so a worktree's own page asks
// for that project too.
const activeKey = computed(() => (projectMode.value ? projectKeyFor(props.projectPath) : filterKey.value));

const rankedProjects = computed(() => data.value?.projects || []);
const colorIndex = computed(() => {
  const map = new Map();
  rankedProjects.value.forEach((p, i) => { if (i < SERIES_COLORS.length) map.set(p.key, SERIES_COLORS[i]); });
  return map;
});

function labelOf(key) {
  if (!key) return '';
  if (key === ELSEWHERE_KEY) return 'Outside this app';
  return data.value?.labels?.[key]?.label || String(key).split(/[\\/]/).filter(Boolean).pop() || key;
}
function kindOf(key) {
  return data.value?.labels?.[key]?.kind || 'project';
}
function colorOf(key) {
  if (projectMode.value) return 'var(--indigo-400)';
  if (key === ELSEWHERE_KEY) return ELSEWHERE_COLOR;
  return colorIndex.value.get(key) || OTHER_COLOR;
}

// ── Totals ────────────────────────────────────────────────────────
const EMPTY = { tokens: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0, fiveHour: 0, sevenDay: 0, messages: 0 };
const activeProject = computed(() => rankedProjects.value.find(p => p.key === activeKey.value) || null);

const shown = computed(() => {
  if (!data.value) return EMPTY;
  if (activeKey.value) return activeProject.value?.totals || EMPTY;
  return data.value.total;
});
const shownSessions = computed(() => {
  if (!data.value) return 0;
  if (activeKey.value) return activeProject.value?.sessionCount || 0;
  return data.value.sessions.length;
});
const tokenBreakdown = computed(() => {
  const t = shown.value;
  return `Input ${compactTokens(t.input)} · output ${compactTokens(t.output)} · cache writes ${compactTokens(t.cacheWrite)} · cache reads ${compactTokens(t.cacheRead)}`;
});
const hasReadings = computed(() => Boolean(data.value?.observedSince));

// ── Timeline ──────────────────────────────────────────────────────
const points = computed(() => data.value?.timeline?.[windowKind.value] || []);

async function selectPoint(p) {
  if (selected.value?.ts === p.ts) {
    selected.value = null;
    return;
  }
  selected.value = p;
  interval.value = null;
  intervalLoading.value = true;
  try {
    const res = await window.api.getUsageInterval(props.accountId || null, p.from, p.ts);
    if (selected.value?.ts !== p.ts) return;
    interval.value = res?.ok ? res : null;
    if (res?.labels && data.value) data.value.labels = { ...res.labels, ...data.value.labels };
  } finally {
    if (selected.value?.ts === p.ts) intervalLoading.value = false;
  }
}

const intervalRows = computed(() => {
  const rows = interval.value?.sessions || [];
  return activeKey.value ? rows.filter(s => s.key === activeKey.value) : rows;
});
const selectedElsewhere = computed(() => (activeKey.value ? 0 : selected.value?.byKey?.[ELSEWHERE_KEY] || 0));

// ── Bars ──────────────────────────────────────────────────────────
const barSeries = computed(() => {
  const d = data.value;
  if (!d) return [];
  const field = METRICS[metric.value].field;
  const n = d.buckets.length;
  if (activeKey.value) {
    const p = activeProject.value;
    return [{ key: activeKey.value, label: labelOf(activeKey.value), color: colorOf(activeKey.value), values: p ? p.series.map(t => t[field]) : new Array(n).fill(0) }];
  }
  const out = [];
  const other = new Array(n).fill(0);
  rankedProjects.value.forEach((p, i) => {
    if (i < SERIES_COLORS.length) out.push({ key: p.key, label: labelOf(p.key), color: colorOf(p.key), values: p.series.map(t => t[field]) });
    else p.series.forEach((t, j) => { other[j] += t[field]; });
  });
  if (other.some(v => v > 0)) out.push({ key: '__other__', label: 'Other projects', color: OTHER_COLOR, values: other });
  if (METRICS[metric.value].limit) {
    const elsewhere = d.elsewhere.series.map(t => t[field]);
    if (elsewhere.some(v => v > 0)) out.push({ key: ELSEWHERE_KEY, label: 'Outside this app', color: ELSEWHERE_COLOR, values: elsewhere });
  }
  return out;
});

function bucketLabel(i) {
  const b = data.value?.buckets?.[i];
  if (!b) return '';
  return data.value.bucket === 'hour' ? `${dayLabel(b.start)}, ${timeOfDay(b.start)}` : dayLabel(b.start);
}

// ── Tables ────────────────────────────────────────────────────────
const projectRows = computed(() => {
  const i = selectedBucket.value;
  return rankedProjects.value
    .map(p => ({ key: p.key, t: i >= 0 ? p.series[i] : p.totals, sessions: i >= 0 ? null : p.sessionCount }))
    .filter(r => r.t.messages > 0);
});
const elsewhereRow = computed(() => {
  const e = data.value?.elsewhere;
  if (!e) return null;
  const t = selectedBucket.value >= 0 ? e.series[selectedBucket.value] : e.totals;
  return t && (t.fiveHour > 0 || t.sevenDay > 0) ? t : null;
});

const sessionRows = computed(() => (data.value?.sessions || []).filter(s => s.key === activeKey.value).slice(0, 50));

// Sessions of the active account can be opened; Buddy's and another
// account's cannot — the session list does not hold them.
function canOpen(s) {
  return props.sessionsOpenable && Boolean(s.sessionId) && s.key !== 'buddy';
}
function openSession(s) {
  if (!canOpen(s)) return;
  window.__sb?.openSessionById?.(s.sessionId);
}

defineExpose({ reload: load });
</script>
