/**
 * Widget freshness chrome, shared by every home-screen widget layout.
 *
 * The widgets are redrawn from a CACHED bundle, not from a live fetch, so the
 * data on the home screen can be minutes or hours old without the user
 * noticing. These helpers turn the cache's `fetchedAt` into a short relative
 * age plus a "stale enough to warn" flag.
 *
 * Hardcoded English on purpose: widget components never use i18n (the widget
 * bundle is rendered headlessly in a background JS context, where the app's
 * language store is not guaranteed to have been hydrated). Keeping all widget
 * chrome English is the established convention in this repo.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Age past which the widget starts warning. Chosen against the app's own cache
 * policy: the background task and widget refresh run on a 30-minute period, so
 * anything under ~1 h is normal; the widget cache itself is refused past 12 h
 * and `utils/storage.ts` past 24 h. Six hours means several missed refreshes.
 */
export const WIDGET_STALE_AFTER_MS = 6 * HOUR_MS;

export interface WidgetFreshness {
  /** Short relative age, e.g. "just now", "12 min ago", "3 h ago". */
  relative: string;
  /** True once the snapshot is older than {@link WIDGET_STALE_AFTER_MS}. */
  stale: boolean;
}

/**
 * Relative age of a cached bundle. Defensive about bad input: a corrupt or
 * clock-skewed timestamp degrades to "just now" rather than rendering
 * "in -4 h ago" or throwing inside the headless widget render.
 */
export function describeFreshness(
  fetchedAt: number,
  now: number = Date.now(),
): WidgetFreshness {
  if (!Number.isFinite(fetchedAt) || !Number.isFinite(now)) {
    return { relative: 'just now', stale: false };
  }
  const age = now - fetchedAt;
  // Future timestamps (device clock moved, DST-free NTP skew) read as fresh.
  if (age <= 2 * MINUTE_MS) {
    return { relative: 'just now', stale: false };
  }
  let relative: string;
  if (age < HOUR_MS) {
    relative = `${Math.floor(age / MINUTE_MS)} min ago`;
  } else if (age < DAY_MS) {
    relative = `${Math.floor(age / HOUR_MS)} h ago`;
  } else {
    relative = `${Math.floor(age / DAY_MS)} d ago`;
  }
  return { relative, stale: age > WIDGET_STALE_AFTER_MS };
}

/**
 * The full "Updated 14:32 · 3 h ago" line the widgets render. Combines the
 * absolute clock time (which the widgets already showed) with the new
 * relative age so users can judge staleness at a glance.
 */
export function widgetUpdatedLabel(
  fetchedAt: number,
  now: number = Date.now(),
): string {
  const { relative } = describeFreshness(fetchedAt, now);
  const time = new Date(fetchedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Updated ${time} · ${relative}`;
}