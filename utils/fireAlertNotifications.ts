import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from './notifications';
import {
  DEFAULT_QUIET_END_MINUTES,
  DEFAULT_QUIET_START_MINUTES,
  evaluateAlerts,
  isInsideQuietWindow,
  localMinutesOfDay,
} from './alertRules';
import type { AlertExtras, AlertSettings, TriggeredAlert } from './alertRules';
import { evaluateCustomRules, loadCustomAlerts } from './customAlerts';
import { computeNowcast } from './nowcast';
import { AURORA_LATITUDE_MIN, fetchAuroraMaxKp } from './aurora';
import { appendAlertHistory, type AlertDeliveryStatus, type AlertHistoryEntry } from './alertHistory';
import { isAlertSeverityEscalation, normalizeFiredMap, shouldDeliverAlert } from './alertEscalation';
import { forecastAlertExpiresAt } from './alertValidity';
import type { AlertFireStamp } from './alertEscalation';
import { assessWeatherCacheFreshness, weatherLocationKey } from './freshnessPolicy';
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
 * Is the device clock inside the user's quiet window right now? Reads the same
 * alert-settings blob every notification path shares, so the alert pipeline,
 * the rain-nowcast hook and the golden-hour hook all obey one gate. Reuses
 * isInsideQuietWindow (the window may span midnight; start === end disables).
 * A failed read must never silence notifications.
 */
