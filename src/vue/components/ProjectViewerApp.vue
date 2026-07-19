<template>
  <div class="pv-root" v-if="project">

    <!-- ── Diff / File view (full-screen overlay) ──────────────────── -->
    <template v-if="activeDiff || activeFile">
      <div class="pv-diff-nav">
        <button class="pv-nav-btn pv-nav-back" @click="closeOverlay">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <span class="pv-nav-file">
          <span class="pv-nav-filename">{{ overlayTitle }}</span>
          <span class="pv-nav-filepath">{{ overlayPath }}</span>
        </span>
        <template v-if="activeDiff">
          <div class="pv-nav-arrows">
            <button class="pv-nav-btn" @click="prevFile" :disabled="currentFileIndex <= 0" title="Previous file">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span class="pv-nav-counter">{{ currentFileIndex + 1 }} / {{ changedFiles.length }}</span>
            <button class="pv-nav-btn" @click="nextFile" :disabled="currentFileIndex >= changedFiles.length - 1" title="Next file">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </template>
        <template v-if="activeFile">
          <button class="pv-nav-btn pv-save-btn" @click="saveFile" :disabled="!fileModified || fileSaving">
            {{ fileSaving ? 'Saving…' : 'Save' }}
          </button>
        </template>
      </div>
      <div ref="diffContainerRef" class="pv-diff-container"></div>
    </template>

    <!-- ── Main panel ─────────────────────────────────────────────── -->
    <template v-else>
      <!-- Header -->
      <div class="pv-header">
        <span class="pv-avatar" :style="{ background: avatar.color }">{{ avatar.initials }}</span>
        <div class="pv-title-wrap">
          <div class="pv-name">
            {{ projectName }}
            <span v-if="unpushedCount" class="pv-header-unpushed-badge" :title="`${unpushedCount} unpushed commit${unpushedCount > 1 ? 's' : ''}`">{{ unpushedCount }}</span>
          </div>
          <div class="pv-path">{{ viewedPath }}</div>
        </div>
        <button class="pv-new-btn" @click="newSession">+ New session</button>
      </div>

      <!-- Worktree switcher -->
      <div v-if="worktrees.length" class="pv-worktree-bar">
        <button
          class="pv-wt-btn"
          :class="{ active: viewedPath === project.projectPath }"
          @click="setViewedPath(project.projectPath)"
        >main</button>
        <button
          v-for="wt in worktrees" :key="wt.projectPath"
          class="pv-wt-btn"
          :class="{ active: viewedPath === wt.projectPath }"
          @click="setViewedPath(wt.projectPath)"
        >{{ wt.name }}</button>
      </div>

      <!-- Tabs -->
      <div class="pv-tabs">
        <button v-for="t in TABS" :key="t.id" class="pv-tab" :class="{ active: activeTab === t.id }" @click="activeTab = t.id">{{ t.label }}</button>
      </div>

      <div class="pv-tab-body">
        <div v-if="loading" class="pv-loading">Loading…</div>

        <!-- ── OVERVIEW TAB ──────────────────────────────────────── -->
        <template v-else-if="activeTab === 'overview' && detail">
          <!-- Git toolbar -->
          <div class="pv-git-toolbar">
            <div class="pv-branch-wrap">
              <svg class="pv-branch-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
              <select class="pv-branch-select" :value="detail.branch" @change="switchBranch($event.target.value)" :disabled="gitBusy">
                <optgroup label="Local">
                  <option v-for="b in branches" :key="b" :value="b">{{ b }}</option>
                </optgroup>
                <optgroup v-if="remoteBranches.length" label="Remote">
                  <option v-for="b in remoteBranches" :key="b" :value="b">{{ b }}</option>
                </optgroup>
              </select>
            </div>
            <button class="pv-git-btn" @click="doFetch" :disabled="gitBusy" title="git fetch --prune">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Fetch
            </button>
            <button class="pv-git-btn" @click="doPull" :disabled="gitBusy" title="git pull">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
              Pull
            </button>
            <span v-if="gitMessage" class="pv-git-msg" :class="{ error: gitError }">{{ gitMessage }}</span>
            <span v-if="detail.totalAdded || detail.totalDeleted" class="pv-git-stats">
              <span class="pv-added" v-if="detail.totalAdded">+{{ detail.totalAdded }}</span>
              <span class="pv-deleted" v-if="detail.totalDeleted">−{{ detail.totalDeleted }}</span>
            </span>
          </div>

          <div class="pv-overview-grid">
            <!-- Left: changed files + commit -->
            <div class="pv-col-left">
              <!-- Changed files -->
              <div class="pv-card" v-if="detail.changedFiles.length">
                <div class="pv-card-title">
                  <span>Uncommitted changes</span>
                  <span class="pv-count-badge">{{ detail.changedFiles.length }}</span>
                </div>
                <div class="pv-file-list">
                  <div
                    v-for="f in detail.changedFiles" :key="f.file"
                    class="pv-file-row pv-file-row--clickable"
                    :class="{ loading: loadingFile === f.file }"
                    @click="openDiff(f.file)" :title="f.file"
                  >
                    <span class="pv-file-status" :class="fileStatus(f)">{{ fileStatusChar(f) }}</span>
                    <span class="pv-file-name">{{ f.file }}</span>
                    <span class="pv-file-diff">
                      <span v-if="f.added" class="pv-added">+{{ f.added }}</span>
                      <span v-if="f.deleted" class="pv-deleted">−{{ f.deleted }}</span>
                    </span>
                  </div>
                </div>
              </div>
              <div class="pv-card pv-empty-changes" v-else>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:.3"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Working tree clean</span>
              </div>

              <!-- Commit panel -->
              <div class="pv-card pv-commit-card">
                <div class="pv-card-title">Commit</div>
                <div v-if="generating" class="pv-generating-wrap">
                  <span class="pv-generating-text">Generating…</span>
                </div>
                <textarea
                  v-else
                  class="pv-commit-input"
                  placeholder="Commit message…"
                  v-model="commitMessage"
                  rows="3"
                ></textarea>
                <div class="pv-commit-actions">
                  <button class="pv-git-btn pv-gen-btn" @click="generateCommitMsg" :disabled="gitBusy || generating">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    Generate with Claude
                  </button>
                  <div class="pv-commit-btns">
                    <button class="pv-action-btn" @click="doCommit" :disabled="gitBusy || !commitMessage.trim()">
                      Commit
                    </button>
                    <button class="pv-action-btn pv-push-btn" @click="confirmPush = true" :disabled="gitBusy" title="Push to remote">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                      Push
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: containers + sessions -->
            <div class="pv-col-right">
              <div class="pv-card" v-if="detail.containers.length">
                <div class="pv-card-title">Docker Compose</div>
                <div class="pv-container-list">
                  <div v-for="c in detail.containers" :key="c.name" class="pv-container-row" :class="{ running: c.state.includes('running') }">
                    <span class="pv-container-dot"></span>
                    <span class="pv-container-name">{{ c.name }}</span>
                    <span class="pv-container-state">{{ c.status || c.state }}</span>
                    <span v-if="c.ports" class="pv-container-ports">{{ c.ports }}</span>
                  </div>
                </div>
              </div>

              <div class="pv-card" v-if="sessions.length">
                <div class="pv-card-title">Recent sessions</div>
                <div class="pv-session-list">
                  <div v-for="s in sessions" :key="s.id" class="pv-session-row" @click="openSession(s)">
                    <div class="pv-session-name">{{ s.name }}</div>
                    <div class="pv-session-date">{{ fmtDate(s.updatedAt) }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ── COMMITS TAB ───────────────────────────────────────── -->
        <template v-else-if="activeTab === 'commits' && detail">
          <template v-if="unpushedCommits.length">
            <div class="pv-commits-section-label pv-commits-section-label--unpushed">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              {{ unpushedCommits.length }} unpushed
            </div>
            <div class="pv-commit-list-full pv-commit-list-full--unpushed">
              <div v-for="c in unpushedCommits" :key="c.hash" class="pv-commit-item">
                <span class="pv-commit-hash">{{ c.hash }}</span>
                <span class="pv-commit-msg">{{ c.message }}</span>
                <span class="pv-commit-author">{{ c.author }}</span>
                <span class="pv-commit-date">{{ c.date }}</span>
              </div>
            </div>
          </template>
          <div v-if="detail.commits.length" class="pv-commits-section-label">History</div>
          <div class="pv-commit-list-full">
            <div v-for="c in detail.commits" :key="c.hash" class="pv-commit-item">
              <span class="pv-commit-hash">{{ c.hash }}</span>
              <span class="pv-commit-msg">{{ c.message }}</span>
              <span class="pv-commit-author">{{ c.author }}</span>
              <span class="pv-commit-date">{{ c.date }}</span>
            </div>
            <div v-if="!detail.commits.length" class="pv-empty">No commits found.</div>
          </div>
        </template>

        <!-- ── FILES TAB ─────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'files'">
          <div class="pv-files-layout">
            <div class="pv-tree-panel">
              <div class="pv-tree-search">
                <input v-model="treeSearch" class="pv-tree-search-input" placeholder="Filter files…" />
              </div>
              <div class="pv-tree-scroll">
                <div v-if="treeLoading" class="pv-loading">Loading…</div>
                <FileTreeNode
                  v-else
                  v-for="node in filteredTree"
                  :key="node.path"
                  :node="node"
                  :search="treeSearch"
                  @open="openFileFromTree"
                />
              </div>
            </div>
          </div>
        </template>

        <!-- ── SESSIONS TAB ──────────────────────────────────────── -->
        <template v-else-if="activeTab === 'sessions'">
          <div v-if="activeSessions.length" class="pv-active-sessions">
            <div class="pv-commits-section-label" style="margin-top:0">
              <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#34d399"/></svg>
              Active
            </div>
            <div v-for="s in activeSessions" :key="s.id" class="pv-asession-row" @click="openSession(s)">
              <div class="pv-asession-name">{{ s.name || s.id.slice(0, 12) }}</div>
              <span class="pv-asession-badge" :class="s.busy ? 'busy' : 'idle'">{{ s.busy ? 'working' : 'idle' }}</span>
            </div>
          </div>
          <div v-if="sessions.length" class="pv-active-sessions" :style="activeSessions.length ? 'margin-top:16px' : ''">
            <div class="pv-commits-section-label" :style="activeSessions.length ? '' : 'margin-top:0'">Recent</div>
            <div v-for="s in sessions" :key="s.id" class="pv-asession-row" @click="openSession(s)">
              <div class="pv-asession-name">{{ s.name }}</div>
              <div class="pv-session-date">{{ fmtDate(s.updatedAt) }}</div>
            </div>
          </div>
          <div v-if="!activeSessions.length && !sessions.length" class="pv-empty">No sessions found.</div>
        </template>

      </div>
    </template>

    <!-- ── Push confirmation dialog ──────────────────────────────── -->
    <div v-if="confirmPush" class="pv-dialog-overlay" @click.self="confirmPush = false">
      <div class="pv-dialog">
        <div class="pv-dialog-title">Push to remote?</div>
        <div class="pv-dialog-body">This will push the current branch to origin. Are you sure?</div>
        <div class="pv-dialog-actions">
          <button class="pv-dialog-cancel" @click="confirmPush = false">Cancel</button>
          <button class="pv-action-btn pv-push-btn" @click="doPush">Push</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import FileTreeNode from './FileTreeNode.vue';

const TABS = computed(() => [
  { id: 'overview', label: 'Overview' },
  { id: 'commits', label: unpushedCount.value ? `Commits (${unpushedCount.value})` : 'Commits' },
  { id: 'files', label: 'Files' },
  { id: 'sessions', label: activeSessions.value.length ? `Sessions (${activeSessions.value.length})` : 'Sessions' },
]);

const props = defineProps({ callbacks: { type: Object, required: true } });

const project = ref(null);
const worktrees = ref([]);
const viewedPath = ref('');
const detail = ref(null);
const loading = ref(false);
const activeTab = ref('overview');
watch(activeTab, (tab) => props.callbacks.onTabChange?.(tab));

// Git actions
const branches = ref([]);
const remoteBranches = ref([]);
const gitBusy = ref(false);
const gitMessage = ref('');
const gitError = ref(false);
const commitMessage = ref('');
const generating = ref(false);
const confirmPush = ref(false);

// Changed files
const loadingFile = ref(null);

// Diff / file overlay
const activeDiff = ref(null);
const activeFile = ref(null);
const fileContent = ref('');
const fileModified = ref(false);
const fileSaving = ref(false);
const diffContainerRef = ref(null);
let editorView = null;

// File tree
const fileTree = ref([]);
const treeLoading = ref(false);
const treeSearch = ref('');

// Sessions
const sessions = ref([]);
const activeSessions = ref([]);

// ── Computed ──────────────────────────────────────────────────────
const avatar = computed(() =>
  project.value && window.getProjectAvatar
    ? window.getProjectAvatar(project.value.projectPath)
    : { initials: '?', color: '#666' }
);
const projectName = computed(() =>
  project.value?.projectPath.split('/').filter(Boolean).pop() || ''
);
const changedFiles = computed(() => detail.value?.changedFiles || []);
const unpushedCommits = computed(() => detail.value?.unpushedCommits || []);
const unpushedCount = computed(() => unpushedCommits.value.length);
const currentFileIndex = computed(() =>
  changedFiles.value.findIndex(f => f.file === activeDiff.value?.filePath)
);
const overlayTitle = computed(() => {
  if (activeDiff.value) return basename(activeDiff.value.filePath);
  if (activeFile.value) return basename(activeFile.value);
  return '';
});
const overlayPath = computed(() => activeDiff.value?.filePath || activeFile.value || '');

const filteredTree = computed(() => {
  if (!treeSearch.value) return fileTree.value;
  return filterTree(fileTree.value, treeSearch.value.toLowerCase());
});

// ── Utils ─────────────────────────────────────────────────────────
function basename(p) { return p ? p.replace(/\\/g, '/').split('/').pop() || p : ''; }
function fmtDate(t) {
  if (!t) return '';
  try { return window.formatDate ? window.formatDate(new Date(t)) : new Date(t).toLocaleDateString(); } catch { return ''; }
}

function fileStatus(f) {
  if (!f.added && f.deleted) return 'deleted';
  if (f.added && !f.deleted) return 'added';
  return 'modified';
}
function fileStatusChar(f) {
  if (!f.added && f.deleted) return 'D';
  if (f.added && !f.deleted) return 'A';
  return 'M';
}

function filterTree(nodes, q) {
  const result = [];
  for (const n of nodes) {
    if (n.isDir) {
      const children = filterTree(n.children || [], q);
      if (children.length) result.push({ ...n, children, _expanded: true });
    } else if (n.name.toLowerCase().includes(q)) {
      result.push(n);
    }
  }
  return result;
}

// ── Data loading ──────────────────────────────────────────────────
watch(viewedPath, async (p) => {
  if (!p) return;
  activeDiff.value = null;
  activeFile.value = null;
  commitMessage.value = '';
  // Show stale cache immediately — no blank flash
  const cached = await window.api.getProjectGitCache(p).catch(() => null);
  if (cached) {
    detail.value = cached;
    loading.value = false;
  } else {
    detail.value = null;
    loading.value = true;
  }
  // Load branches + sessions in parallel with fresh detail
  const rootPath = project.value?.projectPath;
  const [det, br, sess, terminals] = await Promise.all([
    window.api.getProjectDetail(p).catch(() => null),
    window.api.gitBranches(p).catch(() => null),
    window.api.getProjectSessions(rootPath || p).catch(() => null),
    window.api.getActiveTerminals().catch(() => null),
  ]);
  detail.value = det || detail.value;
  branches.value = br?.ok ? br.branches : [];
  remoteBranches.value = br?.ok ? (br.remotes || []) : [];
  if (sess?.ok) sessions.value = sess.sessions;
  if (terminals) {
    activeSessions.value = Object.values(terminals)
      .filter(t => t.projectPath === (rootPath || p) && !t.exited)
      .map(t => ({ id: t.id, name: t.title || t.id?.slice(0, 12), busy: t.busy || false }));
  }
  loading.value = false;
});

watch(activeTab, async (tab) => {
  if (tab === 'files' && !fileTree.value.length && viewedPath.value) {
    treeLoading.value = true;
    const res = await window.api.getFileTree(viewedPath.value).catch(() => null);
    if (res?.ok) fileTree.value = res.tree;
    treeLoading.value = false;
  }
});

// ── Diff overlay ──────────────────────────────────────────────────
watch([activeDiff, activeFile], async ([diff, file]) => {
  if (editorView) {
    try { typeof editorView.destroy === 'function' ? editorView.destroy() : editorView.a?.destroy(); } catch {}
    editorView = null;
  }
  if (!diff && !file) return;
  await nextTick();
  const el = diffContainerRef.value;
  if (!el) return;
  el.innerHTML = '';
  if (diff) {
    editorView = window.createReadOnlyMergeViewer?.(el, diff.oldContent, diff.newContent, diff.filePath);
  } else if (file) {
    editorView = window.createEditableViewer?.(el, fileContent.value, file);
    if (editorView) {
      editorView.dom?.addEventListener('input', () => { fileModified.value = true; });
    }
  }
});

async function openDiff(filePath) {
  if (loadingFile.value) return;
  loadingFile.value = filePath;
  try {
    const result = await window.api.getFileDiff(viewedPath.value, filePath);
    if (!result?.ok) return;
    activeFile.value = null;
    activeDiff.value = { filePath, oldContent: result.oldContent, newContent: result.newContent };
  } finally { loadingFile.value = null; }
}

async function openFileFromTree(path) {
  const fullPath = `${viewedPath.value}/${path}`;
  const res = await window.api.readFileForPanel(fullPath).catch(() => null);
  if (!res?.ok) return;
  fileContent.value = res.content;
  fileModified.value = false;
  activeDiff.value = null;
  activeFile.value = fullPath;
}

async function saveFile() {
  if (!activeFile.value || !editorView) return;
  fileSaving.value = true;
  const content = editorView.state?.doc?.toString?.() ?? fileContent.value;
  await window.api.saveFileForPanel(activeFile.value, content).catch(() => {});
  fileModified.value = false;
  fileSaving.value = false;
}

function closeOverlay() {
  activeDiff.value = null;
  activeFile.value = null;
}
function prevFile() {
  const i = currentFileIndex.value;
  if (i > 0) openDiff(changedFiles.value[i - 1].file);
}
function nextFile() {
  const i = currentFileIndex.value;
  if (i < changedFiles.value.length - 1) openDiff(changedFiles.value[i + 1].file);
}

// ── Git actions ───────────────────────────────────────────────────
function showGitMsg(msg, isError = false, ms = 4000) {
  gitMessage.value = msg; gitError.value = isError;
  setTimeout(() => { gitMessage.value = ''; gitError.value = false; }, ms);
}

async function switchBranch(branch) {
  if (branch === detail.value?.branch) return;
  gitBusy.value = true;
  const res = await window.api.gitCheckout(viewedPath.value, branch);
  gitBusy.value = false;
  if (res.ok) { showGitMsg(`Switched to ${branch}`); await reload(); }
  else showGitMsg(res.error || 'Checkout failed', true);
}

async function doFetch() {
  gitBusy.value = true;
  showGitMsg('Fetching…');
  const res = await window.api.gitFetch(viewedPath.value);
  gitBusy.value = false;
  if (res.ok) { showGitMsg('Fetched'); const br = await window.api.gitBranches(viewedPath.value); if (br?.ok) { branches.value = br.branches; remoteBranches.value = br.remotes || []; } }
  else showGitMsg(res.error || 'Fetch failed', true);
}

async function doPull() {
  gitBusy.value = true;
  showGitMsg('Pulling…');
  const res = await window.api.gitPull(viewedPath.value);
  gitBusy.value = false;
  if (res.ok) { showGitMsg('Pulled'); await reload(); }
  else showGitMsg(res.error || 'Pull failed', true);
}

async function generateCommitMsg() {
  generating.value = true; gitBusy.value = true;
  const res = await window.api.gitGenerateCommitMsg(viewedPath.value);
  generating.value = false; gitBusy.value = false;
  if (res.ok) commitMessage.value = res.message;
  else showGitMsg(res.error || 'Generation failed', true);
}

async function doCommit() {
  if (!commitMessage.value.trim()) return;
  gitBusy.value = true;
  const res = await window.api.gitCommit(viewedPath.value, commitMessage.value.trim());
  gitBusy.value = false;
  if (res.ok) { showGitMsg('Committed'); commitMessage.value = ''; await reload(); }
  else showGitMsg(res.error || 'Commit failed', true);
}

async function doPush() {
  confirmPush.value = false;
  gitBusy.value = true;
  showGitMsg('Pushing…');
  const res = await window.api.gitPush(viewedPath.value);
  gitBusy.value = false;
  if (res.ok) showGitMsg('Pushed successfully');
  else showGitMsg(res.error || 'Push failed', true);
}

async function reload() {
  const p = viewedPath.value;
  if (!p) return;
  const det = await window.api.getProjectDetail(p).catch(() => null);
  detail.value = det;
}

function setViewedPath(path) {
  if (path === viewedPath.value) return;
  fileTree.value = [];
  viewedPath.value = path;
}

function openSession(s) { window.__sb?.openSessionById?.(s.id); }
function newSession() { if (project.value) props.callbacks.newSession?.(project.value); }

// ── Expose ────────────────────────────────────────────────────────
defineExpose({
  open(proj, wts = []) {
    project.value = proj;
    worktrees.value = wts;
    viewedPath.value = proj?.projectPath || '';
  },
  close() { project.value = null; worktrees.value = []; viewedPath.value = ''; detail.value = null; activeDiff.value = null; activeFile.value = null; },
  setTab(tab) { activeTab.value = tab; },
  setViewedPath,
});
</script>
