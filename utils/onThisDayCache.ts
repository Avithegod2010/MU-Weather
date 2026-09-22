import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OnThisDayYear } from '../api/types';

const ON_THIS_DAY_CACHE_KEY = '@mu_weather/on_this_day_v1';
/** Cap on persisted locations; the oldest fetch is dropped when full. */
const MAX_CACHED_LOCATIONS = 8;

/**
 * One persisted "weather on this day" row for a location. History is static,
 * so there is no expiry - only the fetch date matters for LRU eviction. A row
 * is only ever shown for the exact calendar day it was fetched for.
 */
export interface OnThisDayCacheRow {
  /** Location the observations were fetched for, rounded to ~1 km. */
  lat: number;
  lon: number;
  /** Calendar day the rows describe, as `MM-DD` (Feb 29 fetches use `02-28`). */
  monthDay: string;
  /** Local date (YYYY-MM-DD) of the fetch. */
  fetchedOn: string;
  /** Observed rows, newest year first. */
  years: OnThisDayYear[];
}

interface OnThisDayCacheFile {
  version: 1;
  rows: OnThisDayCacheRow[];
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

function isValidYear(value: unknown): value is OnThisDayYear {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<OnThisDayYear>;
  return (
    typeof row.year === 'number' &&
    Number.isInteger(row.year) &&
    row.year >= 1900 &&
    row.year <= 2100 &&
    typeof row.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    typeof row.tMax === 'number' &&
    Number.isFinite(row.tMax) &&
    typeof row.tMin === 'number' &&
    Number.isFinite(row.tMin) &&
    typeof row.weatherCode === 'number' &&
    Number.isInteger(row.weatherCode) &&
    row.weatherCode >= 0 &&
    row.weatherCode <= 99
  );
}

function isValidRow(value: unknown): value is OnThisDayCacheRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<OnThisDayCacheRow>;
  return (
    typeof row.lat === 'number' &&
    typeof row.lon === 'number' &&
    typeof row.monthDay === 'string' &&
    /^\d{2}-\d{2}$/.test(row.monthDay) &&
    typeof row.fetchedOn === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.fetchedOn) &&
    Array.isArray(row.years) &&
    row.years.length > 0 &&
    row.years.every(isValidYear)
  );
}

/** All persisted rows, oldest fetch first; null/[] on absent or corrupt data. */
async function loadAllRows(): Promise<OnThisDayCacheRow[]> {
  try {
    const raw = await AsyncStorage.getItem(ON_THIS_DAY_CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];
    const file = parsed as Partial<OnThisDayCacheFile>;
    if (file.version !== 1 || !Array.isArray(file.rows)) return [];
    return file.rows.filter(isValidRow).sort((a, b) => (a.fetchedOn < b.fetchedOn ? -1 : 1));
  } catch {
    return [];
  }
}

/**
 * Cached observations for this location AND calendar day, or null when absent,
 * fetched for a different place, or fetched for a different calendar day.
 * History never goes stale, so `fetchedOn` is not checked.
 */
export async function loadOnThisDayCache(
  lat: number,
  lon: number,
  monthDay: string,
): Promise<OnThisDayCacheRow | null> {
  const rows = await loadAllRows();
  const match = rows.find(
    (row) =>
      rounded(row.lat) === rounded(lat) &&
      rounded(row.lon) === rounded(lon) &&
      row.monthDay === monthDay,
  );
  return match ?? null;
}

/**
 * Persists a successful fetch for this location + calendar day, merging by
 * year into any existing row for the same place/day (existing years kept,
 * same-year rows replaced by the incoming ones), capped at
 * MAX_CACHED_LOCATIONS entries by dropping the oldest `fetchedOn` rows.
 * Fire-and-forget: callers do not await this, so it must never throw.
 */
export async function saveOnThisDayCache(
  lat: number,
  lon: number,
  monthDay: string,
  years: OnThisDayYear[],
): Promise<void> {
  try {
    const rows = await loadAllRows();
    const sameRow = (row: OnThisDayCacheRow) =>
      rounded(row.lat) === rounded(lat) &&
      rounded(row.lon) === rounded(lon) &&
      row.monthDay === monthDay;
    const existing = rows.find(sameRow);
    // Merge by year: existing years survive, same-year rows are replaced.
    const byYear = new Map<number, OnThisDayYear>();
    for (const row of existing?.years ?? []) byYear.set(row.year, row);
    for (const row of years) byYear.set(row.year, row);
    const merged = [...byYear.values()].sort((a, b) => b.year - a.year);
    const filtered = rows.filter((row) => !sameRow(row));
    filtered.push({
      lat: rounded(lat),
      lon: rounded(lon),
      monthDay,
      fetchedOn: localDateStamp(),
      years: merged,
    });
    while (filtered.length > MAX_CACHED_LOCATIONS) {
      filtered.shift();
    }
    const file: OnThisDayCacheFile = { version: 1, rows: filtered };
    await AsyncStorage.setItem(ON_THIS_DAY_CACHE_KEY, JSON.stringify(file));
  } catch {
    // Non-critical: persistence failure must not break the fetch flow.
  }
}