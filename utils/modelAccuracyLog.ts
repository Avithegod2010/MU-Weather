import AsyncStorage from '@react-native-async-storage/async-storage';
import { MODEL_KEYS, type ModelForecast, type ModelKey } from '../api/providers';

/**
 * One comparison model's prediction for one calendar day, as this device saw
 * it. Mirrors `ForecastLogEntry` (utils/forecastLog.ts) but keeps the model and
 * the location, so the accuracy view can rank the models against each other for
 * the city the user is actually in - a Paris prediction must never be scored
 * against London observations.
 */
export interface ModelLogEntry {
  date: string;
  model: ModelKey;
  /** Location the prediction was made for, rounded to ~1 km (see roundedCoord). */
  lat: number;
  lon: number;
  tMax: number;
  tMin: number;
}

/** Any `{ latitude, longitude }` pair - the log and scorer only need coordinates. */
export interface LocationAnchor {
  latitude: number;
  longitude: number;
}

/**
 * The lat/lon rounding idiom established by utils/pastDaysCache and
 * utils/climateCache: two decimals, ~1 km - close enough that "the same city"
 * matches after a GPS wobble, far enough apart that neighbouring towns do not.
 */
export function roundedCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

const MODEL_LOG_KEY = '@mu_weather/model_log_v1';
const MODEL_LOG_STAMP_KEY = '@mu_weather/model_log_stamp_v1';
/** A month of dates per (location, model) - the same window the archive feed covers. */
const MAX_DATES_PER_MODEL = 30;
/** Blob-wide safety valve: logging many cities must not grow storage without bound. */
const MAX_TOTAL_ENTRIES = 360;
/** One multi-model sweep every 6 h at most; six global models do not change faster. */
const MODEL_LOG_TTL_MS = 6 * 60 * 60 * 1000;

function isModelKey(value: unknown): value is ModelKey {
  return typeof value === 'string' && (MODEL_KEYS as string[]).includes(value);
}

function isValidEntry(value: unknown): value is ModelLogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ModelLogEntry>;
  return (
    typeof entry.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    isModelKey(entry.model) &&
    typeof entry.lat === 'number' &&
    Number.isFinite(entry.lat) &&
    typeof entry.lon === 'number' &&
    Number.isFinite(entry.lon) &&
    typeof entry.tMax === 'number' &&
    typeof entry.tMin === 'number'
  );
}

/**
 * Logged per-model predictions, oldest first. Empty on absence or corruption.
 *
 * Entries that predate the location field fail validation and are dropped: they
 * cannot be attributed to a city any more, and scoring them against whichever
 * city happens to be open is the very bug the location key fixes - the log
 * simply starts fresh for those dates.
 */
export async function loadModelLog(): Promise<ModelLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(MODEL_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

/**
 * Upsert one prediction per (location, date, model) from a fresh multi-model
 * response - the newest prediction for a triple wins - and keep each
 * (location, model) pair's newest MAX_DATES_PER_MODEL dates only. Fire-and-
 * forget: must never throw.
 */
export async function logModelPredictions(
  results: ModelForecast[],
  location: LocationAnchor,
): Promise<void> {
  if (results.length === 0) return;
  const lat = roundedCoord(location.latitude);
  const lon = roundedCoord(location.longitude);
  try {
    const byKey = new Map<string, ModelLogEntry>();
    for (const entry of await loadModelLog()) {
      byKey.set(`${entry.lat}|${entry.lon}|${entry.model}|${entry.date}`, entry);
    }
    for (const result of results) {
      for (const day of result.days) {
        byKey.set(`${lat}|${lon}|${result.model}|${day.date}`, {
          date: day.date,
          model: result.model,
          lat,
          lon,
          tMax: day.tMax,
          tMin: day.tMin,
        });
      }
    }

    // Bucket per (location, model) so logging a second city never evicts the
    // first city's window.
    const byPlace = new Map<string, ModelLogEntry[]>();
    for (const entry of byKey.values()) {
      const bucketKey = `${entry.lat}|${entry.lon}|${entry.model}`;
      const bucket = byPlace.get(bucketKey);
      if (bucket) bucket.push(entry);
      else byPlace.set(bucketKey, [entry]);
    }

    let next: ModelLogEntry[] = [];
    for (const bucket of byPlace.values()) {
      bucket.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      next.push(...bucket.slice(-MAX_DATES_PER_MODEL));
    }
    next.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (next.length > MAX_TOTAL_ENTRIES) next = next.slice(-MAX_TOTAL_ENTRIES);
    await AsyncStorage.setItem(MODEL_LOG_KEY, JSON.stringify(next));
  } catch {
    // Non-critical: a persistence failure must not break the fetch flow.
  }
}

/** True when the log has not been swept within the TTL (or never was). */
export async function isModelLogStale(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(MODEL_LOG_STAMP_KEY);
    const stamp = raw ? Number(raw) : 0;
    if (!Number.isFinite(stamp) || stamp <= 0) return true;
    return Date.now() - stamp > MODEL_LOG_TTL_MS;
  } catch {
    return true;
  }
}

/** Record the moment of a successful sweep so the TTL gate can back off. */
export async function markModelLogFetched(): Promise<void> {
  try {
    await AsyncStorage.setItem(MODEL_LOG_STAMP_KEY, String(Date.now()));
  } catch {
    // Non-critical bookkeeping.
  }
}
