<template>
  <div class="projects-panel">
    <!-- Same chrome as the sessions sidebar: the sort orders become the text
         tabs, the toggles become icon actions. `--no-views` drops the
         list/grid pair, which has no meaning for a project list. -->
    <FilterTabs
      class="sbx-filtertabs--no-views"
      :tabs="SORT_TABS"
      :active="sortOrder"
      @select="sortOrder = $event"
    >
      <template #actions>
        <span class="projects-count" :title="`${liveProjects.length} projects`">{{ liveProjects.length }}</span>
        <button
          type="button"
          class="sbx-filtertabs__view"
          :class="{ 'sbx-filtertabs__view--active': showContainers }"
          data-tooltip="Toggle containers"
          aria-label="Toggle container visibility"
          :aria-pressed="showContainers"
          @click="showContainers = !showContainers"
        >
          <SbIcon name="container" :size="13" :tone="showContainers ? 'accent' : 'muted'" />
        </button>
        <button
          type="button"
          class="sbx-filtertabs__view"
          data-tooltip="Add project"
          aria-label="Add project"
          @click="callbacks.addProject?.()"
        >
          <SbIcon name="folder-plus" :size="13" tone="muted" />
        </button>
      </template>
    </FilterTabs>

    <!-- The shared sidebar block — css/sidebar-blocks.css. Same box every other
         tab's sidebar uses; the archived one below is it again, folded shut. -->
    <div class="sbx-blockpanel projects-scroll">
    <section class="sbx-block sbx-block--fill">
      <div class="sbx-block__body sbx-block__body--scroll">
      <div class="project-group">
      <div class="project-sessions">
        <div v-if="liveProjects.length === 0" class="projects-empty-hint">
          {{ searchQuery ? 'No matching projects.' : 'No projects yet. Click Add to select a folder.' }}
        </div>
        <div
          v-for="project in liveProjects"
          :key="project.projectPath"
          class="session-item project-item"
          :class="{ active: project.projectPath === activeProjectPath, syncing: loadingPaths.has(project.projectPath) }"
          @click="openProject(project)"
        >
          <div class="session-row">
            <ProjectAvatar class="project-card-avatar" :project-path="project.projectPath" />
            <div class="session-info">
              <div class="session-summary">
                <span class="project-item-name">{{ projectName(project) }}</span>
                <span v-if="projectInfo[project.projectPath]?.unpushedCount ?? project.unpushedCount" class="project-unpushed-badge">{{ projectInfo[project.projectPath]?.unpushedCount ?? project.unpushedCount }}</span>
                <span v-if="loadingPaths.has(project.projectPath)" class="project-syncing-dot"></span>
              </div>
              <div class="session-subtitle" :title="project.projectPath">{{ project.projectPath }}</div>
              <div class="session-meta">{{ baseMeta(project) }}</div>
              <div v-if="projectInfo[project.projectPath]?.branch" class="session-meta project-branch-meta">
                <span class="project-env-branch-icon">⎇</span>
                {{ projectInfo[project.projectPath].branch }}
                <span v-if="projectInfo[project.projectPath].added" class="project-env-added">+{{ projectInfo[project.projectPath].added }}</span>
                <span v-if="projectInfo[project.projectPath].deleted" class="project-env-deleted">−{{ projectInfo[project.projectPath].deleted }}</span>
              </div>
              <div v-if="showContainers && projectInfo[project.projectPath]?.containers?.length" class="project-card-env">
                <div class="project-env-containers-box">
                  <div class="project-env-containers-hdr">
                    <SbIcon name="container" :size="12" tone="muted" />
                    CONTAINERS · {{ projectInfo[project.projectPath].containers.length }}
                  </div>
                  <div
                    v-for="c in projectInfo[project.projectPath].containers"
                    :key="c.name"
                    class="project-env-container-row"
                  >
                    <span
                      class="project-env-dot"
                      :class="{
                        running: c.state.includes('running'),
                        starting: !c.state.includes('running') && (c.state.includes('starting') || c.status?.toLowerCase().includes('starting'))
                      }"
                    ></span>
                    <span class="project-env-cname">{{ c.name }}</span>
                    <span class="project-env-cuptime">{{ parseUptime(c.status) }}</span>
                    <span
                      v-if="!c.state.includes('running') && c.state && c.state !== 'exited'"
                      class="project-env-cbadge"
                      :class="{ starting: c.state.includes('starting') || c.status?.toLowerCase().includes('starting') }"
                    >{{ c.state }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="project-card-actions" @click.stop>
              <button
                class="project-card-new-btn"
                data-tooltip="New session"
                @click.stop="callbacks.newSession?.(project, $event.currentTarget)"
              >
                <SbIcon name="plus" :size="13" tone="muted" />
              </button>
              <button
                class="project-card-arch-btn"
                data-tooltip="Archive project"
                @click.stop="setArchived(project, true)"
              >
                <SbIcon name="archive" :size="13" tone="muted" />
              </button>
              <button
                class="project-card-del-btn"
                data-tooltip="Remove project"
                @click.stop="removeProject(project)"
              ><SbIcon name="trash-2" :size="13" tone="muted" /></button>
            </div>
          </div>
        </div>
      </div>
      </div>
      </div>
      <!-- Outside the scroller: the way to add a project should not be
           something you have to scroll thirty rows to reach. -->
      <div class="sbx-block__foot projects-add-row">
        <button class="projects-add-btn" @click="callbacks.addProject?.()">
          <SbIcon name="plus" :size="12" tone="muted" />
          Add project
        </button>
      </div>
    </section>

    <!-- Archived: folded shut, and nothing in here is polled. Opening one is
         what fetches its git and containers, and that is the point — see
         project-polling.js. -->
    <section v-if="archivedProjects.length" class="sbx-block sbx-block--fit projects-block--archived">
      <header
        class="sbx-block__head sbx-block__head--toggle"
        role="button"
        tabindex="0"
        :aria-expanded="!archivedCollapsed"
        @click="archivedCollapsed = !archivedCollapsed"
        @keydown.enter.prevent="archivedCollapsed = !archivedCollapsed"
        @keydown.space.prevent="archivedCollapsed = !archivedCollapsed"
      >
        <SbIcon
          name="chevron-down"
          :size="12"
          tone="muted"
          class="sbx-block__chevron"
          :class="{ 'is-collapsed': archivedCollapsed }"
        />
        <span class="sbx-block__title">Archived</span>
        <span class="sbx-block__count">{{ archivedProjects.length }}</span>
      </header>
      <div v-show="!archivedCollapsed" class="sbx-block__body sbx-block__body--scroll">
        <div
          v-for="project in archivedProjects"
          :key="project.projectPath"
          class="session-item project-item project-item--archived"
          :class="{ active: project.projectPath === activeProjectPath }"
          @click="openProject(project)"
        >
          <div class="session-row">
            <ProjectAvatar class="project-card-avatar" :project-path="project.projectPath" />
            <div class="session-info">
              <div class="session-summary">
                <span class="project-item-name">{{ projectName(project) }}</span>
              </div>
              <div class="session-subtitle" :title="project.projectPath">{{ project.projectPath }}</div>
              <div class="session-meta">{{ baseMeta(project) }}</div>
            </div>
            <div class="project-card-actions" @click.stop>
              <button
                class="project-card-arch-btn"
                data-tooltip="Restore project"
                @click.stop="setArchived(project, false)"
              >
                <SbIcon name="folder-open" :size="13" tone="muted" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import ProjectAvatar from './ProjectAvatar.vue';
import FilterTabs from './FilterTabs.vue';
import SbIcon from './SbIcon.vue';
import { matchProjectPaths } from '../project-search.js';

const props = defineProps({
  callbacks: { type: Object, required: true },
});

const projects = ref([]);
const searchQuery = ref('');
const sortOrder = ref('name');
const showContainers = ref(true);
const projectInfo = reactive({});
const loadingPaths = reactive(new Set());
const activeProjectPath = ref(null);
// path → { archived, hasCompose }. Held here rather than merged into
// `projects` because it outlives any one project list: the list is rebuilt
// from the session cache on every change, and this is not part of it.
const projectMeta = reactive({});
const archivedCollapsed = ref(true);
// Same shape FilterTabs takes on the sessions tab; the ids are the sort orders.
const SORT_TABS = [
  { id: 'name', label: 'Name' },
  { id: 'changes', label: 'Changes' },
];

let queueGen = 0;

// Batch reactive updates into one rAF flush to avoid per-project re-renders
let pendingInfoUpdates = {};
let flushScheduled = false;
function scheduleInfoFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    for (const [path, info] of Object.entries(pendingInfoUpdates)) {
      projectInfo[path] = projectInfo[path] ? { ...projectInfo[path], ...info } : info;
      loadingPaths.delete(path);
    }
    pendingInfoUpdates = {};
  });
}

