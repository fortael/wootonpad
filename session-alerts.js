// session-alerts.js — when a session is worth a system notification.
//
// Two moments, the same two the dock already cares about, told with more
// words and heard from anywhere:
//
//   waiting   a session stopped to ask something — a permission, a question,
//             a dialog. Work is blocked on you, so this one always notifies,
//             with a sound unless that is switched off.
//   finished  a turn ended. Only worth saying if it took a while: a two-second
//             answer you will see anyway is noise. The threshold is a setting
//             (notifyMinWorkSeconds).
//
// Never about the session you are looking at: the window in front, showing
// that session, is already the notification.
//
// Fed by session-status.js transitions. Everything Electron is injected, so
// the rules can be tested without it.

/**
 * @param {object} deps
 * @param {(n: { kind: 'waiting'|'finished', sessionId: string, title: string, body: string, sound: boolean }) => void} deps.notify
 * @param {() => { notifyEnabled?: boolean, notifyMinWorkSeconds?: number, notifySound?: boolean }} deps.settings
 * @param {(sessionId: string) => boolean} deps.isWatching   window focused and showing this session
 * @param {(sessionId: string) => string} deps.titleFor
 * @param {() => number} [deps.now]
 */
function createSessionAlerts(deps) {
  const now = deps.now || Date.now;
  /** sessionId → when the current turn started, ms. */
  const turnStart = new Map();

  function settings() {
    const s = deps.settings() || {};
    return {
      enabled: s.notifyEnabled !== false,
      minMs: Math.max(0, Number(s.notifyMinWorkSeconds ?? 3)) * 1000,
      sound: s.notifySound !== false,
    };
  }

  /**
   * One state change of one session.
   * @param {string} sessionId
   * @param {{ state: string, message?: string|null, tool?: string|null, lastAssistantMessage?: string|null }} snapshot
   */
  function onChange(sessionId, snapshot) {
    const state = snapshot?.state;
    if (!sessionId || !state) return;

    if (state === 'running') {
      // The turn starts when work does; coming back from a question is the
      // same turn carrying on.
      if (!turnStart.has(sessionId)) turnStart.set(sessionId, now());
      return;
    }
    if (state === 'exited') { turnStart.delete(sessionId); return; }

    const conf = settings();

    if (state === 'requires_action') {
      if (!conf.enabled || deps.isWatching(sessionId)) return;
      deps.notify({
        kind: 'waiting',
        sessionId,
        title: `Waiting for you · ${deps.titleFor(sessionId)}`,
        body: waitingReason(snapshot),
        sound: conf.sound,
      });
      return;
    }

    if (state === 'idle') {
      const started = turnStart.get(sessionId);
      turnStart.delete(sessionId);
      if (started == null || !conf.enabled) return;
      const worked = now() - started;
      if (worked < conf.minMs || deps.isWatching(sessionId)) return;
      const said = clip(snapshot.lastAssistantMessage);
      deps.notify({
        kind: 'finished',
        sessionId,
        title: `Done · ${deps.titleFor(sessionId)}`,
        body: said ? `${formatSpan(worked)} · ${said}` : `Worked ${formatSpan(worked)}`,
        sound: false,
      });
    }
  }

  function rekey(oldId, newId) {
    if (!turnStart.has(oldId)) return;
    turnStart.set(newId, turnStart.get(oldId));
    turnStart.delete(oldId);
  }

  return { onChange, rekey, /** test seam */ turnStart };
}

/** What the session is waiting on, as the notification's line. */
function waitingReason(snapshot) {
  if (snapshot?.message) return clip(snapshot.message);
  const tool = snapshot?.tool;
  if (tool === 'AskUserQuestion' || tool === 'ask_user_question') return 'Has a question for you';
  if (tool) return `Wants to use ${tool}`;
  return 'Needs your answer to go on';
}

function clip(text, max = 140) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** 7s, 4m 05s, 1h 12m. */
function formatSpan(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

module.exports = { createSessionAlerts, formatSpan, waitingReason };
