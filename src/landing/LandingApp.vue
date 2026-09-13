<template>
  <div class="lp-root">

    <!-- Ambient light. Three blurred blobs and a grid, fixed behind every
         section so the page keeps one continuous backdrop instead of a seam
         at each section border. Purely decorative — pointer-events: none. -->
    <div class="lp-aurora" aria-hidden="true">
      <span class="lp-aurora__grid"></span>
      <span class="lp-aurora__blob lp-aurora__blob--1"></span>
      <span class="lp-aurora__blob lp-aurora__blob--2"></span>
      <span class="lp-aurora__blob lp-aurora__blob--3"></span>
    </div>

    <!-- ── HERO ───────────────────────────────────────────────── -->
    <header class="lp-hero">
      <!-- The page's own theme switch. It runs the same toggleTheme the demo
           window's nav button runs, so flipping either one flips both — and
           the fake terminal with them. -->
      <button
        type="button"
        class="lp-theme-toggle"
        :aria-label="store.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'"
        :title="store.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'"
        @click="toggleTheme"
      >
        <SbIcon :name="store.theme === 'light' ? 'moon' : 'sun'" :size="14" />
        <span class="lp-theme-toggle__label">{{ store.theme === 'light' ? 'Dark' : 'Light' }}</span>
      </button>

      <div class="lp-hero-inner">
        <img class="lp-logo" :src="iconUrl" alt="Wooton Pad icon" width="72" height="72">
        <h1 class="lp-title">Wooton Pad</h1>
        <p class="lp-tagline">The session manager for Claude Code</p>
        <div class="lp-cta">
          <a class="lp-btn-primary" href="https://github.com/fortael/wootonpad/releases" target="_blank" rel="noopener">
            Download
          </a>
          <a class="lp-btn-secondary" href="https://github.com/fortael/wootonpad" target="_blank" rel="noopener">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
            <span v-if="stars !== null" class="lp-stars">★ {{ stars }}</span>
          </a>
        </div>
        <div class="lp-platforms">
          <span>macOS</span><span>·</span><span>Linux</span><span>·</span><span>Windows</span>
        </div>
      </div>
    </header>

    <!-- ── INTERACTIVE DEMO ──────────────────────────────────── -->
    <section class="lp-demo-section">
      <div class="lp-section-inner">
        <h2 class="lp-section-title">Try the real interface</h2>
        <p class="lp-section-subtitle lp-demo-subtitle">
          Not a screenshot. Every tab, filter and panel below is the app's own Vue
          component running on mock data — click around.
        </p>

        <!-- The demo below renders the app's own components (TopNavApp,
             CommandBar, UnreadRail, FilterTabs, SidebarApp,
             SessionHeaderApp, SessionPanelRail, SessionSidePanelApp,
             SessionBoardApp …) inside App.vue's wrapper markup, driven by
             mock-data.js. Change a component in src/vue/components and this
             picks it up with no edit here. -->
        <div class="lp-app-window" :data-theme="store.theme">
          <!-- The window has no title bar of its own: main.js runs with
               titleBarStyle 'hiddenInset', so the top nav IS the top of the
               window and only reserves a gap for the traffic lights. -->
          <div class="lp-traffic-lights" aria-hidden="true">
            <span class="lp-tl lp-tl-close"></span>
            <span class="lp-tl lp-tl-min"></span>
            <span class="lp-tl lp-tl-max"></span>
          </div>

          <!-- ── App shell — mirrors src/vue/components/App.vue ──────── -->
          <div class="sbx-shell">
            <TopNavApp
              :tabs="store.sidebarCollapsed ? [] : TABS"
              :active-id="store.activeTab"
              :theme="store.theme"
              :sidebar-collapsed="store.sidebarCollapsed"
              :can-toggle-sidebar="true"
              @select="setTab"
              @settings="onGlobalSettings"
              @toggle-sidebar="store.sidebarCollapsed = !store.sidebarCollapsed"
              @toggle-theme="toggleTheme"
            >
              <template #account>
                <AccountDropdownApp ref="accountDropdownRef" :callbacks="accountDropdownCallbacks" />
              </template>
            </TopNavApp>

            <div class="sbx-shell__body">
              <CollapsedRailApp
                v-if="store.sidebarCollapsed"
                :tabs="TABS"
                :active-id="store.activeTab"
                :projects="attentionProjects"
                :active-project="store.attentionProject"
                @select="setTab"
                @select-project="onSelectAttentionProject"
                @settings="onGlobalSettings"
                @expand="store.sidebarCollapsed = false"
              />

              <div id="sidebar" v-show="!store.sidebarCollapsed">
                <CommandBar
                  :model-value="store.searchQuery"
                  :placeholder="searchPlaceholder"
                  add-title="Quick open"
                  @update:model-value="onSearchValue"
                  @add="openSpotlight"
                  @spotlight="openSpotlight"
                >
                  <template #field-actions>
                    <button
                      v-show="store.searchQuery"
                      type="button"
                      class="sbx-commandbar__chip"
                      aria-label="Clear search"
                      @click="doClearSearch"
                    >&times;</button>
                  </template>
                </CommandBar>

                <!-- Not scoped to the sessions tab any more: live sessions are
                     worth watching from wherever you are. The board is the one
                     exception — it already shows every one of them as a card. -->
                <UnreadRail
                  v-if="store.activeTab !== 'board'"
                  :items="unreadRows"
                  :active-session-id="store.activeSessionId || ''"
                  @select="onSelectUnread"
                />

                <!-- Shared with the board: same sessions, same filter flags. -->
                <FilterTabs
                  v-if="sessionListVisible || store.activeTab === 'board'"
                  :class="{ 'sbx-filtertabs--no-views': store.activeTab === 'board' }"
                  :tabs="FILTER_TABS"
                  :active="store.sessionFilterTab"
                  :view-mode="store.sidebarViewMode"
                  @select="onFilterTab"
                  @update:view-mode="onViewMode"
                >
                  <template #actions>
                    <span id="loading-status" v-show="store.loadingStatus">{{ store.loadingStatus }}</span>
                    <button
                      type="button"
                      class="sbx-filtertabs__view"
                      data-tooltip="Refresh sessions"
                      aria-label="Refresh sessions"
                      @click="onResort"
                    >
                      <SbIcon name="refresh-cw" :size="13" tone="muted" />
                    </button>
                  </template>
                </FilterTabs>

                <div id="sidebar-content" class="sbx-sidebar-panel sbx-sidebar-panel--blocks" v-show="sessionListVisible">
                  <SidebarApp :callbacks="sidebarCallbacks" />
                </div>
                <div id="plans-content" class="sbx-sidebar-panel sbx-sidebar-panel--blocks" v-show="store.activeTab === 'plans'">
                  <PlansApp ref="plansRef" :callbacks="planCallbacks" />
                </div>
                <div id="accounts-content" class="sbx-sidebar-panel sbx-sidebar-panel--blocks" v-show="store.activeTab === 'accounts'">
                  <AccountsApp ref="accountsRef" :callbacks="accountsCallbacks" />
                </div>
                <div id="projects-content" class="sbx-sidebar-panel sbx-sidebar-panel--blocks" v-show="store.activeTab === 'projects'">
                  <ProjectsApp ref="projectsRef" :callbacks="projectsCallbacks" />
                </div>
                <div id="board-sidebar-content" class="sbx-sidebar-panel sbx-sidebar-panel--blocks" v-show="store.activeTab === 'board'">
                  <BoardSidebarApp :callbacks="boardSidebarCallbacks" />
                </div>
              </div>

              <div id="sidebar-resize-handle" v-show="!store.sidebarCollapsed"></div>

              <div
                id="main"
                :class="{ 'is-board': store.showBoard, 'has-board-split': boardSplitActive }"
                :style="{ '--sbx-board-split': store.boardSplitHeight + 'px' }"
              >
                <div id="board-viewer" v-show="store.showBoard">
                  <SessionBoardApp ref="boardRef" />
                </div>

                <!-- The three main-area pages a click in the sidebar opens.
                     Same components, same containers and same stylesheets the
                     app uses; only what fills them is mocked. -->
                <div id="plan-viewer" v-show="mainView === 'plan'">
                  <ViewerContentApp
                    ref="planViewerRef"
                    language="markdown"
                    storage-key="markdownPreviewMode"
                    :show-copy-path="true"
                    :show-copy-content="true"
                    :on-close="closeMainView"
                  />
                </div>

                <div id="account-viewer" v-show="mainView === 'account'">
                  <AccountViewerApp ref="accountViewerRef" />
                </div>

                <div id="project-viewer" v-show="mainView === 'project'">
                  <ProjectViewerApp ref="projectViewerRef" :callbacks="projectViewerCallbacks" />
                </div>

                <!-- Drag the seam between the board and the session below it. -->
                <div
                  v-if="boardSplitActive"
                  class="sbx-board-splitter"
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize the session pane"
                  @mousedown.prevent="startBoardResize"
                ></div>

                <div
                  v-show="mainView === 'session' && (!store.showBoard || boardSplitActive)"
                  id="terminal-area"
                  :class="{ 'has-side-panel': sidePanelVisible }"
                  :style="{ '--sbx-sidepanel-w': store.sidePanelWidth + 'px' }"
                >
                  <div id="vue-session-header">
                    <SessionHeaderApp />
                  </div>

                  <!-- The panel toggles, Stop and Close all live on this rail
                       now — overlaid on the terminal's top-right corner rather
                       than in the session header, so they reach the board's
                       bottom split too. -->
                  <SessionPanelRail v-if="store.headerSession" />
                  <SessionSidePanelApp v-if="sidePanelVisible" />

                  <!-- No PTY on a landing page: a static transcript rendered
                       from mock-data.js, not an xterm instance. -->
                  <div v-if="activeSession" class="lp-term">
                    <template v-for="(line, i) in terminalLines" :key="i">
                      <div v-if="line.t === 'logo'" class="lp-term-logo-block">
                        <div v-for="(art, ri) in line.logo" :key="ri" class="lp-term-line lp-term-logo-row">
                          <span class="lp-term-logo-art">{{ art }}</span>
                          <span class="lp-term-logo-meta" :class="'lp-logo-meta-' + ri">{{ line.info[ri] }}</span>
                        </div>
                      </div>
                      <div v-else-if="line.t === 'blank'" class="lp-term-blank"></div>
                      <div v-else-if="line.t === 'opt-sel'" class="lp-term-line lp-term-opt-sel">
                        <span class="lp-opt-cursor">❯</span>{{ line.v }}
                      </div>
                      <div v-else-if="line.t === 'sh-prompt'" class="lp-term-line lp-term-sh-prompt">
                        <span class="lp-sh-cwd">{{ line.cwd }}</span>
                        <span v-if="line.branch" class="lp-sh-branch">&nbsp;on <span class="lp-sh-branch-name">{{ line.branch }}</span></span>
                      </div>
                      <div v-else-if="line.t === 'sh-cmd'" class="lp-term-line lp-term-sh-cmd">
                        <span class="lp-sh-arrow">❯</span> {{ line.v }}
                      </div>
                      <div v-else-if="line.t === 'sh-cursor'" class="lp-term-line lp-term-sh-cmd">
                        <span class="lp-sh-arrow">❯</span> <span class="lp-sh-block-cursor">█</span>
                      </div>
                      <div v-else-if="line.t === 'spin'" class="lp-term-line lp-term-spin">
                        <span class="lp-spinner-char">{{ spinChar }}</span> {{ line.v }}
                      </div>
                      <div v-else-if="line.t === 'wait'" class="lp-term-line lp-term-wait">
                        <span class="lp-wait-cursor">▋</span> {{ line.v }}
                      </div>
                      <div v-else class="lp-term-line" :class="'lp-term-' + line.t">{{ line.v }}</div>
                    </template>
                  </div>

                  <div v-else class="lp-demo-placeholder">Select a session from the sidebar to begin.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── FEATURES ─────────────────────────────────────────────
         Three showcase panels, each one holding the component it is talking
         about — the same ones the demo window mounts, on the same mock data —
         followed by a compact grid for everything that does not need a
         picture to be understood. -->
    <section class="lp-features">
      <div class="lp-section-inner">
        <h2 class="lp-section-title">Everything Claude Code needs</h2>
        <p class="lp-section-subtitle">
          One window for every session, project and account. Each panel below is
          the live component, not an illustration of it.
        </p>

        <div class="lp-showcase">

          <!-- ① Multi-account ──────────────────────────────────────
               First, and with the real switcher in it: two Claude plans in
               one window is the thing people come here for. -->
          <article class="lp-show lp-show--accounts lp-bento-accent-blue">
            <div class="lp-show__copy">
              <div class="lp-show__eyebrow">
                <SbIcon name="users" :size="13" />
                Multi-account
              </div>
              <h3>Two Claude plans, one window</h3>
              <p>
                Personal and work side by side — each with its own credentials, its own
                session history, its own <code>CLAUDE.md</code> and settings, and its own
                quota. Switching is one click and no re-login: nothing signs out, nothing
                is shared, and every project list re-scans against the account you picked.
              </p>
              <p>
                Sessions stay attached to the account that ran them, so the sidebar,
                the board and the plans tab all follow the switch. An account whose
                Claude home lives inside a WSL distribution works the same way — attach
                the distribution and its sessions appear alongside the Windows ones.
              </p>
              <div class="lp-show__meters">
                <div v-for="m in showcaseUsage" :key="m.label" class="lp-show__meter">
                  <UsageRing :value="m.pct" :size="34" :label="`${m.label} — ${m.pct}%`" />
                  <span class="lp-show__metertext">
                    <strong>{{ m.pct }}%</strong>
                    {{ m.label }}
                  </span>
                </div>
              </div>
            </div>

            <!-- The Accounts tab's own rows, quota bars and Use button —
                 clicking one opens that account's page in the demo above. -->
            <div class="lp-show__stage lp-show__stage--accounts">
              <AccountsApp ref="showcaseAccountsRef" :callbacks="showcaseAccountsCallbacks" />
            </div>
          </article>

          <!-- ② Projects overview ─────────────────────────────────── -->
          <article class="lp-show lp-show--projects lp-bento-accent-green">
            <div class="lp-show__copy">
              <div class="lp-show__eyebrow">
                <SbIcon name="folder" :size="13" />
                Projects
              </div>
              <h3>Every repository, and the state it is in</h3>
              <p>
                One overview across all of them: current branch, uncommitted churn,
                unpushed count, how many sessions the project has, its size on disk and
                whether its compose services are up — without opening a terminal in any
                of them.
              </p>
              <p>
                Click one and it gets a page of its own in the main area:
                <strong>Overview</strong> with the working tree and a commit box,
                <strong>Commits</strong> with a push button, <strong>Files</strong>,
                its <strong>Sessions</strong>, and every <strong>agent file</strong>
                the project loads.
              </p>
            </div>
            <div class="lp-show__stage lp-show__stage--projects">
              <ProjectsApp ref="showcaseProjectsRef" :callbacks="showcaseProjectsCallbacks" />
            </div>
          </article>

          <!-- ③ Board + Summarize ─────────────────────────────────── -->
          <article class="lp-show lp-show--board lp-bento-accent-cyan">
            <div class="lp-show__copy">
              <div class="lp-show__eyebrow">
                <SbIcon name="square-kanban" :size="13" />
                Session board
              </div>
              <h3>Every session, dealt into four lanes</h3>
              <p>
                Idle, waiting on you, in progress, done — derived live from what each
                session is actually doing, not from a status somebody remembered to set.
                One click opens it in a pane under the board.
              </p>
              <p>
                <strong>Summarize</strong> reads the last message of each session in one
                headless <code>claude</code> call and flags at most two cards per level,
                so the board keeps a shape you can read at a glance.
              </p>
              <ul class="lp-show__legend">
                <li v-for="lv in FOCUS_ORDER" :key="lv">
                  <span class="sbx-focusflag" :class="`sbx-focusflag--${lv}`">
                    <SbIcon name="flag" :size="10" />
                    {{ FOCUS_LEVELS[lv].label }}
                  </span>
                  <span class="lp-show__legendhint">{{ FOCUS_LEVELS[lv].hint }}</span>
                </li>
              </ul>
            </div>

            <!-- Real SessionCards, real focus flags: `boardFocus` is the same
                 map the demo's Summarize button writes, so pressing it up
                 there re-flags these too. -->
            <div class="lp-show__stage lp-show__stage--cards">
              <div class="lp-show__column">
                <div class="lp-show__columnhead">
                  <span class="lp-show__dot lp-show__dot--done"></span> Done
                </div>
                <SessionCard :session="showcaseCards[0]" />
              </div>
              <div class="lp-show__column">
                <div class="lp-show__columnhead">
                  <span class="lp-show__dot lp-show__dot--running"></span> In progress
                </div>
                <SessionCard :session="showcaseCards[1]" />
              </div>
              <button type="button" class="lp-show__cta" @click="showBoardTab">
                Open the board in the demo ↑
              </button>
            </div>
          </article>

          <!-- ④ Unread rail ─────────────────────────────────────── -->
          <article class="lp-show lp-show--rail lp-bento-accent-yellow">
            <div class="lp-show__copy">
              <div class="lp-show__eyebrow">
                <SbIcon name="triangle-alert" :size="13" />
                Attention
              </div>
              <h3>Nothing waits on you unnoticed</h3>
              <p>
                A rail above the session list carries one avatar per session that wants
                something: a finished turn nobody has read, or a permission prompt
                blocking the run. It is never hidden — an empty rail is the answer too.
              </p>
              <p>
                The dock badge, the board's WAITING column and this rail all read the
                same precedence table, so they cannot disagree about what is blocked.
              </p>
            </div>
            <div class="lp-show__stage lp-show__stage--rail">
              <UnreadRail :items="unreadRows" :active-session-id="store.activeSessionId || ''" @select="onSelectUnread" />
            </div>
          </article>

          <!-- ⑤ Activity ────────────────────────────────────────── -->
          <article class="lp-show lp-show--stats lp-bento-accent-orange">
            <div class="lp-show__copy">
              <div class="lp-show__eyebrow">
                <SbIcon name="chart-no-axes-column" :size="13" />
                Activity
              </div>
              <h3>What each account has actually spent</h3>
              <p>
                A year of coding on the account's own page — messages a day, current and
                longest streak, tokens per model, and the last thirty days as a chart.
                Read off this app's index, topped up from <code>claude /stats</code> when
                you ask for it.
              </p>
              <p>
                Per account, not per machine: the personal plan's heatmap does not
                include the work one's, which is the whole point of keeping them apart.
              </p>
            </div>
            <div class="lp-show__stage lp-show__stage--heatmap">
              <ActivityHeatmap :daily-map="showcaseHeatmap" />
            </div>
          </article>
        </div>

        <!-- Everything else — one line each, no pictures needed. -->
        <div class="lp-grid">
          <div v-for="f in FEATURE_GRID" :key="f.title" class="lp-gridcard" :class="`lp-bento-accent-${f.accent}`">
            <span class="lp-gridcard__icon"><SbIcon :name="f.icon" :size="15" /></span>
            <h4>{{ f.title }}</h4>
            <p v-html="f.body"></p>
          </div>
        </div>
      </div>
    </section>

    <!-- The project page used to get a second window of its own down here.
         It is reachable in the demo above now — Projects tab, click a
         project — so a static copy of it would only say the same thing
         twice. -->

    <!-- ── INSTALL ────────────────────────────────────────────── -->
    <section class="lp-install">
      <div class="lp-section-inner">
        <h2 class="lp-section-title">Get started</h2>
        <div class="lp-install-grid">
          <div class="lp-install-card">
            <div class="lp-install-platform">
              <svg width="20" height="20" viewBox="0 0 814 1000" fill="currentColor"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-36.8-162.1-124.3C46.7 740.3 0 599.1 0 517.8c0-220.1 144.4-336.6 284.1-336.6 75.2 0 137.7 49.3 184.8 49.3 44.9 0 115.1-52.3 200.4-52.3zM518.3 15.3c28.5-35.3 50-84.2 50-133.1 0-6.7-.6-13.3-1.9-19.3-47.7 1.9-104.8 31.9-138.8 71.5-26.2 30.3-52.2 79.2-52.2 128.7 0 7.4 1.3 14.7 1.9 17.1 3.2.5 8.4 1.3 13.6 1.3 43.5 0 98.9-28.9 127.4-66.2z"/></svg>
              macOS
            </div>
            <a class="lp-dl-btn" href="https://github.com/fortael/wootonpad/releases" target="_blank" rel="noopener">Download .dmg</a>
            <p class="lp-install-note">arm64 + x64 universal</p>
          </div>
          <div class="lp-install-card">
            <div class="lp-install-platform">
              <svg width="20" height="20" viewBox="0 0 88 88" fill="currentColor"><path d="M0 0h42v42H0V0zm4 4h34v34H4V4zm42-4h42v42H46V0zm4 4h34v34H50V4zM0 46h42v42H0V46zm4 4h34v34H4V50zm42-4h42v42H46V46zm4 4h34v34H50V50z"/></svg>
              Windows
            </div>
            <a class="lp-dl-btn" href="https://github.com/fortael/wootonpad/releases" target="_blank" rel="noopener">Download .exe</a>
            <p class="lp-install-note">NSIS installer</p>
          </div>
          <div class="lp-install-card">
            <div class="lp-install-platform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.581 19.049c-.55-.446-.336-1.431-.907-1.917.553-3.365-.997-6.331-2.845-8.232a9.286 9.286 0 0 0-6.636-2.736 9.65 9.65 0 0 0-2.108.234C4.924 7.086 2 10.006 2 13.5c0 3.866 3.134 7 7 7 .295 0 .585-.019.87-.055 1.5.35 3.17.55 4.13.65.96.101 3.001.51 4.001-.24 0 0 .5-.5 1-.5s1 .5 1.5.5 1-.5 1.5-.5.5.5.5.5c0 0-.97-1.857-.92-1.806zM9 19.5c-3.309 0-6-2.691-6-6s2.691-6 6-6 6 2.691 6 6-2.691 6-6 6z"/></svg>
              Linux
            </div>
            <a class="lp-dl-btn" href="https://github.com/fortael/wootonpad/releases" target="_blank" rel="noopener">Download .AppImage</a>
            <p class="lp-install-note">AppImage + .deb</p>
          </div>
        </div>
        <p class="lp-install-prereq">Requires <a href="https://docs.anthropic.com/en/docs/claude-code/getting-started" target="_blank" rel="noopener">Claude Code CLI</a> to be installed.</p>
      </div>
    </section>

    <!-- The ⌘K palette. Same component the app mounts; landing.css keeps its
         backdrop inside the demo window instead of over the whole page. -->
    <SpotlightApp to=".lp-app-window" />

    <!-- Tooltip element (matches public/style.css #app-tooltip) -->
    <div id="app-tooltip"></div>

    <!-- ── FOOTER ─────────────────────────────────────────────── -->
    <footer class="lp-footer">
      <div class="lp-footer-inner">
        <span>Wooton Pad · Open source · MIT license · Fork of Switchboard</span>
        <a href="https://github.com/fortael/wootonpad" target="_blank" rel="noopener">github.com/fortael/wootonpad</a>
      </div>
    </footer>

  </div>
</template>

<script setup>
// The demo window is a thin re-implementation of src/vue/components/App.vue:
// same components, same wrapper markup, same store fields — only the data is
// mocked and the Electron-facing callbacks are routed through the window.__sb
// / window.api stubs installed in src/landing/main.js. Nothing in
// src/vue/** is landing-aware.
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { store } from '../vue/store.js';
import { setSidePanelTab } from '../vue/side-panel-tabs.js';

import SbIcon from '../vue/components/SbIcon.vue';
import { FOCUS_LEVELS } from '../vue/board-focus.js';
import TopNavApp from '../vue/components/TopNavApp.vue';
import CollapsedRailApp from '../vue/components/CollapsedRailApp.vue';
import CommandBar from '../vue/components/CommandBar.vue';
import FilterTabs from '../vue/components/FilterTabs.vue';
import UnreadRail from '../vue/components/UnreadRail.vue';
import { unreadSessions, stateFromStore } from '../vue/session-column.js';
import SidebarApp from '../vue/components/SidebarApp.vue';
import SessionHeaderApp from '../vue/components/SessionHeaderApp.vue';
import SpotlightApp from '../vue/components/SpotlightApp.vue';
import SessionPanelRail from '../vue/components/SessionPanelRail.vue';
import SessionSidePanelApp from '../vue/components/SessionSidePanelApp.vue';
import SessionBoardApp from '../vue/components/SessionBoardApp.vue';
import BoardSidebarApp from '../vue/components/BoardSidebarApp.vue';
import AccountDropdownApp from '../vue/components/AccountDropdownApp.vue';
import AccountsApp from '../vue/components/AccountsApp.vue';
import ProjectsApp from '../vue/components/ProjectsApp.vue';
import PlansApp from '../vue/components/PlansApp.vue';
import ProjectViewerApp from '../vue/components/ProjectViewerApp.vue';
import AccountViewerApp from '../vue/components/AccountViewerApp.vue';
import ViewerContentApp from '../vue/components/ViewerContentApp.vue';
import SessionCard from '../vue/components/SessionCard.vue';
import UsageRing from '../vue/components/UsageRing.vue';
import ActivityHeatmap from '../vue/components/ActivityHeatmap.vue';
import {
  MOCK_ACCOUNTS,
  MOCK_ACTIVE_ACCOUNT_ID,
  MOCK_PROJECTS,
  MOCK_TERMINAL_LINES,
  MOCK_USAGE,
  MOCK_PLANS,
  MOCK_ACCOUNT_STATS,
  MOCK_SELECTED_SESSION_ID,
} from './mock-data.js';

const iconUrl = 'icon.png';

// ── Marketing chrome ─────────────────────────────────────────────
const stars = ref(null);

// ── Fake terminal spinner ────────────────────────────────────────
const SPIN_FRAMES = ['⠸', '⠼', '⠴', '⠦', '⠇', '⠏', '⠋', '⠙'];
let _spinIdx = 0;
const spinChar = ref(SPIN_FRAMES[0]);

// ── Template refs ────────────────────────────────────────────────
const accountDropdownRef = ref(null);
const accountsRef = ref(null);
const projectsRef = ref(null);
const plansRef = ref(null);
const projectViewerRef = ref(null);
const accountViewerRef = ref(null);
const planViewerRef = ref(null);
const boardRef = ref(null);
// Second instances of two sidebar panels, mounted in the feature showcase
// further down the page. Same components, same mock data — a screenshot of
// them would go stale the first time either one changed.
const showcaseAccountsRef = ref(null);
const showcaseProjectsRef = ref(null);

// ── Main area ────────────────────────────────────────────────────
// app.js juggles the main area's panels through DOM `display` in the real
// app; on the landing there are only four of them, so one name is enough.
// The board is not in here — it has store.showBoard, because it can share the
// area with a session in the split below it.
const mainView = ref('session');   // 'session' | 'plan' | 'project' | 'account'

function closeMainView() {
  mainView.value = 'session';
}

// ── Tab config (same list App.vue feeds TopNavApp) ───────────────
// Agent Files and Stats are gone: agent files moved into the project panel's
// own "Agent files" tab and the activity heatmap into the account page.
const TABS = [
  { id: 'sessions', icon: 'sparkles', label: 'Sessions' },
  { id: 'board', icon: 'square-kanban', label: 'Board' },
  { id: 'plans', icon: 'book-open', label: 'Plans' },
  { id: 'projects', icon: 'folder', label: 'Projects' },
  { id: 'accounts', icon: 'users', label: 'Accounts' },
];

const FILTER_TABS = [
  { id: 'recent', label: 'Recent' },
  { id: 'active', label: 'Active' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'today', label: 'Today' },
  { id: 'archived', label: 'Archived' },
];

// ── Board split ──────────────────────────────────────────────────
// One click on a card opens the session in a pane under the board — the same
// arrangement App.vue builds, so the panel rail has to work there too.
const boardSplitActive = computed(() =>
  store.activeTab === 'board' && !!store.boardPreviewId
);

const BOARD_SPLIT_MIN = 160;
const BOARD_SPLIT_MARGIN = 220;   // leave at least this much board visible

function startBoardResize(event) {
  const main = event.currentTarget.closest('#main');
  if (!main) return;
  const bottom = main.getBoundingClientRect().bottom;
  const max = Math.max(BOARD_SPLIT_MIN, main.clientHeight - BOARD_SPLIT_MARGIN);

  const onMove = (e) => {
    store.boardSplitHeight = Math.round(
      Math.min(max, Math.max(BOARD_SPLIT_MIN, bottom - e.clientY))
    );
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
  };

  document.body.style.cursor = 'row-resize';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── Search ───────────────────────────────────────────────────────
const sessionListVisible = computed(() => store.activeTab === 'sessions');

// One pane at a time, over an open session — same rule App.vue applies.
const sidePanelVisible = computed(() => !!store.sidePanelTab && !!store.headerSession);

// The app's window has a minimum width; a browser tab does not. Below this the
// 340px panel leaves the terminal too narrow to read, so the demo puts the
// panel away and leaves the rail — which is exactly what a user would do, and
// keeps the control that reopens it on screen.
const PANEL_MIN_VIEWPORT = 1360;
// Only reopen what this closed. A panel the visitor put away themselves stays
// away when the window is resized.
let closedByWidth = null;

function syncPanelToWidth() {
  const wide = window.innerWidth >= PANEL_MIN_VIEWPORT;
  if (!wide && store.sidePanelTab) {
    closedByWidth = store.sidePanelTab;
    setSidePanelTab(null);
  } else if (wide && closedByWidth && !store.sidePanelTab) {
    setSidePanelTab(closedByWidth);
    closedByWidth = null;
  }
}

// Same wording the app uses — each tab names the fields it searches, because
// there is no modifier on the field to explain them.
const searchPlaceholder = computed(() => {
  switch (store.activeTab) {
    case 'plans': return 'Search plans by title or text…';
    case 'projects': return 'Search projects by name or folder…';
    case 'accounts': return 'Search accounts by name or folder…';
    case 'board': return 'Search the board by session or project…';
    default: return 'Search sessions by title or project…';
  }
});

let searchDebounceTimer = null;

function onSearchValue(value) {
  store.searchQuery = value;
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null;
    const query = store.searchQuery.trim();
    if (!query) { doClearSearch(); return; }
    window.__sb?.search?.(query);
  }, 200);
}

