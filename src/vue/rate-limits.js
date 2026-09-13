// rate-limits.js — the plan's 5-hour and 7-day meters, from the message stream.
//
// A terminal session renders these itself, in the CLI's own status line. The
// chat view replaces that status line, so without this an SDK-backed session is
// the one place in the app where you cannot see how much of your plan is left.
//
// The source is `rate_limit_event`, which the CLI pushes once per turn. Not the
// `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET` control request:
// the name is the SDK's own warning, and the stream event turns out to carry
// everything that one does.
//
// Two things about the payload are worth knowing before reading the code, both
// established by watching a real session rather than by reading the types:
//
//   * `utilization` is a FRACTION here (0.81), while the same number in the
//     control request is a PERCENT (81). Everything below normalises to percent.
//   * `resetsAt` is epoch SECONDS (1789192800 → 2026-09-12T06:00:00Z, which is
//     what the control request reported as an ISO string for the same window).
//
// And one caveat: `unifiedWindows`, which is what carries both windows at once,
// is not in the shipped type declarations at all. It is read defensively and
// the single-window fields are used as the fallback, so a build that stops
// sending it degrades to "the one window the CLI is warning about" rather than
// to nothing.

/** The windows worth showing. Anything else the CLI reports is ignored. */
export const WINDOWS = ['five_hour', 'seven_day'];

/** Seconds since the epoch, or already milliseconds — both have been seen. */
function toMillis(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  // A seconds timestamp for any date this side of the year 2001 is under 1e12;
  // a milliseconds one is over it. Nothing in between is a real reset time.
  return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
}

/**
 * A fraction (0.81) or a percent (81) in, a percent out.
 *
 * The stream sends fractions and the control request sends percents, and there
 * is no field saying which. Values above 1 can only be percents; at or below 1
 * they are read as fractions, which costs us the ability to say "1%" exactly —
 * it reads as 100%. Erring that way is deliberate: a meter that says you are
 * full when you are nearly empty gets noticed and fixed, one that says you are
 * empty when you are full does not.
 */
function toPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const percent = value <= 1 ? value * 100 : value;
  return Math.min(100, Math.round(percent * 10) / 10);
}

function window(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const utilization = toPercent(raw.utilization);
  if (utilization === null) return null;
  return { utilization, resetsAt: toMillis(raw.resetsAt ?? raw.resets_at) };
}

/**
 * `rate_limit_info` → what the meter shows, or null when there is nothing in it
 * worth showing.
 *
 * @param {unknown} info
 * @param {number} [now] millis, for tests
 * @returns {{ windows: object, status: string, surpassedThreshold: number|null,
 *             isUsingOverage: boolean, updatedAt: number } | null}
 */
export function parseRateLimitEvent(info, now = Date.now()) {
  if (!info || typeof info !== 'object') return null;

  const windows = {};
  const unified = info.unifiedWindows;
  if (unified && typeof unified === 'object') {
    for (const name of WINDOWS) {
      const parsed = window(unified[name]);
      if (parsed) windows[name] = parsed;
    }
  }

  // Fallback, and also the single window the CLI is actually warning about:
  // the top-level fields name one `rateLimitType` and describe it. Only filled
  // in when `unifiedWindows` did not already cover it, so the richer source
  // wins when both are present.
  const named = typeof info.rateLimitType === 'string' ? info.rateLimitType : '';
  if (WINDOWS.includes(named) && !windows[named]) {
    const parsed = window(info);
    if (parsed) windows[named] = parsed;
  }

  if (!Object.keys(windows).length) return null;

  return {
    windows,
    status: typeof info.status === 'string' ? info.status : 'allowed',
    surpassedThreshold: toPercent(info.surpassedThreshold),
    isUsingOverage: info.isUsingOverage === true || info.overageInUse === true,
    updatedAt: now,
  };
}

/**
 * The window closest to running out — what a one-line meter should lead with.
 * @returns {{ name: string, utilization: number, resetsAt: number|null } | null}
 */
export function tightestWindow(limits) {
  const windows = limits?.windows;
  if (!windows) return null;
  let worst = null;
  for (const name of WINDOWS) {
    const w = windows[name];
    if (!w) continue;
    if (!worst || w.utilization > worst.utilization) worst = { name, ...w };
  }
  return worst;
}

/** `five_hour` → `5h`. Short enough for a control bar. */
export const WINDOW_LABEL = { five_hour: '5h', seven_day: '7d' };

/**
 * "resets in 2h 15m" — the half of this that people actually act on. A window
 * whose reset has passed reports nothing rather than a negative age: the next
 * event will carry the new one.
 */
export function resetsIn(resetsAt, now = Date.now()) {
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) return '';
  const left = resetsAt - now;
  if (left <= 0) return '';
  const minutes = Math.floor(left / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}
