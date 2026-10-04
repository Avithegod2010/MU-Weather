import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import * as Notifications from '../utils/notifications';
import { t } from '../utils/i18n';
import { computeTwilight } from '../utils/twilight';
import type { GeoLocation } from '../api/types';

/** Identifiers of the alarm notifications this hook owns. */
const ALARM_IDS_KEY = '@mu_weather/sunrise_alarm_v1';
/**
 * How many upcoming sunrises are queued per reschedule. Android fires a DATE
 * trigger once and forgets it, so queueing a few days means the alarm still
 * rings when the app has not been opened for a couple of days; every app start
 * (or location / offset change) cancels the old ones and queues a fresh set.
 */
const HORIZON_DAYS = 3;

/** Cancel every alarm this hook previously scheduled. Never throws. */
async function clearScheduledAlarms(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ALARM_IDS_KEY);
    await AsyncStorage.removeItem(ALARM_IDS_KEY);
    if (!raw) return;
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids)) return;
    for (const id of ids) {
      if (typeof id !== 'string') continue;
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // Already fired or cancelled by the OS - nothing to do.
      }
    }
  } catch {
    // Storage failure: the alarms may double up, but never blocks the app.
  }
}

/**
 * Sunrise alarm: a real scheduled notification (not the lead-window pattern the
 * rain/golden-hour hooks use) so it rings even when the app is closed.
 *
 * Deliberately NOT gated by quiet hours: it is an alarm the user explicitly
 * asked for, and sunrise often lands inside a quiet window - a wake-up call
 * the user cannot hear would be pointless. Permissions are checked, never
 * requested (the settings switch asks for them, like the other alerts).
 */
export function useSunriseAlarm(
  enabled: boolean,
  offsetMin: number,
  location: GeoLocation | null,
): void {
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Always start from a clean slate: the offset, the city or the toggle may
      // have changed, and stale alarms would fire at the wrong time.
      await clearScheduledAlarms();
      if (cancelled || !enabled || lat === null || lon === null) return;
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;

      const now = Date.now();
      const ids: string[] = [];
      for (let day = 0; day < HORIZON_DAYS; day++) {
        const date = new Date(now + day * 86400000);
        // Polar day / night: no sunrise to ring for, skip that day.
        const sunrise = computeTwilight(date, lat, lon).sunrise;
        if (!sunrise) continue;
        const fireAt = sunrise.getTime() - offsetMin * 60000;
        // A second of slack so a trigger created exactly now is not rejected.
        if (fireAt <= now + 1000) continue;
        try {
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: t('notif_sunrise_title'),
              body:
                offsetMin === 0
                  ? t('notif_sunrise_body_now')
                  : t('notif_sunrise_body').replace('{n}', String(offsetMin)),
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(fireAt),
            },
          });
          ids.push(id);
        } catch {
          // Best-effort: keep queuing the remaining days.
        }
      }
      if (ids.length > 0) {
        try {
          await AsyncStorage.setItem(ALARM_IDS_KEY, JSON.stringify(ids));
        } catch {
          // Non-critical bookkeeping.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, offsetMin, lat, lon]);
}