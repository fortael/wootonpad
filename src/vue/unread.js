// unread.js — how many of Claude's messages you have not seen yet.
//
// A number on a session's row that grows while it works tells you work is
// moving without opening it; the same number on the Sessions tab sums them,
// and Buddy keeps its own on its tab. Off unless Settings → Session list →
// Unread counters is on (store.unreadCounters).
//
// "Seen" is a count, not a flag: for each session, how many of its messages
// from Claude (`assistantCount`, from the session cache — read-session-file.js)
// there were the last time it was on screen. Unread is the difference. A
// session met for the first time — or every session, the moment the feature
// is switched on — starts at what it has now, so nothing arrives with a
// backlog of history nobody asked to be told about.
//
// Kept in the database (session_meta.unreadSeen), shared by every window and
// by a dev build running beside the packaged app — a baseline only one of
// them knew made the other count days of work as unread. localStorage keeps a
// copy for the moment before the database answers. A baseline only moves up:
// the furthest anyone has read is what was read.

import { computed, watch } from 'vue';
import { store } from './store.js';
import { columnOf, stateFromStore } from './session-column.js';

const SEEN_KEY = 'unreadSeen';
const BUDDY_KEY = 'buddyUnread';

/**
 * Two sets of baselines as one: the higher of each. Returns the merged map
 * and the ids where `local` is ahead — those the database has yet to hear.
 */
export function mergeSeen(local, remote) {
  const merged = { ...(remote || {}) };
  const ahead = [];
  for (const [id, seen] of Object.entries(local || {})) {
    if (merged[id] == null || seen > merged[id]) {
      merged[id] = seen;
      ahead.push(id);
    }
  }
  return { merged, ahead };
}

/** Unread messages, given the count now and the count last seen. */
export function unreadCount(count, seen) {
  if (seen == null) return 0;
  return Math.max(0, (Number(count) || 0) - (Number(seen) || 0));
}

/** "7", or "99+" once it stops mattering exactly how many. */
export function formatUnread(n) {
  return n > 99 ? '99+' : String(n);
}

/** Unread for one session row — 0 while the feature is off. */
export function unreadFor(session) {
  if (!store.unreadCounters || !session) return 0;
  return unreadCount(session.assistantCount, store.unreadSeen[session.sessionId]);
}

/**
 * Is the number still moving? While the session works it is a progress count
 * — drawn grey, nothing to act on yet. Once the turn is over, or the session
 * is waiting on you, it is a reply to read — drawn in the accent. Same lanes as
 * the board (session-column.js), so the two views cannot disagree.
 */
export function unreadStillComing(sessionId) {
  return columnOf(sessionId, stateFromStore(store)) === 'running';
}

// ── Persistence ───────────────────────────────────────────────────

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

let saveTimer = null;
/** Baselines changed since the database last heard. */
const dirty = new Set();
/** Until the database has answered, "first sight" would be a guess. */
let loaded = false;

function saveSoon(known) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (dirty.size && window.api?.setUnreadSeen) {
      const batch = {};
      for (const id of dirty) if (store.unreadSeen[id] != null) batch[id] = store.unreadSeen[id];
      dirty.clear();
      window.api.setUnreadSeen(batch).catch(() => {});
    }
    // Only sessions that still exist — the map would otherwise grow by one
    // entry for every session ever opened.
    const out = {};
    for (const [id, seen] of Object.entries(store.unreadSeen)) {
      if (!known.size || known.has(id)) out[id] = seen;
    }
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(out)); } catch {}
  }, 1000);
}

// ── Tracking ──────────────────────────────────────────────────────

/** Every session the app knows, by id → its message count. */
const counts = computed(() => {
  const map = new Map();
  for (const list of [store.allProjects, store.projects]) {
    for (const p of list || []) {
      for (const s of p.sessions || []) {
        if (!map.has(s.sessionId)) map.set(s.sessionId, s.assistantCount || 0);
      }
    }
  }
  return map;
});

