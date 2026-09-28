import AsyncStorage from '@react-native-async-storage/async-storage';

/** One hourly marine point we persist (JSON-safe). */
export interface MarineHourPoint {
  time: string;
  waveHeight: number | null;
  waveDirection: number | null;
  wavePeriod: number | null;
  swellHeight: number | null;
  swellDirection: number | null;
  swellPeriod: number | null;
  seaTemp: number | null;
}

/** One persisted per-location snapshot: current seas + 24 h outlook. */
export interface MarineCacheEntry {
  /** Location the snapshot was fetched for, rounded to ~1 km. */
  lat: number;
  lon: number;
  /** Epoch ms of the fetch — outlooks go stale, cache entries expire. */
  fetchedAt: number;
  waveHeight: number | null;
  waveDirection: number | null;
  wavePeriod: number | null;
  swellHeight: number | null;
  swellDirection: number | null;
  swellPeriod: number | null;
  seaTemp: number | null;
  /** Peak combined wave height in the next 24 h (null when no hourly data). */
  max24h: number | null;
  /** Hourly points kept for the outlook peak + future card use. */
  hours: MarineHourPoint[];
}

const MARINE_CACHE_KEY = '@mu_weather/marine_v1';
/** Cap on persisted locations; the oldest fetch is dropped when full. */
const MAX_CACHED_LOCATIONS = 8;
/**
 * Marine outlooks refresh 2× daily (DWD ICON Wave) and evolve slowly, so a
 * 6-hour TTL keeps the card fresh across the day with at most ~4 fetches —
 * cheap for a ~3 KB response, and a stale snapshot still beats no card.
 */
export const MARINE_TTL_MS = 6 * 60 * 60 * 1000;

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function toFiniteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isValidHour(value: unknown): value is MarineHourPoint {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (typeof row.time !== 'string') return false;
  const keys = [
    'waveHeight',
    'waveDirection',
    'wavePeriod',
    'swellHeight',
    'swellDirection',
    'swellPeriod',
    'seaTemp',
  ];
  for (const key of keys) {
    const v = row[key];
    if (v !== null && typeof v !== 'number') return false;
  }
  return true;
}

function isValidEntry(value: unknown): value is MarineCacheEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<MarineCacheEntry>;
  return (
    typeof row.lat === 'number' &&
    typeof row.lon === 'number' &&
    typeof row.fetchedAt === 'number' &&
    (row.waveHeight === null || typeof row.waveHeight === 'number') &&
    (row.waveDirection === null || typeof row.waveDirection === 'number') &&
    (row.wavePeriod === null || typeof row.wavePeriod === 'number') &&
    (row.swellHeight === null || typeof row.swellHeight === 'number') &&
    (row.swellDirection === null || typeof row.swellDirection === 'number') &&
    (row.swellPeriod === null || typeof row.swellPeriod === 'number') &&
    (row.seaTemp === null || typeof row.seaTemp === 'number') &&
    (row.max24h === null || typeof row.max24h === 'number') &&
    Array.isArray(row.hours) &&
    row.hours.every(isValidHour)
  );
}

interface MarineCacheFile {
  version: 1;
  rows: MarineCacheEntry[];
}

async function loadAllRows(): Promise<MarineCacheEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(MARINE_CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];
    const file = parsed as Partial<MarineCacheFile>;
    if (file.version !== 1 || !Array.isArray(file.rows)) return [];
    return file.rows.filter(isValidEntry).sort((a, b) => a.fetchedAt - b.fetchedAt);
  } catch {
    return [];
  }
}

/**
 * Fresh cached snapshot for this location, or null when absent, corrupt, for
 * a different place, or older than MARINE_TTL_MS. Stale rows are dropped, not
 * served: a 6-hour-old outlook may already mislead small craft.
 */
export async function loadMarineCache(lat: number, lon: number): Promise<MarineCacheEntry | null> {
  const rows = await loadAllRows();
  const match = rows.find(
    (row) => rounded(row.lat) === rounded(lat) && rounded(row.lon) === rounded(lon),
  );
  if (!match) return null;
  if (Date.now() - match.fetchedAt > MARINE_TTL_MS) return null;
  return match;
}

/**
 * Persists a successful fetch for this location, capped at
 * MAX_CACHED_LOCATIONS entries by dropping the oldest fetch. Inland
 * (null waveHeight) results are skipped so a landlocked visit can never hide
 * a later coastal one. Fire-and-forget: callers do not await this, so it must
 * never throw.
 */
export async function saveMarineCache(entry: MarineCacheEntry): Promise<void> {
  try {
    if (entry.waveHeight === null || !Number.isFinite(entry.waveHeight)) return;
    const rows = await loadAllRows();
    const filtered = rows.filter(
      (row) => rounded(row.lat) !== rounded(entry.lat) || rounded(row.lon) !== rounded(entry.lon),
    );
    filtered.push({ ...entry, lat: rounded(entry.lat), lon: rounded(entry.lon) });
    while (filtered.length > MAX_CACHED_LOCATIONS) {
      filtered.shift();
    }
    const file: MarineCacheFile = { version: 1, rows: filtered };
    await AsyncStorage.setItem(MARINE_CACHE_KEY, JSON.stringify(file));
  } catch {
    // Non-critical: persistence failure must not break the fetch flow.
  }
}

/** Test seam: build the entry the fetch layer would persist. */
export function buildMarineCacheEntry(
  lat: number,
  lon: number,
  current: {
    waveHeight: number | null;
    waveDirection: number | null;
    wavePeriod: number | null;
    swellHeight: number | null;
    swellDirection: number | null;
    swellPeriod: number | null;
    seaTemp: number | null;
  },
  hours: MarineHourPoint[],
  fetchedAt: number,
): MarineCacheEntry {
  const heights = hours.map((hour) => hour.waveHeight);
  const finite = heights.filter((value): value is number => value !== null);
  return {
    lat: rounded(lat),
    lon: rounded(lon),
    fetchedAt,
    waveHeight: current.waveHeight,
    waveDirection: current.waveDirection,
    wavePeriod: current.wavePeriod,
    swellHeight: current.swellHeight,
    swellDirection: current.swellDirection,
    swellPeriod: current.swellPeriod,
    seaTemp: current.seaTemp,
    max24h: finite.length ? Math.max(...finite) : null,
    hours,
  };
}

// Re-exported for the fetch layer's null-coalescing; keeps one converter.
export { toFiniteOrNull };
