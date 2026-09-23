import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from './notifications';
import { evaluateAlerts } from './alertRules';
import type { AlertExtras, AlertSettings, TriggeredAlert } from './alertRules';
import { computeNowcast } from './nowcast';
import { AURORA_LATITUDE_MIN, fetchAuroraMaxKp } from './aurora';
import type { WeatherBundle } from '../api/types';

export const ALERTS_STORAGE_KEY = '@mu_weather/alerts_v1';
const FIRED_KEY = '@mu_weather/alert_fired_v1';
export const COOLDOWN_MS = 6 * 60 * 60 * 1000;

export async function ensureChannel(): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync('weather-alerts', {
      name: 'Weather alerts',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#3D6FD8',
    });
  } catch {
    // Channel creation is best-effort.
  }
}

/**
 * Evaluate alert rules against fresh weather data and fire notifications for
 * anything whose cooldown has expired. Shared by the in-app refresh flow AND
 * the background task so both behave identically.
 *
 * Rules that need live fetches or data outside WeatherBundle (rain easing,
 * aurora) are materialized here first; evaluateAlerts itself stays synchronous
 * and side-effect free so it can be called from anywhere.
 *
 * Returns the triggered alerts (for in-app banners) regardless of delivery.
 */
/**
 * Materialize the inputs the alert rules need but cannot derive synchronously:
 * the nowcast (rain easing) and the SWPC Kp outlook (aurora). The latitude gate
 * mirrors the Aurora card so a below-45° location never pays for the request.
 */
async function buildAlertExtras(settings: AlertSettings, data: WeatherBundle): Promise<AlertExtras> {
  const extras: AlertExtras = {};
  if (settings.raineasing) {
    extras.nowcast = computeNowcast(data.minutely);
  }
  if (settings.aurora && Math.abs(data.location.latitude) >= AURORA_LATITUDE_MIN) {
    const kpMax = await fetchAuroraMaxKp();
    if (kpMax !== null) extras.auroraKpMax = kpMax;
  }
  return extras;
}

export async function fireAlertNotifications(
  settings: AlertSettings,
  data: WeatherBundle,
): Promise<TriggeredAlert[]> {
  const extras = await buildAlertExtras(settings, data);
  const triggered = evaluateAlerts(
    settings,
    data.current,
    data.hourly,
    data.daily[0] ?? null,
    data.aqi,
    extras,
  );
  if (!triggered.length) return [];

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return triggered;
  await ensureChannel();

  let fired: Record<string, number> = {};
  try {
    const raw = await AsyncStorage.getItem(FIRED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') fired = parsed;
    }
  } catch {
    // Corrupt cooldown map: start fresh.
  }

  const now = Date.now();
  let changed = false;
  for (const alert of triggered) {
    const lastFired = fired[alert.key] ?? 0;
    if (now - lastFired < COOLDOWN_MS) continue;
    fired[alert.key] = now;
    changed = true;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: alert.title,
          body: alert.message,
          sound: alert.severity === 'severe',
        },
        trigger: null,
      });
    } catch {
      // Delivery is best-effort.
    }
  }

  if (changed) {
    try {
      await AsyncStorage.setItem(FIRED_KEY, JSON.stringify(fired));
    } catch {
      // Non-critical bookkeeping.
    }
  }

  return triggered;
}

export async function loadAlertSettings(): Promise<Partial<AlertSettings>> {
  try {
    const raw = await AsyncStorage.getItem(ALERTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...parsed };
      }
    }
  } catch {
    // Corrupt storage: caller falls back to defaults.
  }
  return {};
}
