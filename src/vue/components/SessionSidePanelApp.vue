<template>
  <aside class="sbx-sidepanel">
    <!-- Drag to resize. Every width change has to refit the session terminal:
         xterm owns its cols/rows and hands them to the PTY, so a narrower
         terminal that was not refitted makes the CLI wrap at the old width. -->
    <div
      class="sbx-sidepanel__grip"
      :class="{ 'is-dragging': dragging }"
      title="Drag to resize"
      @mousedown.prevent="startDrag"
      @dblclick="resetWidth"
    ></div>

    <div class="sbx-sidepanel__body">
      <!-- A file someone clicked in the conversation. Same overlay shape as the
           diff, and for the same reason: the answer to "what is in that file"
           belongs beside the session, not in place of it. -->
      <header v-if="viewedFile" class="sbx-sidepanel__head">
        <button
          type="button"
          class="sbx-sidepanel__backbtn"
          data-tooltip="Close file"
          aria-label="Close file"
          @click="closeFile"
        >
          <SbIcon name="chevron-down" :size="13" class="sbx-sidepanel__backchev" />
          Back
        </button>
        <span class="sbx-sidepanel__difffile" :title="viewedFile">{{ baseOf(viewedFile) }}</span>
        <span class="sbx-sidepanel__spacer"></span>
        <!-- Read-only here on purpose: this is a reference while you read the
             conversation. Editing is a different task, and the Projects tab is
             where the tree, the save button and the rest of it already live. -->
        <button
          v-if="editableRelPath"
          type="button"
          class="sbx-sidepanel__iconbtn"
          data-tooltip="Open for editing in Projects"
          aria-label="Open for editing in Projects"
          @click="editInProjects"
        >
          <SbIcon name="notebook-pen" :size="12" />
        </button>
        <button
          type="button"
          class="sbx-sidepanel__iconbtn"
          data-tooltip="Close panel"
          aria-label="Close panel"
          @click="close"
        >
          <SbIcon name="x" :size="13" />
        </button>
      </header>

      <!-- The diff takes the header over rather than stacking a second bar:
           at this width every row of chrome is a row the diff does not get. -->
      <header v-else-if="activeDiff" class="sbx-sidepanel__head">
        <button
          type="button"
          class="sbx-sidepanel__backbtn"
          data-tooltip="Back to changes"
          aria-label="Back to changes"
          @click="closeDiff"
        >
          <SbIcon name="chevron-down" :size="13" class="sbx-sidepanel__backchev" />
          Back
        </button>
        <span class="sbx-sidepanel__difffile" :title="activeDiff.filePath">{{ baseOf(activeDiff.filePath) }}</span>
        <span class="sbx-sidepanel__spacer"></span>
        <span class="sbx-sidepanel__diffcount">{{ diffIndex + 1 }}/{{ changedFiles.length }}</span>
        <button
          type="button" class="sbx-sidepanel__iconbtn" data-tooltip="Previous file"
          aria-label="Previous file" :disabled="diffIndex <= 0" @click="stepDiff(-1)"
        >
          <SbIcon name="chevron-down" :size="12" class="sbx-sidepanel__prevchev" />
        </button>
        <button
          type="button" class="sbx-sidepanel__iconbtn" data-tooltip="Next file"
          aria-label="Next file" :disabled="diffIndex >= changedFiles.length - 1" @click="stepDiff(1)"
        >
          <SbIcon name="chevron-down" :size="12" class="sbx-sidepanel__nextchev" />
        </button>
      </header>

      <!-- A note or plan open for editing. Same overlay shape as the diff: at
           this width a second bar is a row the editor does not get. -->
      <header v-else-if="editingDoc" class="sbx-sidepanel__head">
        <button
          type="button"
          class="sbx-sidepanel__backbtn"
          :data-tooltip="docDirty ? 'Discard changes and go back' : 'Back'"
          aria-label="Close editor"
          @click="closeDoc"
        >
          <SbIcon name="chevron-down" :size="13" class="sbx-sidepanel__backchev" />
          Back
        </button>
        <span class="sbx-sidepanel__difffile" :title="editingDoc.filePath">{{ editingDoc.title }}</span>
        <span v-if="docDirty" class="sbx-sidepanel__dot" title="Unsaved changes"></span>
        <span class="sbx-sidepanel__spacer"></span>
        <button
          type="button"
          class="sbx-sidepanel__iconbtn"
          data-tooltip="Open in the main view"
          aria-label="Open in the main view"
          @click="expandDoc"
        >
          <SbIcon name="maximize-2" :size="12" />
        </button>
        <button
          type="button"
          class="sbx-sidepanel__iconbtn"
          :disabled="!docDirty || docSaving"
          data-tooltip="Save (⌘S)"
          aria-label="Save"
          @click="saveDoc"
        >
          <SbIcon name="check" :size="13" />
        </button>
      </header>

      <header v-else class="sbx-sidepanel__head">
        <span class="sbx-sidepanel__title">{{ activeTab?.label }}</span>
        <span v-if="tab === 'changes' && detail?.totalAdded" class="pv-added">+{{ detail.totalAdded }}</span>
        <span v-if="tab === 'changes' && detail?.totalDeleted" class="pv-deleted">&minus;{{ detail.totalDeleted }}</span>
        <span class="sbx-sidepanel__spacer"></span>
        <SbIcon name="git-branch" :size="12" tone="muted" />
        <span class="sbx-sidepanel__branch" :title="detail?.branch || ''">{{ detail?.branch || '—' }}</span>
        <span class="sbx-sidepanel__path" :title="projectPath">{{ shortPath }}</span>
        <button
          v-if="tab !== 'shell'"
          type="button"
          class="sbx-sidepanel__iconbtn"
          :class="{ 'is-busy': loading }"
          data-tooltip="Refresh"
          aria-label="Refresh"
          @click="load()"
        >
          <SbIcon name="refresh-cw" :size="12" />
        </button>
        <button
          type="button"
          class="sbx-sidepanel__iconbtn"
          data-tooltip="Close panel"
          aria-label="Close panel"
          @click="close"
        >
          <SbIcon name="x" :size="13" />
        </button>
      </header>

      <!-- ── File overlay ────────────────────────────────────────────── -->
      <div v-if="viewedFile" class="sbx-sidepanel__pane sbx-sidepanel__pane--diff">
        <div v-if="fileError" class="pv-empty">{{ fileError }}</div>
        <div v-show="!fileError" ref="fileHostRef" class="sbx-sidepanel__diffhost"></div>
      </div>

      <!-- ── Diff overlay ────────────────────────────────────────────── -->
      <div v-else-if="activeDiff" class="sbx-sidepanel__pane sbx-sidepanel__pane--diff">
        <div ref="diffHostRef" class="sbx-sidepanel__diffhost"></div>
      </div>

      <!-- ── Note / plan editor ──────────────────────────────────────
           Markdown source, because that is what these files are and what the
           main view edits too. A note is rarely only checkboxes — the prose
           around them is half the point. -->
      <div v-else-if="editingDoc" class="sbx-sidepanel__pane sbx-sidepanel__pane--doc">
        <!-- The app's own Markdown editor, the same CodeMirror the main view
             and the Projects tab use — highlighting, folding, ⌘F, ⌘S. -->
        <div ref="docHostRef" class="sbx-doc__editor" @keydown="onDocKey"></div>
        <div class="sbx-doc__foot">
          <span class="sbx-doc__hint">{{ docError || (docDirty ? 'Unsaved — ⌘S' : docSavedNote) }}</span>
          <button type="button" class="sbx-sidepanel__linkbtn" @click="expandDoc">Open full view</button>
        </div>
      </div>

      <!-- ── Changes: working tree / commits ─────────────────────────── -->
      <template v-else-if="tab === 'changes'">
        <!-- Two views of the same git pane rather than a fourth rail button:
             writing a commit and pushing it are the same errand. -->
        <div class="sbx-sidepanel__subtabs">
          <button
            type="button" class="sbx-sidepanel__subtab"
            :class="{ 'is-active': changesView === 'files' }"
            @click="changesView = 'files'"
          >Changes<span v-if="changedFiles.length" class="sbx-sidepanel__subcount">{{ changedFiles.length }}</span></button>
          <button
            type="button" class="sbx-sidepanel__subtab"
            :class="{ 'is-active': changesView === 'commits' }"
            @click="changesView = 'commits'"
          >Commits<span v-if="unpushedCommits.length" class="sbx-sidepanel__subcount is-unpushed">{{ unpushedCommits.length }}</span></button>
        </div>

        <template v-if="changesView === 'commits'">
          <div class="sbx-sidepanel__pane sbx-sidepanel__pane--commits">
            <template v-if="unpushedCommits.length">
              <div class="sbx-sidepanel__seclabel is-unpushed">
                {{ unpushedCommits.length }} unpushed
              </div>
              <div v-for="c in unpushedCommits" :key="'u' + c.hash" class="pv-commit-item sbx-sidepanel__commititem is-unpushed">
                <span class="pv-commit-hash">{{ c.hash }}</span>
                <span class="pv-commit-msg" :title="c.message">{{ c.message }}</span>
                <span class="pv-commit-date">{{ c.date }}</span>
              </div>
            </template>

            <div v-if="pushedCommits.length" class="sbx-sidepanel__seclabel">Recent</div>
            <div v-for="c in pushedCommits" :key="c.hash" class="pv-commit-item sbx-sidepanel__commititem">
              <span class="pv-commit-hash">{{ c.hash }}</span>
              <span class="pv-commit-msg" :title="c.message">{{ c.message }}</span>
              <span class="pv-commit-date">{{ c.date }}</span>
            </div>

            <div v-if="!commits.length && !unpushedCommits.length" class="pv-empty">
              {{ loading && !detail ? 'Loading…' : 'No commits' }}
            </div>
          </div>

          <div class="sbx-sidepanel__commit">
            <!-- Says what the push will do rather than refusing it: a branch
                 with no upstream gets one — see git-push-target.js. -->
            <div v-if="push.willSetUpstream && push.canPush" class="sbx-sidepanel__gitmsg">
              Will set upstream to {{ push.label }}.
            </div>
            <div v-else-if="push.reason && !push.canPush" class="sbx-sidepanel__gitmsg">{{ push.reason }}</div>
            <div class="sbx-sidepanel__commitrow">
              <span class="sbx-sidepanel__genlabel" :title="push.label">{{ push.label }}</span>
              <span class="sbx-sidepanel__spacer"></span>
              <!-- Two-step rather than a modal: pushing publishes to a remote,
                   so it should not be one stray click, and a 380px column is
                   the wrong place for a dialog. -->
              <button
                v-if="!confirmPush"
                type="button" class="pv-action-btn"
                :disabled="gitBusy || !push.canPush"
                @click="confirmPush = true"
              >Push{{ unpushedCommits.length ? ` (${unpushedCommits.length})` : '' }}</button>
              <template v-else>
                <button type="button" class="pv-gen-style-btn" @click="confirmPush = false">Cancel</button>
                <button type="button" class="pv-action-btn" :disabled="gitBusy" @click="doPush">Confirm push</button>
              </template>
            </div>
            <div v-if="gitMsg" class="sbx-sidepanel__gitmsg" :class="{ 'is-error': gitMsgError }">{{ gitMsg }}</div>
            <PushLinkNotice :link="pushLink" @dismiss="pushLink = null" />
          </div>
        </template>

        <template v-else>
        <div class="sbx-sidepanel__pane sbx-sidepanel__pane--files">
          <!-- A tree, not a column of full paths: nine files under the same
               four directories repeated that prefix nine times and pushed the
               only part that differs off the right edge. Untracked files are
               in there too, with the `git add` that used to need a terminal. -->
          <ChangeTree
            :files="changedFiles"
            :untracked="untrackedFiles"
            :hidden-count="hiddenNoise"
            :loading-file="loadingFile || ''"
            :busy="gitBusy"
            :empty-text="loading && !detail ? 'Loading…' : 'Working tree clean'"
            @open="openDiff"
            @add="doGitAdd"
            @update:included="commitPaths = $event"
          />
        </div>

        <!-- Committing from here is the point: the session that made the
             changes is right there, so going to the Projects tab to write the
             message is a trip for nothing. -->
        <div v-if="changedFiles.length" class="sbx-sidepanel__commit">
          <textarea
            v-if="!generating"
            class="pv-commit-input sbx-sidepanel__commitinput"
            placeholder="Commit message…"
            v-model="commitMessage"
            rows="3"
          ></textarea>
          <div v-else class="sbx-sidepanel__generating">Generating…</div>
          <div class="sbx-sidepanel__commitrow">
            <span class="sbx-sidepanel__genlabel">Claude:</span>
            <button
              type="button" class="pv-gen-style-btn"
              :disabled="gitBusy || generating" title="One-sentence commit message"
              @click="generateCommitMsg('short')"
            >short</button>
            <button
              type="button" class="pv-gen-style-btn"
              :disabled="gitBusy || generating" title="Title + bullet list of key changes"
              @click="generateCommitMsg('descriptive')"
            >detailed</button>
            <span class="sbx-sidepanel__spacer"></span>
            <button
              type="button" class="pv-action-btn"
              :disabled="gitBusy || !commitMessage.trim() || !commitPaths.length"
              @click="doCommit"
            >Commit{{ partialCommit ? ` (${commitPaths.length})` : '' }}</button>
          </div>
          <!-- Untracked files are not committed — see git-staging.js. Said out
               loud, because "it did not commit my new file" is the mirror of
               the bug this fixed: a commit must be exactly the list above, and
               what is outside it has to be visible rather than silent. -->
          <div v-if="untrackedFiles.length" class="sbx-untracked" :title="untrackedFiles.join('\n')">
            <SbIcon name="circle-dot" :size="11" tone="muted" />
            {{ untrackedFiles.length }} untracked file{{ untrackedFiles.length === 1 ? '' : 's' }} not committed
          </div>
          <!-- Who the commit will be authored as. Easy to be in a worktree or a
               repo with a local override and not notice until after the fact. -->
          <div v-if="gitUser.name || gitUser.email" class="pv-git-user">
            <SbIcon name="users" :size="11" />
            <span class="pv-git-user-name">{{ gitUser.name }}</span>
            <span v-if="gitUser.email" class="pv-git-user-email">&lt;{{ gitUser.email }}&gt;</span>
          </div>
          <div v-if="gitMsg" class="sbx-sidepanel__gitmsg" :class="{ 'is-error': gitMsgError }">{{ gitMsg }}</div>
          <PushLinkNotice :link="pushLink" @dismiss="pushLink = null" />
        </div>
        </template>
      </template>

      <!-- ── Containers ──────────────────────────────────────────────── -->
      <div v-else-if="tab === 'containers'" class="sbx-sidepanel__pane sbx-sidepanel__pane--containers">
        <template v-if="containers.length">
          <div
            v-for="c in containers" :key="c.name"
            class="pv-container-row"
            :class="{ running: (c.state || '').includes('running') }"
            :title="c.status || c.state"
          >
            <span class="pv-container-dot"></span>
            <span class="pv-container-name">{{ c.name }}</span>
            <span class="pv-container-state">{{ c.status || c.state }}</span>
            <span v-if="c.ports" class="pv-container-ports">{{ c.ports }}</span>
          </div>
        </template>
        <div v-else class="pv-empty">{{ loading && !detail ? 'Loading…' : 'No compose services' }}</div>
      </div>

      <!-- ── TODOs and plans ─────────────────────────────────────────
           The account's notes that name this project, and the plans that
           mention it. Both are Markdown in the account's Claude home, and both
           open in the same editor the Plans tab uses. -->
      <template v-else-if="tab === 'todos'">
        <div class="sbx-sidepanel__pane">
          <div class="sbx-sidepanel__seclabel">
            Notes
            <button
              type="button"
              class="sbx-sidepanel__linkbtn"
              :data-tooltip="creatingNote ? 'Cancel' : 'New note related to this project'"
              @click="toggleNewNote"
            >{{ creatingNote ? 'Cancel' : '+ New' }}</button>
          </div>

          <!-- An inline field rather than a dialog: window.prompt does not
               exist in Electron, and a one-field dialog for a title would be
               heavier than the note it creates. -->
          <div v-if="creatingNote" class="sbx-doc__newrow">
            <input
              ref="newNoteInput"
              v-model="newNoteTitle"
              class="sbx-doc__input"
              placeholder="Note title"
              @keydown.enter.prevent="createNote"
              @keydown.escape="toggleNewNote"
            />
            <button type="button" class="sbx-sidepanel__linkbtn" @click="createNote">Create</button>
          </div>

          <div v-if="!projectNotes.length" class="pv-empty">
            No notes for this project yet.
          </div>

          <div v-for="note in projectNotes" :key="note.filename" class="sbx-todo">
            <div class="sbx-todo__head" @click="editNote(note)">
              <span class="sbx-todo__title">{{ note.title }}</span>
              <span v-if="note.total" class="sbx-todo__count" :class="{ 'is-done': note.done === note.total }">
                {{ note.done }}/{{ note.total }}
              </span>
              <button
                type="button"
                class="sbx-todo__act"
                data-tooltip="Edit note"
                aria-label="Edit note"
                @click.stop="editNote(note)"
              ><SbIcon name="pencil" :size="11" tone="muted" /></button>
              <button
                type="button"
                class="sbx-todo__act"
                data-tooltip="Open in the main view"
                aria-label="Open in the main view"
                @click.stop="openNote(note)"
              ><SbIcon name="maximize-2" :size="11" tone="muted" /></button>
            </div>
            <!-- The whole note, prose and checkboxes in the order they were
                 written: a list of boxes without the text around them loses
                 the part that says why they are there. -->
            <div v-if="note.blocks?.length" class="sbx-todo__list">
              <template v-for="(block, i) in note.blocks" :key="i">
                <div
                  v-if="block.type === 'todo'"
                  class="sbx-todo__item"
                  :class="{ 'is-done': block.done }"
                  @click="toggleNoteTodo(note, block)"
                >
                  <SbIcon :name="block.done ? 'square-check-big' : 'square'" :size="12" tone="muted" />
                  <span>{{ block.text || '(empty)' }}</span>
                </div>
                <p v-else class="sbx-todo__text" @click="editNote(note)">{{ block.text }}</p>
              </template>
            </div>
          </div>

          <div class="sbx-sidepanel__seclabel">
            Plans
            <button
              type="button"
              class="sbx-sidepanel__linkbtn"
              @click="allPlans = !allPlans"
            >{{ allPlans ? 'Related only' : 'Show all' }}</button>
          </div>

          <div v-if="!visiblePlans.length" class="pv-empty">
            {{ allPlans ? 'No plans on this account.' : 'No plans mention this project.' }}
          </div>

          <div
            v-for="plan in visiblePlans"
            :key="plan.filename"
            class="sbx-todo sbx-todo--plan"
            @click="editPlan(plan)"
          >
            <div class="sbx-todo__head">
              <span class="sbx-todo__title">{{ plan.title || plan.filename }}</span>
              <button
                type="button"
                class="sbx-todo__act"
                data-tooltip="Open in the main view"
                aria-label="Open in the main view"
                @click.stop="openPlan(plan)"
              ><SbIcon name="maximize-2" :size="11" tone="muted" /></button>
            </div>
            <span class="sbx-todo__meta">{{ plan.filename }}</span>
          </div>
        </div>
      </template>

      <!-- ── Background tasks ────────────────────────────────────────
           Sub-agents this session spawned. Clicking one opens its transcript
           in the main area — the same viewer a session's own history uses. -->
      <template v-else-if="tab === 'tasks'">
        <div class="sbx-sidepanel__pane">
          <div v-if="!subagents.length" class="pv-empty">
            This session has not spawned any sub-agents.
          </div>

          <button
            v-for="agent in subagents"
            :key="agent.agentId"
            type="button"
            class="sbx-agent"
            :class="{ 'is-running': agent.running }"
            @click="openSubagent(agent)"
          >
            <span class="sbx-agent__head">
              <span class="sbx-agent__dot" :class="{ 'is-running': agent.running }"></span>
              <span class="sbx-agent__type">{{ agent.agentType }}</span>
              <span class="sbx-sidepanel__spacer"></span>
              <span class="sbx-agent__state">{{ agent.running ? 'running' : 'finished' }}</span>
            </span>
            <span class="sbx-agent__desc">{{ agent.description || agent.agentId }}</span>
            <span v-if="agent.lastText" class="sbx-agent__last">{{ agent.lastText }}</span>
            <span class="sbx-agent__meta">
              {{ agentWhen(agent) }} · {{ formatBytes(agent.bytes) }}
            </span>
          </button>
        </div>
      </template>

      <!-- ── Scratch shell ───────────────────────────────────────────── -->
      <!-- v-show, not v-if: the xterm instance is bound to this host element,
           and unmounting it on every tab switch would tear the PTY down and
           lose the user's scrollback and their shell state. -->
      <!-- An overlay covers the pane behind it, and the shell is the one pane
           that is not part of the v-if chain — without this it would show
           through a diff or a file. -->
      <div
        v-show="tab === 'shell' && !activeDiff && !viewedFile"
        class="sbx-sidepanel__pane sbx-sidepanel__pane--shell"
      >
        <div ref="shellHostRef" class="sbx-sidepanel__shellhost" @mousedown="focusShell"></div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { store } from '../store.js';
