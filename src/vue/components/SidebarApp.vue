<template>
  <!-- One block holding the whole list, matching the projects tab: the project
       headers inside stay what they are, section headings within the list
       rather than blocks of their own. Ten bordered cards down a narrow rail
       reads as ten unrelated panels, which is not what a project group is. -->
  <div class="sbx-blockpanel">
    <section class="sbx-block sbx-block--fill">
      <div class="sbx-block__body sbx-block__body--scroll">
    <ProjectGroup
      v-for="project in visibleProjects"
      :key="project.projectPath"
      :project="project"
      :worktrees="worktreeMap.get(project.projectPath) || []"
      :active-pty-ids="store.activePtyIds"
      :active-session-id="store.activeSessionId"
      :session-busy-state="store.sessionBusyState"
      :attention-sessions="store.attentionSessions"
      :response-ready-sessions="store.responseReadySessions"
      :search-match-ids="project._projectMatched ? null : store.searchMatchIds"
      :show-archived="store.showArchived"
      :show-starred-only="store.showStarredOnly"
      :show-running-only="store.showRunningOnly"
      :show-today-only="store.showTodayOnly"
      :visible-session-count="store.visibleSessionCount"
      :session-max-age-days="store.sessionMaxAgeDays"
      @open="onOpen"
      @new-session="onNewSession"
      @settings="onSettings"
      @archive-sessions="onArchiveSessions"
      @remove-project="onRemoveProject"
    />
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { store } from '../store.js';
import ProjectGroup from './ProjectGroup.vue';
import { projectHasVisibleSessions } from '../session-filter.js';

const props = defineProps({
  callbacks: { type: Object, required: true },
});

const worktreePattern = /^(.+?)\/\.claude\/worktrees\/([^/]+)\/?$/;

const worktreeMap = computed(() => {
  const map = new Map();
  for (const p of store.projects) {
    const match = p.projectPath.match(worktreePattern);
    if (match) {
      const parent = match[1];
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent).push(p);
    }
  }
  return map;
});

const worktreeSet = computed(() => {
  const s = new Set();
  for (const p of store.projects) {
    if (worktreePattern.test(p.projectPath)) s.add(p.projectPath);
  }
  return s;
});

const visibleProjects = computed(() => {
  let projects = store.projects;

  if (store.searchMatchIds !== null) {
    // Search: show every project that matches by session title or by its own
    // name. A project that matched by name keeps all of its sessions — the
    // query named the project, so the whole project is the result; trimming it
    // to the sessions whose titles happen to contain the same string would
    // answer a question nobody asked.
    projects = projects
      .map(p => {
        const hasMatchingSessions = p.sessions.some(s => store.searchMatchIds.has(s.sessionId));
        const projectMatched = !!store.searchMatchProjectPaths?.has(p.projectPath);
        if (!hasMatchingSessions && !projectMatched) return null;
        return {
          ...p,
          sessions: projectMatched ? p.sessions : p.sessions.filter(s => store.searchMatchIds.has(s.sessionId)),
          _projectMatched: projectMatched,
          _projectMatchedOnly: projectMatched && !hasMatchingSessions,
        };
      })
      .filter(Boolean);
  } else {
    // A project with nothing surviving the filters is a collapsible header with
    // nothing behind it, so it is not listed. The rules are filterSessions' —
    // written out a second time here, they drifted.
    projects = projects.filter(p => projectHasVisibleSessions(p, {
      showArchived: store.showArchived,
      showStarredOnly: store.showStarredOnly,
      showRunningOnly: store.showRunningOnly,
      showTodayOnly: store.showTodayOnly,
      activePtyIds: store.activePtyIds,
    }));
  }

  return projects.filter(p => !worktreeSet.value.has(p.projectPath));
});

function onOpen(session) { props.callbacks.openSession?.(session); }
function onNewSession(project, btn) { props.callbacks.newSession?.(project, btn); }
function onSettings(path) { props.callbacks.openSettings?.(path); }
function onArchiveSessions(sessions) { props.callbacks.archiveSessions?.(sessions); }
function onRemoveProject(path) { props.callbacks.removeProject?.(path); }
</script>
