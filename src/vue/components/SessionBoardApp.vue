<template>
  <div class="sbx-board">
    <div class="sbx-board__bar">
      <SbIcon name="square-kanban" :size="15" tone="muted" />
      <div class="sbx-board__heading">Board</div>
      <div class="sbx-board__summary">{{ summary }}</div>
      <button
        type="button"
        class="sbx-board__toggle"
        :class="{ 'is-active': store.highlightFresh }"
        :aria-pressed="store.highlightFresh"
        data-tooltip="Fade cards by how long ago the session last did anything"
        @click="store.highlightFresh = !store.highlightFresh"
      >Highlight fresh</button>
    </div>

    <div class="sbx-board__grid">
      <section
        v-for="col in columns"
        :key="col.id"
        class="sbx-board__col"
        :class="'sbx-board__col--' + col.id"
      >
        <header class="sbx-board__colhead">
          <span class="sbx-board__dot"></span>
          <span class="sbx-board__collabel">{{ col.label }}</span>
          <span class="sbx-board__count">{{ col.total }}</span>
        </header>

        <div class="sbx-board__colbody">
          <div v-if="!col.groups.length" class="sbx-board__empty">Empty</div>

          <div v-for="group in col.groups" :key="group.projectPath" class="sbx-board__group">
            <div class="sbx-board__grouphead">
              <ProjectAvatar class="sbx-board__avatar" :project-path="group.projectPath" />
              <span class="sbx-board__grouppath" :title="group.projectPath">{{ group.label }}</span>
            </div>

            <SessionCard
              v-for="session in group.items"
              :key="session.sessionId"
              :session="session"
              :highlight-fresh="store.highlightFresh"
              :selected="session.sessionId === store.boardPreviewId"
              @preview="preview"
              @open="open"
            />
          </div>
        </div>
      </section>
    </div>

  </div>
</template>

<script setup>
import { computed, onUnmounted, watch, nextTick } from 'vue';
import { store } from '../store.js';
import SbIcon from './SbIcon.vue';
import ProjectAvatar from './ProjectAvatar.vue';
import SessionCard from './SessionCard.vue';
import { filterSessions } from '../session-filter.js';
// Aliased: `columnOf` below is this board's own map of every card's lane, which
// is a different question from "which lane is this one session in".
import { columnOf as laneOf, stateFromStore } from '../session-column.js';
import { tick } from '../time-tick.js';

// Lifecycle order, left to right. Nothing here is stored: a card's column is
// re-derived from live session state on every render, which is also why the
// board has no drag and drop — dragging would assert a state the runtime is
// about to overwrite.
const COLUMNS = [
  { id: 'idle', label: 'IDLE' },
  { id: 'waiting', label: 'WAITING INPUT' },
  { id: 'running', label: 'IN PROGRESS' },
  { id: 'done', label: 'DONE' },
];

// The precedence itself lives in session-column.js, because the Recent rail
// sorts by the same thing and the two used to disagree at the edges. It is
// called from the board's own pass below, with the state read once per pass.

function shortPath(projectPath) {
  return projectPath.split('/').filter(Boolean).slice(-2).join('/') || projectPath;
}

