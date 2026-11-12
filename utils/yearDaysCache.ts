import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PastDayActual } from '../api/types';

/**
 * Persisted 365-day archive snapshot feeding the year heatmap. Same contract
 * as utils/pastDaysCache.ts but with its own (much larger) cap and key, so
 * the 30-day views can never interact with it. Archive actuals never change:
 * the snapshot refreshes at most once per local day and a stale snapshot is
 * served forever as a fallback.
 */
const YEAR_DAYS_CACHE_KEY = '@mu_weather/year_days_v1';
/** 365-day window plus slack for archive lag and partial refetch merges. */
const MAX_CACHED_DAYS = 400;
const FETCH_TIMEOUT_MS = 20_000;

export interface YearDaysCacheEntry {
  /** Location the snapshot was fetched for, rounded to ~1 km. */
  lat: number;
  lon: number;
  /** Local date (YYYY-MM-DD) of the fetch. */
  fetchedOn: string;
  /** Complete days, oldest first. */
  days: PastDayActual[];
}

/** Local calendar date as `YYYY-MM-DD` (matches Archive API date strings). */
export function localDateStampYear(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** UTC calendar date `n` days before now, as `YYYY-MM-DD`. */
export function utcDaysAgoStampYear(n: number): string {
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
 * One ranged Archive call covering the past 365 days (verified live: the
 * window returns ~364 rows, ending at T-1 or T-2 depending on the era lag).
 */
export async function fetchYearDays(lat: number, lon: number): Promise<PastDayActual[]> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: utcDaysAgoStampYear(366),
    end_date: utcDaysAgoStampYear(1),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
    timezone: 'auto',
  }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Archive responded ${response.status}`);
    const json: unknown = await response.json();
    const daily = (json as { daily?: Record<string, unknown> }).daily;
    const time = daily?.time;
    if (!Array.isArray(time) || time.length === 0) throw new Error('No archive data');
    const tMax = daily?.temperature_2m_max as (number | null)[];
    const tMin = daily?.temperature_2m_min as (number | null)[];
    const precip = daily?.precipitation_sum as (number | null)[];
    const code = daily?.weather_code as (number | null)[];
    const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    const days: PastDayActual[] = [];
    for (let i = 0; i < time.length; i++) {
      const date = time[i];
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const maxRow = tMax?.[i];
      const minRow = tMin?.[i];
      if (!finite(maxRow) || !finite(minRow)) continue; // no usable temperature row
      const precipRow = precip?.[i];
      const codeRow = code?.[i];
      days.push({
        date,
        tMax: maxRow,
        tMin: minRow,
        precipSum: finite(precipRow) && precipRow >= 0 ? precipRow : 0,
        weatherCode: finite(codeRow) ? codeRow : 0,
      });
    }
    return days;
  } finally {
    clearTimeout(timer);
  }
}

/** Cached snapshot for this location, or null when absent/corrupt/elsewhere. */
export async function loadYearDaysCache(lat: number, lon: number): Promise<YearDaysCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(YEAR_DAYS_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const entry = parsed as Partial<YearDaysCacheEntry>;
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
 * Persists a successful fetch, merged date-wise (past actuals never change,
 * so old rows always win). Capped at the newest MAX_CACHED_DAYS days.
 * Fire-and-forget: callers do not await this, so it must never throw.
 */
export async function saveYearDaysCache(lat: number, lon: number, days: PastDayActual[]): Promise<void> {
  try {
    const previous = (await loadYearDaysCache(lat, lon))?.days ?? [];
    const byDate = new Map(previous.map((day) => [day.date, day]));
    for (const day of days) byDate.set(day.date, day);
    const entry: YearDaysCacheEntry = {
      lat: rounded(lat),
      lon: rounded(lon),
      fetchedOn: localDateStampYear(),
      days: [...byDate.values()]
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .slice(-MAX_CACHED_DAYS),
    };
    await AsyncStorage.setItem(YEAR_DAYS_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Non-critical: persistence failure must not break the fetch flow.
  }
}
