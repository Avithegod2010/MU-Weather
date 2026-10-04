import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeoLocation } from '../api/types';

/**
 * Which saved city each multi-city widget instance shows.
 *
 * The library gives the configuration screen `widgetInfo.widgetId` and lets us
 * draw with `drawWidgetById`, but exposes no native per-instance storage, so we
 * keep the mapping here. Keyed by widgetId because a user may place several
 * city widgets pointing at different cities.
 */

const WIDGET_CITY_KEY = '@mu_weather/widget_cities_v1';

/** Cap so a user who reconfigures many times cannot grow this file forever. */
const MAX_ENTRIES = 16;

export interface WidgetCityConfig {
  widgetId: number;
  city: GeoLocation;
}

/** Exported for the backup/restore (utils/backup.ts) — reused, not duplicated. */
export function isValidEntry(value: unknown): value is WidgetCityConfig {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<WidgetCityConfig>;
  const city = entry.city as Partial<GeoLocation> | undefined;
  return (
    typeof entry.widgetId === 'number' &&
    Number.isFinite(entry.widgetId) &&
    !!city &&
    typeof city.id === 'string' &&
    typeof city.name === 'string' &&
    typeof city.latitude === 'number' &&
    Number.isFinite(city.latitude) &&
    typeof city.longitude === 'number' &&
    Number.isFinite(city.longitude)
  );
}

async function readAll(): Promise<WidgetCityConfig[]> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_CITY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
  } catch {
    return [];
  }
}

/** All per-widget city assignments, newest first. */
export async function loadWidgetCities(): Promise<WidgetCityConfig[]> {
  return readAll();
}

/** The city assigned to one widget instance, or null when unconfigured. */
export async function loadWidgetCity(widgetId: number): Promise<GeoLocation | null> {
  if (!Number.isFinite(widgetId) || widgetId < 0) return null;
  const rows = await readAll();
  return rows.find((row) => row.widgetId === widgetId)?.city ?? null;
}

/** Assign a city to a widget instance. Never throws. */
export async function saveWidgetCity(widgetId: number, city: GeoLocation): Promise<void> {
  try {
    if (!Number.isFinite(widgetId) || widgetId < 0) return;
    const existing = await readAll();
    const kept = existing.filter((row) => row.widgetId !== widgetId);
    const next = [{ widgetId, city }, ...kept].slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(WIDGET_CITY_KEY, JSON.stringify(next));
  } catch {
    // Non-critical: the widget falls back to its "not configured" state.
  }
}