export async function isInQuietHoursNow(): Promise<boolean> {
  try {
    const stored = await loadAlertSettings();
    if (stored.quietHoursEnabled !== true) return false;
    const quietStart =
      typeof stored.quietStartMinutes === 'number'
        ? stored.quietStartMinutes
        : DEFAULT_QUIET_START_MINUTES;
    const quietEnd =
      typeof stored.quietEndMinutes === 'number'
        ? stored.quietEndMinutes
        : DEFAULT_QUIET_END_MINUTES;
    return isInsideQuietWindow(localMinutesOfDay(new Date()), quietStart, quietEnd);
  } catch {
    return false;
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
  /**
   * Cooldown override for this call (default COOLDOWN_MS = 6 h). The
   * saved-city sweep passes 12 h so background cities stay quieter than the
   * active location.
   */
  cooldownMs?: number;
  /** Provider IANA timezone used to derive a cited forecast window's expiry. */
  timezone?: string;
}

export interface AlertNotificationScheduleRequest {
  content: {
    title: string;
    body: string;
    sound: boolean;
    categoryIdentifier: string;
    data: Record<string, unknown>;
  };
  trigger: null;
}

/** Side-effect ports keep the real delivery flow deterministic in integration tests. */
export interface AlertDeliveryPorts {
  now?: () => number;
  getPermissionStatus?: () => Promise<string>;
  ensureChannel?: () => Promise<void>;
  ensureCategory?: () => Promise<void>;
  inQuietHours?: () => Promise<boolean>;
  loadFiredMap?: () => Promise<unknown>;
  saveFiredMap?: (fired: Record<string, AlertFireStamp>) => Promise<void>;
  scheduleNotification?: (request: AlertNotificationScheduleRequest) => Promise<unknown>;
  appendHistory?: (entries: AlertHistoryEntry[]) => Promise<void>;
}

/**
 * Shared delivery path for every alert source (the active location and the
 * saved-city sweep). Each cooldown-eligible alert gets an explicit local
 * history outcome: scheduled, quiet-hours suppression, permission suppression,
 * or scheduling failure. Permission/failure suppressions do not consume the
 * cooldown, allowing a later refresh to retry. Quiet-hours suppression does
 * consume it so the alert is not unexpectedly delivered after quiet hours.
 *
 * A successful Expo scheduling call means the app handed the notification to
 * the OS; it does not independently prove that the OS displayed it. The daily
 * digest is a separate path and remains deliberately outside this gate.
 *
 * Returns the alerts it was handed - callers use that for in-app banners - so
 * notification outcome never changes what the UI reports as active.
 */
export async function deliverAlerts(
  triggered: TriggeredAlert[],
  options: DeliverAlertsOptions = {},
  ports: AlertDeliveryPorts = {},
): Promise<TriggeredAlert[]> {
  if (!triggered.length) return [];
  const { city, cooldownPrefix = '', titleFormatter, cooldownMs = COOLDOWN_MS, timezone } = options;

  let permissionGranted = false;
  try {
    const status = ports.getPermissionStatus
      ? await ports.getPermissionStatus()
      : (await Notifications.getPermissionsAsync()).status;
    permissionGranted = status === 'granted';
  } catch {
    // Treat a permissions API failure as not granted; retain an explicit row.
  }
  if (permissionGranted) {
    await (ports.ensureChannel ?? ensureChannel)();
    // Action buttons ("Snooze 1 h" / "Dismiss"): language-aware and idempotent,
    // so a stored-language change re-registers the category before delivery.
    await (ports.ensureCategory ?? ensureWeatherAlertCategory)();
  }

  // Quiet hours share one gate with the notification pipeline. The daily
  // digest is a separate path and is deliberately not gated here.
  const inQuietHours = permissionGranted
    ? await (ports.inQuietHours ?? isInQuietHoursNow)()
    : false;

  await withFiredLock(async () => {
    let fired: Record<string, AlertFireStamp> = {};
    try {
      const raw = ports.loadFiredMap
        ? await ports.loadFiredMap()
        : await AsyncStorage.getItem(FIRED_KEY);
      fired = normalizeFiredMap(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
      // Corrupt cooldown map: start fresh.
    }

    const now = ports.now?.() ?? Date.now();
    const historyRows: {
      key: string;
      title: string;
      message: string;
      severity: TriggeredAlert['severity'];
      city?: string;
      at: number;
      evidence?: TriggeredAlert['evidence'];
      deliveryStatus: AlertDeliveryStatus;
      escalated: boolean;
      expiresAt?: number;
    }[] = [];
    let changed = false;

    for (const alert of triggered) {
      const cooldownKey = `${cooldownPrefix}${alert.key}`;
      const previous = fired[cooldownKey];
      if (!shouldDeliverAlert(now, previous, alert.severity, cooldownMs)) continue;
      const escalated = isAlertSeverityEscalation(previous?.severity, alert.severity);
      const expiresAt = alert.expiresAt ?? forecastAlertExpiresAt(alert.evidence, timezone) ?? undefined;
      let deliveryStatus: AlertDeliveryStatus;

      if (expiresAt !== undefined && expiresAt <= now) {
        // A forecast-backed alert that is already out of date must never be
        // scheduled retroactively. It does not consume the current alert key's
        // cooldown, so a newer forecast event can still notify normally.
        deliveryStatus = 'expired';
      } else if (!permissionGranted) {
        deliveryStatus = 'permission-denied';
      } else if (inQuietHours) {
        deliveryStatus = 'quiet-hours';
        fired[cooldownKey] = { at: now, severity: alert.severity };
        changed = true;
      } else {
        try {
          const request: AlertNotificationScheduleRequest = {
            content: {
              title: titleFormatter ? titleFormatter(alert) : alert.title,
              body: alert.message,
              sound: alert.severity === 'severe',
              categoryIdentifier: WEATHER_ALERT_CATEGORY,
              // The response only knows the notification identifier - the
              // cooldown key (city prefix included) rides in `data` so the
              // snooze action can target exactly this key.
              data: {
                alertKey: cooldownKey,
                ...(expiresAt !== undefined ? { alertExpiresAt: expiresAt } : {}),
              },
            },
            trigger: null,
          };
          if (ports.scheduleNotification) {
            await ports.scheduleNotification(request);
          } else {
            await Notifications.scheduleNotificationAsync(request);
          }
          deliveryStatus = 'scheduled';
          fired[cooldownKey] = { at: now, severity: alert.severity };
          changed = true;
        } catch {
          // Leave cooldown open so a later refresh can retry.
          deliveryStatus = 'scheduling-failed';
        }
      }

      historyRows.push({
        key: alert.key,
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        city,
        at: now,
        evidence: alert.evidence,
        deliveryStatus,
        escalated,
        ...(typeof expiresAt === 'number' && Number.isFinite(expiresAt)
          ? { expiresAt }
          : {}),
      });
    }

    if (changed) {
      try {
        if (ports.saveFiredMap) {
          await ports.saveFiredMap(fired);
        } else {
          await AsyncStorage.setItem(FIRED_KEY, JSON.stringify(fired));
        }
      } catch {
        // Non-critical bookkeeping.
      }
    }
    const appendHistory = ports.appendHistory ?? appendAlertHistory;
    await appendHistory(historyRows);
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
    let fired: Record<string, AlertFireStamp> = {};
    try {
      const raw = await AsyncStorage.getItem(FIRED_KEY);
      if (raw) fired = normalizeFiredMap(JSON.parse(raw));
    } catch {
      // Corrupt cooldown map: start fresh - the snooze still applies.
    }
    fired[alertKey] = { at: Date.now() - COOLDOWN_MS + SNOOZE_MS, severity: null };
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
  const locationId = weatherLocationKey(data.location.latitude, data.location.longitude);
  if (!locationId) return [];
  const freshness = assessWeatherCacheFreshness({
    snapshotLocationId: locationId,
    currentLocationId: locationId,
    fetchedAt: data.fetchedAt,
  });
  if (!freshness.alertsMayBeTreatedAsCurrent) return [];

  const extras = await buildAlertExtras(settings, data);
  const triggered = evaluateAlerts(
    settings,
    data.current,
    data.hourly,
    data.daily[0] ?? null,
    data.aqi,
    extras,
  );
  // Custom rules (the user's own thresholds) run for the active city too.
  const customTriggered = evaluateCustomRules(await loadCustomAlerts(), data);
  const all = [...triggered, ...customTriggered];
  if (!all.length) return [];
  return deliverAlerts(all, { city: data.location.name, timezone: data.timezone });
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
