<template>
  <div class="sbx-ctxpop">
    <div class="sbx-ctxpop__head">
      <span class="sbx-ctxpop__title">Context window</span>
      <span class="sbx-ctxpop__total">
        {{ formatTokens(usage.totalTokens) }} / {{ formatTokens(view.window) }}
        <span class="sbx-ctxpop__pct">({{ Math.round(usage.percentage) }}%)</span>
      </span>
    </div>

    <!-- The same stack the ring is a circle of. Free space is a track rather
         than a segment, so the filled part reads as "this much is spent". -->
    <div class="sbx-ctxpop__bar">
      <span
        v-for="row in view.bar"
        :key="row.name"
        class="sbx-ctxpop__seg"
        :style="{ width: row.width + '%', background: row.color }"
        :title="`${row.name} — ${formatTokens(row.tokens)}`"
      ></span>
    </div>

    <dl class="sbx-ctxpop__rows">
      <div v-for="row in view.rows" :key="row.name" class="sbx-ctxpop__row" :class="{ 'is-muted': row.muted }">
        <span class="sbx-ctxpop__swatch" :style="{ background: row.color }"></span>
        <dt>{{ row.name }}</dt>
        <dd class="sbx-ctxpop__tokens">{{ formatTokens(row.tokens) }}</dd>
        <dd class="sbx-ctxpop__share">{{ row.share }}</dd>
      </div>
    </dl>

    <!-- Drill-downs. Only what is actually spending tokens, biggest first:
         the reason to open this is to find the thing to turn off. -->
    <template v-for="section in view.sections" :key="section.label">
      <div class="sbx-ctxpop__seclabel">
        {{ section.label }}
        <span class="sbx-ctxpop__seccount">{{ section.total }}</span>
      </div>
      <div v-for="item in section.items" :key="section.label + item.label" class="sbx-ctxpop__item">
        <span class="sbx-ctxpop__itemname" :title="item.title || item.label">{{ item.label }}</span>
        <span class="sbx-ctxpop__tokens">{{ formatTokens(item.tokens) }}</span>
      </div>
      <div v-if="section.more" class="sbx-ctxpop__more">+{{ section.more }} more</div>
    </template>

    <div v-if="usage.model" class="sbx-ctxpop__foot">{{ usage.model }}</div>
  </div>
</template>

<script setup>
/**
 * The breakdown behind the context ring — the rows the CLI's own /context
 * prints, which the SDK hands over already computed
 * (`getContextUsage({ detail: 'full' })`, see sdk-session.js).
 *
 * Nothing is estimated here. A transcript records only the four API usage
 * numbers, so a breakdown read off disk would have been a guess; this is the
 * CLI's own accounting of the prompt it assembled.
 */
import { computed } from 'vue';
import { breakdown, formatTokens } from '../context-breakdown.js';

const props = defineProps({
  /** SDKControlGetContextUsageResponse, as stored by SessionSdkApp. */
  usage: { type: Object, required: true },
  /** How many entries each drill-down list shows before it says "+N more". */
  limit: { type: Number, default: 5 },
});

const view = computed(() => breakdown(props.usage, { limit: props.limit }));
</script>
