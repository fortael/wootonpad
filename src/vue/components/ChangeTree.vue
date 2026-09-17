<template>
  <div class="sbx-ctree">
    <!-- ── Changed, tracked ─────────────────────────────────────── -->
    <template v-if="changedRows.length">
      <div
        v-for="row in changedRows"
        :key="'c:' + row.path"
        class="pv-file-row sbx-ctree__row"
        :class="[
          row.kind === 'dir' ? 'sbx-ctree__row--dir' : 'pv-file-row--clickable',
          { loading: loadingFile === row.path },
        ]"
        :style="{ '--sbx-depth': row.depth }"
        :title="row.path"
        @click="row.kind === 'dir' ? toggle(row.path) : $emit('open', row.path)"
      >
        <template v-if="row.kind === 'dir'">
          <!-- Unchecking a folder takes everything under it out of the commit,
               and comes back indeterminate when only some of it is out. -->
          <input
            type="checkbox"
            class="sbx-ctree__check"
            :checked="dirState(row.path) === 'all'"
            :indeterminate.prop="dirState(row.path) === 'some'"
            :aria-label="`Include ${row.path} in the commit`"
            @click.stop
            @change="setDir(row.path, $event.target.checked)"
          />
          <SbIcon
            name="chevron-down"
            :size="11"
            tone="muted"
            class="sbx-ctree__chevron"
            :class="{ 'is-collapsed': collapsed.has(row.path) }"
          />
          <span class="sbx-ctree__dir">{{ row.name }}</span>
          <span class="sbx-ctree__count">{{ row.count }}</span>
        </template>
        <template v-else>
          <input
            type="checkbox"
            class="sbx-ctree__check"
            :checked="!excluded.has(row.path)"
            :aria-label="`Include ${row.path} in the commit`"
            @click.stop
            @change="setFile(row.path, $event.target.checked)"
          />
          <span class="pv-file-status" :class="statusClass(row.entry)">{{ statusChar(row.entry) }}</span>
          <span class="pv-file-name sbx-ctree__name">{{ row.name }}</span>
          <span class="pv-file-diff">
            <span v-if="row.added" class="pv-added">+{{ row.added }}</span>
            <span v-if="row.deleted" class="pv-deleted">&minus;{{ row.deleted }}</span>
          </span>
        </template>
      </div>
    </template>
    <div v-else-if="!untracked.length" class="pv-empty">{{ emptyText }}</div>

    <!-- ── Untracked ────────────────────────────────────────────── -->
    <!-- Git does not know about these, so a commit does not touch them — see
         git-staging.js. Adding one used to mean opening a terminal, which is
         the only reason this section exists. -->
    <template v-if="untracked.length">
      <div class="sbx-ctree__head">
        <button
          type="button"
          class="sbx-ctree__headtoggle"
          @click="untrackedOpen = !untrackedOpen"
        >
          <SbIcon
            name="chevron-down"
            :size="11"
            tone="muted"
            class="sbx-ctree__chevron"
            :class="{ 'is-collapsed': !untrackedOpen }"
          />
          <span :data-tooltip="hiddenHint">Untracked</span>
          <span class="sbx-ctree__count">{{ untracked.length }}</span>
        </button>
        <button
          type="button"
          class="sbx-ctree__addall"
          :disabled="busy || !untracked.length"
          data-tooltip="git add every untracked file"
          @click="$emit('add', untracked.slice())"
        >Add all</button>
      </div>

      <template v-if="untrackedOpen">
        <div
          v-for="row in untrackedRows"
          :key="'u:' + row.path"
          class="pv-file-row sbx-ctree__row sbx-ctree__row--untracked"
          :class="row.kind === 'dir' ? 'sbx-ctree__row--dir' : ''"
          :style="{ '--sbx-depth': row.depth }"
          :title="row.path"
          @click="row.kind === 'dir' ? toggle(row.path) : null"
        >
          <template v-if="row.kind === 'dir'">
            <SbIcon
              name="chevron-down"
              :size="11"
              tone="muted"
              class="sbx-ctree__chevron"
              :class="{ 'is-collapsed': collapsed.has(row.path) }"
            />
            <span class="sbx-ctree__dir">{{ row.name }}</span>
            <span class="sbx-ctree__count">{{ row.count }}</span>
            <button
              type="button"
              class="sbx-ctree__add"
              :disabled="busy"
              :data-tooltip="`git add everything under ${row.path}`"
              aria-label="Add folder"
              @click.stop="$emit('add', filesUnder(row.path))"
            >+</button>
          </template>
          <template v-else>
            <span class="pv-file-status sbx-ctree__new">?</span>
            <span class="pv-file-name sbx-ctree__name">{{ row.name }}</span>
            <button
              type="button"
              class="sbx-ctree__add"
              :disabled="busy"
              :data-tooltip="`git add ${row.path}`"
              aria-label="Add file"
              @click.stop="$emit('add', [row.path])"
            >+</button>
          </template>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import SbIcon from './SbIcon.vue';
