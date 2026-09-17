<template>
  <!-- What the forge said to do next, kept until it is used or dismissed.
       The push message beside it clears itself after four seconds, which is
       right for "Pushed" and wrong for a link somebody is about to click. -->
  <div v-if="link" class="sbx-pushlink">
    <SbIcon name="square-arrow-out-up-right" :size="12" tone="muted" />
    <button
      type="button"
      class="sbx-pushlink__open"
      :title="link.url"
      @click="open"
    >{{ link.label }}</button>
    <span class="sbx-pushlink__host" :title="link.url">{{ host }}</span>
    <button
      type="button"
      class="sbx-pushlink__icon"
      :data-tooltip="copied ? 'Copied' : 'Copy link'"
      aria-label="Copy link"
      @click="copy"
    >
      <SbIcon :name="copied ? 'check' : 'copy'" :size="11" tone="muted" />
    </button>
    <button
      type="button"
      class="sbx-pushlink__icon"
      data-tooltip="Dismiss"
      aria-label="Dismiss"
      @click="$emit('dismiss')"
    >
      <SbIcon name="x" :size="11" tone="muted" />
    </button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import SbIcon from './SbIcon.vue';

const props = defineProps({
  // { url, kind, label } — bestPushLink() in git-push-links.js
  link: { type: Object, default: null },
});

defineEmits(['dismiss']);

const copied = ref(false);
let copiedTimer = 0;

// The host alone. The full URL is a GitLab "new merge request" query string
// with the branch name percent-encoded twice over, and it does not fit in a
// side panel — it is in the tooltip and in the clipboard.
const host = computed(() => {
  try { return new URL(props.link.url).host; } catch { return ''; }
});

// The URL came off a remote server, and main.js opens http(s) and nothing else
// — see the open-external handler.
function open() {
  if (props.link?.url) window.api?.openExternal?.(props.link.url);
}

function copy() {
  if (!props.link?.url) return;
  navigator.clipboard?.writeText(props.link.url).then(() => {
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copied.value = false; }, 1400);
  }).catch(() => {});
}
</script>