const WORKTREE_RE = /\/\.claude\/worktrees\/[^/]+\/?$/;

const filteredProjects = computed(() => {
  const q = searchQuery.value.trim();
  const base = projects.value.filter(p => !WORKTREE_RE.test(p.projectPath));
  // Name or folder, decided by the same matcher the sessions list and the
  // board use — one rule for "this project matches", wherever it is asked.
  const matched = q ? matchProjectPaths(base, q) : null;
  let list = matched ? base.filter(p => matched.has(p.projectPath)) : [...base];

  if (sortOrder.value === 'name') {
    list.sort((a, b) => {
      const na = a.projectPath.split('/').filter(Boolean).pop() || '';
      const nb = b.projectPath.split('/').filter(Boolean).pop() || '';
      return na.localeCompare(nb);
    });
  } else {
    list.sort((a, b) => {
      const ia = projectInfo[a.projectPath];
      const ib = projectInfo[b.projectPath];
      const sa = (ia?.added || 0) + (ia?.deleted || 0);
      const sb = (ib?.added || 0) + (ib?.deleted || 0);
      return sb - sa;
    });
  }
  return list;
});

function isArchived(projectPath) {
  return !!projectMeta[projectPath]?.archived;
}

/** The list proper: everything not folded away. */
const liveProjects = computed(() => filteredProjects.value.filter(p => !isArchived(p.projectPath)));

