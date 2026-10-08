import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WeatherBundle } from '../api/types';
import { fetchWeather } from '../api/openMeteo';
import { loadFavorites } from './favoritesStore';
import { loadWidgetCities } from './widgetCityConfig';

/**
 * Per-city weather snapshots for the multi-city home-screen widget.
 *
 * The main `@mu_weather/last_weather_v1` cache only ever holds the CURRENT
 * location, so a widget configured for a saved city has nothing to draw. The
 * background task already sweeps favorites for alerts, so it also writes a
 * compact snapshot per city here and the widget task reads the one matching
 * its configured city.
 *
 * Kept separate from utils/storage.ts on purpose: that module is the
 * current-location cache and its 24 h TTL is tuned for the home screen's
 * instant cold start, not for a widget that may be hours old.
 */

const CITY_SNAPSHOTS_KEY = '@mu_weather/city_snapshots_v1';

/** Widgets are redrawn on a 30-minute period; older than this is useless. */
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** How many cities to remember. Favorites lists are short; cap the storage. */
const MAX_SNAPSHOTS = 8;

/**
 * The subset of a bundle a widget actually draws. Storing the whole
 * WeatherBundle per city would be ~10x the bytes for data no widget reads.
 */
export interface CitySnapshot {
  cityId: string;
  cityName: string;
  latitude: number;
  longitude: number;
  temperature: number;
  weatherCode: number;
  tMax: number;
  tMin: number;
  precipProbabilityMax: number;
  precipSum: number;
  /** First few hours, trimmed to the fields the hourly strip renders. */
  hours: { time: string; temperature: number; precipProbability: number }[];
  /** US AQI for the chip, or null when the air-quality call failed. */
  usAqi: number | null;
  fetchedAt: number;
}

interface SnapshotFile {
  snapshots: CitySnapshot[];
}

function isValidSnapshot(value: unknown): value is CitySnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<CitySnapshot>;
  return (
    typeof row.cityId === 'string' &&
    typeof row.cityName === 'string' &&
    typeof row.temperature === 'number' &&
    Number.isFinite(row.temperature) &&
    typeof row.weatherCode === 'number' &&
    typeof row.fetchedAt === 'number' &&
    Number.isFinite(row.fetchedAt) &&
    Array.isArray(row.hours)
  );
}

function isFresh(snapshot: CitySnapshot, now: number): boolean {
  // Same defensive rule as the main cache: a future timestamp (clock change)
  // is accepted, a non-finite one is not.
  if (!Number.isFinite(snapshot.fetchedAt)) return false;
  return now - snapshot.fetchedAt <= SNAPSHOT_MAX_AGE_MS;
}

/** Build the compact per-city snapshot from a freshly fetched bundle. */
export function toCitySnapshot(bundle: WeatherBundle): CitySnapshot {
  const today = bundle.daily[0];
  return {
    cityId: bundle.location.id,
    cityName: bundle.location.name,
    latitude: bundle.location.latitude,
    longitude: bundle.location.longitude,
    temperature: bundle.current.temperature,
    weatherCode: bundle.current.weatherCode,
    tMax: today ? today.tMax : bundle.current.temperature,
    tMin: today ? today.tMin : bundle.current.temperature,
    precipProbabilityMax: today ? today.precipProbabilityMax : 0,
    precipSum: today ? today.precipSum : 0,
    hours: bundle.hourly.slice(0, 6).map((hour) => ({
      time: hour.time,
      temperature: hour.temperature,
      precipProbability: hour.precipProbability,
    })),
    usAqi: bundle.aqi?.usAqi ?? null,
    fetchedAt: bundle.fetchedAt,
  };
}

async function readFile(): Promise<CitySnapshot[]> {
  try {
    const raw = await AsyncStorage.getItem(CITY_SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];
    const file = parsed as Partial<SnapshotFile>;
    if (!Array.isArray(file.snapshots)) return [];
    return file.snapshots.filter(isValidSnapshot);
  } catch {
    return [];
  }
}

/**
 * All stored snapshots, freshest first, stale and malformed rows dropped.
 * Sorted by recency so the LRU trim keeps the cities most likely still placed.
 */
export async function loadCitySnapshots(): Promise<CitySnapshot[]> {
  const now = Date.now();
  const rows = (await readFile()).filter((row) => isFresh(row, now));
  return rows.sort((a, b) => b.fetchedAt - a.fetchedAt);
}

/** The freshest snapshot for one city, or null when absent or too old. */
export async function loadCitySnapshot(cityId: string): Promise<CitySnapshot | null> {
  if (!cityId) return null;
  const rows = await loadCitySnapshots();
  return rows.find((row) => row.cityId === cityId) ?? null;
}