// One pass over the projects, bucketed by column, so each project appears at
// most once per column and keeps its own header there.
//
// The pass also records where each card ended up. That map is what the flight
// animation watches, and deriving it separately meant walking every column,
// group and card a second time on every invalidation — which is every status
// change anywhere.
const board = computed(() => {
  tick.value; // eslint-disable-line no-unused-expressions -- re-read timeago
  const byId = new Map(COLUMNS.map(c => [c.id, { ...c, groups: [], total: 0 }]));
  /** sessionId → column id, the thing whose change is worth animating. */
  const lanes = new Map();
  // Read once. The four collections do not move while this runs, and rebuilding
  // the wrapper for every session was allocating one object per card per pass.
  const state = stateFromStore(store);

  for (const project of store.projects) {
    // Scoped to one project from the board's sidebar. Applied here rather than
    // inside filterSessions: it is a board-only lens, and the sidebar list has
    // no concept of it.
    if (store.boardProjectFilter && project.projectPath !== store.boardProjectFilter) continue;
    // Exactly what the sidebar list is showing — same filter module, same
    // flags. The board is the list in another shape, not a second dataset.
    const sessions = filterSessions(project.sessions, {
      showArchived: store.showArchived,
      showStarredOnly: store.showStarredOnly,
      showRunningOnly: store.showRunningOnly,
      showTodayOnly: store.showTodayOnly,
      searchMatchIds: store.searchMatchIds,
      activePtyIds: store.activePtyIds,
    });
    const buckets = new Map();
    for (const session of sessions) {
      const colId = laneOf(session.sessionId, state);
      lanes.set(session.sessionId, colId);
      if (!buckets.has(colId)) buckets.set(colId, []);
      buckets.get(colId).push(session);
    }
    for (const [colId, items] of buckets) {
      items.sort((a, b) => new Date(b.modified) - new Date(a.modified));
      const col = byId.get(colId);
      col.groups.push({ projectPath: project.projectPath, label: shortPath(project.projectPath), items });
      col.total += items.length;
    }
  }

  return { columns: COLUMNS.map(c => byId.get(c.id)), lanes };
});

const columns = computed(() => board.value.columns);

const summary = computed(() => {
  const sessions = columns.value.reduce((n, c) => n + c.total, 0);
  const projects = new Set();
  for (const col of columns.value) for (const g of col.groups) projects.add(g.projectPath);
  if (!sessions) return 'No sessions';
  return `${sessions} session${sessions === 1 ? '' : 's'} across ${projects.size} project${projects.size === 1 ? '' : 's'}`;
});

// ── Bottom split ──────────────────────────────────────────────────
// One click opens the session for real and shows it in a pane under the
// board — the same live terminal you get on the Sessions tab, not a copy of
// it. #terminal-area is never reparented: file-panel.js owns that subtree, so
// the split is done by moving the two absolutely positioned panes with CSS
// (.has-board-split in css/board-view.css) and refitting afterwards.
// ── Card flight ───────────────────────────────────────────────────
//
// A card's column is derived, so a session finishing a turn simply re-renders
// somewhere else — the card blinks out of one column and into another and you
// have no idea what moved. This animates the move it already made: the card
// starts where it was, lifts off the board, tilts, and lands in its new column.
//
// FLIP, because the layout is what moved: read the old box, let Vue paint the
// new one, then start the card from the old position and animate the offset
// away. Nothing here changes layout — it is a transform on a node that is
// already in its final place, so it cannot fight the board's own reflow.

const FLIGHT_MS = 560;

/** sessionId → column id, built by the board's own pass. */
const columnOf = computed(() => board.value.lanes);