import SbIcon from './SbIcon.vue';
import PushLinkNotice from './PushLinkNotice.vue';
import ChangeTree from './ChangeTree.vue';
import { withoutNoise, countNoise } from '../git-noise.js';
import { TABS, setSidePanelTab } from '../side-panel-tabs.js';
import { pushTarget } from '../git-push-target.js';

const WIDTH_KEY = 'sessionSidePanelWidth';
const MIN_WIDTH = 280;

const detail = ref(null);
const loading = ref(false);
const dragging = ref(false);
const shellHostRef = ref(null);
const shellReady = ref(false);

// Diff overlay + commit box, the two things that used to mean a trip to the
// Projects tab. Same IPC calls that tab makes — getFileDiff, gitGenerateCommitMsg,
// gitCommit — so behaviour cannot drift between the two places.
const activeDiff = ref(null);
const loadingFile = ref(null);
const diffHostRef = ref(null);
const commitMessage = ref('');
const generating = ref(false);
const gitBusy = ref(false);
const gitMsg = ref('');
// The merge/pull request the forge offered on the last push — see
// git-push-links.js. Outlives gitMsg on purpose: it is there to be clicked.
const pushLink = ref(null);
const gitMsgError = ref(false);
const changesView = ref('files');   // 'files' | 'commits'
const confirmPush = ref(false);
const gitUser = ref({ name: '', email: '' });
let diffView = null;
let gitMsgTimer = 0;

