import type React from 'react';
import { registerWidgetTaskHandler, requestWidgetUpdate } from 'react-native-android-widget';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WeatherWidget, renderWeatherWidgetFromBundle } from '../components/WeatherWidget';
import { WeatherWidgetLarge, renderWeatherWidgetLargeFromBundle } from '../components/WeatherWidgetLarge';
import type { WeatherBundle } from '../api/types';

export const WEATHER_WIDGET_NAME = 'MUWeatherWidget';

export const WEATHER_WIDGET_NAME_LARGE = 'MUWeatherWidgetLarge';

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

const NO_DATA_PROPS = {
  hasData: false,
  temperature: '',
  conditionLabel: '',
  maxTemp: '',
  minTemp: '',
  rainChance: '',
  precipitation: '',
  updatedLabel: '',
};

async function renderFromCache(): Promise<React.JSX.Element> {
  const bundle = await loadCachedBundle();
  if (!bundle) {
    return <WeatherWidget {...NO_DATA_PROPS} />;
  }
  return renderWeatherWidgetFromBundle(bundle);
}

async function renderFromCacheLarge(): Promise<React.JSX.Element> {
  const bundle = await loadCachedBundle();
  if (!bundle) {
    return <WeatherWidgetLarge {...NO_DATA_PROPS} hours={[]} />;
  }
  return renderWeatherWidgetLargeFromBundle(bundle);
}

if (!globalScope.__muWidgetTaskDefined) {
  globalScope.__muWidgetTaskDefined = true;

  registerWidgetTaskHandler(async ({ widgetAction, widgetInfo, renderWidget }) => {
    if (widgetAction === 'WIDGET_DELETED') return;
    // WIDGET_ADDED / WIDGET_UPDATE / WIDGET_RESIZED all redraw from cache.
    // The handler is shared by both widget names - render the matching layout.
    renderWidget(
      await (widgetInfo.widgetName === WEATHER_WIDGET_NAME_LARGE
        ? renderFromCacheLarge()
        : renderFromCache())
    );
  });
}

/**
 * Redraw every placed widget (2x2 and 4x2) from the cached bundle. Called
 * whenever the app writes a fresh weather bundle, so the widgets always
 * mirror app data.
 */
export async function refreshWeatherWidgets(): Promise<void> {
  const updates = [
    { widgetName: WEATHER_WIDGET_NAME, renderWidget: renderFromCache },
    { widgetName: WEATHER_WIDGET_NAME_LARGE, renderWidget: renderFromCacheLarge },
  ].map(async ({ widgetName, renderWidget }) => {
    try {
      await requestWidgetUpdate({ widgetName, renderWidget });
    } catch {
      // Widget never added on the home screen, or native module absent (Expo Go) - non-critical.
    }
  });
  await Promise.allSettled(updates);
}