function prefersReducedMotion() {
  if (store.reduceMotion) return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

// More than this many cards changing column at once is not a move anyone can
// follow — it is the board resettling. Animating it costs a clone, a forced
// layout and a 560ms animation each, for something that reads as noise.
const MAX_FLYING = 8;

function cardEl(sessionId) {
  return document.querySelector(`.sbx-board [data-session-id="${CSS.escape(sessionId)}"]`);
}

// The card cannot fly on its own: .sbx-board__col clips with overflow:hidden
// and .sbx-board__colbody scrolls, so a transform that leaves the destination
// column is simply cut off — the animation ran, and almost none of it was on
// screen. z-index does not help; clipping is not a paint-order problem.
//
// So the thing that flies is a clone, parented to <body> where nothing clips
// it, while the real card waits invisibly in its new home. On landing the
// clone goes and the real one reappears — same pixels, no layout involved.
//
// Read first, then write. Every `getBoundingClientRect` and `getComputedStyle`
// below is a question the browser can only answer by finishing layout, and the
// appends and style writes in the second half are what invalidate it again.
// Interleaved — which is how this read, one card at a time — each card forced
// its own layout: measured over a board with cards moving, the flight was
// costing ten times the style recalculations of the same churn without it.
function fly(firstRects) {
  // Phase 1 — measure. Nothing here touches the DOM.
  const moves = [];
  for (const [id, first] of firstRects) {
    const el = cardEl(id);
    if (!el) continue;
    const last = el.getBoundingClientRect();
    const dx = last.left - first.left;
    const dy = last.top - first.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    // The column, not the card, declares the state colour — a clone on <body>
    // would otherwise lose its leading edge mid-flight.
    const tone = getComputedStyle(el).getPropertyValue('--sbx-board-tone');
    moves.push({ el, first, dx, dy, tone });
  }
  if (!moves.length || moves.length > MAX_FLYING) return;

  // Phase 2 — build. Still detached, so none of this invalidates anything.
  const frag = document.createDocumentFragment();
  const flights = [];
  for (const { el, first, dx, dy, tone } of moves) {
    const clone = el.cloneNode(true);
    clone.classList.add('is-flying');
    // One declaration rather than eight assignments: each one on a live node
    // would be its own invalidation, and this is per card per move.
    clone.style.cssText = `position:fixed;left:${first.left}px;top:${first.top}px;`
      + `width:${first.width}px;height:${first.height}px;margin:0;pointer-events:none;`
      + `--sbx-board-tone:${tone};`;
    frag.appendChild(clone);
    flights.push({ el, clone, dx, dy });
  }

  // Phase 3 — write. One insertion for the whole batch.
  document.body.appendChild(frag);

  for (const { el, clone, dx, dy } of flights) {
    el.style.visibility = 'hidden';

    const tilt = dx > 0 ? 5 : -5;   // lean into the direction of travel
    const animation = clone.animate([
      { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45}px) rotate(${tilt}deg) scale(1.06)`,
        offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(1)` },
    ], { duration: FLIGHT_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });

    const land = () => {
      clone.remove();
      el.style.visibility = '';
    };
    animation.addEventListener('finish', land);
    animation.addEventListener('cancel', land);
    // A card removed mid-flight never fires finish, and a clone left behind
    // would sit over the whole window.
    setTimeout(land, FLIGHT_MS + 120);
  }
}

// `flush: 'pre'` is the whole trick: the callback runs before Vue patches the
// DOM, so these are the boxes the cards are still occupying.
watch(columnOf, (next, previous) => {
  if (!previous || prefersReducedMotion()) return;

  // Which cards moved is decided before anything is measured, so the reads
  // below are one uninterrupted run rather than one per lookup.
  const moved = [];
  for (const [id, column] of next) {
    const was = previous.get(id);
    if (!was || was === column) continue;
    moved.push(id);
  }
  if (!moved.length || moved.length > MAX_FLYING) return;

  const firstRects = new Map();
  for (const id of moved) {
    const el = cardEl(id);
    if (el) firstRects.set(id, el.getBoundingClientRect());
  }
  if (!firstRects.size) return;
  nextTick(() => fly(firstRects));
}, { flush: 'pre' });

function refitSoon() {
  requestAnimationFrame(() => window._refitOpenTerminals?.());
}

function preview(session) {
  store.boardPreviewId = session.sessionId;
  window.__sb?.openSession?.(session);
  refitSoon();
}

// Routed through app.js rather than clearing the id here: closing the pane is
// what retires the card from DONE, and doing it locally skipped that — the
// session came back to DONE-forever, since nothing else ever released it.
function closePreview() {
  window.__sb?.closeSessionView?.();
  refitSoon();
}

// Leaving the board must not strand the terminal in a half-height pane. This
// one stays a plain clear: switching tabs is not closing the session, which
// remains open in the session view and keeps whatever card it had earned.
onUnmounted(() => { store.boardPreviewId = null; });

// The board is a survey, not a workspace: opening a card hands you over to the
// session view, the same way the attention rail does.
function open(session) {
  store.boardPreviewId = null;
  window.vueApp?.setTab?.('sessions');
  window.__sb?.openSession?.(session);
  refitSoon();
}

// The board's sidebar links a session summary back to its card; selecting it
// has to mean exactly what clicking that card means.
defineExpose({ selectSession: preview });
</script>
