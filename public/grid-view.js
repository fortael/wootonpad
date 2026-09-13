// --- Session Grid Overview ---
// No reparenting — terminals stay in #terminals. We wrap each terminal container
// with an in-place card overlay (header/footer) and switch #terminals to grid layout.
//
// Depends on globals from app.js: openSessions, activeSessionId, sessionMap, activePtyIds,
// sortedOrder, sidebarContent, terminalsEl, gridViewActive, gridViewer,
// placeholder, terminalHeader, planViewer, memoryViewer, terminalArea, cachedProjects, isMac
// Vue-managed panels (stats, jsonl, settings) are hidden via window.vueStore
// Depends on: cleanDisplayName, formatDate (utils.js), fitAndScroll, showSession (terminal-manager.js)

let gridCards = new Map(); // sessionId → card wrapper element
/** sessionId → the mounted chat card, for the sessions that have one. */
let gridChats = new Map();
let gridFocusedSessionId = null;

/**
 * The count in the grid's header bar.
 *
 * One function because three callers used to spell the same sentence out for
 * themselves, and when the Vue migration turned `gridViewerCount` from a DOM
 * element into a store field it converted two of them. The third kept writing
 * `.textContent` on a global that no longer existed, and threw every time a
 * session was first shown in the grid — which aborted the rest of showSession
 * and openSession with it.
 *
 * `showGridView` passes its own count because it is mid-build: the cards are
 * wrapped but `gridCards` is not what it is about to become.
 */
function setGridViewerCount(count = gridCards.size) {
  if (!window.vueStore) return;
  window.vueStore.gridViewerCount = count + ' session' + (count !== 1 ? 's' : '');
}

/** Is this session drawn as a chat rather than a terminal? */
function isSdkSession(sessionId) {
  return !!window.vueStore?.sdkSessionIds?.has(sessionId);
}

/**
 * The body of a chat session's card: its transcript, read-only.
 *
 * A PTY session's card holds the terminal itself, live and typeable. A chat has
 * no terminal to hold — the conversation is one Vue component bound to the
 * session in the header — so these cards used to come out empty. This mounts
 * the transcript on its own, which is a thing there can be several of.
 *
 * Scrolling reads back through it. Anything else opens the session for real:
 * the card is for watching, and a screen of composers is not.
 */
function mountChatBody(card, sessionId) {
  const slot = document.createElement('div');
  slot.className = 'grid-card-chat';
  card.appendChild(slot);

  const chat = window.createSdkGridCard?.(slot, sessionId);
  if (!chat) return slot;
  gridChats.set(sessionId, chat);

  // Vue mounts the component's own root inside the slot, and that root is the
  // element that scrolls — so it is the one the gestures below have to read.
  const scroller = slot.firstElementChild;
  if (!scroller) return slot;

  // A click, not a drag and not a scroll. Reading back through a card moves
  // the pointer and the scroll position, and neither should throw you out of
  // the grid into the session.
  let down = null;
  scroller.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY, top: scroller.scrollTop };
  });
  scroller.addEventListener('click', (event) => {
    const from = down;
    down = null;
    if (!from) return;
    if (Math.abs(event.clientX - from.x) > 4 || Math.abs(event.clientY - from.y) > 4) return;
    if (scroller.scrollTop !== from.top) return;
    // A fold inside the transcript is part of reading it, not a way out.
    if (event.target.closest('.jsonl-toggle, .jsonl-tool-header, a')) return;
    gridFocusedSessionId = sessionId;
    toggleGridView();
  });

  return slot;
}

