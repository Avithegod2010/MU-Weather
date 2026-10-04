import AsyncStorage from '@react-native-async-storage/async-storage';
import { roundedCoord } from './modelAccuracyLog';
import type { PastDayActual } from '../api/types';

/**
 * The year in review, built entirely from archive ACTUALS this device has
 * already downloaded for the past-days views (utils/pastDaysCache). No extra
 * network request and nothing sent anywhere: the rows are simply the observed
 * days the user happened to open the app on, which the card states plainly.
 *
 * Storage follows the repo's per-location idiom (utils/pastDaysCache): one key,
 * one bucket per location rounded to ~1 km, one row per calendar date (newest
 * wins), a per-location cap, an LRU over locations, and full validation on
 * load so a corrupt file degrades to "no review yet" instead of throwing.
 */

const YEAR_LOG_KEY = '@mu_weather/year_log_v1';
/** ~13 months of daily rows per location. */
const MAX_DAYS_PER_LOCATION = 400;
/** Locations kept; the least recently written one is dropped when full. */
const MAX_LOCATIONS = 8;
/** A "wet day", matching the wet-day definition used across the app. */
const RAIN_DAY_MM = 1.0;

export interface YearRow {
  /** Local calendar date `YYYY-MM-DD`. */
  date: string;
  tMax: number;
  tMin: number;
  precipSum: number;
  weatherCode: number;
  /** Daily max 10 m wind km/h when the archive had it, else null. */
  windMax: number | null;
}

interface YearBucket {
  lat: number;
  lon: number;
  /** Epoch ms of the last write - drives the location LRU. */
  touchedAt: number;
  days: YearRow[];
}

interface YearLogFile {
  version: 1;
  buckets: YearBucket[];
}

export interface YearStats {
  /** Days recorded in the current calendar year. */
  days: number;
  year: number;
  hottest: YearRow | null;
  coldest: YearRow | null;
  wettest: YearRow | null;
  totalRain: number;
  wetDays: number;
  avgHigh: number;
  avgLow: number;
  /** Days with clear or mainly clear skies (WMO 0-1). */
  fairDays: number;
  /** Newest recorded date in the year, `YYYY-MM-DD`. */
  latest: string | null;
}

function isValidRow(value: unknown): value is YearRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<YearRow>;
  return (
    typeof row.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    typeof row.tMax === 'number' &&
    Number.isFinite(row.tMax) &&
    typeof row.tMin === 'number' &&
    Number.isFinite(row.tMin) &&
    typeof row.precipSum === 'number' &&
    Number.isFinite(row.precipSum) &&
    typeof row.weatherCode === 'number' &&
    (row.windMax === null || row.windMax === undefined || typeof row.windMax === 'number')
  );
}

function isValidBucket(value: unknown): value is YearBucket {
  if (!value || typeof value !== 'object') return false;
  const bucket = value as Partial<YearBucket>;
  return (
    typeof bucket.lat === 'number' &&
    Number.isFinite(bucket.lat) &&
    typeof bucket.lon === 'number' &&
    Number.isFinite(bucket.lon) &&
    Array.isArray(bucket.days) &&
    bucket.days.every(isValidRow)
  );
}

async function readFile(): Promise<YearLogFile> {
  try {
    const raw = await AsyncStorage.getItem(YEAR_LOG_KEY);
    if (!raw) return { version: 1, buckets: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { version: 1, buckets: [] };
    const file = parsed as Partial<YearLogFile>;
    if (file.version !== 1 || !Array.isArray(file.buckets)) return { version: 1, buckets: [] };
    return { version: 1, buckets: file.buckets.filter(isValidBucket) };
  } catch {
    return { version: 1, buckets: [] };
  }
}
/**
 * Merge freshly fetched archive actuals into the year log. One row per date
 * (a re-fetched day replaces the old row, which is correct - archive actuals
 * get revised). Fire-and-forget: callers do not await it, so it must never
 * throw.
 */
export async function recordYearActuals(
  days: PastDayActual[],
  latitude: number,
  longitude: number,
): Promise<void> {
  if (days.length === 0) return;
  const lat = roundedCoord(latitude);
  const lon = roundedCoord(longitude);
  try {
    const file = await readFile();
    const bucket = file.buckets.find((b) => b.lat === lat && b.lon === lon);
    const byDate = new Map<string, YearRow>();
    for (const row of bucket?.days ?? []) byDate.set(row.date, row);
    for (const day of days) {
      byDate.set(day.date, {
        date: day.date,
        tMax: day.tMax,
        tMin: day.tMin,
        precipSum: day.precipSum,
        weatherCode: day.weatherCode,
        windMax: typeof day.windMax === 'number' ? day.windMax : null,
      });
    }
    const merged: YearBucket = {
      lat,
      lon,
      touchedAt: Date.now(),
      days: [...byDate.values()]
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .slice(-MAX_DAYS_PER_LOCATION),
    };
    const buckets = [merged, ...file.buckets.filter((b) => !(b.lat === lat && b.lon === lon))]
      .sort((a, b) => b.touchedAt - a.touchedAt)
      .slice(0, MAX_LOCATIONS);
    await AsyncStorage.setItem(YEAR_LOG_KEY, JSON.stringify({ version: 1, buckets }));
  } catch {
    // Non-critical: the review is a bonus, the past-days cache is the real store.
  }
}

/** Recorded rows for one location, oldest first. Empty when nothing matches. */
export async function loadYearRows(latitude: number, longitude: number): Promise<YearRow[]> {
  const lat = roundedCoord(latitude);
  const lon = roundedCoord(longitude);
  const file = await readFile();
  const bucket = file.buckets.find((b) => b.lat === lat && b.lon === lon);
  if (!bucket) return [];
  return bucket.days
    .filter(isValidRow)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Year-to-date statistics from the recorded rows. Returns null when the
 * given year has no rows at all - the card then shows its empty state.
 * Pure, so it is directly testable.
 */
export function computeYearStats(rows: YearRow[], year: number): YearStats | null {
  const inYear = rows.filter((row) => row.date.startsWith(`${year}-`));
  if (inYear.length === 0) return null;
  let hottest: YearRow | null = null;
  let coldest: YearRow | null = null;
  let wettest: YearRow | null = null;
  let totalRain = 0;
  let wetDays = 0;
  let fairDays = 0;
  let highSum = 0;
  let lowSum = 0;
  for (const row of inYear) {
    if (!hottest || row.tMax > hottest.tMax) hottest = row;
    if (!coldest || row.tMin < coldest.tMin) coldest = row;
    if (!wettest || row.precipSum > wettest.precipSum) wettest = row;
    totalRain += row.precipSum;
    if (row.precipSum >= RAIN_DAY_MM) wetDays += 1;
    if (row.weatherCode <= 1) fairDays += 1;
    highSum += row.tMax;
    lowSum += row.tMin;
  }
  return {
    days: inYear.length,
    year,
    hottest,
    coldest,
    wettest,
    totalRain,
    wetDays,
    avgHigh: highSum / inYear.length,
    avgLow: lowSum / inYear.length,
    fairDays,
    latest: inYear[inYear.length - 1].date,
  };
}