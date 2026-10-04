import type React from 'react';
import { registerWidgetTaskHandler, requestWidgetUpdate, requestWidgetUpdateById } from 'react-native-android-widget';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as IntentLauncher from 'expo-intent-launcher';
import { WeatherWidget, renderWeatherWidgetFromBundle } from '../components/WeatherWidget';
import { WeatherWidgetLarge, renderWeatherWidgetLargeFromBundle } from '../components/WeatherWidgetLarge';
import {
  WeatherWidgetDashboard,
  renderWeatherWidgetDashboardFromBundle,
} from '../components/WeatherWidgetDashboard';
import {
  renderCityWidgetFromSnapshot,
  renderCityWidgetNoData,
  renderCityWidgetUnconfigured,
} from '../components/WeatherWidgetCity';
import { loadCitySnapshot } from '../utils/citySnapshots';
import { stampWidgetRendered } from '../utils/widgetPresence';
import { loadWidgetCity, loadWidgetCities } from '../utils/widgetCityConfig';
import type { WeatherBundle } from '../api/types';

export const WEATHER_WIDGET_NAME = 'MUWeatherWidget';

export const WEATHER_WIDGET_NAME_LARGE = 'MUWeatherWidgetLarge';

export const WEATHER_WIDGET_NAME_DASHBOARD = 'MUWeatherWidgetDashboard';

export const WEATHER_WIDGET_NAME_CITY = 'MUWeatherWidgetCity';

const WEATHER_CACHE_KEY = '@mu_weather/last_weather_v1';

const APP_PACKAGE = 'com.avithegod.muweather';

/**
 * Android's FLAG_ACTIVITY_NEW_TASK (0x10000000) - startActivityAsync runs
 * outside any activity context, so the flag is mandatory or Android throws.
 * The library exports no constant for it, hence the literal.
 */
const FLAG_ACTIVITY_NEW_TASK = 0x10000000;

/**
 * Widget hour-cell taps arrive here as a `WIDGET_CLICK` with clickAction
 * `openHour` and data {time}. We launch MainActivity explicitly (same pattern
 * as the static app shortcuts - no intent-filter needed in the manifest) with
 * a muweather://hour/<ISO> data URI; HomeScreen parses it and focuses the
 * matching hour in the hourly forecast.
 */
async function openHourDeepLink(time: unknown): Promise<void> {
  if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)) return;
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: `muweather://hour/${time}`,
      packageName: APP_PACKAGE,
      className: `${APP_PACKAGE}.MainActivity`,
      flags: FLAG_ACTIVITY_NEW_TASK,
    });
  } catch {
    // App launch failure is non-critical - the widget stays usable.
  }
}

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
  stale: false,
};

const DASHBOARD_NO_DATA_PROPS = {
  hasData: false,
  cityName: '',
  temperature: '',
  conditionLabel: '',
  maxTemp: '',
  minTemp: '',
  rainChance: '',
  precipitation: '',
  updatedLabel: '',
  clockLabel: '',
  aqiLabel: '',
  aqiColor: null,
  stale: false,
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

async function renderFromCacheDashboard(): Promise<React.JSX.Element> {
  const bundle = await loadCachedBundle();
  if (!bundle) {
    return <WeatherWidgetDashboard {...DASHBOARD_NO_DATA_PROPS} hours={[]} days={[]} />;
  }
  return renderWeatherWidgetDashboardFromBundle(bundle);
}

/**
 * Redraw ONE multi-city widget instance.
 *
 * The per-instance path is necessary because each placed widget shows a
 * different city, so a name-only `requestWidgetUpdate` (which would redraw every
 * instance identically) cannot be used here.
 */
export async function renderCityWidgetInstance(widgetId: number): Promise<React.JSX.Element> {
  const city = await loadWidgetCity(widgetId);
  if (!city) return renderCityWidgetUnconfigured();
  const snapshot = await loadCitySnapshot(city.id);
  return snapshot ? renderCityWidgetFromSnapshot(snapshot) : renderCityWidgetNoData();
}

if (!globalScope.__muWidgetTaskDefined) {
  globalScope.__muWidgetTaskDefined = true;

  registerWidgetTaskHandler(async ({ widgetAction, renderWidget, widgetInfo, clickAction, clickActionData }) => {
    if (widgetAction === 'WIDGET_DELETED') return;
    // Hour-cell taps: launch the app focused on the tapped hour (see
    // openHourDeepLink). Other click actions fall through unused for now.
    if (widgetAction === 'WIDGET_CLICK') {
      if (clickAction === 'openHour') {
        void openHourDeepLink(clickActionData?.time);
      }
      return;
    }
    // WIDGET_ADDED / WIDGET_UPDATE / WIDGET_RESIZED all redraw from cache.
    // The handler is shared by all three widget names - render the matching
    // layout for whichever one fired.
    // Stamp "a widget rendered" first: the SYSTEM only invokes this handler
    // while a widget is placed, so a recent stamp is the app's only signal
    // (the library exposes no placed-widget state) that widgets are in use
    // and the background task should keep the bundle fresh for them.
    void stampWidgetRendered(widgetInfo.widgetName);
    if (widgetInfo.widgetName === WEATHER_WIDGET_NAME_LARGE) {
      renderWidget(await renderFromCacheLarge());
      return;
    }
    if (widgetInfo.widgetName === WEATHER_WIDGET_NAME_DASHBOARD) {
      renderWidget(await renderFromCacheDashboard());
      return;
    }
    if (widgetInfo.widgetName === WEATHER_WIDGET_NAME_CITY) {
      // Per-instance: each city widget resolves its own configured city.
      renderWidget(await renderCityWidgetInstance(widgetInfo.widgetId));
      return;
    }
    renderWidget(await renderFromCache());
  });
}

/**
 * Redraw every placed widget from the cached bundle. Called whenever the app
 * writes a fresh weather bundle, so the widgets always mirror app data.
 *
 * The multi-city widget is redrawn PER INSTANCE (each shows a different city),
 * so it is handled separately from the name-keyed updates below.
 */
export async function refreshWeatherWidgets(): Promise<void> {
  const updates = [
    { widgetName: WEATHER_WIDGET_NAME, renderWidget: renderFromCache },
    { widgetName: WEATHER_WIDGET_NAME_LARGE, renderWidget: renderFromCacheLarge },
    { widgetName: WEATHER_WIDGET_NAME_DASHBOARD, renderWidget: renderFromCacheDashboard },
  ].map(async ({ widgetName, renderWidget }) => {
    try {
      await requestWidgetUpdate({ widgetName, renderWidget });
    } catch {
      // Widget never added on the home screen, or native module absent (Expo Go) - non-critical.
    }
  });
  await Promise.allSettled(updates);
  await refreshCityWidgets();
}

/**
 * Redraw every placed multi-city widget instance from its own city's snapshot.
 * Instances with no stored city or no fresh snapshot render their placeholder.
 */
export async function refreshCityWidgets(): Promise<void> {
  try {
    const configs = await loadWidgetCities();
    await Promise.allSettled(
      configs.map(async ({ widgetId }) => {
        try {
          await requestWidgetUpdateById({
            widgetName: WEATHER_WIDGET_NAME_CITY,
            widgetId,
            renderWidget: () => renderCityWidgetInstance(widgetId),
          });
        } catch {
          // That instance was removed from the home screen - non-critical.
        }
      }),
    );
  } catch {
    // Native module absent (Expo Go) - non-critical.
  }
}