function wrapInGridCard(sessionId) {
  const entry = openSessions.get(sessionId);
  const session = sessionMap.get(sessionId) || (entry && entry.session);
  if (!session || !entry) return;

  const displayName = cleanDisplayName(session.name || session.aiTitle || session.summary) || sessionId;
  const shortProject = session.projectPath ? session.projectPath.split('/').filter(Boolean).slice(-2).join('/') : '';

  const card = document.createElement('div');
  card.className = 'grid-card';
  card.dataset.sessionId = sessionId;

  const header = document.createElement('div');
  header.className = 'grid-card-header';
  card.appendChild(header);

  const chatBody = isSdkSession(sessionId) ? mountChatBody(card, sessionId) : null;
  if (!chatBody) {
    entry.element.classList.add('visible', 'grid-mode');
    card.appendChild(entry.element);
  }

  const footer = document.createElement('div');
  footer.className = 'grid-card-footer';
  card.appendChild(footer);

  // Insert card into the correct project group in the grid
  if (gridViewActive) {
    const pp = session.projectPath || '';
    let targetHeading = null;
    for (const h of terminalsEl.querySelectorAll('.grid-project-heading')) {
      if (h.dataset.projectPath === pp) { targetHeading = h; break; }
    }
    if (!targetHeading) {
      targetHeading = document.createElement('div');
      targetHeading.className = 'grid-project-heading';
      targetHeading.dataset.projectPath = pp;
      targetHeading.textContent = pp ? pp.split('/').filter(Boolean).slice(-2).join('/') : 'Other';
      const orderIndex = new Map(sortedOrder.map((e, i) => [e.projectPath, i]));
      const myIdx = orderIndex.get(pp);
      let inserted = false;
      if (myIdx !== undefined) {
        for (const h of terminalsEl.querySelectorAll('.grid-project-heading')) {
          const hIdx = orderIndex.get(h.dataset.projectPath);
          if (hIdx !== undefined && hIdx > myIdx) {
            terminalsEl.insertBefore(targetHeading, h);
            inserted = true;
            break;
          }
        }
      }
      if (!inserted) terminalsEl.appendChild(targetHeading);
    }
    let insertBefore = targetHeading.nextSibling;
    while (insertBefore && !insertBefore.classList.contains('grid-project-heading')) {
      insertBefore = insertBefore.nextSibling;
    }
    terminalsEl.insertBefore(card, insertBefore);
  } else {
    terminalsEl.appendChild(card);
  }

  // Card is now in DOM — mount Vue reactive header/footer via Teleport
  const { initials: gI, color: gC } = getProjectAvatar(session.projectPath || '');
  const running0 = activePtyIds.has(sessionId);
  const busy0 = sessionBusyState.get(sessionId) || false;
  const time0 = formatDate(lastActivityTime.get(sessionId) || new Date(session.modified));
  window.vueGrid?.addCard(sessionId, header, footer, {
    name: displayName,
    project: shortProject,
    initials: gI,
    color: gC,
    running: running0,
    busy: busy0,
    time: time0,
  });

  header.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    focusGridCard(sessionId);
  });
  header.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    gridFocusedSessionId = sessionId;
    toggleGridView();
  });
  footer.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    focusGridCard(sessionId);
  });
  // Only a terminal takes focus. A chat card has nothing focusable in it —
  // that is what makes it a card you watch rather than one you work in.
  if (!chatBody) {
    entry.element.addEventListener('focusin', () => {
      if (gridViewActive && gridFocusedSessionId !== sessionId) {
        focusGridCard(sessionId);
      }
    });
  }

  gridCards.set(sessionId, card);
}

function unwrapGridCards() {
  for (const [sid, card] of gridCards) {
    window.vueGrid?.removeCard(sid);
    // A chat card owns its Vue app; leaving it mounted would leave its
    // `sdk-message` listener running against a card that is no longer anywhere.
    gridChats.get(sid)?.destroy();
    const entry = openSessions.get(sid);
    if (entry && !gridChats.has(sid)) {
      entry.element.classList.remove('grid-mode', 'visible');
      card.parentNode.insertBefore(entry.element, card);
    }
    card.remove();
  }
  gridChats.clear();
  gridCards.clear();
  terminalsEl.querySelectorAll('.grid-project-heading').forEach(el => el.remove());
}

