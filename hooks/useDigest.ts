import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from '../utils/notifications';
import { t, setLanguage } from '../utils/i18n';
import { describeWmo } from '../utils/wmo';
import { uvBand } from '../utils/aqi';
import { formatTemp, setUnits } from '../utils/format';
import { DIGEST_CATEGORY } from '../utils/spokenDigest';
import { loadLastWeather } from '../utils/storage';
import type { WeatherBundle } from '../api/types';

const DIGEST_IDENTIFIER = 'daily-digest';
/** Persisted settings key (kept in sync with hooks/useSettings.ts). */
export const SETTINGS_KEY = '@mu_weather/settings_v1';
/** Same-date reschedules are throttled to spare the OS scheduler. */
const RESCHEDULE_OK_MS = 5 * 60 * 1000;

export interface AccuracyEntry {
  t: number;
  d: number;
}

export function buildDigestBody(data: WeatherBundle): string | null {
  const tomorrow = data.daily[1] ?? data.daily[0];
  if (!tomorrow) return null;
  const { label } = describeWmo(tomorrow.weatherCode);
  // formatTemp follows the user's tempUnit — the body must never mix °C into
  // an app that displays °F.
  const parts = [
    `${t('digest_high')} ${formatTemp(tomorrow.tMax)} · ${t('digest_low')} ${formatTemp(tomorrow.tMin)}`,
    label,
  ];
  if (tomorrow.precipProbabilityMax >= 40) {
    parts.push(
      t('digest_rain').split('{n}').join(String(Math.round(tomorrow.precipProbabilityMax))),
    );
  }
  const uv = uvBand(tomorrow.uvIndexMax);
  if (uv && tomorrow.uvIndexMax >= 6) {
    parts.push(t('digest_uv').split('{n}').join(uv.label));
  }
  return parts.join(' · ');
}

/** Epoch ms of the next `hour:00` occurrence (today if still ahead, else tomorrow). */
export function nextDigestAt(hour: number, now = Date.now()): number {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}

/**
 * Schedule the digest as a ONE-SHOT notification for the next digest hour.
 *
 * One-shot (rather than a repeating DAILY trigger) is what keeps the body
 * fresh: a repeat replays whatever was computed at schedule time, so a user who
 * did not open the app got yesterday's forecast. Every call re-schedules from
 * the latest bundle; the background task re-schedules from the cached bundle
 * when the app is closed.
 */
async function scheduleDigestAt(body: string, when: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DIGEST_IDENTIFIER);
  await Notifications.scheduleNotificationAsync({
    identifier: DIGEST_IDENTIFIER,
    content: {
      title: t('notif_digest_title'),
      body,
      sound: false,
      categoryIdentifier: DIGEST_CATEGORY,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(when),
      channelId: 'weather-alerts',
    },
  });
}

export function useDigest(
  enabled: boolean,
  hour: number,
  data: WeatherBundle | null,
): void {
  // The target date the current schedule was built for. Re-scheduling costs two
  // native calls, so only do it when the target day changes or after a gap.
  const scheduledForRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !data) return;
    const body = buildDigestBody(data);
    if (!body) return;

    const now = Date.now();
    const target = nextDigestAt(hour, now);
    const scheduledFor = scheduledForRef.current;
    if (scheduledFor !== null && scheduledFor === target && now - scheduledFor < RESCHEDULE_OK_MS) {
      return;
    }
    scheduledForRef.current = target;

    (async () => {
      try {
        await scheduleDigestAt(body, target);
      } catch {
        // Scheduling is best-effort.
      }
    })();
  }, [enabled, hour, data]);
}

/**
 * Re-schedule the digest from the cached bundle — called by the background task
 * so a user who has not opened the app still gets a current body. Settings are
 * re-applied first so the body follows the stored unit and language (the
 * background JS context starts with the defaults).
 */
export async function rescheduleDigestFromCache(): Promise<void> {
  try {
    const data = await loadLastWeather();
    if (!data) return;
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const stored: Record<string, unknown> = raw ? JSON.parse(raw) : {};
    if (stored.digestEnabled !== true) return;
    const hour = typeof stored.digestHour === 'number' ? stored.digestHour : 8;
    if (typeof stored.language === 'string') {
      setLanguage(stored.language as Parameters<typeof setLanguage>[0]);
    }
    setUnits({
      temp: stored.tempUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius',
      wind: stored.windUnit === 'mph' ? 'mph' : 'kmh',
      precip: stored.precipUnit === 'inches' ? 'inches' : 'mm',
      time: stored.timeFormat === '24h' ? '24h' : '12h',
      pressure:
        stored.pressureUnit === 'mmHg'
          ? 'mmHg'
          : stored.pressureUnit === 'inHg'
            ? 'inHg'
            : 'hPa',
      beaufort: stored.windBeaufort === true,
    });

    const body = buildDigestBody(data);
    if (!body) return;
    await scheduleDigestAt(body, nextDigestAt(hour));
  } catch {
    // Best-effort: a failed re-schedule leaves the previous one in place.
  }
}

export async function cancelDigest(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(DIGEST_IDENTIFIER);
  } catch {
    // Nothing scheduled.
  }
}

export async function wasNotifiedToday(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return false;
    const stamp = Number(raw);
    const today = new Date();
    const stampDate = new Date(stamp);
    return (
      stampDate.getDate() === today.getDate() &&
      stampDate.getMonth() === today.getMonth() &&
      stampDate.getFullYear() === today.getFullYear()
    );
  } catch {
    return false;
  }
}

export async function markNotifiedToday(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, String(Date.now()));
  } catch {
    // Non-critical.
  }
}