function doClearSearch() {
  store.searchQuery = '';
  if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
  window.__sb?.clearSearch?.();
}

function openSpotlight() { store.spotlightOpen = true; }

// ── Theme ────────────────────────────────────────────────────────
// One switch for the whole page. It writes <html data-theme> exactly like the
// app does, so theme-light.css repaints the marketing sections, the demo
// window and the fake terminal in one go — the demo window keeps its own
// data-theme too, for the CSS that is scoped to it.
function applyTheme(next) {
  store.theme = next === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = store.theme;
  localStorage.setItem('theme', store.theme);
}

function toggleTheme() {
  applyTheme(store.theme === 'light' ? 'dark' : 'light');
}

// ── Active-session rail ──────────────────────────────────────────
const ATTENTION_ORDER = { waiting: 0, done: 1, running: 2, idle: 3 };

const attentionProjects = computed(() => {
  const out = [];
  for (const p of store.projects) {
    const live = p.sessions.filter(s => store.activePtyIds.has(s.sessionId));
    if (!live.length) continue;
    let status = 'idle';
    let reason = 'open';
    if (live.some(s => store.attentionSessions.has(s.sessionId))) {
      status = 'waiting'; reason = 'needs input';
    } else if (live.some(s => store.responseReadySessions.has(s.sessionId))) {
      status = 'done'; reason = 'response ready';
    } else if (live.some(s => store.sessionBusyState.get(s.sessionId))) {
      status = 'running'; reason = 'working';
    }
    out.push({
      projectPath: p.projectPath,
      name: p.projectPath.split('/').filter(Boolean).pop() || p.projectPath,
      status,
      reason,
      count: live.length,
    });
  }
  return out.sort((a, b) => ATTENTION_ORDER[a.status] - ATTENTION_ORDER[b.status]);
});

