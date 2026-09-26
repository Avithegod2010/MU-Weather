import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from './notifications';
import { evaluateAlerts } from './alertRules';
import type { AlertExtras, AlertSettings, TriggeredAlert } from './alertRules';
import { computeNowcast } from './nowcast';
import { AURORA_LATITUDE_MIN, fetchAuroraMaxKp } from './aurora';
import { appendAlertHistory } from './alertHistory';
import type { WeatherBundle } from '../api/types';

export const ALERTS_STORAGE_KEY = '@mu_weather/alerts_v1';
const FIRED_KEY = '@mu_weather/alert_fired_v1';
export const COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * The cooldown blob is a read-modify-write with no AsyncStorage transaction:
 * the in-app refresh (current location) and the saved-city sweep both end in
 * `deliverAlerts`, so without serialization whichever write lands second wins -
 * alerts can re-fire and history rows (utils/alertHistory) can be lost. Every
 * caller queues on this chain, so one read-decide-write completes before the
 * next begins. All in-process callers share the single JS event loop, which
 * makes a promise chain a sufficient mutex here; a task running in a separate
 * JS context or process is not covered (the lock is per JS runtime, not a
 * cross-process lock).
 */
let firedChain: Promise<unknown> = Promise.resolve();

function withFiredLock<T>(task: () => Promise<T>): Promise<T> {
  const run = firedChain.then(task, task);
  firedChain = run.catch(() => undefined);
  return run;
}

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
export async function buildAlertExtras(
  settings: AlertSettings,
  data: WeatherBundle,
): Promise<AlertExtras> {
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

export interface DeliverAlertsOptions {
  /** City these alerts belong to - saved-city sweeps tag their rows with it. */
  city?: string;
  /** Cooldown namespace so one city's alert cannot silence another's. */
  cooldownPrefix?: string;
  /**
   * Rewrites the notification title only. Saved-city alerts prefix the city
   * name here; the history row keeps the plain title and carries the city
   * separately, so the city is never written twice.
   */
  titleFormatter?: (alert: TriggeredAlert) => string;
}

/**
 * Shared delivery path for every alert source (the active location and the
 * saved-city sweep): notification-permission gate, per-alert 6-hour cooldown,
 * local notification, and an entry in the in-app history (utils/alertHistory).
 *
 * Returns the alerts it was handed - callers use that for in-app banners - so
 * the delivery outcome never changes what the UI reports as active.
 */
export async function deliverAlerts(
  triggered: TriggeredAlert[],
  options: DeliverAlertsOptions = {},
): Promise<TriggeredAlert[]> {
  if (!triggered.length) return [];
  const { city, cooldownPrefix = '', titleFormatter } = options;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return triggered;
  await ensureChannel();

  await withFiredLock(async () => {
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
    const delivered: TriggeredAlert[] = [];
    let changed = false;
    for (const alert of triggered) {
      const cooldownKey = `${cooldownPrefix}${alert.key}`;
      const lastFired = fired[cooldownKey] ?? 0;
      if (now - lastFired < COOLDOWN_MS) continue;
      fired[cooldownKey] = now;
      changed = true;
      delivered.push(alert);
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: titleFormatter ? titleFormatter(alert) : alert.title,
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
      await appendAlertHistory(
        delivered.map((alert) => ({
          key: alert.key,
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
          city,
          at: now,
        })),
      );
    }
  });

  return triggered;
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
  return deliverAlerts(triggered, { city: data.location.name });
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
