<template>
  <!-- One square, tiled. The grid shape comes off the count, so two groups of
       different sizes never draw the same picture even before their colours
       are compared. -->
  <span
    v-bind="$attrs"
    class="sb-gavatar"
    :class="`sb-gavatar--${tiles.length}`"
    :style="{ width: px, height: px, '--sb-gavatar-size': px }"
  >
    <ProjectAvatar
      v-for="path in tiles"
      :key="path"
      class="sb-gavatar__tile"
      :project-path="path"
    />
  </span>
</template>

<script setup>
// ProjectAvatar.vue, for a session that belongs to more than one project.
//
// A group session has no single project to stand for it, and picking the first
// one would make every group that starts in the same repo look identical in the
// sidebar. So the members draw it between them: the tiles are the same avatars
// the projects have everywhere else, and the split is the group's fingerprint —
// you learn a group by its shape long before you read its name.
import { computed } from 'vue';
import ProjectAvatar from './ProjectAvatar.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  projectPaths: { type: Array, required: true },
  size: { type: Number, default: 28 },
});

/**
 * Past four, a tile is smaller than the letter in it.
 *
 * The square is an identifier, not a census: nobody counts the members off a
 * 28px mark, and a group of nine drawn as nine slivers is a smudge. Four is
 * what stays legible, and the fifth member is named in the places that have
 * room to name it — the group pane of the side panel, the tooltip a caller
 * passes in.
 */
const MAX_TILES = 4;

// Deduplicated: the same project twice is one tile, not two identical ones —
// and duplicate keys are a render warning besides.
const tiles = computed(() =>
  [...new Set((props.projectPaths || []).filter(Boolean))].slice(0, MAX_TILES));

const px = computed(() => `${props.size}px`);
</script>
