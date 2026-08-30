import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WeatherBundle } from '../api/types';

/** One predicted day, aligned with `DayPoint` field names. */
export interface ForecastLogEntry {
  date: string;
  tMax: number;
  tMin: number;
  precipSum: number;
}

const FORECAST_LOG_KEY = '@mu_weather/forecast_log_v1';
/** A month of predictions - enough for forecast-vs-actual without growing forever. */
const MAX_LOG_ENTRIES = 30;

function isValidEntry(value: unknown): value is ForecastLogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ForecastLogEntry>;
  return (
    typeof entry.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    typeof entry.tMax === 'number' &&
    typeof entry.tMin === 'number' &&
    typeof entry.precipSum === 'number'
  );
}

/** Previously logged predictions, oldest first. Empty on absence or corruption. */
export async function loadForecastLog(): Promise<ForecastLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(FORECAST_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

/**
 * Upsert one prediction per date from the fresh bundle (the most recent
 * prediction for a date wins), capped at the newest MAX_LOG_ENTRIES dates.
 * Fire-and-forget: callers do not await this, so it must never throw.
 */
export async function logForecast(bundle: WeatherBundle): Promise<void> {
  try {
    const log = await loadForecastLog();
    const byDate = new Map(log.map((entry) => [entry.date, entry]));
    for (const day of bundle.daily) {
      byDate.set(day.date, {
        date: day.date,
        tMax: day.tMax,
        tMin: day.tMin,
        precipSum: day.precipSum,
      });
    }
    const next = [...byDate.values()]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(-MAX_LOG_ENTRIES);
    await AsyncStorage.setItem(FORECAST_LOG_KEY, JSON.stringify(next));
  } catch {
    // Non-critical: persistence failure must not break the fetch flow.
  }
}