function focusGridCard(sessionId) {
  gridFocusedSessionId = sessionId;
  setActiveSession(sessionId);
  clearNotifications(sessionId);
  // Update sidebar active highlight
  document.querySelectorAll('.session-item.active').forEach(el => el.classList.remove('active'));
  const sidebarItem = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
  if (sidebarItem) sidebarItem.classList.add('active');
  // Update visual focus
  document.querySelectorAll('.grid-card').forEach(c => c.classList.remove('focused'));
  const card = gridCards.get(sessionId);
  if (card) {
    card.classList.add('focused');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  // A chat card has no terminal to hand the keyboard to, and taking it would
  // only steal it from wherever it usefully was.
  if (gridChats.has(sessionId)) return;
  const entry = openSessions.get(sessionId);
  if (entry) entry.terminal.focus();
}

function showGridView({ remember = true } = {}) {
  gridViewActive = true;
  if (remember) localStorage.setItem('gridViewActive', '1');
  placeholder.style.display = 'none';
  terminalHeader.style.display = 'none';

  // Hide other viewers but keep terminal-area visible
  if (window.vueStore) {
    window.vueStore.planViewerOpen = false;
    window.vueStore.settingsOpen = false;
    window.vueStore.showJsonl = false;
    window.vueStore.gridViewActive = true;
  }
  terminalArea.style.display = '';

  // Switch #terminals to grid layout
  terminalsEl.classList.add('grid-layout');

  // Collect open (non-closed) session IDs
  const openSet = new Set();
  for (const [sid, entry] of openSessions) {
    if (!entry.closed) openSet.add(sid);
  }

  // Use cachedProjects sorted by sortedOrder — same grouping & order as sidebar
  let projects = [...cachedProjects];
  if (sortedOrder.length > 0) {
    const orderIndex = new Map(sortedOrder.map((e, i) => [e.projectPath, i]));
    projects.sort((a, b) => {
      const aPos = orderIndex.get(a.projectPath);
      const bPos = orderIndex.get(b.projectPath);
      if (aPos !== undefined && bPos !== undefined) return aPos - bPos;
      if (aPos === undefined && bPos !== undefined) return -1;
      if (aPos !== undefined && bPos === undefined) return 1;
      return 0;
    });
  }

  // Hide all terminals first, then wrap cards in sidebar order (grouped by project)
  document.querySelectorAll('.terminal-container').forEach(el => el.classList.remove('visible'));
  const sessionIds = [];
  // Walk sidebar items to get sessions in display order, grouped by project
  const sidebarItems = sidebarContent.querySelectorAll('.session-item[data-session-id]');
  let currentProjectPath = null;
  for (const item of sidebarItems) {
    const sid = item.dataset.sessionId;
    if (!openSet.has(sid)) continue;
    // Determine project path for this session
    const session = sessionMap.get(sid);
    const projectPath = session ? session.projectPath : null;
    // Add project heading when project changes
    if (projectPath && projectPath !== currentProjectPath) {
      currentProjectPath = projectPath;
      const heading = document.createElement('div');
      heading.className = 'grid-project-heading';
      heading.dataset.projectPath = projectPath;
      heading.textContent = projectPath.split('/').filter(Boolean).slice(-2).join('/');
      terminalsEl.appendChild(heading);
    }
    wrapInGridCard(sid);
    sessionIds.push(sid);
  }

  // Show grid header bar with session count
  setGridViewerCount(sessionIds.length);

  // Fit all terminals after layout resolves. A chat card has none to fit —
  // fitting the unused one behind it would only cost a resize round trip.
  for (const sid of sessionIds) {
    if (gridChats.has(sid)) continue;
    const entry = openSessions.get(sid);
    if (entry) fitAndScroll(entry);
  }
  // Focus active or first (deferred so fitAndScroll's rAF runs first)
  requestAnimationFrame(() => {
    const toFocus = activeSessionId && sessionIds.includes(activeSessionId) ? activeSessionId : sessionIds[0];
    if (toFocus) focusGridCard(toFocus);
  });
}

function updateGridColumns() {
  if (!gridViewActive) return;
  const width = terminalsEl.clientWidth;
  const minCardWidth = 560;
  const gap = 14;
  const fitCols = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
  const cardCount = terminalsEl.querySelectorAll('.grid-card').length;
  const cols = Math.max(1, Math.min(fitCols, cardCount || 1));
  terminalsEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
}

// initGridObservers is called from app.js after DOM refs are ready
function initGridObservers() {
  new ResizeObserver(updateGridColumns).observe(terminalsEl);
  new MutationObserver(updateGridColumns).observe(terminalsEl, { childList: true });
}

function hideGridView({ remember = true } = {}) {
  gridViewActive = false;
  if (remember) localStorage.setItem('gridViewActive', '0');
  unwrapGridCards();
  terminalsEl.classList.remove('grid-layout');
  terminalsEl.style.gridTemplateColumns = '';
  if (window.vueStore) window.vueStore.gridViewActive = false;
}

// --- Grid suspension across tabs ------------------------------------------
//
// The grid is a mode of the sessions tab, not of the application. The board
// draws its own view, and its preview pane shows the one session whose card
// you clicked — so laying the grid of every open session into it answers a
// question nobody asked, and for a chat session it put a read-only card where
// the conversation should be.
//
// Leaving the tab therefore takes the grid down and coming back puts it up
// again, without touching the stored preference that says whether it belongs
// there at all. `gridViewActive` stays the honest answer to "is the grid on
// screen" — which is what SessionSdkApp's own visibility reads.
let gridSuspended = false;

function suspendGridView() {
  if (!gridViewActive) return;
  gridSuspended = true;
  hideGridView({ remember: false });
}

function resumeGridView() {
  if (!gridSuspended) return;
  gridSuspended = false;
  showGridView({ remember: false });
}

function toggleGridView() {
  // An explicit toggle is a new decision; it outranks whatever the last tab
  // switch left suspended.
  gridSuspended = false;
  // The shortcut is global but the grid only exists on the sessions tab, so
  // asking for it from the board is asking to go there. Without this the grid
  // could be switched on underneath a tab that draws its own main area, which
  // is the state the suspension above exists to prevent.
  if (window.vueStore && window.vueStore.activeTab !== 'sessions') {
    window.vueApp?.setTab?.('sessions');
  }
  if (gridViewActive) {
    const restoreId = gridFocusedSessionId || activeSessionId;
    hideGridView();
    gridFocusedSessionId = null;
    if (restoreId && openSessions.has(restoreId)) {
      showSession(restoreId);
    } else {
      placeholder.style.display = '';
    }
  } else {
    terminalHeader.style.display = 'none';
    showGridView();
  }
}

// --- Session navigation (Cmd+Shift+[/], Cmd+Arrow) ---

// Returns ordered list of open (non-closed) session IDs matching sidebar order.
function getOrderedOpenSessionIds() {
  const items = sidebarContent.querySelectorAll('.session-item[data-session-id]');
  const ids = [];
  for (const item of items) {
    const sid = item.dataset.sessionId;
    const entry = openSessions.get(sid);
    if (entry && !entry.closed) ids.push(sid);
  }
  return ids;
}

function navigateSession(direction) {
  const ids = getOrderedOpenSessionIds();
  const current = gridViewActive ? gridFocusedSessionId : activeSessionId;
  const idx = ids.indexOf(current);
  let next;
  if (idx === -1) {
    next = ids[0];
  } else {
    next = ids[(idx + direction + ids.length) % ids.length];
  }
  if (ids.length === 0 || !next) return;
  if (gridViewActive) {
    focusGridCard(next);
  } else {
    showSession(next);
  }
}

// Navigate the grid in 2D by visual position using bounding rects.
// Project headings break the simple index math, so we use actual screen positions.
function navigateGrid(direction) {
  if (!gridViewActive) return;
  const cards = [...terminalsEl.querySelectorAll('.grid-card')];
  if (cards.length === 0) return;
  const currentCard = gridCards.get(gridFocusedSessionId || activeSessionId);
  if (!currentCard || !cards.includes(currentCard)) {
    for (const [sid, card] of gridCards) {
      if (card === cards[0]) { focusGridCard(sid); return; }
    }
    return;
  }
  const cur = currentCard.getBoundingClientRect();
  const curCx = cur.left + cur.width / 2;
  const curCy = cur.top + cur.height / 2;
  let best = null;
  let bestDist = Infinity;
  for (const card of cards) {
    if (card === currentCard) continue;
    const r = card.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Filter by direction
    const dx = cx - curCx;
    const dy = cy - curCy;
    let valid = false;
    switch (direction) {
      case 'left':  valid = dx < -10; break;
      case 'right': valid = dx > 10; break;
      case 'up':    valid = dy < -10; break;
      case 'down':  valid = dy > 10; break;
    }
    if (!valid) continue;
    // For left/right prefer same row (small dy), for up/down prefer same column (small dx)
    let dist;
    if (direction === 'left' || direction === 'right') {
      dist = Math.abs(dy) * 3 + Math.abs(dx);
    } else {
      dist = Math.abs(dx) * 3 + Math.abs(dy);
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = card;
    }
  }
  if (!best) return;
  for (const [sid, card] of gridCards) {
    if (card === best) { focusGridCard(sid); return; }
  }
}

// Returns true if the key combo is a session nav shortcut (used by xterm to block without acting)
function isSessionNavKey(e) {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (!mod || e.altKey) return false;
  if (e.shiftKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) return true;
  if (!e.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return true;
  return false;
}

function handleSessionNavKey(e) {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (!mod || e.altKey) return false;

  // Cmd+Shift+[ or Cmd+Shift+] — prev/next session
  // On macOS, Shift changes e.key to { / }, so check code for reliable matching
  if (e.shiftKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
    e.preventDefault();
    if (e.type === 'keydown') navigateSession(e.code === 'BracketLeft' ? -1 : 1);
    return true;
  }

  // Cmd+Arrow — in grid view: 2D grid navigation; in single view: left/right cycle sessions
  if (!e.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    if (e.type === 'keydown') {
      if (gridViewActive) {
        const dirMap = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
        navigateGrid(dirMap[e.key]);
      } else {
        const dir = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1;
        navigateSession(dir);
      }
    }
    return true;
  }

  return false;
}
