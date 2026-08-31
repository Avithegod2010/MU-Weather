import type React from 'react';
import { registerWidgetTaskHandler, requestWidgetUpdate } from 'react-native-android-widget';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WeatherWidget, renderWeatherWidgetFromBundle } from '../components/WeatherWidget';
import type { WeatherBundle } from '../api/types';

export const WEATHER_WIDGET_NAME = 'MUWeatherWidget';

const WEATHER_CACHE_KEY = '@mu_weather/last_weather_v1';

// Guard against duplicate registration during Fast Refresh.
const globalScope = globalThis as typeof globalThis & { __muWidgetTaskDefined?: boolean };

async function loadCachedBundle(): Promise<WeatherBundle | null> {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeatherBundle;
    // Refuse caches older than 12 h - better a placeholder than stale weather.
    if (!parsed || typeof parsed.fetchedAt !== 'number') return null;
    if (Date.now() - parsed.fetchedAt > 12 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function renderFromCache(): Promise<React.JSX.Element> {
  const bundle = await loadCachedBundle();
  if (!bundle) {
    return <WeatherWidget hasData={false} temperature="" conditionLabel="" maxTemp="" minTemp="" rainChance="" precipitation="" updatedLabel="" />;
  }
  return renderWeatherWidgetFromBundle(bundle);
}

if (!globalScope.__muWidgetTaskDefined) {
  globalScope.__muWidgetTaskDefined = true;

  registerWidgetTaskHandler(async ({ widgetAction, renderWidget }) => {
    if (widgetAction === 'WIDGET_DELETED') return;
    // WIDGET_ADDED / WIDGET_UPDATE / WIDGET_RESIZED all redraw from cache.
    renderWidget(await renderFromCache());
  });
}

/**
 * Redraw every placed widget from the cached bundle. Called whenever the app
 * writes a fresh weather bundle, so the widget always mirrors app data.
 */
export async function refreshWeatherWidgets(): Promise<void> {
  try {
    await requestWidgetUpdate({
      widgetName: WEATHER_WIDGET_NAME,
      renderWidget: renderFromCache,
    });
  } catch {
    // Widget never added on the home screen, or native module absent (Expo Go) - non-critical.
  }
}
