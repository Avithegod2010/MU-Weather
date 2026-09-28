import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PastDayActual } from '../api/types';

const HISTORICAL_CACHE_KEY = '@mu_weather/historical_days_v1';
/**
 * Newest-explored dates kept on the device. Each row is ~120 bytes, so 30
 * explored dates cost well under 5 kB - the same order as the 30-day snapshot.
 */
const MAX_CACHED_DATES = 30;

/**
 * One explored past date for one location. Observed history never changes, so
 * there is no TTL: only the fetch date matters, and only for LRU eviction.
 */
export interface HistoricalCacheRow {
  /** Location the observation was fetched for, rounded to ~1 km. */
  lat: number;
  lon: number;
  /** The explored calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Local date (YYYY-MM-DD) of the fetch - LRU ordering only. */
  fetchedOn: string;
  day: PastDayActual;
}

interface HistoricalCacheFile {
  version: 1;
  rows: HistoricalCacheRow[];
}

/** Local calendar date as `YYYY-MM-DD`. */
function localDateStamp(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidDay(value: unknown): value is PastDayActual {
  if (!value || typeof value !== 'object') return false;
  const day = value as Partial<PastDayActual>;
  return (
    typeof day.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(day.date) &&
    typeof day.tMax === 'number' &&
    Number.isFinite(day.tMax) &&
    typeof day.tMin === 'number' &&
    Number.isFinite(day.tMin) &&
    typeof day.precipSum === 'number' &&
    Number.isFinite(day.precipSum) &&
    typeof day.weatherCode === 'number' &&
    Number.isInteger(day.weatherCode)
  );
}

function isValidRow(value: unknown): value is HistoricalCacheRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<HistoricalCacheRow>;
  return (
    typeof row.lat === 'number' &&
    typeof row.lon === 'number' &&
    typeof row.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    typeof row.fetchedOn === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.fetchedOn) &&
    isValidDay(row.day) &&
    row.day.date === row.date
  );
}

/** All persisted rows, newest fetch first; [] on absent or corrupt data. */
async function loadAllRows(): Promise<HistoricalCacheRow[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORICAL_CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];
    const file = parsed as Partial<HistoricalCacheFile>;
    if (file.version !== 1 || !Array.isArray(file.rows)) return [];
    return file.rows
      .filter(isValidRow)
      .sort((a, b) => (a.fetchedOn < b.fetchedOn ? 1 : a.fetchedOn > b.fetchedOn ? -1 : 0));
  } catch {
    return [];
  }
}

function samePlace(row: HistoricalCacheRow, lat: number, lon: number): boolean {
  return rounded(row.lat) === rounded(lat) && rounded(row.lon) === rounded(lon);
}

/**
 * Cached observation for this location AND date, or null when absent, corrupt
 * or fetched for a different place/date. History never goes stale, so
 * `fetchedOn` is not checked - a hit is served without any network call.
 */
export async function loadHistoricalDay(
  lat: number,
  lon: number,
  date: string,
): Promise<PastDayActual | null> {
  const rows = await loadAllRows();
  const match = rows.find((row) => samePlace(row, lat, lon) && row.date === date);
  return match ? match.day : null;
}

/**
 * The most recently explored dates for this location, newest fetch first, for
 * the "recently explored" chips. Purely a convenience list; [] when nothing has
 * been explored yet.
 */
export async function loadHistoricalRecent(
  lat: number,
  lon: number,
  limit = 8,
): Promise<string[]> {
  const rows = await loadAllRows();
  return rows
    .filter((row) => samePlace(row, lat, lon))
    .slice(0, Math.max(1, limit))
    .map((row) => row.date);
}

/**
 * Persists a successful observation, replacing any row for the same place/date
 * and capped at MAX_CACHED_DATES by dropping the oldest `fetchedOn` rows.
 * Fire-and-forget: callers do not await this, so it must never throw.
 */
export async function saveHistoricalDay(
  lat: number,
  lon: number,
  day: PastDayActual,
): Promise<void> {
  try {
    const rows = await loadAllRows();
    const kept = rows.filter((row) => !(samePlace(row, lat, lon) && row.date === day.date));
    kept.push({
      lat: rounded(lat),
      lon: rounded(lon),
      date: day.date,
      fetchedOn: localDateStamp(),
      day,
    });
    kept.sort((a, b) => (a.fetchedOn < b.fetchedOn ? 1 : a.fetchedOn > b.fetchedOn ? -1 : 0));
    const file: HistoricalCacheFile = { version: 1, rows: kept.slice(0, MAX_CACHED_DATES) };
    await AsyncStorage.setItem(HISTORICAL_CACHE_KEY, JSON.stringify(file));
  } catch {
    // Non-critical: persistence failure must not break the fetch flow.
  }
}