/**
 * The session on screen right now, if any. A session is read while it is the
 * open one in the Sessions or Board tab and the window is showing — nothing
 * counts as seen behind another tab, or in a window on another space.
 */
function visibleSessionId() {
  if (document.hidden) return null;
  if (store.activeTab !== 'sessions' && store.activeTab !== 'board') return null;
  return store.activeSessionId || null;
}

function sync() {
  if (!store.unreadCounters || !loaded) return;
  const map = counts.value;
  const seen = store.unreadSeen;
  const visible = visibleSessionId();
  let changed = false;
  for (const [id, count] of map) {
    // First sight starts at "all read"; the open session stays read.
    if (seen[id] == null || id === visible) {
      if (seen[id] !== count) { seen[id] = count; dirty.add(id); changed = true; }
    }
  }
  if (changed) saveSoon(new Set(map.keys()));
}

/** Everything counts as read as of now — for switching the feature on. */
function baselineAll() {
  for (const [id, count] of counts.value) { store.unreadSeen[id] = count; dirty.add(id); }
  saveSoon(new Set(counts.value.keys()));
}

// ── Buddy ─────────────────────────────────────────────────────────
//
// Buddy's session is hidden from the lists, so it has no cache row to count
// from. Its messages are counted as they stream in instead, while its tab is
// not the one showing.

let lastBuddyMessage = null;

function buddyVisible() {
  return store.activeTab === 'chat' && !document.hidden;
}

function setBuddyUnread(n) {
  store.buddyUnread = n;
  try { localStorage.setItem(BUDDY_KEY, String(n)); } catch {}
}

function onSdkMessage(id, message) {
  if (!id || id !== store.chatSession?.sessionId) return;
  if (message?.type !== 'assistant') return;
  const messageId = message.message?.id || null;
  // One per message, not per streamed block of it.
  if (messageId && messageId === lastBuddyMessage) return;
  lastBuddyMessage = messageId;
  if (!store.unreadCounters || buddyVisible()) return;
  setBuddyUnread((store.buddyUnread || 0) + 1);
}

/**
 * Take in what the database knows — including what another window or the
 * other build has read since — and hand it whatever only this one knows.
 */
async function pullFromDb() {
  if (!window.api?.getUnreadSeen) { loaded = true; return; }
  try {
    const remote = await window.api.getUnreadSeen();
    const { merged, ahead } = mergeSeen(store.unreadSeen, remote);
    for (const [id, seen] of Object.entries(merged)) {
      if (store.unreadSeen[id] !== seen) store.unreadSeen[id] = seen;
    }
    ahead.forEach(id => dirty.add(id));
  } catch {}
  loaded = true;
  sync();
  if (dirty.size) saveSoon(new Set(counts.value.keys()));
}

/** Start counting. Once, from App.vue. */
export function installUnreadTracking() {
  store.unreadSeen = loadJson(SEEN_KEY, {}) || {};
  pullFromDb();
  store.buddyUnread = Number(localStorage.getItem(BUDDY_KEY)) || 0;

  watch(counts, sync);
  watch(() => [store.activeSessionId, store.activeTab], sync);
  watch(() => store.unreadCounters, (on, was) => {
    if (on && !was) { baselineAll(); setBuddyUnread(0); }
  });

  watch(() => store.activeTab, () => { if (buddyVisible()) setBuddyUnread(0); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pullFromDb();
    sync();
    if (buddyVisible()) setBuddyUnread(0);
  });

  window.api?.onSdkMessage?.(onSdkMessage);
}

/** The Sessions tab's number: every unread message across the listed sessions. */
export const totalUnread = computed(() => {
  if (!store.unreadCounters) return 0;
  let total = 0;
  for (const p of store.projects || []) {
    for (const s of p.sessions || []) total += unreadCount(s.assistantCount, store.unreadSeen[s.sessionId]);
  }
  return total;
});
