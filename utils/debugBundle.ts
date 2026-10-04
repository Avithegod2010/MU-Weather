import { File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import appJson from '../app.json';
import { loadComfortJournal } from './comfortJournal';
import { loadForecastLog } from './forecastLog';
import { loadModelLog, roundedCoord } from './modelAccuracyLog';
import { loadYearRows } from './yearLog';
import { loadWidgetCities } from './widgetCityConfig';
import { loadAlertHistory } from './alertHistory';
import { loadAlertSettings } from './fireAlertNotifications';
import { isAnyRuleEnabled, DEFAULT_ALERT_SETTINGS, type AlertSettings } from './alertRules';
import { loadLastWeather } from './storage';
import { getLanguage, LANGUAGES } from './i18n';
import { SETTINGS_KEY } from '../hooks/useDigest';
import * as Notifications from './notifications';

/**
 * A hand-written diagnostics report the user can attach to a bug report.
 *
 * No telemetry and no account: it is built on the device, written to the cache
 * directory and handed to the share sheet, so it only goes where the user sends
 * it.
 *
 * WHAT IS REDACTED, deliberately:
 * - coordinates are rounded to two decimals (~1 km, the app's own caching
 *   granularity) instead of dropped, because "which city" is exactly what a
 *   weather bug depends on;
 * - custom-alert notes and comfort-journal ratings are never included - that is
 *   free text and opinions the user wrote, not diagnostics;
 * - no identifiers and nothing from outside the device - the app has none.
 *
 * Plain text, sections in a fixed order, so it is readable before sharing.
 */

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Counts and health checks, one line each. Never throws. */
async function collectSections(): Promise<string[]> {
  const lines: string[] = [];
  const add = (section: string, body: string[]) => {
    lines.push('', `[${section}]`, ...body);
  };

  // Settings, straight from the stored blob (key reused from useDigest).
  let settings: Record<string, unknown> = {};
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    settings = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    settings = {};
  }
  add('app', [
    `version: ${appJson.expo.version} (versionCode ${String(appJson.expo.android?.versionCode ?? 'remote')})`,
    `platform: ${Platform.OS} ${Platform.Version}`,
    `language: ${getLanguage()} of ${LANGUAGES.length}`,
    `settings keys present: ${Object.keys(settings).length}`,
    `units (temp/wind/precip): ${String(settings.tempUnit)} / ${String(settings.windUnit)} / ${String(settings.precipUnit)}`,
    `theme: ${String(settings.colorTheme)} (${String(settings.themeMode)}), density ${String(settings.layoutDensity)}`,
    `tiles hidden: ${Array.isArray(settings.hiddenTiles) ? settings.hiddenTiles.length : 0}`,
    `weather accent: ${settings.weatherAccentEnabled === true ? 'on' : 'off'}`,
    `sunrise alarm: ${settings.sunriseAlarmEnabled === true ? `on, ${String(settings.sunriseAlarmOffsetMin)} min before` : 'off'}`,
    `rain status notification: ${settings.rainOngoingEnabled === true ? 'on' : 'off'}`,
    `digest: ${settings.digestEnabled === true ? `on, hour ${String(settings.digestHour)}` : 'off'}`,
  ]);

  // Active location, rounded on purpose.
  let bundle = null;
  try {
    bundle = await loadLastWeather();
  } catch {
    bundle = null;
  }
  const location = bundle?.location;
  add('location', [
    `city: ${location?.name ?? 'none stored'}`,
    location
      ? `coords: ${roundedCoord(location.latitude)}, ${roundedCoord(location.longitude)} (rounded to ~1 km on purpose)`
      : 'coords: none stored',
    bundle
      ? `cached bundle age: ${Math.max(0, Math.round((Date.now() - bundle.fetchedAt) / 60000))} min`
      : 'cached bundle: none',
  ]);
// Notifications and alert configuration.
  let permission = 'unavailable';
  try {
    permission = (await Notifications.getPermissionsAsync()).status;
  } catch {
    permission = 'unavailable';
  }
  let ruleSummary = 'unreadable';
  let quietSummary = 'unreadable';
  try {
    // loadAlertSettings returns a partial (corrupt or partial blob) - fill the
    // defaults so the rule scan and the quiet-hours line read the same shape the
    // app itself uses.
    const stored: AlertSettings = { ...DEFAULT_ALERT_SETTINGS, ...(await loadAlertSettings()) };
    ruleSummary = isAnyRuleEnabled(stored) ? 'at least one enabled' : 'none enabled';
    quietSummary =
      stored.quietHoursEnabled === true
        ? `${minutesToClock(stored.quietStartMinutes)}-${minutesToClock(stored.quietEndMinutes)}`
        : 'off';
  } catch {
    // Keep the "unreadable" defaults: a corrupt blob is itself worth reporting.
  }
  add('notifications', [
    `permission: ${permission}`,
    `alert rules: ${ruleSummary}`,
    `quiet hours: ${quietSummary}`,
  ]);

  // On-device stores, for "why is my history empty" questions.
  const counts: string[] = [];
  const count = async (label: string, loader: () => Promise<unknown[]>) => {
    try {
      counts.push(`${label}: ${(await loader()).length}`);
    } catch {
      counts.push(`${label}: unreadable`);
    }
  };
  await count('comfort journal rows', () => loadComfortJournal());
  await count('forecast log rows', () => loadForecastLog());
  await count('model log rows', () => loadModelLog());
  await count('alert history rows', () => loadAlertHistory());
  await count('year review rows', () =>
    location ? loadYearRows(location.latitude, location.longitude) : Promise.resolve([]),
  );
  add('stored data', counts);

  // Widgets configured on this device.
  try {
    const cities = await loadWidgetCities();
    add('widgets', [
      `multi-city widgets configured: ${cities.length}`,
      `cities: ${cities.map((entry) => entry.city.name).join(', ') || 'none'}`,
    ]);
  } catch {
    add('widgets', ['widget city list unreadable']);
  }

  return lines;
}

/** Minutes-since-midnight as HH:MM for the quiet-hours line. */
function minutesToClock(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const total = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** The full report as plain text. Never throws; unreadable stores degrade to a note. */
export async function buildDiagnosticsReport(): Promise<string> {
  const header = [
    'MU Weather diagnostics report',
    `generated: ${new Date().toISOString()}`,
    'no telemetry, no identifiers, no user-written text',
    'coordinates are rounded to about 1 km',
  ];
  try {
    return [...header, ...(await collectSections())].join('\n');
  } catch {
    return [...header, '', '[diagnostics]', 'the report could not be collected on this device'].join('\n');
  }
}

/**
 * Writes the report to a dated file in the cache dir and returns its uri, or
 * null when the write failed (never throws).
 */
export async function writeDiagnosticsReport(): Promise<string | null> {
  try {
    const file = new File(Paths.cache, `mu-weather-diagnostics-${stamp()}.txt`);
    file.write(await buildDiagnosticsReport());
    return file.uri;
  } catch {
    return null;
  }
}