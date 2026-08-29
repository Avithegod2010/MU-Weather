import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeoLocation, WeatherBundle } from '../api/types';

const LAST_LOCATION_KEY = '@mu_weather/last_location_v1';
const LAST_WEATHER_KEY = '@mu_weather/last_weather_v1';

/** Cached weather older than this is useless even as a stale snapshot. */
const LAST_WEATHER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function loadLastLocation(): Promise<GeoLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number' &&
      typeof parsed.name === 'string'
    ) {
      return parsed as GeoLocation;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveLastLocation(location: GeoLocation): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(location));
  } catch {
    // Non-critical: persistence failure should not break the app.
  }
}

/**
 * Last successfully fetched weather, for instant cold-start rendering.
 * Returns null when absent, corrupt, from another shape, or older than 24 h.
 */
export async function loadLastWeather(): Promise<WeatherBundle | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_WEATHER_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const bundle = parsed as WeatherBundle;
    if (
      !bundle.location ||
      !bundle.current ||
      typeof bundle.current.temperature !== 'number' ||
      !Array.isArray(bundle.hourly) ||
      !Array.isArray(bundle.daily)
    ) {
      return null;
    }
    // `fetchedAt` is an epoch-milliseconds number in api/types.ts, so it is
    // JSON-safe and needs no Date revival; every other field is plain
    // strings, numbers, nulls and arrays of those.
    if (
      typeof bundle.fetchedAt !== 'number' ||
      !Number.isFinite(bundle.fetchedAt) ||
      Date.now() - bundle.fetchedAt > LAST_WEATHER_MAX_AGE_MS
    ) {
      return null;
    }
    return bundle;
  } catch {
    return null;
  }
}

export async function saveLastWeather(bundle: WeatherBundle): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_WEATHER_KEY, JSON.stringify(bundle));
  } catch {
    // Non-critical: persistence failure should not break the app.
  }
}
