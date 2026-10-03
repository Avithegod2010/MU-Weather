import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from './notifications';
import {
  DEFAULT_QUIET_END_MINUTES,
  DEFAULT_QUIET_START_MINUTES,
  evaluateAlerts,
  isInsideQuietWindow,
} from './alertRules';
import type { AlertExtras, AlertSettings, TriggeredAlert } from './alertRules';
import { computeNowcast } from './nowcast';
import { AURORA_LATITUDE_MIN, fetchAuroraMaxKp } from './aurora';
import { appendAlertHistory } from './alertHistory';
import { getLanguage, t } from './i18n';
import type { WeatherBundle } from '../api/types';

export const ALERTS_STORAGE_KEY = '@mu_weather/alerts_v1';
const FIRED_KEY = '@mu_weather/alert_fired_v1';
export const COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * Notification action buttons ("Snooze 1 h" / "Dismiss"), rendered natively on
 * Android from this category. The identifier deliberately avoids ":" and "-" -
 * the installed SDK docs warn that categories misbehave with those characters.
 */
export const WEATHER_ALERT_CATEGORY = 'weather_alert';
export const SNOOZE_ACTION = 'snooze';
export const DISMISS_ACTION = 'dismiss';
/** Snooze window: exactly 1 h of quiet from the tap. */
const SNOOZE_MS = 60 * 60 * 1000;

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
 * The language whose button titles are currently registered. The category is
 * recreated whenever this drifts from the runtime language, so the buttons on
 * the notification follow the app language - the background task restores the
 * stored language BEFORE firing, which stamps the right titles here too.
 */
let categoryLanguage: string | null = null;

/**
 * Register (or re-register) the weather-alert category. Idempotent per
 * language: a second call with the same language is a cheap no-op, and the
 * stamp is only set on success so a failed attempt retries on the next call.
 */
export async function ensureWeatherAlertCategory(): Promise<void> {
  const language = getLanguage();
  if (categoryLanguage === language) return;
  try {
    await Notifications.setNotificationCategoryAsync(WEATHER_ALERT_CATEGORY, [
      {
        identifier: SNOOZE_ACTION,
        buttonTitle: t('notif_action_snooze'),
        options: { opensAppToForeground: true },
      },
      {
        identifier: DISMISS_ACTION,
        buttonTitle: t('notif_action_dismiss'),
        options: { isDestructive: false, opensAppToForeground: true },
      },
    ]);
    categoryLanguage = language;
  } catch {
    // Categories unsupported in this environment - alerts simply show without
    // the action buttons. Best-effort, never crash.
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
 * Quiet hours (alert-settings blob) skip the NOTIFICATION while the device
 * clock is inside the window - the alert itself is still stamped in the
 * cooldown map and appended to the history, so quiet means no notification,
 * not no alert. The daily digest (hooks/useDigest) schedules its own
 * notification on a separate path and is deliberately not gated here.
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
  // Action buttons ("Snooze 1 h" / "Dismiss"): language-aware and idempotent,
  // so a stored-language change re-registers the category before delivering.
  await ensureWeatherAlertCategory();

  // The quiet-hours settings live in the same blob every source shares, so one
  // read here covers the active city, the saved-city sweep and the background
  // task without new plumbing through DeliverAlertsOptions.
  const stored = await loadAlertSettings();
  const quietStart =
    typeof stored.quietStartMinutes === 'number'
      ? stored.quietStartMinutes
      : DEFAULT_QUIET_START_MINUTES;
  const quietEnd =
    typeof stored.quietEndMinutes === 'number'
      ? stored.quietEndMinutes
      : DEFAULT_QUIET_END_MINUTES;
  const localNow = new Date();
  const inQuietHours =
    stored.quietHoursEnabled === true &&
    isInsideQuietWindow(
      localNow.getHours() * 60 + localNow.getMinutes(),
      quietStart,
      quietEnd,
    );

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
      // Quiet hours silence the notification only - the cooldown stamp and the
      // history row below still happen, so a suppressed alert is never
      // re-recorded on the next refresh and stays visible in the Alerts screen.
      if (!inQuietHours) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: titleFormatter ? titleFormatter(alert) : alert.title,
              body: alert.message,
              sound: alert.severity === 'severe',
              categoryIdentifier: WEATHER_ALERT_CATEGORY,
              // The response only knows the notification identifier - the
              // cooldown key (city prefix included) rides in `data` so the
              // snooze action can target exactly this alert.
              data: { alertKey: cooldownKey },
            },
            trigger: null,
          });
        } catch {
          // Delivery is best-effort.
        }
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

/**
 * Snooze one alert key for ~1 hour: the next evaluation cannot re-fire it
 * before then. The cooldown check is `now - lastFired < COOLDOWN_MS`, so the
 * timestamp that gives exactly SNOOZE_MS of quiet from the tap is
 * `now - COOLDOWN_MS + SNOOZE_MS` - a naive future timestamp (now + SNOOZE_MS)
 * would instead silence the alert for ~7 h (the remaining 6 h plus the 1 h).
 * Written through the same withFiredLock mutex as the cooldown stamps.
 */
export async function snoozeAlert(alertKey: string): Promise<void> {
  await withFiredLock(async () => {
    let fired: Record<string, number> = {};
    try {
      const raw = await AsyncStorage.getItem(FIRED_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') fired = parsed;
      }
    } catch {
      // Corrupt cooldown map: start fresh - the snooze still applies.
    }
    fired[alertKey] = Date.now() - COOLDOWN_MS + SNOOZE_MS;
    try {
      await AsyncStorage.setItem(FIRED_KEY, JSON.stringify(fired));
    } catch {
      // Non-critical bookkeeping.
    }
  });
}

/**
 * One tap can be surfaced twice (the live response listener and the cold-start
 * last-response path can both see it), so each response signature is handled
 * once per session.
 */
const handledResponses = new Set<string>();

/**
 * Responses to the weather-alert action buttons. The notification carries the
 * alert's cooldown key in its `data` (the response itself only knows the
 * notification identifier), so the snooze targets exactly that key - active
 * city and saved cities alike, because the stored key includes the city
 * prefix. Dismiss only acknowledges: nothing is written, the normal 6-hour
 * cooldown already prevents an immediate re-fire.
 */
export function handleWeatherAlertAction(
  actionIdentifier: string,
  data: Record<string, unknown> | undefined,
  notificationIdentifier: string,
): void {
  if (actionIdentifier !== SNOOZE_ACTION && actionIdentifier !== DISMISS_ACTION) return;
  const signature = `${actionIdentifier}:${notificationIdentifier}`;
  if (handledResponses.has(signature)) return;
  handledResponses.add(signature);
  if (handledResponses.size > 50) {
    // Bounded: drop the oldest signature so the set cannot grow without end.
    const oldest = handledResponses.values().next();
    if (oldest.done !== true) handledResponses.delete(oldest.value);
  }
  if (actionIdentifier === SNOOZE_ACTION) {
    const alertKey = data && typeof data.alertKey === 'string' ? data.alertKey : null;
    if (alertKey) void snoozeAlert(alertKey);
  }
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
