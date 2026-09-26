import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeoLocation } from '../api/types';

/**
 * Saved cities ("favorites"). Extracted from hooks/useFavorites so non-React
 * code - the background alert sweep - can read the same list without
 * duplicating the storage key or the shape validation.
 */
export const FAVORITES_KEY = '@mu_weather/favorites_v1';

function isValidLocation(value: unknown): value is GeoLocation {
  if (!value || typeof value !== 'object') return false;
  const location = value as Partial<GeoLocation>;
  return (
    typeof location.id === 'string' &&
    typeof location.name === 'string' &&
    typeof location.latitude === 'number' &&
    Number.isFinite(location.latitude) &&
    typeof location.longitude === 'number' &&
    Number.isFinite(location.longitude)
  );
}

/** Saved cities in insertion order. Empty when absent or corrupt. */
export async function loadFavorites(): Promise<GeoLocation[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidLocation);
  } catch {
    return [];
  }
}

export async function saveFavorites(list: GeoLocation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  } catch {
    // Storage full or unavailable: the caller keeps its in-memory state.
  }
}
