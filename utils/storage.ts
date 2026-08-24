import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeoLocation } from '../api/types';

const LAST_LOCATION_KEY = '@mu_weather/last_location_v1';

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