// Same set the app's rail shows — one entry per unread session, from the
// mock store rather than a live one.
const unreadRows = computed(() => unreadSessions(store.projects, stateFromStore(store)));

function onSelectUnread(session) {
  if (session?.projectPath) onSelectAttentionProject(session.projectPath);
}

function onSelectAttentionProject(projectPath) {
  store.attentionProject = projectPath;
  const project = store.projects.find(p => p.projectPath === projectPath);
  const live = project?.sessions.filter(s => store.activePtyIds.has(s.sessionId)) || [];
  if (!live.length) return;
  const newest = live.reduce((a, b) => (new Date(b.modified || 0) > new Date(a.modified || 0) ? b : a));
  window.__sb?.openSession?.(newest);
}

// ── Tab switching ────────────────────────────────────────────────
// app.js owns the main-area swap in the real app; on the landing the board is
// the only tab that claims #main, so the rule fits here.
function setTab(tabId) {
  if (!TABS.some(t => t.id === tabId)) return;
  if (tabId === store.activeTab) return;
  store.activeTab = tabId;
  store.showBoard = tabId === 'board';
  // A plan, a project page or an account page belongs to the tab it was
  // opened from; leaving it up over another tab's sidebar is the bug
  // hideAllViewers() exists to prevent in the app.
  mainView.value = 'session';
  store.searchQuery = '';
  store.searchMatchIds = null;
  store.searchMatchProjectPaths = null;
  window.__sb?.onTabChange?.(tabId);
}

