import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AqiHourPoint } from '../api/types';

/**
 * One persisted per-location AQI history: 31 days of hourly US/EU AQI.
 * History is stable past data, so a 12 h TTL is plenty and a STALE entry is
 * still worth showing when a refetch fails (unlike the marine outlook).
 */
export interface AqiHistoryEntry {
  /** Location the history was fetched for, rounded to ~1 km. */
  lat: number;
  lon: number;
  fetchedAt: number;
  hours: AqiHourPoint[];
}

const AQI_HISTORY_KEY = '@mu_weather/aqi_history_v1';
/** Cap on persisted locations; the oldest fetch is dropped when full. */
const MAX_CACHED_LOCATIONS = 8;
export const AQI_HISTORY_TTL_MS = 12 * 60 * 60 * 1000;

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidHour(value: unknown): value is AqiHourPoint {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (typeof row.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(row.time)) return false;
  for (const key of ['usAqi', 'euAqi', 'pm25', 'pm10']) {
    const v = row[key];
    if (v !== null && typeof v !== 'number') return false;
  }
  return true;
}

function isValidEntry(value: unknown): value is AqiHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<AqiHistoryEntry>;
  return (
    typeof row.lat === 'number' &&
    typeof row.lon === 'number' &&
    typeof row.fetchedAt === 'number' &&
    Array.isArray(row.hours) &&
    row.hours.length > 0 &&
    row.hours.every(isValidHour)
  );
}

function sanitizeHours(hours: AqiHourPoint[]): AqiHourPoint[] {
  return hours.map((point) => ({
    time: point.time,
    usAqi: typeof point.usAqi === 'number' && Number.isFinite(point.usAqi) ? point.usAqi : null,
    euAqi: typeof point.euAqi === 'number' && Number.isFinite(point.euAqi) ? point.euAqi : null,
    pm25: typeof point.pm25 === 'number' && Number.isFinite(point.pm25) ? point.pm25 : null,
    pm10: typeof point.pm10 === 'number' && Number.isFinite(point.pm10) ? point.pm10 : null,
  }));
}

async function loadAll(): Promise<AqiHistoryEntry[]> {
  const raw = await AsyncStorage.getItem(AQI_HISTORY_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
}

export async function loadAqiHistory(
  lat: number,
  lon: number,
): Promise<{ hours: AqiHourPoint[]; stale: boolean } | null> {
  const roundedLat = rounded(lat);
  const roundedLon = rounded(lon);
  const all = await loadAll();
  const entry = all.find((e) => e.lat === roundedLat && e.lon === roundedLon);
  if (!entry) return null;
  return { hours: entry.hours, stale: Date.now() - entry.fetchedAt > AQI_HISTORY_TTL_MS };
}

export async function saveAqiHistory(lat: number, lon: number, hours: AqiHourPoint[]): Promise<void> {
  const roundedLat = rounded(lat);
  const roundedLon = rounded(lon);
  const all = await loadAll();
  const next: AqiHistoryEntry[] = [
    { lat: roundedLat, lon: roundedLon, fetchedAt: Date.now(), hours: sanitizeHours(hours) },
    ...all.filter((e) => e.lat !== roundedLat || e.lon !== roundedLon),
  ].slice(0, MAX_CACHED_LOCATIONS);
  await AsyncStorage.setItem(AQI_HISTORY_KEY, JSON.stringify(next));
}