const tab = computed(() => store.sidePanelTab);
const activeTab = computed(() => TABS.find(t => t.id === tab.value) || null);

// Everything in this panel is scoped to the OPEN SESSION's own project path,
// not to whatever the Projects tab happens to be showing — the session may be
// running in a worktree with its own branch and its own working tree.
const projectPath = computed(() => store.headerSession?.projectPath || '');
const sessionId = computed(() => store.headerSession?.sessionId || '');

const shortPath = computed(() =>
  projectPath.value.split('/').filter(Boolean).slice(-2).join('/')
);
const changedFiles = computed(() => detail.value?.changedFiles || []);
// .DS_Store and its friends never reach the list. They are not a decision
// anybody makes — see git-noise.js — and a row that is shown only to be
// struck through is worse than either showing it or not.
const untrackedFiles = computed(() => withoutNoise(detail.value?.untrackedFiles || []));
const hiddenNoise = computed(() => countNoise(detail.value?.untrackedFiles || []));
// What the tree's checkboxes currently include — see ChangeTree.vue.
const commitPaths = ref([]);
// Said on the button only when it differs from "everything".
const partialCommit = computed(() => commitPaths.value.length !== changedFiles.value.length);
const containers = computed(() => detail.value?.containers || []);
const commits = computed(() => detail.value?.commits || []);
const unpushedCommits = computed(() => detail.value?.unpushedCommits || []);
// One source for the button's state and the line of text beside it.
const push = computed(() => pushTarget(detail.value));
// `commits` is the last 15 regardless of push state, so drop the ones already
// listed above as unpushed instead of showing them twice.
const pushedCommits = computed(() => {
  const unpushed = new Set(unpushedCommits.value.map(c => c.hash));
  return commits.value.filter(c => !unpushed.has(c.hash));
});

