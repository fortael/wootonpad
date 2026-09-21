<template>
  <div class="settings-panel">
    <!-- Header and tabs are the project page's, down to the class names: this
         panel opens in the same slot and has to read as the same kind of
         place. See .pv-header / .pv-filtertabs in style.css. -->
    <div class="settings-panel-header">
      <div class="settings-panel-titles">
        <div class="settings-panel-title">{{ title }}</div>
        <div class="settings-panel-scope">{{ scopeLabel }}</div>
      </div>
    </div>

    <!-- Project settings only override what a session runs as, so their one
         tab is the whole panel and a row with a single tab in it is noise. -->
    <FilterTabs
      v-if="tabs.length > 1"
      class="sbx-filtertabs--no-views settings-filtertabs"
      :tabs="tabs"
      :active="tab"
      @select="tab = $event"
    />

    <div class="settings-panel-body">
      <div v-if="loading" class="settings-loading">Loading…</div>
      <div v-else class="settings-form">

        <!-- ══ Agent ══════════════════════════════════════════════ -->
        <template v-if="tab === 'agent'">

          <!-- ── What a session starts on ─────────────────────────── -->
          <div class="settings-section">
            <div class="settings-section-title">Session defaults</div>
            <div class="settings-section-note">
              What every new session in {{ isProject ? 'this project' : 'WootonPad' }} starts on.
              Running sessions keep what they were started with.
            </div>

            <div class="settings-field">
              <div class="settings-field-info">
                <div class="settings-field-header">
                  <span class="settings-label">Permission Mode</span>
                  <label v-if="isProject" class="settings-use-global">
                    <input type="checkbox" :checked="useGlobal.permissionMode" @change="toggleGlobal('permissionMode', $event.target.checked)" />
                    Use global default
                  </label>
                </div>
                <div class="settings-description">{{ permissionModeDesc }}</div>
              </div>
              <div class="settings-field-control">
                <select class="settings-select" v-model="form.permissionMode" :disabled="isProject && useGlobal.permissionMode">
                  <option v-for="m in PERMISSION_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
                </select>
              </div>
            </div>

            <!-- Aliases rather than wire ids: `sonnet` keeps meaning the current
                 Sonnet, where `claude-sonnet-5` would quietly pin an old one. -->
            <div class="settings-field">
              <div class="settings-field-info">
                <div class="settings-field-header">
                  <span class="settings-label">Model</span>
                  <label v-if="isProject" class="settings-use-global">
                    <input type="checkbox" :checked="useGlobal.model" @change="toggleGlobal('model', $event.target.checked)" />
                    Use global default
                  </label>
                </div>
                <div class="settings-description">Model new chat sessions start on</div>
              </div>
              <div class="settings-field-control">
                <select class="settings-select" v-model="form.model" :disabled="isProject && useGlobal.model">
                  <option value="">Default (recommended)</option>
                  <option value="opus">Opus</option>
                  <option value="sonnet">Sonnet</option>
                  <option value="haiku">Haiku</option>
                </select>
              </div>
            </div>

            <div class="settings-field">
              <div class="settings-field-info">
                <div class="settings-field-header">
                  <span class="settings-label">Effort</span>
                  <label v-if="isProject" class="settings-use-global">
                    <input type="checkbox" :checked="useGlobal.effort" @change="toggleGlobal('effort', $event.target.checked)" />
                    Use global default
                  </label>
                </div>
                <div class="settings-description">How hard the model thinks before answering</div>
              </div>
              <div class="settings-field-control">
                <select class="settings-select" v-model="form.effort" :disabled="isProject && useGlobal.effort">
                  <option value="">Default</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="xhigh">Extra high</option>
                  <option value="max">Max</option>
                </select>
              </div>
            </div>

          </div>

          <!-- ── Where a session works ────────────────────────────── -->
          <div class="settings-section">
            <div class="settings-section-title">Workspace</div>

            <div class="settings-field">
              <div class="settings-field-info">
                <div class="settings-field-header">
                  <span class="settings-label">Worktree</span>
                  <label v-if="isProject" class="settings-use-global">
                    <input type="checkbox" :checked="useGlobal.worktree" @change="toggleGlobal('worktree', $event.target.checked)" />
                    Use global default
                  </label>
                </div>
                <div class="settings-description">Enable worktree for new sessions</div>
              </div>
              <div class="settings-field-control">
                <SbSwitch v-model="form.worktree" :disabled="isProject && useGlobal.worktree" />
              </div>
            </div>

            <div class="settings-field">
              <div class="settings-field-info">
                <div class="settings-field-header">
                  <span class="settings-label">Worktree Name</span>
                  <label v-if="isProject" class="settings-use-global">
                    <input type="checkbox" :checked="useGlobal.worktreeName" @change="toggleGlobal('worktreeName', $event.target.checked)" />
                    Use global default
                  </label>
                </div>
                <div class="settings-description">Custom name for worktree branches</div>
              </div>
              <div class="settings-field-control">
                <input type="text" class="settings-input" v-model="form.worktreeName"
                  placeholder="auto" :disabled="isProject && useGlobal.worktreeName" style="width:140px" />
              </div>
            </div>

            <div class="settings-field">
              <div class="settings-field-info">
                <div class="settings-field-header">
                  <span class="settings-label">Chrome</span>
                  <label v-if="isProject" class="settings-use-global">
                    <input type="checkbox" :checked="useGlobal.chrome" @change="toggleGlobal('chrome', $event.target.checked)" />
                    Use global default
                  </label>
                </div>
                <div class="settings-description">Enable Chrome browser automation</div>
              </div>
              <div class="settings-field-control">
                <SbSwitch v-model="form.chrome" :disabled="isProject && useGlobal.chrome" />
              </div>
            </div>

            <div class="settings-field settings-field-wide">
              <div class="settings-field-info">
                <div class="settings-field-header">
                  <span class="settings-label">Additional Directories</span>
                  <label v-if="isProject" class="settings-use-global">
                    <input type="checkbox" :checked="useGlobal.addDirs" @change="toggleGlobal('addDirs', $event.target.checked)" />
                    Use global default
                  </label>
                </div>
                <div class="settings-description">Extra directories to include in Claude sessions</div>
              </div>
              <div class="settings-field-control">
                <input type="text" class="settings-input" v-model="form.addDirs"
                  placeholder="/path/to/dir1, /path/to/dir2" :disabled="isProject && useGlobal.addDirs" />
              </div>
            </div>
          </div>

          <!-- ── How a session is launched ────────────────────────── -->
          <div class="settings-section">
            <div class="settings-section-title">Launch</div>

            <div class="settings-field settings-field-wide">
              <div class="settings-field-info">
                <div class="settings-field-header">
                  <span class="settings-label">Pre-launch Command</span>
                  <label v-if="isProject" class="settings-use-global">
                    <input type="checkbox" :checked="useGlobal.preLaunchCmd" @change="toggleGlobal('preLaunchCmd', $event.target.checked)" />
                    Use global default
                  </label>
                </div>
                <div class="settings-description">Prepended to the claude command (e.g. "aws-vault exec profile --")</div>
              </div>
              <div class="settings-field-control">
                <input type="text" class="settings-input" v-model="form.preLaunchCmd"
                  placeholder="e.g. aws-vault exec profile --" :disabled="isProject && useGlobal.preLaunchCmd" />
              </div>
            </div>

            <!-- The rest of launching is one answer for the whole app: which
                 shell it runs in, which IDE it talks to. Not per-project. -->
            <template v-if="!isProject">
              <div class="settings-field">
                <div class="settings-field-info">
                  <span class="settings-label">Shell Profile</span>
                  <div class="settings-description">Shell used for terminal and Claude sessions. Changes take effect for new sessions only.</div>
                </div>
                <div class="settings-field-control">
                  <select class="settings-select" v-model="form.shellProfile">
                    <option value="auto">Auto (detect)</option>
                    <option v-for="p in shellProfiles" :key="p.id" :value="p.id">{{ p.name }}</option>
                  </select>
                </div>
              </div>

              <div class="settings-field">
                <div class="settings-field-info">
                  <span class="settings-label">IDE Emulation</span>
                  <div class="settings-description">Emulate an IDE so Claude can open files and diffs in a side panel. Disable to use your own IDE instead. Changes take effect for new sessions only.</div>
                </div>
                <div class="settings-field-control">
                  <SbSwitch v-model="form.mcpEmulation" />
                </div>
              </div>
            </template>
          </div>

          <!-- ── What the summarizer writes back ──────────────────── -->
          <div v-if="!isProject" class="settings-section">
            <div class="settings-section-title">Summaries</div>

            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Summary language</span>
                <div class="settings-description">
                  Language the board's Summarize and a session's own summary are written in.
                  File paths, identifiers and commands are left as they are either way.
                </div>
              </div>
              <div class="settings-field-control">
                <select class="settings-select" v-model="form.summaryLanguage">
                  <option value="">Match the session</option>
                  <option v-for="lang in SUMMARY_LANGUAGES" :key="lang" :value="lang">{{ lang }}</option>
                </select>
              </div>
            </div>
          </div>
        </template>

        <!-- ══ Appearance (global only) ═══════════════════════════ -->
        <template v-if="tab === 'appearance' && !isProject">
          <div class="settings-section">
            <div class="settings-section-title">Terminal</div>

            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Terminal Theme</span>
                <div class="settings-description">Color theme for terminal sessions</div>
              </div>
              <div class="settings-field-control">
                <select class="settings-select" v-model="form.terminalTheme">
                  <optgroup label="Dark">
                    <option v-for="(theme, key) in darkTerminalThemes" :key="key" :value="key">{{ theme.label }}</option>
                  </optgroup>
                  <optgroup label="Light">
                    <option v-for="(theme, key) in lightTerminalThemes" :key="key" :value="key">{{ theme.label }}</option>
                  </optgroup>
                </select>
              </div>
            </div>

            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Terminal Font</span>
                <div class="settings-description">Monospace font for terminal sessions</div>
              </div>
              <div class="settings-field-control">
                <select class="settings-select" v-model="form.monoFont">
                  <option v-for="(font, key) in terminalFonts" :key="key" :value="key">{{ font.label }}</option>
                </select>
              </div>
            </div>

            <div class="settings-field settings-field-wide">
              <div class="settings-field-info">
                <span class="settings-label">Terminal Size</span>
                <div class="settings-description">Font size and line height for terminal sessions</div>
              </div>
              <div class="settings-field-control sbx-metrics">
                <label class="sbx-metric">
                  <span class="sbx-metric__label">Size</span>
                  <input class="sbx-metric__range" type="range" min="8" max="24" step="1" v-model.number="form.terminalFontSize">
                  <span class="sbx-metric__value">{{ form.terminalFontSize }}px</span>
                </label>
                <label class="sbx-metric">
                  <span class="sbx-metric__label">Line height</span>
                  <input class="sbx-metric__range" type="range" min="1" max="2.2" step="0.05" v-model.number="form.terminalLineHeight">
                  <span class="sbx-metric__value">{{ form.terminalLineHeight.toFixed(2) }}</span>
                </label>
              </div>
            </div>

            <div class="settings-field settings-field-wide">
              <div class="settings-field-info">
                <span class="settings-label">Preview</span>
                <div class="settings-description">Live — theme, font, size and line height exactly as a session will render them</div>
              </div>
              <div class="settings-field-control">
                <TerminalPreview
                  :theme-key="form.terminalTheme"
                  :font-key="form.monoFont"
                  :font-size="form.terminalFontSize"
                  :line-height="form.terminalLineHeight"
                />
              </div>
            </div>

          </div>

          <!-- ── The app's own chrome ───────────────────────────── -->
          <div class="settings-section">
            <div class="settings-section-title">Interface</div>

            <div class="settings-field settings-field-wide">
              <div class="settings-field-info">
                <span class="settings-label">App Font</span>
                <div class="settings-description">Font for the application interface (sidebar, labels, viewer)</div>
              </div>
              <div class="settings-field-control settings-font-control">
                <select class="settings-select" v-model="form.uiFont">
                  <option v-for="(font, key) in terminalFonts" :key="key" :value="key">{{ font.label }}</option>
                </select>
                <span
                  class="settings-font-preview"
                  :style="{
                    fontFamily: terminalFonts[form.uiFont]?.family,
                    fontSize: form.uiFontSize + 'px',
                    lineHeight: form.uiLineHeight,
                  }"
                >
                  Wooton Pad — 42 sessions
                </span>
              </div>
            </div>

            <div class="settings-field settings-field-wide">
              <div class="settings-field-info">
                <span class="settings-label">App Size</span>
                <div class="settings-description">Scales the whole interface type scale and its line height</div>
              </div>
              <div class="settings-field-control sbx-metrics">
                <label class="sbx-metric">
                  <span class="sbx-metric__label">Size</span>
                  <input class="sbx-metric__range" type="range" min="10" max="20" step="1" v-model.number="form.uiFontSize">
                  <span class="sbx-metric__value">{{ form.uiFontSize }}px</span>
                </label>
                <label class="sbx-metric">
                  <span class="sbx-metric__label">Line height</span>
                  <input class="sbx-metric__range" type="range" min="1.1" max="2.2" step="0.05" v-model.number="form.uiLineHeight">
                  <span class="sbx-metric__value">{{ form.uiLineHeight.toFixed(2) }}</span>
                </label>
              </div>
            </div>

            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Chat view (experimental)</span>
                <div class="settings-description">Render sessions as a chat instead of a terminal. Same Claude, same account, same transcript on disk — it drives the CLI through the Agent SDK rather than a terminal. New sessions only; existing ones keep their terminal.</div>
              </div>
              <div class="settings-field-control">
                <SbSwitch v-model="form.sdkMode" />
              </div>
            </div>

            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Reduce motion</span>
                <div class="settings-description">Stop board cards from flying between columns when a session changes state. Already off if your system asks for reduced motion.</div>
              </div>
              <div class="settings-field-control">
                <SbSwitch v-model="form.reduceMotion" />
              </div>
            </div>

            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Show Avatars</span>
                <div class="settings-description">Show project initials avatars on session groups and grid cards</div>
              </div>
              <div class="settings-field-control">
                <SbSwitch v-model="form.showAvatars" />
              </div>
            </div>
          </div>

          <!-- ── How much of the list is shown ──────────────────── -->
          <div class="settings-section">
            <div class="settings-section-title">Session list</div>

            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Max Visible Sessions</span>
                <div class="settings-description">Show up to this many sessions before collapsing the rest behind "+N older"</div>
              </div>
              <div class="settings-field-control">
                <input type="number" class="settings-input settings-input-compact"
                  v-model.number="form.visibleSessionCount" min="1" max="100" />
              </div>
            </div>

            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Session Max Age (days)</span>
                <div class="settings-description">Sessions older than this are hidden behind "+N older" even if under the count limit</div>
              </div>
              <div class="settings-field-control">
                <input type="number" class="settings-input settings-input-compact"
                  v-model.number="form.sessionMaxAgeDays" min="1" max="365" />
              </div>
            </div>

            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Unread counters</span>
                <div class="settings-description">Count Claude's messages you have not seen yet — on each session row, on Buddy, and on the Sessions and Buddy tabs — so you can tell work is moving without opening anything.</div>
              </div>
              <div class="settings-field-control">
                <SbSwitch v-model="form.unreadCounters" />
              </div>
            </div>
          </div>
        </template>

        <!-- ══ Notifications (global only) ═══════════════════════
             What happens outside the window: session-alerts.js decides when,
             main.js shows it; tray-status.js is the menu-bar light. -->
        <template v-if="tab === 'notifications' && !isProject">
          <div class="settings-section">
            <div class="settings-section-title">System notifications</div>

            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Notify me</span>
                <div class="settings-description">When a session finishes a stretch of work or stops to ask you something — unless you are looking at it.</div>
              </div>
              <div class="settings-field-control">
                <SbSwitch v-model="form.notifyEnabled" />
              </div>
            </div>

            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Worth a notification after (seconds)</span>
                <div class="settings-description">A finished turn only notifies if the session worked at least this long. Questions and permission prompts always do.</div>
              </div>
              <div class="settings-field-control">
                <input type="number" class="settings-input settings-input-compact"
                  v-model.number="form.notifyMinWorkSeconds" min="0" max="3600" :disabled="!form.notifyEnabled" />
              </div>
            </div>

            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Sound when a session waits for you</span>
                <div class="settings-description">Played by the app itself, so you hear it even when the system keeps the banner quiet.</div>
              </div>
              <div class="settings-field-control">
                <SbSwitch v-model="form.notifySound" :disabled="!form.notifyEnabled" />
              </div>
            </div>

            <!-- A real one, through the same path as a session's — the only
                 way to find out whether the system lets them through. -->
            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Try it</span>
                <div class="settings-description">
                  Sends in five seconds, so you can click another window first: the system may hold
                  back banners from the app you are looking at, and this app is the one you are looking
                  at while you press the button.
                </div>
                <div v-if="notifyTest" class="settings-description settings-notify-result" :class="{ 'is-warn': notifyTest.warn }">
                  {{ notifyTest.text }}
                </div>
                <div v-if="notifyDenied && isMac" class="settings-description settings-notify-result is-warn">
                  macOS is not showing them. In System Settings → Notifications → WootonPad,
                  <strong>Allow notifications</strong> has to be on — everything else here has no say over that.
                </div>
                <div v-else-if="notifyDenied && isWindows" class="settings-description settings-notify-result is-warn">
                  Windows is not showing them. In Settings → System → Notifications, notifications have to be
                  on, for WootonPad as well — and Do not disturb off.
                </div>
                <div v-else-if="notifyDenied" class="settings-description settings-notify-result is-warn">
                  The system is not showing them — check its notification settings for WootonPad.
                </div>
              </div>
              <div class="settings-field-control">
                <button type="button" class="settings-reset-btn" :disabled="notifyTesting" @click="testNotification">
                  {{ notifyCountdown ? `Sending in ${notifyCountdown}…` : notifyTesting ? 'Sending…' : 'Send test' }}
                </button>
                <button v-if="isMac || isWindows" type="button" class="settings-reset-btn" @click="openNotificationSettings">
                  {{ isMac ? 'System Settings' : 'Windows settings' }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="isMac" class="settings-section">
            <div class="settings-section-title">Menu bar</div>
            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">Menu bar icon</span>
                <div class="settings-description">A status light in the menu bar: spins while any session works, turns orange when one waits for you. Its menu lists them.</div>
              </div>
              <div class="settings-field-control">
                <SbSwitch v-model="form.trayIcon" />
              </div>
            </div>
          </div>
        </template>

        <!-- ══ Assistant (global only) ════════════════════════════
             The Chat tab's assistant — see chat-agent.js. Its prompt is
             layered on top of the CLI's own; what it may *not* do (edit files,
             run commands) is enforced by the tools it is given, not by this
             text, so editing the prompt cannot turn it into a coder. -->
        <template v-if="tab === 'assistant' && !isProject">
          <div class="settings-section">
            <div class="settings-section-title">Buddy</div>
            <div class="settings-field settings-field--column">
              <div class="settings-field-info">
                <span class="settings-label">System prompt</span>
                <div class="settings-description">
                  Added to Claude Code's own system prompt for the Chat tab's assistant. It already
                  cannot edit files or run shell commands — it has no tool for either — so this is
                  about how it manages: how it words the sessions it starts, when it asks, how it
                  reports back. Takes effect when the assistant next starts, or on Restart below.
                </div>
              </div>
              <div class="settings-field-control settings-field-control--full">
                <textarea
                  class="settings-textarea settings-textarea--tall"
                  v-model="form.managerChatPrompt"
                  rows="18"
                  spellcheck="false"
                ></textarea>
                <div class="settings-inline-actions">
                  <button class="settings-reset-btn" @click="form.managerChatPrompt = managerChatDefault" v-if="form.managerChatPrompt !== managerChatDefault">Reset to default</button>
                </div>
              </div>
            </div>

            <!-- Which robot the mascot is. The preview is the real thing,
                 drawn from the same component the sidebar uses — with its
                 brain, drones and speech left off, since none of that is what
                 is being picked. -->
            <div class="settings-field settings-field--column">
              <div class="settings-field-info">
                <span class="settings-label">Mascot</span>
                <div class="settings-description">
                  The robot at the foot of Buddy's sidebar. Classic is the one that acts out what
                  Buddy is doing; the rest are the same states in another body.
                </div>
              </div>
              <div class="settings-field-control settings-field-control--full sbx-mascot">
                <div class="sbx-mascot__picks">
                  <button
                    v-for="d in DESIGNS"
                    :key="d.id"
                    type="button"
                    class="sbx-mascot__pick"
                    :class="{ 'is-on': d.id === form.buddyDesign }"
                    :title="d.about"
                    @click="form.buddyDesign = d.id"
                  >{{ d.label }}</button>
                </div>
                <div class="sbx-mascot__preview">
                  <PixelBuddy :design="form.buddyDesign" bare state="idle" />
                  <span class="settings-description">{{ mascotAbout }}</span>
                </div>
              </div>
            </div>

            <!-- The buttons over its chat. Five boxes, each showing the
                 default it replaces: empty is "keep that one". -->
            <div class="settings-field settings-field--column">
              <div class="settings-field-info">
                <span class="settings-label">Quick questions</span>
                <div class="settings-description">
                  The buttons over Buddy's chat. Clicking one types it into the composer without sending.
                  Leave a box empty to keep the question it shows.
                </div>
              </div>
              <div class="settings-field-control settings-field-control--full">
                <input
                  v-for="(fallback, i) in BUDDY_PROMPT_DEFAULTS"
                  :key="i"
                  v-model="form.buddyPrompts[i]"
                  type="text"
                  class="settings-input sbx-promptbox"
                  :placeholder="fallback"
                  spellcheck="false"
                >
              </div>
            </div>

            <!-- How it writes, apart from what it does: reworking the role
                 should not mean re-typing the formatting rules. -->
            <div class="settings-field settings-field--column">
              <div class="settings-field-info">
                <span class="settings-label">Response style</span>
                <div class="settings-description">
                  How the assistant writes its answers — length, lists, what goes first. Sent after
                  the system prompt above, as its own block.
                </div>
              </div>
              <div class="settings-field-control settings-field-control--full">
                <textarea
                  class="settings-textarea settings-textarea--tall"
                  v-model="form.managerChatStyle"
                  rows="12"
                  spellcheck="false"
                ></textarea>
                <div class="settings-inline-actions">
                  <button class="settings-reset-btn" @click="form.managerChatStyle = managerStyleDefault" v-if="form.managerChatStyle !== managerStyleDefault">Reset to default</button>
                  <button class="settings-reset-btn" :disabled="assistantRestarting" @click="restartAssistant">
                    {{ assistantRestarting ? 'Restarting…' : 'Save and restart the assistant' }}
                  </button>
                  <span v-if="assistantNotice" class="settings-description">{{ assistantNotice }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>

          <!-- ── The assistant's toolset (development builds only) ──
               Everything the in-process `wooton` MCP server offers, as the
               model sees it, with the read-only tools runnable against the
               live app. For knowing what the assistant can do and debugging
               what a tool returns — see wooton-mcp.js. -->
          <div v-if="tab === 'assistant' && !isProject && mcpInfo" class="settings-section">
            <div class="settings-section-title">
              What Buddy can do <span v-if="mcpInfo.dev" class="sbx-mcptools__dev">dev</span>
            </div>
            <div class="settings-section-note">
              {{ mcpInfo.tools.length }} tools ·
              {{ toolCount('auto') }} run when it asks for them ·
              {{ toolCount('ask') }} ask you first ·
              {{ toolCount('off') }} switched off.
              Never given: <code v-for="(name, i) in mcpInfo.forbidden" :key="name">{{ name }}{{ i < mcpInfo.forbidden.length - 1 ? ', ' : '' }}</code>.
              A change takes effect on Buddy's next message: it restarts with the tools it is given.
            </div>

            <div
              v-for="tool in mcpInfo.tools"
              :key="tool.name"
              class="sbx-mcptool"
              :class="{ 'is-open': openTool === tool.name }"
            >
              <div class="sbx-mcptool__head">
                <button type="button" class="sbx-mcptool__title" @click="openTool = openTool === tool.name ? '' : tool.name">
                  <span class="sbx-mcptool__chev">{{ openTool === tool.name ? '▾' : '▸' }}</span>
                  <code class="sbx-mcptool__name">{{ tool.name }}</code>
                  <span class="sbx-mcptool__badge" :class="tool.readOnly ? 'is-read' : 'is-write'">{{ tool.readOnly ? 'read' : 'write' }}</span>
                </button>
                <!-- Two decisions, not three states in a picker: is it given at
                     all, and does it stop to ask. Off wins — a tool it does not
                     have cannot ask. The same switch component as every other
                     setting, untouched — a resized copy of it came out broken. -->
                <span class="sbx-mcptool__opt">
                  <SbSwitch
                    :model-value="toolState(tool) !== 'off'"
                    @update:model-value="on => setToolState(tool, on ? (tool.defaultState === 'off' ? 'auto' : tool.defaultState) : 'off')"
                  />
                  <span>On</span>
                </span>
                <span class="sbx-mcptool__opt" :class="{ 'is-disabled': toolState(tool) === 'off' }">
                  <SbSwitch
                    :model-value="toolState(tool) === 'ask'"
                    :disabled="toolState(tool) === 'off'"
                    @update:model-value="ask => setToolState(tool, ask ? 'ask' : 'auto')"
                  />
                  <span>Ask first</span>
                </span>
              </div>
              <div class="sbx-mcptool__desc">{{ tool.description }}</div>

              <div v-if="openTool === tool.name" class="sbx-mcptool__body">
                <div class="sbx-mcptool__full"><code>{{ tool.fullName }}</code></div>
                <table v-if="tool.params.length" class="sbx-mcptool__params">
                  <tr v-for="p in tool.params" :key="p.name">
                    <td><code>{{ p.name }}</code><span v-if="p.required" class="sbx-mcptool__req">*</span></td>
                    <td class="sbx-mcptool__type">{{ p.type }}</td>
                    <td>{{ p.description }}</td>
                  </tr>
                </table>
                <div v-else class="settings-description">No parameters.</div>

                <div v-if="tool.readOnly && mcpInfo.dev" class="sbx-mcptool__try">
                  <textarea
                    v-model="toolArgs[tool.name]"
                    class="settings-textarea sbx-mcptool__args"
                    rows="3"
                    spellcheck="false"
                    :placeholder="argsPlaceholder(tool)"
                    @keydown.meta.enter.prevent="runMcpTool(tool)"
                    @keydown.ctrl.enter.prevent="runMcpTool(tool)"
                  ></textarea>
                  <div class="settings-inline-actions">
                    <button class="settings-reset-btn" :disabled="toolRunning === tool.name" @click="runMcpTool(tool)">
                      {{ toolRunning === tool.name ? 'Running…' : 'Run  ⌘↵' }}
                    </button>
                    <span v-if="toolOut[tool.name]?.meta" class="settings-description">{{ toolOut[tool.name].meta }}</span>
                  </div>
                  <pre
                    v-if="toolOut[tool.name]"
                    class="sbx-mcptool__out"
                    :class="{ 'is-error': toolOut[tool.name].error }"
                  >{{ toolOut[tool.name].text }}</pre>
                </div>
                <div v-else class="settings-description">Changes something — run it through the assistant, not from here.</div>
              </div>
            </div>
          </div>

        <!-- ══ Git (global only) ══════════════════════════════════ -->
        <template v-if="tab === 'git' && !isProject">
          <div class="settings-section">
            <div class="settings-section-title">Commit messages</div>
            <div class="settings-field settings-field--column">
              <div class="settings-field-info">
                <span class="settings-label">Commit Message Prompt</span>
                <div class="settings-description">Instruction sent to Claude CLI when generating a commit message. The git diff is appended automatically. Leave empty to use the default.</div>
              </div>
              <div class="settings-field-control settings-field-control--full">
                <textarea
                  class="settings-textarea"
                  v-model="form.commitMessagePrompt"
                  placeholder="Enter prompt…"
                  rows="5"
                ></textarea>
                <button class="settings-reset-btn" @click="form.commitMessagePrompt = ''" v-if="form.commitMessagePrompt">Reset to default</button>
              </div>
            </div>
          </div>

          <!-- ── Integrations ──────────────────────────────────────── -->
          <div class="settings-section">
            <div class="settings-section-title">Integrations</div>
            <div class="settings-field">
              <div class="settings-field-info">
                <span class="settings-label">GitLab Token</span>
                <div class="settings-description">Personal access token for GitLab API (read_api scope). Used for downloading project avatars.</div>
              </div>
              <div class="settings-field-control">
                <input
                  type="password"
                  class="settings-input"
                  v-model="form.gitlabToken"
                  placeholder="glpat-…"
                  autocomplete="off"
                >
              </div>
            </div>
          </div>

        </template>

      </div>
    </div>

    <!-- ── Footer ───────────────────────────────────────────────
         Saving is the same action on every tab, so it belongs to the panel
         rather than to any one of them — and out of the scroller, it stays
         reachable from the middle of a long tab. The version sits beside it
         because it belongs to no tab either. -->
    <div v-if="!loading" class="settings-footer">
      <div class="settings-version">
        <template v-if="!isProject">
          <span v-if="appVersion">v{{ appVersion }}</span>
          <span v-if="updateStatus" class="settings-update-status">{{ updateStatus }}</span>
          <a
            v-if="newVersion"
            class="settings-update-link"
            href="#"
            @click.prevent="openReleasesPage"
          >Download v{{ newVersion }} ↗</a>
          <button v-else class="settings-update-check" type="button" @click="checkUpdates">Check for updates</button>
        </template>
      </div>
      <span v-if="ideNotice" class="settings-notice">{{ ideNotice }}</span>
      <div class="settings-btn-row">
        <SbButton v-if="isProject" variant="danger" size="sm" @click="removeProject">Hide Project</SbButton>
        <SbButton variant="secondary" size="sm" @click="close">Cancel</SbButton>
        <SbButton :variant="'primary'" size="sm" @click="save" :disabled="saveState === 'saved'">
          {{ saveState === 'saved' ? '✓ Saved' : 'Save Settings' }}
        </SbButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { store } from '../store.js';
import { DEFAULT_PROMPTS as BUDDY_PROMPT_DEFAULTS } from '../buddy-suggestions.js';
import { DESIGNS, designById } from '../buddy-designs.js';
import PixelBuddy from './PixelBuddy.vue';
import SbSwitch from './SbSwitch.vue';
import SbButton from './SbButton.vue';
import FilterTabs from './FilterTabs.vue';
import TerminalPreview from './TerminalPreview.vue';

// ── Derived from store ────────────────────────────────────────────
const isProject = computed(() => store.settingsScope === 'project');
// The menu-bar icon is a macOS thing; elsewhere the setting would do nothing.
const isMac = /Mac/.test(navigator.platform);
const isWindows = /Win/.test(navigator.platform);

// ── Test notification ─────────────────────────────────────────────
// Goes through main's real path, and says which way it went: the app's own
// notification, or AppleScript when macOS refused the app's (an unsigned dev
// build is refused without a word).
const notifyTesting = ref(false);
const notifyTest = ref(null);
const notifyCountdown = ref(0);
// What the system has done with the notifications sent so far — main.js can
// only know this by having sent one, so it stays 'unknown' until then.
const notifyState = ref('unknown');
const notifyDenied = computed(() => notifyState.value === 'refused');

function openNotificationSettings() {
  window.api.openNotificationSettings?.();
}

// Five seconds of countdown before it goes: a banner is suppressed while its
// own app is in front, which is exactly where you are when you press this.
// Clicking away during the count is the point of the wait.
async function testNotification() {
  notifyTesting.value = true;
  notifyTest.value = null;
  try {
    for (notifyCountdown.value = 5; notifyCountdown.value > 0; notifyCountdown.value--) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const res = await window.api.testNotification?.({ sound: form.notifySound !== false });
    if (!res) notifyTest.value = { text: 'This build cannot send notifications.', warn: true };
    else if (res.via === 'native') notifyTest.value = { text: 'Sent. Clicking a notification opens its session.' };
    else if (res.via === 'applescript') {
      notifyTest.value = {
        text: `macOS did not show the app's own notification${res.error ? ` (${res.error})` : ''}. It went out through AppleScript instead, which macOS may also be holding back — and a banner from there cannot open the session when clicked.`,
        warn: true,
      };
    } else notifyTest.value = { text: res.error || 'Nothing could be shown.', warn: true };
  } finally {
    notifyTesting.value = false;
    notifyCountdown.value = 0;
    notifyState.value = (await window.api.notificationPermission?.().catch(() => null))?.state || 'unknown';
  }
}
const projectPath = computed(() => store.settingsProjectPath);
const settingsKey = computed(() => isProject.value ? 'project:' + projectPath.value : 'global');
// Name over path, the way the project page titles itself: what this is, then
// what it applies to.
const title = computed(() => (isProject.value ? 'Project Settings' : 'Global Settings'));
const scopeLabel = computed(() => (isProject.value
  ? (projectPath.value || '')
  : 'Applies to every project unless a project overrides it'));

// ── Tabs ──────────────────────────────────────────────────────────
//
// Split by what a setting governs, not by which layer stores it: what the
// agent is allowed to do and how it starts, what happens around git, and how
// the app looks. Everything a project may override is agent work, so the other
// two tabs are global-only and a project sees one tab.
const TABS = [
  { id: 'agent', label: 'Agent', globalOnly: false },
  { id: 'git', label: 'Git', globalOnly: true },
  { id: 'assistant', label: 'Buddy', globalOnly: true },
  { id: 'notifications', label: 'Notifications', globalOnly: true },
  { id: 'appearance', label: 'Appearance', globalOnly: true },
];
const tabs = computed(() => TABS.filter(t => !t.globalOnly || !isProject.value));
const tab = ref('agent');

// `''` is "pass no flag", which leaves the CLI on its own default — prompting
// for anything that is not already allowed. Naming that is worth more than
// calling it "none": it is the mode most sessions actually run in.
const PERMISSION_MODES = [
  { value: '', label: 'Ask every time (default)' },
  { value: 'auto', label: 'Auto — classifier decides' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'plan', label: 'Plan' },
  { value: 'dontAsk', label: "Don't ask — deny instead" },
  { value: 'bypassPermissions', label: 'Bypass all checks' },
];

// Stored and sent as the language's own name: the value goes straight into the
// summarize prompt, so "Русский" is both what the menu says and what the model
// is asked for. Empty means the model answers in whatever the transcript is in.
const SUMMARY_LANGUAGES = [
  'English', 'Русский', 'Українська', 'Deutsch', 'Español', 'Français',
  'Italiano', 'Português', 'Polski', 'Türkçe', 'Nederlands',
  '中文', '日本語', '한국어',
];

const PERMISSION_MODE_DESCS = {
  '': 'Claude stops and asks before anything that is not already allowed.',
  auto: 'A model classifier approves or denies each prompt; only what it will not decide reaches you.',
  acceptEdits: 'File edits go through without asking. Everything else still prompts.',
  plan: 'Claude plans and does not run anything until the plan is accepted.',
  dontAsk: 'Nothing prompts — anything not pre-approved is denied outright.',
  bypassPermissions: 'Every check is off. Claude runs whatever it decides to run.',
};

// ── Local state ───────────────────────────────────────────────────
const loading = ref(true);
const saveState = ref('idle'); // 'idle' | 'saved'
const ideNotice = ref('');
const appVersion = ref('');
const updateStatus = ref('');
const newVersion = ref('');
const shellProfiles = ref([]);
const terminalThemes = computed(() => window.TERMINAL_THEMES || {});
const terminalFonts = computed(() => window.TERMINAL_FONTS || {});

// Themes carry a `mode` so the dropdown can group them; anything without one
// predates the split and is dark.
function themesByMode(mode) {
  return Object.fromEntries(
    Object.entries(terminalThemes.value).filter(([, t]) => (t.mode || 'dark') === mode)
  );
}
const darkTerminalThemes = computed(() => themesByMode('dark'));
const lightTerminalThemes = computed(() => themesByMode('light'));

const COMMIT_MSG_PROMPT_DEFAULT = `Write a concise git commit message (max 72 chars for first line) for these changes. Use conventional commit format (feat/fix/refactor/docs/chore). Output ONLY the commit message, no explanation:`;
const commitMsgPromptDefault = COMMIT_MSG_PROMPT_DEFAULT;

const form = reactive({
  model: '',
  effort: '',
  permissionMode: '',
  worktree: false,
  worktreeName: '',
  chrome: false,
  preLaunchCmd: '',
  addDirs: '',
  visibleSessionCount: 10,
  sessionMaxAgeDays: 3,
  terminalTheme: 'wootonpadDark',
  mcpEmulation: true,
  sdkMode: false,
  reduceMotion: false,
  shellProfile: 'auto',
  showAvatars: true,
  unreadCounters: false,
  notifyEnabled: true,
  notifyMinWorkSeconds: 3,
  notifySound: true,
  trayIcon: true,
  monoFont: 'default',
  uiFont: 'default',
  uiFontSize: 13,
  uiLineHeight: 1.55,
  terminalFontSize: 12,
  terminalLineHeight: 1.25,
  commitMessagePrompt: '',
  gitlabToken: '',
  summaryLanguage: '',
  managerChatPrompt: '',
  managerChatStyle: '',
  buddyPrompts: ['', '', '', '', ''],
  mcpTools: {},
  buddyDesign: 'classic',
});

const mascotAbout = computed(() => designById(form.buddyDesign).about);

// The assistant's built-in prompt, fetched from main — the one place it lives
// (chat-agent.js). An edit equal to it is stored as "use the default", so a
// later improvement to the default reaches everyone who never changed it.
const managerChatDefault = ref('');
const managerStyleDefault = ref('');
const assistantRestarting = ref(false);

// ── MCP tools (development builds only) ──
const mcpInfo = ref(null);

// The state of one tool: what has been changed in this panel, else what main
// reported. 'auto' runs, 'ask' stops for a dialog, 'off' is not given at all.
function toolState(tool) {
  return form.mcpTools[tool.name] || tool.state;
}

function setToolState(tool, state) {
  form.mcpTools = { ...form.mcpTools, [tool.name]: state };
}

const toolCount = (state) => (mcpInfo.value?.tools || []).filter(t => toolState(t) === state).length;
const openTool = ref('');
const toolArgs = reactive({});
const toolOut = reactive({});
const toolRunning = ref('');

// A starting point for the arguments box: every parameter, required ones first.
function argsPlaceholder(tool) {
  if (!tool.params.length) return '{}';
  const sample = {};
  for (const p of [...tool.params].sort((a, b) => Number(b.required) - Number(a.required))) {
    sample[p.name] = p.type.includes('integer') || p.type.includes('number') ? 0
      : p.type === 'boolean' ? false
      : p.type.endsWith('[]') ? []
      : '';
  }
  return JSON.stringify(sample);
}

async function runMcpTool(tool) {
  let args = {};
  const raw = (toolArgs[tool.name] || '').trim();
  if (raw) {
    try { args = JSON.parse(raw); } catch (err) {
      toolOut[tool.name] = { text: `Arguments are not JSON: ${err.message}`, error: true };
      return;
    }
  }
  toolRunning.value = tool.name;
  try {
    const res = await window.api.wootonMcpRun(tool.name, args);
    toolOut[tool.name] = res?.ok
      ? { text: res.text || '(empty)', error: res.isError, meta: `${res.ms} ms · ${res.text.split('\n').length} lines${res.isError ? ' · tool error' : ''}` }
      : { text: res?.error || 'Failed', error: true };
  } finally {
    toolRunning.value = '';
  }
}
const assistantNotice = ref('');

const permissionModeDesc = computed(() =>
  PERMISSION_MODE_DESCS[form.permissionMode] || PERMISSION_MODE_DESCS['']);

// Mirrors UI_METRIC_DEFAULTS in public/ui-metrics.js.
const METRIC_DEFAULTS = window.UI_METRIC_DEFAULTS || {
  uiFontSize: 13, uiLineHeight: 1.55, terminalFontSize: 12, terminalLineHeight: 1.25,
};

const useGlobal = reactive({
  permissionMode: true,
  model: true,
  effort: true,
  worktree: true,
  worktreeName: true,
  chrome: true,
  preLaunchCmd: true,
  addDirs: true,
});

let originalMcpEmulation = true;

// ── Helpers ───────────────────────────────────────────────────────
// `null` is how "not set" is stored, and it is not a value any <select> has an
// option for — inheriting a null global left the control blank rather than
// showing what was being inherited. Both ends normalise to the fallback.
function effectiveValue(current, global, field, fallback) {
  const use = (value) => (value === undefined || value === null ? fallback : value);
  if (isProject.value && (current[field] === undefined || current[field] === null)) {
    return use(global[field]);
  }
  return use(current[field]);
}

function isUsingGlobal(current, field) {
  return current[field] === undefined || current[field] === null;
}

// ── Load settings ─────────────────────────────────────────────────
async function loadSettings() {
  loading.value = true;
  const current = (await window.api.getSetting(settingsKey.value)) || {};
  const global = isProject.value ? ((await window.api.getSetting('global')) || {}) : {};

  const overrideFields = ['permissionMode', 'model', 'effort', 'worktree', 'worktreeName', 'chrome', 'preLaunchCmd', 'addDirs'];
  for (const field of overrideFields) {
    if (isProject.value) {
      useGlobal[field] = isUsingGlobal(current, field);
    }
    form[field] = effectiveValue(current, global, field, getDefault(field));
  }

  if (!isProject.value) {
    form.visibleSessionCount = current.visibleSessionCount ?? 10;
    form.sessionMaxAgeDays = current.sessionMaxAgeDays ?? 3;
    form.terminalTheme = window.resolveTerminalTheme?.(current.terminalTheme) ?? current.terminalTheme ?? 'wootonpadDark';
    form.mcpEmulation = current.mcpEmulation !== false;
    form.sdkMode = current.sessionMode === 'sdk';
    form.reduceMotion = current.reduceMotion === true;
    form.shellProfile = current.shellProfile ?? 'auto';
    form.showAvatars = current.showAvatars !== false;
    form.unreadCounters = current.unreadCounters === true;
    form.notifyEnabled = current.notifyEnabled !== false;
    form.notifyMinWorkSeconds = current.notifyMinWorkSeconds ?? 3;
    form.notifySound = current.notifySound !== false;
    form.trayIcon = current.trayIcon !== false;
    form.monoFont = current.monoFont ?? 'default';
    form.uiFont = current.uiFont ?? 'default';
    form.uiFontSize = current.uiFontSize ?? METRIC_DEFAULTS.uiFontSize;
    form.uiLineHeight = current.uiLineHeight ?? METRIC_DEFAULTS.uiLineHeight;
    form.terminalFontSize = current.terminalFontSize ?? METRIC_DEFAULTS.terminalFontSize;
    form.terminalLineHeight = current.terminalLineHeight ?? METRIC_DEFAULTS.terminalLineHeight;
    form.commitMessagePrompt = current.commitMessagePrompt || COMMIT_MSG_PROMPT_DEFAULT;
    form.gitlabToken = current.gitlabToken || '';
    form.summaryLanguage = current.summaryLanguage || '';
    managerChatDefault.value = (await window.api.managerChatDefaultPrompt?.().catch(() => '')) || '';
    form.managerChatPrompt = current.managerChatPrompt || managerChatDefault.value;
    managerStyleDefault.value = (await window.api.managerChatDefaultStyle?.().catch(() => '')) || '';
    mcpInfo.value = (await window.api.wootonMcpTools?.().catch(() => null)) || null;
    notifyState.value = (await window.api.notificationPermission?.().catch(() => null))?.state || 'unknown';
    form.managerChatStyle = current.managerChatStyle || managerStyleDefault.value;
    form.buddyPrompts = BUDDY_PROMPT_DEFAULTS.map((_, i) => current.buddyPrompts?.[i] || '');
    form.mcpTools = { ...(current.mcpTools || {}) };
    form.buddyDesign = current.buddyDesign || store.buddyDesign || 'classic';
    originalMcpEmulation = form.mcpEmulation;

    try { shellProfiles.value = await window.api.getShellProfiles(); } catch { shellProfiles.value = []; }
    window.api.getAppVersion().then(v => { appVersion.value = v; });
  }

  loading.value = false;
}

function getDefault(field) {
  const defaults = { permissionMode: '', model: '', effort: '', worktree: false, worktreeName: '', chrome: false, preLaunchCmd: '', addDirs: '' };
  return defaults[field];
}

// ── "Use global" toggle ───────────────────────────────────────────
function toggleGlobal(field, checked) {
  useGlobal[field] = checked;
}

// ── Save ──────────────────────────────────────────────────────────
async function save() {
  let settings = {};

  if (isProject.value) {
    const overrideFields = ['permissionMode', 'model', 'effort', 'worktree', 'worktreeName', 'chrome', 'preLaunchCmd', 'addDirs'];
    for (const field of overrideFields) {
      if (!useGlobal[field]) {
        settings[field] = form[field];
      }
    }
  } else {
    const existing = (await window.api.getSetting('global')) || {};
    settings = {
      ...existing,
      permissionMode: form.permissionMode || null,
      model: form.model || null,
      effort: form.effort || null,
      worktree: form.worktree,
      worktreeName: form.worktreeName,
      chrome: form.chrome,
      preLaunchCmd: form.preLaunchCmd,
      addDirs: form.addDirs,
      visibleSessionCount: form.visibleSessionCount || 10,
      sessionMaxAgeDays: form.sessionMaxAgeDays || 3,
      terminalTheme: form.terminalTheme || 'wootonpadDark',
      mcpEmulation: form.mcpEmulation,
      sessionMode: form.sdkMode ? 'sdk' : 'pty',
      reduceMotion: form.reduceMotion,
      shellProfile: form.shellProfile || 'auto',
      showAvatars: form.showAvatars,
      unreadCounters: form.unreadCounters,
      notifyEnabled: form.notifyEnabled,
      notifyMinWorkSeconds: Math.max(0, Number(form.notifyMinWorkSeconds) || 0),
      notifySound: form.notifySound,
      trayIcon: form.trayIcon,
      monoFont: form.monoFont || 'default',
      uiFont: form.uiFont || 'default',
      uiFontSize: Number(form.uiFontSize) || METRIC_DEFAULTS.uiFontSize,
      uiLineHeight: Number(form.uiLineHeight) || METRIC_DEFAULTS.uiLineHeight,
      terminalFontSize: Number(form.terminalFontSize) || METRIC_DEFAULTS.terminalFontSize,
      terminalLineHeight: Number(form.terminalLineHeight) || METRIC_DEFAULTS.terminalLineHeight,
      commitMessagePrompt: form.commitMessagePrompt === COMMIT_MSG_PROMPT_DEFAULT ? '' : (form.commitMessagePrompt || ''),
      gitlabToken: form.gitlabToken || '',
      summaryLanguage: form.summaryLanguage || '',
      managerChatPrompt: storedManagerPrompt(),
      managerChatStyle: storedManagerStyle(),
      // A box left at its default is stored empty, so a later change to the
      // defaults reaches anyone who never wrote their own.
      buddyPrompts: form.buddyPrompts.map((q, i) => (q.trim() === BUDDY_PROMPT_DEFAULTS[i] ? '' : q.trim())),
      // Only what differs from the app's defaults, so a later change to those
      // reaches anyone who never touched a tool.
      buddyDesign: form.buddyDesign || 'classic',
      mcpTools: Object.fromEntries((mcpInfo.value?.tools || [])
        .map(t => [t.name, toolState(t)])
        .filter(([name, state]) => state !== (mcpInfo.value.tools.find(t => t.name === name)?.defaultState))),
    };
  }

  await window.api.setSetting(settingsKey.value, settings);

  if (!isProject.value) {
    window._setVisibleSessionCount?.(settings.visibleSessionCount);
    window._setSessionMaxAge?.(settings.sessionMaxAgeDays);
    window._applyTerminalTheme?.(settings.terminalTheme);
    window._setShowAvatars?.(settings.showAvatars);
    window._setReduceMotion?.(settings.reduceMotion);
    window._setUnreadCounters?.(settings.unreadCounters);
    window._setBuddyPrompts?.(settings.buddyPrompts);
    window._setBuddyDesign?.(settings.buddyDesign);
    if (window.TERMINAL_FONTS?.[settings.monoFont]) {
      window._applyTerminalFont?.(window.TERMINAL_FONTS[settings.monoFont].family);
    }
    window._applyUiFont?.(settings.uiFont);
    window._applyUiMetrics?.(settings);
    if (typeof refreshSidebar === 'function') refreshSidebar();

    if (settings.mcpEmulation !== originalMcpEmulation) {
      ideNotice.value = 'IDE Emulation setting changed. New sessions will use the updated setting — running sessions are not affected.';
      setTimeout(() => { ideNotice.value = ''; }, 8000);
    }
  }

  saveState.value = 'saved';
  setTimeout(() => close(), 600);
}

function storedManagerPrompt() {
  const text = (form.managerChatPrompt || '').trim();
  return !text || text === managerChatDefault.value.trim() ? '' : form.managerChatPrompt;
}

function storedManagerStyle() {
  const text = (form.managerChatStyle || '').trim();
  return !text || text === managerStyleDefault.value.trim() ? '' : form.managerChatStyle;
}

// A running session keeps the prompt it started with, so a new one only lands
// on a restart. Same conversation — the transcript is resumed, only the
// instructions change.
async function restartAssistant() {
  assistantRestarting.value = true;
  assistantNotice.value = '';
  try {
    const existing = (await window.api.getSetting('global')) || {};
    await window.api.setSetting('global', {
      ...existing,
      managerChatPrompt: storedManagerPrompt(),
      managerChatStyle: storedManagerStyle(),
    });
    const res = await window.api.managerChatRestart?.();
    assistantNotice.value = res?.ok ? 'Restarted with the new prompt.' : `Could not restart: ${res?.error || 'unknown error'}`;
  } finally {
    assistantRestarting.value = false;
  }
}

// ── Close ─────────────────────────────────────────────────────────
function close() {
  store.settingsOpen = false;
  window._restoreAfterSettings?.();
}

// ── Remove project ────────────────────────────────────────────────
async function removeProject() {
  const shortName = projectPath.value?.split('/').filter(Boolean).slice(-2).join('/') || projectPath.value;
  if (!confirm(`Hide project "${shortName}" from WootonPad?\n\nThis hides the project from the sidebar. Your session files are not deleted.`)) return;
  await window.api.removeProject(projectPath.value);
  store.settingsOpen = false;
  if (typeof loadProjects === 'function') loadProjects();
}

// ── Updates ───────────────────────────────────────────────────────
function checkUpdates() { window.api.updaterCheck(); }
function openReleasesPage() { window.api.openExternal('https://github.com/fortael/wootonpad/releases/latest'); }

// ── Lifecycle ─────────────────────────────────────────────────────
onMounted(async () => {
  await loadSettings();
  if (!isProject.value) {
    window.api.onUpdaterEvent((type, data) => {
      switch (type) {
        case 'checking': updateStatus.value = 'checking…'; newVersion.value = ''; break;
        case 'update-available': updateStatus.value = `v${data.version} available`; newVersion.value = data.version; break;
        case 'update-not-available': updateStatus.value = 'up to date'; newVersion.value = ''; break;
        case 'error': updateStatus.value = 'check failed'; newVersion.value = ''; break;
      }
    });
  }
});
</script>