// The showcase panels are below the demo window, so anything clicked in one
// has to bring the window back into view or the result happens off screen.
function jumpToDemo() {
  document.querySelector('.lp-app-window')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// The showcase's "open the board" link, from outside the demo window.
function showBoardTab() {
  setTab('board');
  jumpToDemo();
}

// ── Filter tabs ──────────────────────────────────────────────────
function onFilterTab(id) {
  store.sessionFilterTab = id;
  // 'active' — the id FILTER_TABS actually declares. This read 'running',
  // the name the tab had two renames ago, so the filter never engaged and
  // the Active tab listed every session.
  store.showRunningOnly = id === 'active';
  store.showStarredOnly = id === 'pinned';
  store.showTodayOnly = id === 'today';
  store.showArchived = id === 'archived';
  window.__sb?.onFilterChange?.({
    showStarredOnly: store.showStarredOnly,
    showRunningOnly: store.showRunningOnly,
    showTodayOnly: store.showTodayOnly,
    showArchived: store.showArchived,
  });
}

function onViewMode(mode) {
  store.sidebarViewMode = mode;
  if ((mode === 'grid') !== store.gridViewActive) window.__sb?.toggleGridView?.();
}

// ── Sidebar action callbacks (identical shape to App.vue) ────────
function onGlobalSettings() { window.__sb?.openGlobalSettings?.(); }
function onResort() { window.__sb?.resort?.(); }
// Per-session actions are not here: SessionMenu calls window.__sb directly, so
// the list only forwards what the rows themselves still do. Same five App.vue
// passes — keep them in step.
const sidebarCallbacks = {
  openSession: (s) => window.__sb?.openSession?.(s),
  newSession: (project, btn) => window.__sb?.newSession?.(project, btn),
  openSettings: (path) => window.__sb?.openSettings?.(path),
  archiveSessions: (sessions) => window.__sb?.archiveSessions?.(sessions),
  removeProject: (path) => window.__sb?.removeProject?.(path),
};

// A plan opens the same Markdown pane the app opens, on the same component —
// only the file comes out of mock-data.js instead of ~/.claude/plans.
async function openPlan(plan) {
  if (!plan?.filename) return;
  plansRef.value?.setActive?.(plan.filename);
  const result = await window.api.readPlan(plan.filename);
  if (!result) return;
  mainView.value = 'plan';
  await nextTick();
  planViewerRef.value?.open(plan.title || plan.filename, result.filePath, result.content);
}

// Notes open in the same pane as plans — same Markdown, same preview toggle.
// Only the directory behind them differs.
async function openNote(note) {
  if (!note?.filename) return;
  const result = await window.api.readNote(note.filename);
  if (!result?.ok) return;
  mainView.value = 'plan';
  await nextTick();
  planViewerRef.value?.open(note.title || note.filename, result.filePath, result.content);
}

const planCallbacks = { openPlan, openNote };

// A summary's link has to land exactly where a card click lands, so it goes
// through the board's own handler rather than repeating it here.
const boardSidebarCallbacks = {
  selectSession: (s) => boardRef.value?.selectSession(s),
};

// Clicking an account opens its page in the main area, the same way the app
// does — config paths, token state, MCP servers, quota meters and a year of
// activity, all off MOCK_ACCOUNT_DETAIL / MOCK_ACCOUNT_STATS.
async function openAccountViewer(id) {
  if (!id) return;
  mainView.value = 'account';
  store.accountViewerId = id;
  await nextTick();
  accountViewerRef.value?.load(id);
}

// app.js broadcasts an account switch back to every component that shows one;
// the landing has three of them (the nav chip and the two AccountsApp copies)
// and no main process to do the broadcasting, so it happens here. Without it
// pressing Use looks like it did nothing, which is a poor advertisement for
// the feature this page leads with.
function switchAccount(id) {
  window.__sb?.switchAccount?.(id);
  accountDropdownRef.value?.setActiveAccount?.(id);
  accountsRef.value?.setActiveAccount?.(id);
  showcaseAccountsRef.value?.setActiveAccount?.(id);
}

const accountsCallbacks = {
  openAccountViewer,
  switchAccount,
  openAccountHomeSession: (acc) => window.__sb?.openAccountHomeSession?.(acc),
  renameAccount: (id, name) => window.__sb?.renameAccount?.(id, name),
  deleteAccount: (id) => window.__sb?.deleteAccount?.(id),
  createAccount: (name) => window.__sb?.createAccount?.(name),
  discoverWslClaudeHomes: () => window.__sb?.discoverWslClaudeHomes?.(),
  createWslAccount: (distro, name) => window.__sb?.createWslAccount?.(distro, name),
};

// The showcase copies of the two panels differ in one thing: opening a row
// there has to switch the demo window to the matching tab first, then scroll
// back up to it — in the sidebar the tab is already the one you are on.
const showcaseAccountsCallbacks = {
  ...accountsCallbacks,
  openAccountViewer: (id) => { setTab('accounts'); openAccountViewer(id); jumpToDemo(); },
};

const accountDropdownCallbacks = { switchAccount };

// Clicking a project opens its page in the main area — overview, commits,
// files, its sessions and the agent files it loads. It used to be a second,
// static window further down the page.
async function openProject(project) {
  if (!project?.projectPath) return;
  mainView.value = 'project';
  await nextTick();
  projectViewerRef.value?.open({ projectPath: project.projectPath });
}

const projectsCallbacks = {
  openProject,
  newSession: (p, btn) => window.__sb?.newSession?.(p, btn),
  addProject: () => window.__sb?.addProject?.(),
  projectRemoved: () => window.__sb?.projectRemoved?.(),
};

const showcaseProjectsCallbacks = {
  ...projectsCallbacks,
  openProject: (p) => { setTab('projects'); openProject(p); jumpToDemo(); },
};

const projectViewerCallbacks = {
  newSession: (p, btn) => window.__sb?.newSession?.(p, btn),
  onTabChange: (tab) => window.__sb?.onPvTabChange?.(tab),
  worktreeDeleted: () => {},
};

// ── Selected session → SessionHeaderApp + fake terminal ──────────
const activeSession = computed(() => {
  if (!store.activeSessionId) return null;
  for (const p of store.projects) {
    const s = p.sessions.find(x => x.sessionId === store.activeSessionId);
    if (s) return { ...s, projectPath: p.projectPath };
  }
  return null;
});

watch(activeSession, (s) => { store.headerSession = s; }, { immediate: true });

// Opening a session takes the main area back off whatever page was on it —
// the sidebar rows, the unread rail and the board's cards all go through
// store.activeSessionId, so one watcher covers every one of them.
watch(() => store.activeSessionId, (id) => { if (id) mainView.value = 'session'; });

// ── Feature showcase ─────────────────────────────────────────────
// The panels under the demo mount live components on the same mock data, so
// they cannot drift from what the window above them shows.
const FOCUS_ORDER = [3, 2, 1];

const allSessions = MOCK_PROJECTS.flatMap(p =>
  p.sessions.map(s => ({ ...s, projectPath: p.projectPath }))
);
// sess-006 finished a turn nobody has read; sess-004 is mid-run. One card
// from each of the two columns that mean something.
const showcaseCards = ['sess-006', 'sess-004'].map(id => allSessions.find(s => s.sessionId === id));

const showcaseUsage = [
  { label: 'Current session', pct: MOCK_USAGE.default.session },
  { label: 'Week (all models)', pct: MOCK_USAGE.default.weekAll },
];

const showcaseHeatmap = Object.fromEntries(
  MOCK_ACCOUNT_STATS.default.dailyActivity.map(e => [e.date, e.messageCount])
);

const FEATURE_GRID = [
  {
    icon: 'search', accent: 'orange', title: 'Full-text search',
    body: 'Every conversation indexed with SQLite FTS5. Find a session by what was discussed, not by when it happened.',
  },
  {
    icon: 'git-fork', accent: 'blue', title: 'Forks & worktrees',
    body: 'A forked session is matched back to the one it came from, and git is scoped to the worktree it actually runs in.',
  },
  {
    icon: 'panel-right-open', accent: 'green', title: 'Session side panel',
    body: 'One pane at a time beside the session it belongs to: working tree, compose services, or a scratch shell in the same directory.',
  },
  {
    icon: 'file-diff', accent: 'purple', title: 'IDE diff viewer',
    body: 'WootonPad registers as a VS Code-compatible IDE, so the CLI sends its diffs here. Accept, reject or edit each hunk.',
  },
  {
    icon: 'git-branch', accent: 'green', title: 'Git, per worktree',
    body: 'Branch, churn, unpushed count, push and one-click branch switching — scoped to the session\'s own worktree.',
  },
  {
    icon: 'sparkles', accent: 'pink', title: 'AI commit messages',
    body: 'Write the commit with Claude next to the session that made the changes — short or descriptive — then commit in place.',
  },
  {
    icon: 'container', accent: 'cyan', title: 'Docker monitoring',
    body: 'Compose service status per project and per session, so you know the stack is up before handing off.',
  },
  {
    icon: 'notebook-pen', accent: 'yellow', title: 'Plans, notes & agent files',
    body: 'Claude\'s plan files in their own tab, account-scoped notes with TODOs, and every CLAUDE.md a project loads.',
  },
  {
    icon: 'bot', accent: 'cyan', title: 'Background tasks',
    body: 'Sub-agents a session has out working, counted on its card and readable as their own transcript.',
  },
  {
    icon: 'plug', accent: 'purple', title: 'MCP servers & plugins',
    body: 'What each account has configured, probed on demand — plus the plugin marketplaces it can install from.',
  },
  {
    icon: 'square-arrow-out-up-right', accent: 'blue', title: 'External launcher',
    body: '<code>open wootonpad://+/path</code> opens or resumes a session from any tool — no extra windows.',
  },
  {
    icon: 'terminal', accent: 'orange', title: 'Your fonts, your shell',
    body: 'Terminal and UI fonts, shell profile and per-project settings, all in Global Settings.',
  },
  {
    icon: 'calendar-days', accent: 'green', title: 'Scheduled tasks',
    body: 'Give a project a cron line and a prompt, and the session runs itself — output waiting where every other session is.',
  },
];

const terminalLines = computed(() =>
  store.activeSessionId ? (MOCK_TERMINAL_LINES[store.activeSessionId] || []) : []
);

onMounted(async () => {
  // SessionBoardApp hands a double-clicked card over to the session view.
  window.vueApp = { setTab };

  // Same restore the app does, so a visitor who picked light keeps it.
  applyTheme(localStorage.getItem('theme'));

  syncPanelToWidth();
  window.addEventListener('resize', syncPanelToWidth);

  fetch('https://api.github.com/repos/fortael/wootonpad')
    .then(r => r.json())
    .then(d => { if (d.stargazers_count != null) stars.value = d.stargazers_count; })
    .catch(() => {});

  setInterval(() => {
    _spinIdx = (_spinIdx + 1) % SPIN_FRAMES.length;
    spinChar.value = SPIN_FRAMES[_spinIdx];
  }, 120);

  // Components that take their data through an exposed setter rather than the
  // store — same handshake App.vue performs in its own onMounted.
  accountDropdownRef.value?.setAccounts(MOCK_ACCOUNTS, MOCK_ACTIVE_ACCOUNT_ID, MOCK_USAGE);
  accountsRef.value?.setAccounts(MOCK_ACCOUNTS, MOCK_ACTIVE_ACCOUNT_ID);
  accountsRef.value?.setUsage(MOCK_USAGE);
  projectsRef.value?.setProjects(MOCK_PROJECTS);
  // The showcase's own copies of those two, fed the same way.
  showcaseAccountsRef.value?.setAccounts(MOCK_ACCOUNTS, MOCK_ACTIVE_ACCOUNT_ID);
  showcaseAccountsRef.value?.setUsage(MOCK_USAGE);
  showcaseProjectsRef.value?.setProjects(MOCK_PROJECTS);
  plansRef.value?.setPlans(MOCK_PLANS);
  // The project page is not opened here any more: it is a main-area panel a
  // click in the Projects tab brings up, exactly as in the app.

  await nextTick();
  store.activeSessionId = MOCK_SELECTED_SESSION_ID;
  store.attentionProject = activeSession.value?.projectPath || null;
});

onBeforeUnmount(() => window.removeEventListener('resize', syncPanelToWidth));
</script>