import { treeRows } from '../file-tree.js';

const props = defineProps({
  // [{ file, added, deleted }] — get-project-detail's changedFiles
  files: { type: Array, default: () => [] },
  // string[] — get-project-detail's untrackedFiles
  untracked: { type: Array, default: () => [] },
  loadingFile: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  emptyText: { type: String, default: 'Working tree clean' },
  // How many untracked paths the caller dropped as OS junk.
  hiddenCount: { type: Number, default: 0 },
});

const emit = defineEmits(['open', 'add', 'update:included']);

// One set for both trees: a directory path appears in only one of them, and
// folding is about the path rather than about which list it came from.
const collapsed = ref(new Set());
const untrackedOpen = ref(true);

function toggle(path) {
  // A new Set, not a mutation: the rows are computed off it.
  const next = new Set(collapsed.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  collapsed.value = next;
}

// ── What goes into the commit ─────────────────────────────────────
//
// Checked by default and held as the *exclusions*, not the inclusions: a file
// that appears while you are writing the message is part of the change you are
// describing, and a set of inclusions would have silently left it out.
const excluded = ref(new Set());

const changedPaths = computed(() => props.files.map(f => f.file).filter(Boolean));

const included = computed(() => changedPaths.value.filter(p => !excluded.value.has(p)));

watch(included, (paths) => emit('update:included', paths), { immediate: true, deep: false });

function setExcluded(next) {
  // A new Set, not a mutation: dirState and included are computed off it.
  excluded.value = next;
}

function setFile(path, on) {
  const next = new Set(excluded.value);
  if (on) next.delete(path);
  else next.add(path);
  setExcluded(next);
}

/** Every tracked change at or under a directory row. */
function changedUnder(dir) {
  const prefix = dir + '/';
  return changedPaths.value.filter(p => p.startsWith(prefix));
}

function setDir(dir, on) {
  const next = new Set(excluded.value);
  for (const path of changedUnder(dir)) {
    if (on) next.delete(path);
    else next.add(path);
  }
  setExcluded(next);
}

/** 'all' | 'some' | 'none' — what the folder's own box should show. */
function dirState(dir) {
  const under = changedUnder(dir);
  if (!under.length) return 'all';
  const on = under.filter(p => !excluded.value.has(p)).length;
  if (on === under.length) return 'all';
  return on ? 'some' : 'none';
}

const changedRows = computed(() => treeRows(props.files, collapsed.value));
const untrackedRows = computed(() => treeRows(props.untracked, collapsed.value));

// The OS junk the caller filtered out before handing the list over — see
// git-noise.js. Not a row and not a number on screen: the whole point is that
// .DS_Store is not a decision anybody makes. Recoverable on hover, for the one
// time somebody wonders where it went.
const hiddenHint = computed(() => (props.hiddenCount
  ? `${props.hiddenCount} OS junk file${props.hiddenCount === 1 ? '' : 's'} hidden (.DS_Store and the like)`
  : null));

/** Everything the folder row covers, for adding it in one go. */
function filesUnder(dir) {
  const prefix = dir + '/';
  return props.untracked.filter(p => p === dir || p.startsWith(prefix));
}

// Same two helpers both pages had, in the one place that draws the rows now.
// `git diff --numstat` reports a new file as all additions and a deleted one as
// all deletions, which is the whole of what can be told from it.
function statusChar(entry) {
  if (!entry) return 'M';
  if (!entry.added && entry.deleted) return 'D';
  if (entry.added && !entry.deleted) return 'A';
  return 'M';
}

function statusClass(entry) {
  const char = statusChar(entry);
  return char === 'A' ? 'added' : char === 'D' ? 'deleted' : 'modified';
}
</script>
