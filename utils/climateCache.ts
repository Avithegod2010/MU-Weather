import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MonthlyNormal } from '../api/types';

const CLIMATE_CACHE_KEY = '@mu_weather/climate_normals_v1';
/** Cap on persisted locations; the oldest fetch is dropped when full. */
const MAX_CACHED_LOCATIONS = 8;

/**
 * One persisted climate-normals row for a location. Normals are static
 * (1991-2020 means), so there is no expiry - only the fetch date matters for
 * LRU eviction.
 */
export interface ClimateCacheRow {
  /** Location the normals were fetched for, rounded to ~1 km. */
  lat: number;
  lon: number;
  /** Local date (YYYY-MM-DD) of the fetch. */
  fetchedOn: string;
  /** 12 monthly rows, month 1-12. */
  months: MonthlyNormal[];
}

interface ClimateCacheFile {
  version: 1;
  rows: ClimateCacheRow[];
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

function isValidMonth(value: unknown): value is MonthlyNormal {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<MonthlyNormal>;
  return (
    typeof row.month === 'number' &&
    Number.isInteger(row.month) &&
    row.month >= 1 &&
    row.month <= 12 &&
    typeof row.tMaxMean === 'number' &&
    typeof row.tMinMean === 'number' &&
    typeof row.precipMean === 'number'
  );
}

function isValidRow(value: unknown): value is ClimateCacheRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<ClimateCacheRow>;
  return (
    typeof row.lat === 'number' &&
    typeof row.lon === 'number' &&
    typeof row.fetchedOn === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.fetchedOn) &&
    Array.isArray(row.months) &&
    row.months.length === 12 &&
    row.months.every(isValidMonth)
  );
}

/** All persisted rows, oldest fetch first; null/[] on absent or corrupt data. */
async function loadAllRows(): Promise<ClimateCacheRow[]> {
  try {
    const raw = await AsyncStorage.getItem(CLIMATE_CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];
    const file = parsed as Partial<ClimateCacheFile>;
    if (file.version !== 1 || !Array.isArray(file.rows)) return [];
    return file.rows.filter(isValidRow).sort((a, b) => (a.fetchedOn < b.fetchedOn ? -1 : 1));
  } catch {
    return [];
  }
}

/**
 * Cached normals for this location, or null when absent or fetched for a
 * different place. Normals never go stale, so `fetchedOn` is not checked.
 */
export async function loadClimateCache(lat: number, lon: number): Promise<ClimateCacheRow | null> {
  const rows = await loadAllRows();
  const match = rows.find(
    (row) => rounded(row.lat) === rounded(lat) && rounded(row.lon) === rounded(lon),
  );
  return match ?? null;
}

/**
 * Persists a successful fetch for this location, capped at
 * MAX_CACHED_LOCATIONS entries by dropping the oldest `fetchedOn` rows.
 * Fire-and-forget: callers do not await this, so it must never throw.
 */
export async function saveClimateCache(lat: number, lon: number, months: MonthlyNormal[]): Promise<void> {
  try {
    const rows = await loadAllRows();
    const filtered = rows.filter(
      (row) => rounded(row.lat) !== rounded(lat) || rounded(row.lon) !== rounded(lon),
    );
    filtered.push({
      lat: rounded(lat),
      lon: rounded(lon),
      fetchedOn: localDateStamp(),
      months,
    });
    while (filtered.length > MAX_CACHED_LOCATIONS) {
      filtered.shift();
    }
    const file: ClimateCacheFile = { version: 1, rows: filtered };
    await AsyncStorage.setItem(CLIMATE_CACHE_KEY, JSON.stringify(file));
  } catch {
    // Non-critical: persistence failure must not break the fetch flow.
  }
}