/**
 * Upsert a city's snapshot and trim to {@link MAX_SNAPSHOTS}. Never throws -
 * a storage failure must not break the background alert sweep that calls it.
 */
export async function saveCitySnapshot(snapshot: CitySnapshot): Promise<void> {
  try {
    const existing = await readFile();
    const kept = existing.filter((row) => row.cityId !== snapshot.cityId);
    const next = [snapshot, ...kept].slice(0, MAX_SNAPSHOTS);
    await AsyncStorage.setItem(CITY_SNAPSHOTS_KEY, JSON.stringify({ snapshots: next }));
  } catch {
    // Non-critical: the widget falls back to its "no data" state.
  }
}

/**
 * The set of city ids some placed multi-city widget is currently showing.
 *
 * Empty when the user has never configured a city widget, which lets the
 * refresh path skip all extra network work for the common case of someone using
 * only the built-in widgets.
 */
export async function whichCityIdsAreShown(): Promise<Set<string>> {
  try {
    const configs = await loadWidgetCities();
    return new Set(configs.map((entry) => entry.city.id).filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

/** At most this many cities fetched per pass - each one is a full request. */
export const MAX_SNAPSHOT_REFRESHES = 3;

/**
 * Gate for the snapshot sweep. Both the app's refresh path and the 30-minute
 * background task call it, so it needs its own rate limit.
 */
const SNAPSHOT_SWEEP_TTL_MS = 60 * 60 * 1000;
const SNAPSHOT_SWEEP_KEY = '@mu_weather/city_snapshot_sweep_v1';

interface SweepState {
  at: number;
  next: number;
}

async function loadSweepState(): Promise<SweepState> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_SWEEP_KEY);
    if (!raw) return { at: 0, next: 0 };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'number' && Number.isFinite(parsed)) return { at: parsed, next: 0 };
    if (parsed && typeof parsed === 'object') {
      const state = parsed as Partial<SweepState>;
      return {
        at: typeof state.at === 'number' && Number.isFinite(state.at) ? state.at : 0,
        next:
          typeof state.next === 'number' && Number.isFinite(state.next) && state.next >= 0
            ? Math.floor(state.next)
            : 0,
      };
    }
    return { at: 0, next: 0 };
  } catch {
    return { at: 0, next: 0 };
  }
}

async function saveSweepState(state: SweepState): Promise<void> {
  try {
    await AsyncStorage.setItem(SNAPSHOT_SWEEP_KEY, JSON.stringify(state));
  } catch {
    // Non-critical bookkeeping.
  }
}

export interface SnapshotRefreshOptions {
  /**
   * Bundles the caller has ALREADY fetched this pass, so the sweep does not
   * spend a second request on them. Their cities are persisted for free.
   */
  alreadyFetched?: WeatherBundle[];
}

/**
 * Refresh stored snapshots for the saved cities that placed city widgets show.
 *
 * Deliberately independent of the saved-city ALERT sweep: that one is opt-in
 * (the `favorites` alert key) and rate-limited, so relying on it would leave
 * the widget with no data for anyone who has not enabled saved-city alerts.
 *
 * Rotation means a user with more cities than one pass covers still gets every
 * shown city refreshed eventually. Only cities a widget actually shows are
 * fetched, so users who never configured a city widget pay nothing.
 */
export async function refreshCitySnapshots(
  options: SnapshotRefreshOptions = {},
): Promise<number> {
  const { alreadyFetched = [] } = options;
  const wanted = await whichCityIdsAreShown();
  if (wanted.size === 0) return 0;

  // Persist anything the caller already paid for.
  let written = 0;
  const covered = new Set<string>();
  for (const bundle of alreadyFetched) {
    if (!wanted.has(bundle.location.id)) continue;
    await saveCitySnapshot(toCitySnapshot(bundle));
    covered.add(bundle.location.id);
    written += 1;
  }

  const pending = (await loadFavorites()).filter(
    (city) => wanted.has(city.id) && !covered.has(city.id),
  );
  if (pending.length === 0) return written;

  const sweep = await loadSweepState();
  if (sweep.at > 0 && Date.now() - sweep.at <= SNAPSHOT_SWEEP_TTL_MS) return written;

  // Rotate through the shown cities so none is starved by a long favorites list.
  const start = sweep.next % pending.length;
  const count = Math.min(MAX_SNAPSHOT_REFRESHES, pending.length);
  for (let index = 0; index < count; index += 1) {
    const city = pending[(start + index) % pending.length];
    try {
      const bundle = await fetchWeather(city);
      await saveCitySnapshot(toCitySnapshot(bundle));
      written += 1;
    } catch {
      // One unreachable city must never block the others.
    }
  }
  await saveSweepState({ at: Date.now(), next: (start + count) % pending.length });
  return written;
}