// The basename is the part worth reading in a 380px column, so it is kept
// whole and only the directory is allowed to truncate.
function baseOf(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
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

// ── Data ──────────────────────────────────────────────────────────
// get-project-detail runs every git and docker command with the given path as
// cwd, so a worktree path yields that worktree's own branch, diff and compose
// services. No extra plumbing needed.
function publish(det) {
  detail.value = det;
  store.sidePanelDetail = det;
}

async function load() {
  const p = projectPath.value;
  if (!p || loading.value) return;
  loading.value = true;
  try {
    const det = await window.api.getProjectDetail(p);
    if (projectPath.value === p && det) publish(det);
  } catch {
    /* keep whatever we already had rather than blanking the panel */
  } finally {
    loading.value = false;
  }
}

async function reset(p) {
  publish(null);
  gitUser.value = { name: '', email: '' };
  if (!p) return;
  // Paint the cached git state first so opening the panel is not a blank flash.
  const cached = await window.api.getProjectGitCache(p).catch(() => null);
  if (cached && projectPath.value === p) publish(cached);
  load();
  // Read per-repo, not once globally: a worktree or a repo-local user.email
  // override is exactly the case worth surfacing before you commit.
  const info = await window.api.getGitUserInfo(p).catch(() => null);
  if (info?.ok && projectPath.value === p) {
    gitUser.value = { name: info.name || '', email: info.email || '' };
  }
}

// Two refreshes, deliberately different in weight.
//
// The full one — get-project-detail — runs the log, tags, worktrees and
// `docker compose ps`, and broadcasts projects-changed, which re-renders the
// whole sidebar. It runs on open, on project change, on an explicit refresh,
// and once each time the CLI stops working, which is exactly when the working
// tree has just stopped moving. ('requires_action' counts: a permission prompt
// for an Edit means the previous edits have already landed.)
//
// The light one is a single `git diff --numstat` with no broadcast, on a timer
// while the panel is open. Edits land throughout a turn, not only at the end
// of it, and a changed-files list that only moves when the turn does is stale
// for most of the time you are looking at it.

const CHANGES_POLL_MS = 15000;
let changesTimer = null;

/** The working tree only, folded into whatever the full read last produced. */
async function pollChanges() {
  const p = projectPath.value;
  if (!p || loading.value) return;
  const changes = await window.api.getProjectChanges?.(p).catch(() => null);
  if (!changes || projectPath.value !== p || !detail.value) return;
  publish({ ...detail.value, ...changes });
}

function startPolling() {
  stopPolling();
  changesTimer = setInterval(pollChanges, CHANGES_POLL_MS);
}

function stopPolling() {
  if (changesTimer) { clearInterval(changesTimer); changesTimer = null; }
}
const sessionState = computed(() =>
  store.sessionBusyState.get(sessionId.value) ? 'running' : 'idle'
);
watch(sessionState, (now, before) => { if (before === 'running' && now !== 'running') load(); });

// Switching sessions re-scopes the panel in place; the pane the user chose
// stays open. That is the whole point of keeping the tab in the store rather
// than in this component.
watch(projectPath, (p) => {
  // A half-typed message belongs to the project it was written for.
  activeDiff.value = null;
  commitMessage.value = '';
  reset(p);
  startShell();
});

// ── Scratch shell ─────────────────────────────────────────────────
// Created here, destroyed on unmount and whenever the project path changes.
// terminal-manager.js owns the xterm/PTY details; main.js reaps a stray
// ephemeral PTY if a renderer reload skipped our teardown.
function startShell() {
  shellReady.value = false;
  window.destroyPanelTerminal?.();
  return ensureShell();
}

// xterm measures its character box the moment it is opened, so it must never
// be created inside a display:none host — the cell size comes out wrong and
// the shell renders a handful of columns wide. If another pane is showing,
// wait until the shell one is selected.
async function ensureShell() {
  const p = projectPath.value;
  if (!p || shellReady.value || tab.value !== 'shell') return;
  await nextTick();
  const host = shellHostRef.value;
  if (!host || !host.offsetParent) return;
  host.innerHTML = '';
  const entry = await window.createPanelTerminal?.(host, p);
  if (entry) shellReady.value = true;
}

function focusShell() { window.focusPanelTerminal?.(); }

// ── Diff overlay ──────────────────────────────────────────────────
const diffIndex = computed(() =>
  changedFiles.value.findIndex(f => f.file === activeDiff.value?.filePath)
);

async function openDiff(filePath) {
  if (loadingFile.value) return;
  loadingFile.value = filePath;
  try {
    const res = await window.api.getFileDiff(projectPath.value, filePath);
    if (!res?.ok) { showGitMsg(res?.error || 'Could not read that file', true); return; }
    activeDiff.value = { filePath, oldContent: res.oldContent, newContent: res.newContent };
  } finally {
    loadingFile.value = null;
  }
}

function closeDiff() { activeDiff.value = null; }

// ── File overlay ──────────────────────────────────────────────────
//
// A file someone clicked in the conversation. Read-only: this is a reference
// while you read, and the Projects tab already owns editing — it has the tree,
// the save button and the modified marker. The button in the header hands the
// file over to it rather than growing a second editor here.

const viewedFile = computed(() => store.sidePanelFile);
const fileError = ref('');
const fileHostRef = ref(null);
let fileView = null;

function destroyFileView() {
  if (!fileView) return;
  try { fileView.destroy?.(); } catch {}
  fileView = null;
}

function closeFile() { store.sidePanelFile = null; }

/** The path relative to this session's project, when the file is inside it. */
const editableRelPath = computed(() => {
  const file = viewedFile.value;
  const root = projectPath.value.replace(/\/$/, '');
  if (!file || !root || !file.startsWith(`${root}/`)) return '';
  return file.slice(root.length + 1);
});

function editInProjects() {
  const rel = editableRelPath.value;
  if (!rel) return;
  window.__sb?.openProjectFile?.(projectPath.value, rel);
}

/**
 * The host element, once it exists.
 *
 * CodeMirror measures its character box on creation, so it must be built into
 * an element that is really in the document. On a fresh mount — which is what
 * opening a file from a closed panel does — the ref can still be empty on the
 * tick after the read comes back, and building into nothing left the panel
 * showing its header over an empty pane.
 */
async function fileHost() {
  for (let i = 0; i < 3; i++) {
    await nextTick();
    if (fileHostRef.value) return fileHostRef.value;
  }
  return null;
}

// `immediate`, because clicking a file in a *closed* panel sets the path and
// then opens the panel: this component mounts with the value already in place,
// and a lazy watcher has nothing left to fire on. That was the intermittent
// blank pane — it only ever worked when the panel happened to be open already.
watch(viewedFile, async (file) => {
  destroyFileView();
  fileError.value = '';
  if (!file) return;
  // Two overlays would stack; the newer one wins.
  activeDiff.value = null;
  const res = await window.api.readFileForPanel(file).catch(() => null);
  if (store.sidePanelFile !== file) return;          // clicked past it already
  if (!res?.ok) { fileError.value = res?.error || 'Could not read that file'; return; }
  const el = await fileHost();
  if (!el || store.sidePanelFile !== file) return;
  el.innerHTML = '';
  // The same read-only CodeMirror the Projects tab and the MCP panel use, so
  // the syntax highlighting cannot differ between the three places.
  fileView = window.createReadOnlyViewer?.(el, res.content, file);
}, { immediate: true });

// A file belongs to the project it was opened from; switching sessions to
// another project leaves a path that means nothing here.
watch(projectPath, () => { store.sidePanelFile = null; });

// Opening a diff closes the file, the same way opening a file closes the diff.
watch(activeDiff, (diff) => { if (diff) store.sidePanelFile = null; });

function stepDiff(delta) {
  const next = changedFiles.value[diffIndex.value + delta];
  if (next) openDiff(next.file);
}

// Unified, not side-by-side. The Projects tab has the full width for two
// columns; this panel is 380px by default, where a split merge view truncates
// both halves and shows neither. Same CodeMirror bundle either way. It measures
// on open, so it is built after the host is in the DOM and torn down whenever
// the overlay changes.
watch(activeDiff, async (diff) => {
  if (diffView) {
    try { typeof diffView.destroy === 'function' ? diffView.destroy() : diffView.a?.destroy(); } catch {}
    diffView = null;
  }
  if (!diff) return;
  await nextTick();
  const el = diffHostRef.value;
  if (!el) return;
  el.innerHTML = '';
  diffView = window.createReadOnlyUnifiedMergeViewer?.(el, diff.oldContent, diff.newContent, diff.filePath);
});

// A file that stopped being dirty — committed, or reverted — has no diff left
// to show, so drop the overlay rather than leave a stale one up.
watch(changedFiles, (files) => {
  const open = activeDiff.value?.filePath;
  if (open && !files.some(f => f.file === open)) activeDiff.value = null;
});

// ── Commit ────────────────────────────────────────────────────────
function showGitMsg(text, isError = false) {
  gitMsg.value = text;
  gitMsgError.value = isError;
  clearTimeout(gitMsgTimer);
  gitMsgTimer = setTimeout(() => { gitMsg.value = ''; }, 4000);
}

async function generateCommitMsg(style = 'short') {
  generating.value = true;
  gitBusy.value = true;
  try {
    const res = await window.api.gitGenerateCommitMsg(projectPath.value, style);
    if (res?.ok) commitMessage.value = res.message;
    else showGitMsg(res?.error || 'Generation failed', true);
  } finally {
    generating.value = false;
    gitBusy.value = false;
  }
}

async function doCommit() {
  const message = commitMessage.value.trim();
  if (!message) return;
  gitBusy.value = true;
  try {
    // The boxes in the tree decide. Everything is checked unless it was
    // unchecked, so the usual case sends the whole list.
    //
    // Copied flat before it crosses IPC: a ref holding an array hands back a
    // reactive Proxy, and the structured clone behind ipcRenderer.invoke cannot
    // serialise one — "An object could not be cloned", and no commit.
    const res = await window.api.gitCommit(projectPath.value, message, [...commitPaths.value]);
    if (res?.ok) {
      showGitMsg('Committed');
      commitMessage.value = '';
      activeDiff.value = null;
      await load();
    } else {
      showGitMsg(res?.error || 'Commit failed', true);
    }
  } finally {
    gitBusy.value = false;
  }
}

// Track files git does not know about yet. The list they came from is the
// panel's own, so this can only ever name something it just drew.
async function doGitAdd(paths) {
  if (!paths?.length || gitBusy.value) return;
  gitBusy.value = true;
  showGitMsg(paths.length === 1 ? `Adding ${paths[0]}…` : `Adding ${paths.length} files…`);
  try {
    const res = await window.api.gitAdd(projectPath.value, paths);
    if (res?.ok) { showGitMsg(paths.length === 1 ? 'Added' : `Added ${paths.length} files`); await load(); }
    else showGitMsg(res?.error || 'Add failed', true);
  } finally {
    gitBusy.value = false;
  }
}

async function doPush() {
  confirmPush.value = false;
  gitBusy.value = true;
  showGitMsg('Pushing…');
  // Whatever the last push offered belongs to the last push.
  pushLink.value = null;
  try {
    const res = await window.api.gitPush(projectPath.value);
    if (res?.ok) {
      showGitMsg('Pushed');
      pushLink.value = res.link || null;
      await load();
    } else showGitMsg(res?.error || 'Push failed', true);
  } finally {
    gitBusy.value = false;
  }
}

// An armed Push must not survive the thing it was armed for.
watch([projectPath, changesView, () => store.sidePanelTab], () => { confirmPush.value = false; });

// Selecting a pane changes what is on screen but not the panel's width, so the
// session terminal does not move. The scratch shell does need a fit, since it
// was measured while hidden or has never been created.
watch(tab, (next) => {
  if (next === 'shell') {
    ensureShell().then(() => requestAnimationFrame(() => window._refitOpenTerminals?.()));
  }
});

// ── TODOs and plans ───────────────────────────────────────────────
// Notes live in the account's Claude home and name the projects they relate
// to; plans live there too but record nothing, so main.js works out which
// projects each one mentions. Both are read here rather than shared with the
// Plans tab: that tab is account-wide, this pane is one project's slice.
const notes = ref([]);
const plans = ref([]);
const allPlans = ref(false);

const projectNotes = computed(() =>
  notes.value.filter(n => (n.projects || []).includes(projectPath.value))
);

const visiblePlans = computed(() => (allPlans.value
  ? plans.value
  : plans.value.filter(p => (p.projects || []).includes(projectPath.value))));

async function loadDocs() {
  const [noteList, planList] = await Promise.all([
    window.api.getNotes().catch(() => []),
    window.api.getPlans().catch(() => []),
  ]);
  notes.value = noteList || [];
  plans.value = planList || [];
}

const creatingNote = ref(false);
const newNoteTitle = ref('');
const newNoteInput = ref(null);

async function toggleNewNote() {
  creatingNote.value = !creatingNote.value;
  if (!creatingNote.value) return;
  newNoteTitle.value = '';
  await nextTick();
  newNoteInput.value?.focus();
}

async function createNote() {
  const title = newNoteTitle.value.trim();
  if (!title) return;
  const res = await window.api.createNote({ title, projects: [projectPath.value] });
  creatingNote.value = false;
  newNoteTitle.value = '';
  await loadDocs();
  window.vuePlans?.refreshNotes?.();
  if (res?.ok) {
    const created = notes.value.find(n => n.filename === res.filename);
    // Straight into the editor: a note created from a title is empty, and the
    // reason for creating it is the thing you were about to write.
    if (created) editNote(created);
  }
}

// ── The panel's own Markdown editor ───────────────────────────────
// Notes and plans are both Markdown in the account's Claude home, and both are
// things you want to change *while* reading a session — which is the whole
// argument for the side panel. The main view is one click away for anything
// that deserves the width.
const editingDoc = ref(null);
// Which session the editor was opened beside, so switching sessions can put it
// away — the note belongs to that session's project, not to the next one.
let editingDocSession = null;
const docOriginal = ref('');
const docSaving = ref(false);
const docError = ref('');
const docSavedNote = ref('');
const docHostRef = ref(null);
const docDirty = ref(false);
let docView = null;

function docText() {
  return docView ? docView.state.doc.toString() : (editingDoc.value?.content ?? '');
}

// CodeMirror owns the text, so "changed" is a comparison, not a bound value.
// Cheap: these documents are notes and plans, tens of kilobytes at worst.
function checkDirty() {
  docDirty.value = !!editingDoc.value && docText() !== docOriginal.value;
}

function destroyDocView() {
  if (!docView) return;
  docView.destroy();
  docView = null;
}

async function mountDocView(content, filename) {
  await nextTick();
  const host = docHostRef.value;
  if (!host) return;
  destroyDocView();
  host.replaceChildren();
  // Same factory the main Markdown pane and the Projects tab use, so a note
  // is highlighted, foldable and searchable in both places rather than being
  // a plain box here and an editor there.
  docView = window.createEditableViewer?.(host, content, filename, { wrap: true }) || null;
  if (!docView) return;
  docView.focus();
  // CodeMirror's own Mod-S binding fires this rather than a keydown we could
  // catch — see cmSaveKeymap in codemirror-setup.js.
  host.addEventListener('cm-save', saveDoc);
  for (const event of ['input', 'keyup', 'paste', 'cut']) {
    host.addEventListener(event, checkDirty);
  }
}

async function openDoc(kind, doc, read) {
  const result = await read();
  // read-plan reports a failure as an empty path rather than an error, so the
  // path is what decides here — an editor with nowhere to save to is worse
  // than a message.
  if (!result || result.error || result.ok === false || !result.filePath) {
    docError.value = result?.error || 'Could not open the file.';
    return;
  }
  editingDoc.value = {
    kind,
    filename: doc.filename,
    filePath: result.filePath,
    title: doc.title || doc.filename,
    content: result.content,
    source: doc,
  };
  docOriginal.value = result.content;
  editingDocSession = sessionId.value;
  docError.value = '';
  docSavedNote.value = '';
  docDirty.value = false;
  await mountDocView(result.content, doc.filename);
}

function editNote(note) {
  return openDoc('note', note, () => window.api.readNote(note.filename));
}

function editPlan(plan) {
  return openDoc('plan', plan, () => window.api.readPlan(plan.filename));
}

async function saveDoc() {
  const doc = editingDoc.value;
  if (!doc || docSaving.value) return;
  const content = docText();
  if (content === docOriginal.value) { docDirty.value = false; return; }
  docSaving.value = true;
  docError.value = '';
  try {
    const res = doc.kind === 'note'
      ? await window.api.saveNote(doc.filePath, content)
      : await window.api.savePlan(doc.filePath, content);
    if (!res?.ok) {
      docError.value = res?.error || 'Could not save.';
      return;
    }
    doc.content = content;
    docOriginal.value = content;
    docDirty.value = false;
    docSavedNote.value = 'Saved';
    // Ticking a box in here has to move the counts everywhere else.
    await loadDocs();
    window.vuePlans?.refreshNotes?.();
  } finally {
    docSaving.value = false;
  }
}

function closeDoc() {
  if (docDirty.value && !confirm('Discard unsaved changes?')) return;
  destroyDocView();
  editingDoc.value = null;
  docOriginal.value = '';
  docError.value = '';
  docDirty.value = false;
}

// The same document, in the main Markdown pane — with the preview toggle and
// the width a long plan wants. Unsaved work goes with it rather than being
// silently dropped.
async function expandDoc() {
  const doc = editingDoc.value;
  if (!doc) return;
  if (docDirty.value) await saveDoc();
  if (docDirty.value) return;   // the save failed; docError says why
  destroyDocView();
  editingDoc.value = null;
  if (doc.kind === 'note') window.openNote?.(doc.source);
  else window.openPlan?.(doc.source);
}

// ⌘S arrives as CodeMirror's own `cm-save` event (see mountDocView); this is
// only the way out.
function onDocKey(event) {
  if (event.key === 'Escape') closeDoc();
}

function openNote(note) {
  destroyDocView();
  editingDoc.value = null;
  window.openNote?.(note);
}

function openPlan(plan) {
  destroyDocView();
  editingDoc.value = null;
  window.openPlan?.(plan);
}

async function toggleNoteTodo(note, todo) {
  const res = await window.api.toggleNoteTodo(note.filename, todo.index);
  if (!res?.ok) return;
  await loadDocs();
  window.vuePlans?.refreshNotes?.();
}

// ── Background tasks ──────────────────────────────────────────────
//
// Sub-agents of the open session, polled for as long as the pane is showing.
//
// It used to poll only while the session was working, which meant the list
// stopped refreshing at the exact moment it had something new to say: the
// interval was cleared when the turn ended, so the agents that finished with it
// went on reading "running" until the tab was closed and opened again. An idle
// session can gain agents too — it is one prompt away from a turn, and that
// turn is usually started from this very window.
//
// Two cadences rather than one, because the two states move at different
// speeds: a working session spawns and finishes agents within seconds, an idle
// one changes only when something outside starts it.
const SUBAGENT_POLL_MS = 5000;
const SUBAGENT_IDLE_POLL_MS = 20000;
const subagents = ref([]);
let subagentTimer = null;

async function loadSubagents() {
  const id = sessionId.value;
  if (!id) { subagents.value = []; return; }
  const list = await window.api.getSessionSubagents(id).catch(() => []);
  if (sessionId.value === id) subagents.value = list || [];
}

function openSubagent(agent) {
  window.openSubagentTranscript?.(sessionId.value, agent);
}

function agentWhen(agent) {
  const when = agent.updatedAt || agent.startedAt;
  if (!when) return '';
  return window.formatDate ? window.formatDate(new Date(when)) : new Date(when).toLocaleString();
}

function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

// An open editor belongs to the pane it was opened from and to the session it
// was opened beside. Leaving either one takes it away — after saving, because
// silently dropping something the user typed is not a trade worth making.
watch([tab, sessionId], async () => {
  if (!editingDoc.value) return;
  if (tab.value === 'todos' && sessionId.value === editingDocSession) return;
  if (docDirty.value) await saveDoc();
  destroyDocView();
  editingDoc.value = null;
});

watch([tab, sessionId, sessionState], () => {
  clearInterval(subagentTimer);
  subagentTimer = null;
  if (tab.value === 'tasks') {
    // Immediately, because a turn that just ended is exactly when the list is
    // wrong — and then on the cadence that state deserves.
    loadSubagents();
    subagentTimer = setInterval(
      loadSubagents,
      sessionState.value === 'running' ? SUBAGENT_POLL_MS : SUBAGENT_IDLE_POLL_MS,
    );
  }
  if (tab.value === 'todos') loadDocs();
}, { immediate: true });

onBeforeUnmount(() => {
  clearInterval(subagentTimer);
  destroyDocView();
});

function close() { setSidePanelTab(null); }

// ── Resize ────────────────────────────────────────────────────────
let fitRaf = 0;
function scheduleFit() {
  cancelAnimationFrame(fitRaf);
  // rAF runs after Vue has flushed the width onto #terminal-area, so the
  // terminals measure their final box.
  fitRaf = requestAnimationFrame(() => window._refitOpenTerminals?.());
}

function startDrag(e) {
  dragging.value = true;
  const startX = e.clientX;
  const startWidth = store.sidePanelWidth;
  const max = Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.7));

  const onMove = (ev) => {
    const next = Math.min(max, Math.max(MIN_WIDTH, startWidth + (startX - ev.clientX)));
    if (next === store.sidePanelWidth) return;
    store.sidePanelWidth = next;
    scheduleFit();
  };
  const onUp = () => {
    dragging.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem(WIDTH_KEY, String(store.sidePanelWidth));
    scheduleFit();
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function resetWidth() {
  store.sidePanelWidth = 380;
  localStorage.setItem(WIDTH_KEY, '380');
  scheduleFit();
}

onMounted(() => {
  reset(projectPath.value);
  startShell();
  startPolling();
});

onBeforeUnmount(() => {
  stopPolling();
  cancelAnimationFrame(fitRaf);
  clearTimeout(gitMsgTimer);
  if (diffView) {
    try { typeof diffView.destroy === 'function' ? diffView.destroy() : diffView.a?.destroy(); } catch {}
    diffView = null;
  }
  destroyFileView();
  window.destroyPanelTerminal?.();
  store.sidePanelDetail = null;
  store.sidePanelFile = null;
});
</script>
