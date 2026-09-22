import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EnsembleSpread, EnsembleSpreadPoint } from '../api/types';

const ENSEMBLE_CACHE_KEY = '@mu_weather/ensemble_v1';
/** Cap on persisted locations; the oldest fetch is dropped when full. */
const MAX_CACHED_LOCATIONS = 8;
/** Ensemble forecasts go stale - entries older than this are refetched. */
const ENSEMBLE_TTL_MS = 3 * 60 * 60 * 1000;

/**
 * One persisted ensemble-spread snapshot for a location. Unlike climate
 * normals (static), ensembles age, so rows carry a fetch timestamp and a TTL.
 */
export interface EnsembleCacheRow extends EnsembleSpread {
  /** Location the spread was fetched for, rounded to ~1 km. */
  lat: number;
  lon: number;
}

interface EnsembleCacheFile {
  version: 1;
  rows: EnsembleCacheRow[];
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidPoint(value: unknown): value is EnsembleSpreadPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<EnsembleSpreadPoint>;
  return (
    typeof point.time === 'string' &&
    typeof point.tP10 === 'number' &&
    typeof point.tMedian === 'number' &&
    typeof point.tP90 === 'number' &&
    typeof point.rainProb === 'number'
  );
}

function isValidRow(value: unknown): value is EnsembleCacheRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<EnsembleCacheRow>;
  return (
    typeof row.lat === 'number' &&
    typeof row.lon === 'number' &&
    typeof row.fetchedAt === 'number' &&
    typeof row.members === 'number' &&
    Array.isArray(row.points) &&
    row.points.length > 0 &&
    row.points.every(isValidPoint)
  );
}

async function loadAllRows(): Promise<EnsembleCacheRow[]> {
  try {
    const raw = await AsyncStorage.getItem(ENSEMBLE_CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];
    const file = parsed as Partial<EnsembleCacheFile>;
    if (file.version !== 1 || !Array.isArray(file.rows)) return [];
    return file.rows.filter(isValidRow).sort((a, b) => a.fetchedAt - b.fetchedAt);
  } catch {
    return [];
  }
}

/**
 * Cached spread for this location. A row older than ENSEMBLE_TTL_MS is still
 * returned (stale band beats no band) - the caller decides whether to refetch.
 */
export async function loadEnsembleCache(lat: number, lon: number): Promise<EnsembleCacheRow | null> {
  const rows = await loadAllRows();
  const match = rows.find(
    (row) => rounded(row.lat) === rounded(lat) && rounded(row.lon) === rounded(lon),
  );
  return match ?? null;
}

/** True when the row is fresh enough that no refetch is needed. */
export function isEnsembleFresh(row: EnsembleCacheRow): boolean {
  return Date.now() - row.fetchedAt < ENSEMBLE_TTL_MS;
}

/**
 * Persists a successful fetch, capped at MAX_CACHED_LOCATIONS by dropping the
 * oldest rows. Fire-and-forget: callers do not await this, it must never throw.
 */
export async function saveEnsembleCache(lat: number, lon: number, spread: EnsembleSpread): Promise<void> {
  try {
    const rows = await loadAllRows();
    const filtered = rows.filter(
      (row) => rounded(row.lat) !== rounded(lat) || rounded(row.lon) !== rounded(lon),
    );
    filtered.push({ ...spread, lat: rounded(lat), lon: rounded(lon) });
    while (filtered.length > MAX_CACHED_LOCATIONS) {
      filtered.shift();
    }
    const file: EnsembleCacheFile = { version: 1, rows: filtered };
    await AsyncStorage.setItem(ENSEMBLE_CACHE_KEY, JSON.stringify(file));
  } catch {
    // Non-critical: persistence failure must not break the fetch flow.
  }
}
