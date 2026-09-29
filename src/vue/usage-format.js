// usage-format.js — numbers and colours for the usage stats views.

/** 1234 → 1.2K, 3456789 → 3.5M. */
export function compactTokens(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(Math.round(v));
}

/** Percentage points of a limit: 0.04 → "<0.1%", 12.34 → "12.3%", 142 → "142%". */
export function pct(n) {
  const v = Number(n) || 0;
  if (v === 0) return '0%';
  if (v < 0.1) return '<0.1%';
  if (v < 10) return v.toFixed(1).replace(/\.0$/, '') + '%';
  return Math.round(v) + '%';
}

export function dollars(n) {
  const v = Number(n) || 0;
  if (v === 0) return '$0';
  if (v < 0.01) return '<$0.01';
  if (v < 100) return '$' + v.toFixed(2);
  return '$' + Math.round(v).toLocaleString('en-US');
}

export function timeOfDay(ts) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dateTime(ts) {
  return `${dayLabel(ts)}, ${timeOfDay(ts)}`;
}

// Series colours, in the order projects are ranked. Past the last one a
// project is folded into "Other" — nine hues side by side stop telling
// anything apart.
export const SERIES_COLORS = [
  'var(--indigo-400)',
  'var(--green-400)',
  'var(--orange-400)',
  'var(--purple-400)',
  'var(--blue-500)',
  'var(--amber-500)',
  'var(--red-400)',
];
// Semantic neutrals, so they follow the theme: the raw gray scale is the dark
// theme's and stays as it is in the light one.
export const OTHER_COLOR = 'var(--text-tertiary)';
export const ELSEWHERE_COLOR = 'var(--text-disabled)';
export const ELSEWHERE_KEY = '__elsewhere__';

/** What each metric reads from a totals object, and how it is written. */
export const METRICS = {
  tokens: { label: 'Tokens', field: 'tokens', format: compactTokens },
  fiveHour: { label: '5h limit', field: 'fiveHour', format: pct, limit: true },
  sevenDay: { label: 'Weekly limit', field: 'sevenDay', format: pct, limit: true },
  cost: { label: 'API cost', field: 'cost', format: dollars },
};
