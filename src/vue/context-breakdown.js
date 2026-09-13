// The rows behind the context ring.
//
// The numbers are the CLI's own: the SDK answers `getContextUsage({ detail:
// 'full' })` with the same accounting `/context` prints — categories with
// their colours, plus which MCP tools, memory files and agents are spending
// the window. Nothing here estimates anything, and deliberately so: a
// transcript records only four API usage numbers (input, cache write, cache
// read, output), so a breakdown read off disk would have been a guess.
//
// Extracted from ContextBreakdown.vue so the rules — what the bar draws, what
// counts toward a share, how the drill-downs rank — can be tested without a
// DOM.

/** Rows the CLI marks as deferred are tool schemas outside the window. */
const isDeferred = (category) => !!category.isDeferred;

/** The CLI's own label for the leftover; it has no `kind` on this response. */
const isFree = (category) => /free/i.test(category.name || '');

/**
 * @param {object} usage SDKControlGetContextUsageResponse
 * @param {{limit?: number}} [opts] how many drill-down entries per section
 */
export function breakdown(usage = {}, { limit = 5 } = {}) {
  const categories = (usage.categories || []).filter(c => c && c.tokens > 0);
  const used = categories.filter(c => !isDeferred(c));
  const deferred = categories.filter(isDeferred);
  const window = usage.rawMaxTokens || usage.maxTokens || 0;

  // The bar is what is spent, so free space is the track it is drawn on rather
  // than a segment of it, and deferred schemas are not in the window at all.
  const barTotal = window || used.reduce((n, c) => n + c.tokens, 0);
  const bar = used
    .filter(c => !isFree(c))
    .map(c => ({
      name: c.name,
      tokens: c.tokens,
      color: c.color,
      width: barTotal ? (c.tokens / barTotal) * 100 : 0,
    }));

  const rows = [
    ...used.map(c => ({
      name: c.name,
      tokens: c.tokens,
      color: c.color,
      share: share(c.tokens, window),
      muted: isFree(c),
    })),
    ...deferred.map(c => ({
      name: c.name,
      tokens: c.tokens,
      color: c.color,
      // A deferred row has no share of the window by definition. "0%" would
      // read as "costs nothing", which is not what it means.
      share: '—',
      muted: true,
    })),
  ];

  return { bar, rows, sections: sections(usage, limit), window };
}

function sections(usage, limit) {
  const out = [];
  const add = (label, items) => {
    const ranked = items.filter(i => i.tokens > 0).sort((a, b) => b.tokens - a.tokens);
    if (!ranked.length) return;
    out.push({
      label,
      items: ranked.slice(0, limit),
      // What the section is a view of, not how much of it fits — the heading
      // sits directly above a "+N more" and the two have to add up.
      total: ranked.length,
      more: Math.max(0, ranked.length - limit),
    });
  };

  add('MCP tools', (usage.mcpTools || []).map(t => ({
    label: toolLabel(t.name),
    title: t.name,
    tokens: t.tokens,
  })));
  add('Memory files', (usage.memoryFiles || []).map(f => ({
    label: String(f.path || '').split('/').slice(-2).join('/'),
    title: [f.type, f.path].filter(Boolean).join(' — '),
    tokens: f.tokens,
  })));
  add('Agents', (usage.agents || []).map(a => ({
    label: a.agentType,
    title: a.source,
    tokens: a.tokens,
  })));
  add('System prompt', (usage.systemPromptSections || []).map(s => ({
    label: s.name,
    tokens: s.tokens,
  })));
  return out;
}

/** `mcp__linear__create_issue` → `create_issue`; the server is the grouping. */
export function toolLabel(name) {
  return String(name || '').replace(/^mcp__[^_]+(?:__)?/, '') || String(name || '');
}

export function share(tokens, window) {
  if (!window) return '';
  const pct = (tokens / window) * 100;
  if (pct > 0 && pct < 0.1) return '<0.1%';
  return pct.toFixed(1) + '%';
}

/** Token counts, at the width a hover panel can spare. */
export function formatTokens(tokens) {
  const n = Number(tokens) || 0;
  if (n >= 1_000_000) return trim((n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)) + 'M';
  if (n >= 1_000) return trim((n / 1_000).toFixed(n >= 100_000 ? 0 : 1)) + 'k';
  return String(n);
}

const trim = (s) => s.replace(/\.0$/, '');


/**
 * Where the hover panel goes, given the chip it hangs off.
 *
 * The chip sits in the chat's control bar, which is at the *bottom* of the
 * view — right above the composer — so "open downwards" put the panel through
 * the floor of the window. It opens on whichever side has room, and is pinned
 * by that side (`bottom` when flipped) so the height never has to be measured
 * first.
 *
 * @param {{top:number,bottom:number,right:number}} rect the chip
 * @param {{width:number,height:number}} viewport
 * @returns {{left:string,width:string,maxHeight:string,top?:string,bottom?:string}}
 *   a style object, ready for :style
 */
export function placePopover(rect, viewport, { width = 300, gap = 6, margin = 8, min = 160 } = {}) {
  const below = viewport.height - rect.bottom - gap - margin;
  const above = rect.top - gap - margin;
  // Below unless it cannot hold the panel and above can hold more of it —
  // dropping down is the expected direction, and flipping on a few pixels of
  // difference reads as the panel jumping about.
  const flip = below < min && above > below;
  const left = Math.min(
    Math.max(margin, rect.right - width),
    Math.max(margin, viewport.width - width - margin),
  );
  return {
    ...(flip
      ? { bottom: viewport.height - rect.top + gap + 'px' }
      : { top: rect.bottom + gap + 'px' }),
    left: left + 'px',
    width: width + 'px',
    // Never negative: a window shorter than the panel still gets a scroller
    // rather than a box with no height.
    maxHeight: Math.max(min, flip ? above : below) + 'px',
  };
}