/** Always sorted by name — an archived project has no fresh numbers to sort by. */
const archivedProjects = computed(() =>
  filteredProjects.value
    .filter(p => isArchived(p.projectPath))
    .sort((a, b) => projectName(a).localeCompare(projectName(b)))
);

// The first list arrives before onMounted's read comes back, and a queue that
// starts without the flags would poll every archived project exactly once —
// the one case archiving exists to prevent. Held as a promise so the queue can
// wait for it instead of racing it.
let metaReady = null;

function loadProjectMeta() {
  metaReady = (window.api.getProjectMeta?.() ?? Promise.resolve(null))
    .then((meta) => {
      if (!meta) return;
      for (const key of Object.keys(projectMeta)) delete projectMeta[key];
      Object.assign(projectMeta, meta);
    })
    .catch(() => {});
  return metaReady;
}

async function setArchived(project, archived) {
  const p = project.projectPath;
  await window.api.setProjectArchived?.(p, archived);
  projectMeta[p] = { ...(projectMeta[p] || {}), archived };
  // Restoring is also the moment its numbers become worth having again; the
  // queue skips archived projects, so nothing else would ever ask.
  if (!archived) {
    queueGen++;
    runInfoQueue(queueGen, [project]);
  }
}

function projectName(p) {
  return p.projectPath.split('/').filter(Boolean).pop() || p.projectPath;
}


function baseMeta(p) {
  const n = p.sessions.length;
  const last = p.sessions[0];
  const activity = last
    ? (window.formatDate ? window.formatDate(new Date(last.modified)) : last.modified)
    : '—';
  const info = projectInfo[p.projectPath];
  const size = info?.sizeMb != null ? ` · ${info.sizeMb} MB` : '';
  return `${n} session${n !== 1 ? 's' : ''} · ${activity}${size}`;
}

function parseUptime(status) {
  return window.parseContainerUptime ? window.parseContainerUptime(status) : '';
}

function openProject(project) {
  activeProjectPath.value = project.projectPath;
  props.callbacks.openProject?.(project);
}

async function removeProject(project) {
  const name = project.projectPath.split('/').pop();
  if (!confirm(`Remove "${name}" from the project list?\n\nSession files are not deleted.`)) return;
  await window.api.removeProject(project.projectPath);
  props.callbacks.projectRemoved?.();
}

async function runInfoQueue(gen, list) {
  await (metaReady || loadProjectMeta());
  if (queueGen !== gen) return;
  for (const project of list) {
    if (queueGen !== gen) break;
    // An archived project is not asked about at all — main.js would refuse
    // anyway, but not sending the call is the point of archiving.
    if (isArchived(project.projectPath)) continue;
    if (projectInfo[project.projectPath]) continue; // already loaded, skip
    loadingPaths.add(project.projectPath);
    try {
      const info = await window.api.getProjectInfo(project.projectPath);
      if (queueGen !== gen) break;
      if (info) {
        pendingInfoUpdates[project.projectPath] = info;
        scheduleInfoFlush();
      } else {
        loadingPaths.delete(project.projectPath);
      }
    } catch {
      loadingPaths.delete(project.projectPath);
    }
  }
}

onMounted(() => {
  loadProjectMeta();
  window.api.onProjectInfoLoading?.((path) => {
    loadingPaths.add(path);
  });
  window.api.onProjectInfoUpdated?.((path, info) => {
    if (info) {
      pendingInfoUpdates[path] = info;
      scheduleInfoFlush();
    } else {
      loadingPaths.delete(path);
    }
  });
});

defineExpose({
  setProjects(list) {
    projects.value = list;
    queueGen++;
    runInfoQueue(queueGen, list);
  },
  setSearch(q) { searchQuery.value = q || ''; },
  clearActive() { activeProjectPath.value = null; },
  updateProjectInfo(path, info) {
    if (info) {
      pendingInfoUpdates[path] = info;
      scheduleInfoFlush();
    }
  },
});

</script>
