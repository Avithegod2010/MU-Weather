import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WeatherBundle } from '../api/types';

/**
 * Per-location forecast snapshots for the two-city comparison.
 *
 * Modelled on utils/pastDaysCache.ts: one key, one file, rows keyed by rounded
 * coordinates, and a time-based freshness gate. A forecast is good for about
 * an hour, so the cache serves the second city instantly when the user flips
 * between pairs instead of re-fetching on every render.
 *
 * Unlike pastDaysCache (archive actuals, which never change) these rows expire
 * for real, so a stale row is dropped rather than returned as a fallback.
 */

const COMPARE_CACHE_KEY = '@mu_weather/compare_cache_v1';

/**
 * A forecast is essentially unchanged over this window, so a cached row younger
 * than this is used without a refetch. 30 minutes matches the app's own refresh
 * cadence (the background task and widget period), so a cached pair is never
 * more out of date than the current-location card already is.
 */
export const COMPARE_CACHE_TTL_MS = 30 * 60 * 1000;

/** Distinct locations to remember - enough for a handful of compared pairs. */
const MAX_CACHED_CITIES = 8;

interface CompareCacheEntry {
  lat: number;
  lon: number;
  fetchedAt: number;
  bundle: WeatherBundle;
}

interface CompareCacheFile {
  entries: CompareCacheEntry[];
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Shape gate, so one corrupt row cannot poison the whole file. */
function isValidEntry(value: unknown): value is CompareCacheEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CompareCacheEntry>;
  const bundle = entry.bundle as Partial<WeatherBundle> | undefined;
  return (
    typeof entry.lat === 'number' &&
    Number.isFinite(entry.lat) &&
    typeof entry.lon === 'number' &&
    Number.isFinite(entry.lon) &&
    typeof entry.fetchedAt === 'number' &&
    Number.isFinite(entry.fetchedAt) &&
    !!bundle &&
    !!bundle.location &&
    !!bundle.current &&
    typeof bundle.current.temperature === 'number' &&
    Number.isFinite(bundle.fetchedAt) &&
    Array.isArray(bundle.daily) &&
    Array.isArray(bundle.hourly)
  );
}

async function readFile(): Promise<CompareCacheEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(COMPARE_CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];
    const file = parsed as Partial<CompareCacheFile>;
    if (!Array.isArray(file.entries)) return [];
    return file.entries.filter(isValidEntry);
  } catch {
    return [];
  }
}

/**
 * Cached bundle for this location when it is younger than
 * {@link COMPARE_CACHE_TTL_MS}, otherwise null so the caller fetches.
 */
export async function loadCompareCache(
  latitude: number,
  longitude: number,
): Promise<WeatherBundle | null> {
  try {
    const rows = await readFile();
    const hit = rows.find(
      (entry) => rounded(entry.lat) === rounded(latitude) && rounded(entry.lon) === rounded(longitude),
    );
    if (!hit) return null;
    if (Date.now() - hit.fetchedAt > COMPARE_CACHE_TTL_MS) return null;
    return hit.bundle;
  } catch {
    return null;
  }
}

/**
 * Persist a fetched bundle, newest first, capped at MAX_CACHED_CITIES. Fire and
 * forget: never throws, so a storage failure cannot break the compare fetch.
 */
export async function saveCompareCache(
  latitude: number,
  longitude: number,
  bundle: WeatherBundle,
): Promise<void> {
  try {
    const rows = await readFile();
    const kept = rows.filter(
      (entry) => !(rounded(entry.lat) === rounded(latitude) && rounded(entry.lon) === rounded(longitude)),
    );
    const next: CompareCacheEntry[] = [
      { lat: rounded(latitude), lon: rounded(longitude), fetchedAt: Date.now(), bundle },
      ...kept,
    ].slice(0, MAX_CACHED_CITIES);
    await AsyncStorage.setItem(COMPARE_CACHE_KEY, JSON.stringify({ entries: next }));
  } catch {
    // Non-critical.
  }
}