import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadWidgetCities } from './widgetCityConfig';

/**
 * "Are widgets in use?" detection for the background-refresh registration.
 *
 * react-native-android-widget exposes NO placed-widget state to JS (verified
 * against the installed typings - there is no getDisplayedWidgets/isWidgetPlaced
 * style API), so placed BUILT-IN widgets are detected indirectly: the widget
 * task handler runs on every system redraw (the widgets' own updatePeriodMillis
 * promises ~30-minute freshness), and it stamps "a widget rendered at <now>"
 * keyed per widgetName. A recent stamp counts as consent for background
 * updates; a stamp older than the window means the widget is gone - no more
 * redraws age it out naturally. Multi-city widgets are tracked explicitly via
 * utils/widgetCityConfig.
 */

export const WIDGET_STAMPS_KEY = '@mu_weather/widget_stamps_v1';
/** A stamp this old still counts as "widgets in use" - 7 days covers a long absence. */
export const WIDGET_IN_USE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Cap so unknown widget names cannot grow the blob forever. */
export const MAX_WIDGET_STAMPS = 8;

/**
 * Pure: validate a parsed stamps blob (corrupt -> {}, negative/non-finite
 * dropped) and cap at MAX_WIDGET_STAMPS (the oldest entries dropped).
 */
export function normalizeStamps(parsed: unknown): Record<string, number> {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const entries = Object.entries(parsed as Record<string, unknown>).filter(
    (entry): entry is [string, number] =>
      typeof entry[0] === 'string' &&
      entry[0].length > 0 &&
      typeof entry[1] === 'number' &&
      Number.isFinite(entry[1]) &&
      entry[1] >= 0,
  );
  return Object.fromEntries(entries.slice(-MAX_WIDGET_STAMPS));
}

/**
 * Pure: true when any stamp sits inside the in-use window. A FUTURE stamp
 * (clock skew) also counts - the device had a widget moments ago in either
 * direction.
 */
export function anyStampWithinWindow(
  stamps: Record<string, number>,
  now: number,
  windowMs = WIDGET_IN_USE_WINDOW_MS,
): boolean {
  return Object.values(stamps).some((at) => now - at < windowMs && now - at > -windowMs);
}

/** Record that a widget of this name just rendered. Never throws. */
export async function stampWidgetRendered(widgetName: string): Promise<void> {
  if (!widgetName) return;
  try {
    const raw = await AsyncStorage.getItem(WIDGET_STAMPS_KEY);
    const stamps = normalizeStamps(raw ? JSON.parse(raw) : null);
    stamps[widgetName] = Date.now();
    await AsyncStorage.setItem(WIDGET_STAMPS_KEY, JSON.stringify(stamps));
  } catch {
    // Non-critical bookkeeping - a missed stamp only delays registration.
  }
}

/**
 * True when the background task should keep running for the widgets alone:
 * a recent built-in redraw stamp, or an explicitly configured multi-city
 * widget. Never throws.
 */
export async function areWidgetsInUse(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_STAMPS_KEY);
    const stamps = normalizeStamps(raw ? JSON.parse(raw) : null);
    if (anyStampWithinWindow(stamps, Date.now())) return true;
    return (await loadWidgetCities()).length > 0;
  } catch {
    return false;
  }
}