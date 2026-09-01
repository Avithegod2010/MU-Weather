import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PastDayActual } from '../api/types';

const PAST_DAYS_CACHE_KEY = '@mu_weather/past_days_cache_v1';
/** 30-day window plus slack for lagging archive rows. */
const MAX_CACHED_DAYS = 40;

/**
 * One persisted archive snapshot. Archive actuals for a past date never
 * change, so only the fetch DATE matters: the entry refreshes once per local
 * day and stays usable as a stale fallback forever after.
 */
export interface PastDaysCacheEntry {
  /** Location the snapshot was fetched for, rounded to ~1 km. */
  lat: number;
  lon: number;
  /** Local date (YYYY-MM-DD) of the fetch. */
  fetchedOn: string;
  /** Complete days, oldest first. */
  days: PastDayActual[];
}

/** Local calendar date as `YYYY-MM-DD` (matches Archive API date strings). */
export function localDateStamp(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** UTC calendar date `n` days before now, as `YYYY-MM-DD`. */
export function utcDaysAgoStamp(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidEntry(value: unknown): value is PastDayActual {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PastDayActual>;
  return (
    typeof entry.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    typeof entry.tMax === 'number' &&
    typeof entry.tMin === 'number' &&
    typeof entry.precipSum === 'number' &&
    typeof entry.weatherCode === 'number'
  );
}

/**
 * Cached archive snapshot for this location, or null when absent, corrupt,
 * or fetched for a different place. An older `fetchedOn` is still returned -
 * stale actuals beat no data.
 */
export async function loadPastDaysCache(lat: number, lon: number): Promise<PastDaysCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(PAST_DAYS_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const entry = parsed as Partial<PastDaysCacheEntry>;
    if (
      typeof entry.lat !== 'number' ||
      typeof entry.lon !== 'number' ||
      typeof entry.fetchedOn !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.fetchedOn) ||
      !Array.isArray(entry.days) ||
      entry.days.length === 0 ||
      !entry.days.every(isValidEntry)
    ) {
      return null;
    }
    if (rounded(entry.lat) !== rounded(lat) || rounded(entry.lon) !== rounded(lon)) {
      return null;
    }
    return { lat: rounded(entry.lat), lon: rounded(entry.lon), fetchedOn: entry.fetchedOn, days: entry.days };
  } catch {
    return null;
  }
}

/**
 * Persists a successful fetch, merged date-wise into any existing snapshot so
 * a partial (archive-lag) fetch can never shrink the window — past actuals
 * never change, so old rows always win. Capped at the newest MAX_CACHED_DAYS
 * days. Fire-and-forget: callers do not await this, so it must never throw.
 */
export async function savePastDaysCache(lat: number, lon: number, days: PastDayActual[]): Promise<void> {
  try {
    const previous = (await loadPastDaysCache(lat, lon))?.days ?? [];
    const byDate = new Map(previous.map((day) => [day.date, day]));
    for (const day of days) byDate.set(day.date, day);
    const entry: PastDaysCacheEntry = {
      lat: rounded(lat),
      lon: rounded(lon),
      fetchedOn: localDateStamp(),
      days: [...byDate.values()]
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .slice(-MAX_CACHED_DAYS),
    };
    await AsyncStorage.setItem(PAST_DAYS_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Non-critical: persistence failure must not break the fetch flow.
  }
}
