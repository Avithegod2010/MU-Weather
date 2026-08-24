import * as Location from 'expo-location';
import type { GeoLocation } from '../api/types';

export class LocationPermissionError extends Error {
  constructor() {
    super('Location permission was not granted.');
    this.name = 'LocationPermissionError';
  }
}

export async function getCurrentLocation(): Promise<GeoLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new LocationPermissionError();
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const { latitude, longitude } = position.coords;

  let name = 'My Location';
  let admin1: string | undefined;
  let country: string | undefined;
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    const place = places[0];
    if (place) {
      name = place.city || place.district || place.region || place.name || 'My Location';
      admin1 = place.region ?? undefined;
      country = place.country ?? undefined;
    }
  } catch {
    // Reverse geocoding is best-effort only.
  }

  return { id: 'current', name, latitude, longitude, admin1, country };
}
