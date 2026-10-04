import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationRecords, RecordDay } from '../api/providers';
import { roundedCoord } from './modelAccuracyLog';

/**
 * Persisted snapshot of the record-breaking archive window.
 *
 * Same idiom as utils/pastDaysCache: one key, one bucket per location rounded
 * to ~1 km, LRU over locations, full validation on load. The window is days of
 * settled ERA5 data with a one-day TTL - yesterday's rows can still be revised
 * by the archive, so the card refreshes daily rather than freezing a snapshot
 * for a month.
 */

const RECORDS_CACHE_KEY = '@mu_weather/records_cache_v1';
/** Yesterday at the earliest; earlier than that the rows cannot change. */
const RECORDS_TTL_MS = 24 * 60 * 60 * 1000;
/** Locations kept; the least recently fetched is dropped when full. */
const MAX_LOCATIONS = 8;
/** ~7 years of daily rows; anything longer is dropped at the tail. */
const MAX_ROWS = 2600;

interface RecordsBucket {
  lat: number;
  lon: number;
  fetchedAt: number;
  from: string;
  to: string;
  rows: RecordDay[];
}

interface RecordsCacheFile {
  version: 1;
  buckets: RecordsBucket[];
}

function isValidRow(value: unknown): value is RecordDay {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<RecordDay>;
  return (
    typeof row.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    typeof row.tMax === 'number' &&
    Number.isFinite(row.tMax) &&
    typeof row.precipSum === 'number' &&
    Number.isFinite(row.precipSum) &&
    (row.windMax === null || row.windMax === undefined || typeof row.windMax === 'number')
  );
}

function isValidBucket(value: unknown): value is RecordsBucket {
  if (!value || typeof value !== 'object') return false;
  const bucket = value as Partial<RecordsBucket>;
  return (
    typeof bucket.lat === 'number' &&
    Number.isFinite(bucket.lat) &&
    typeof bucket.lon === 'number' &&
    Number.isFinite(bucket.lon) &&
    typeof bucket.fetchedAt === 'number' &&
    Number.isFinite(bucket.fetchedAt) &&
    typeof bucket.from === 'string' &&
    typeof bucket.to === 'string' &&
    Array.isArray(bucket.rows) &&
    bucket.rows.length > 0 &&
    bucket.rows.every(isValidRow)
  );
}

async function readFile(): Promise<RecordsCacheFile> {
  try {
    const raw = await AsyncStorage.getItem(RECORDS_CACHE_KEY);
    if (!raw) return { version: 1, buckets: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { version: 1, buckets: [] };
    const file = parsed as Partial<RecordsCacheFile>;
    if (file.version !== 1 || !Array.isArray(file.buckets)) return { version: 1, buckets: [] };
    return { version: 1, buckets: file.buckets.filter(isValidBucket) };
  } catch {
    return { version: 1, buckets: [] };
  }
}

function toRecords(bucket: RecordsBucket): LocationRecords {
  return {
    from: bucket.from,
    to: bucket.to,
    rows: bucket.rows
      .filter(isValidRow)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  };
}

/** Cached snapshot for this location, or null when absent, stale or corrupt. */
export async function loadRecordsCache(
  lat: number,
  lon: number,
): Promise<LocationRecords | null> {
  const file = await readFile();
  const bucket = file.buckets.find(
    (b) => b.lat === roundedCoord(lat) && b.lon === roundedCoord(lon),
  );
  if (!bucket) return null;
  if (Date.now() - bucket.fetchedAt > RECORDS_TTL_MS) return null;
  return toRecords(bucket);
}

/** Persists a successful fetch, keeping the LRU over locations. */
export async function saveRecordsCache(
  lat: number,
  lon: number,
  records: LocationRecords,
): Promise<void> {
  try {
    const file = await readFile();
    const roundedLat = roundedCoord(lat);
    const roundedLon = roundedCoord(lon);
    const bucket: RecordsBucket = {
      lat: roundedLat,
      lon: roundedLon,
      fetchedAt: Date.now(),
      from: records.from,
      to: records.to,
      rows: [...records.rows]
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .slice(-MAX_ROWS),
    };
    const buckets = [
      bucket,
      ...file.buckets.filter((b) => !(b.lat === roundedLat && b.lon === roundedLon)),
    ]
      .sort((a, b) => b.fetchedAt - a.fetchedAt)
      .slice(0, MAX_LOCATIONS);
    await AsyncStorage.setItem(RECORDS_CACHE_KEY, JSON.stringify({ version: 1, buckets }));
  } catch {
    // Non-critical: a failed cache write only costs one extra fetch.
  }
}