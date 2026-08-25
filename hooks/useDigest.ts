import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from '../utils/notifications';
import { describeWmo } from '../utils/wmo';
import { uvBand } from '../utils/aqi';
import type { WeatherBundle } from '../api/types';

const DIGEST_IDENTIFIER = 'daily-digest';

export interface AccuracyEntry {
  t: number;
  d: number;
}

export function buildDigestBody(data: WeatherBundle): string | null {
  const tomorrow = data.daily[1] ?? data.daily[0];
  if (!tomorrow) return null;
  const { label } = describeWmo(tomorrow.weatherCode);
  const parts = [
    `H ${Math.round(tomorrow.tMax)}° · L ${Math.round(tomorrow.tMin)}°`,
    label,
  ];
  if (tomorrow.precipProbabilityMax >= 40) {
    parts.push(`${Math.round(tomorrow.precipProbabilityMax)}% rain`);
  }
  const uv = uvBand(tomorrow.uvIndexMax);
  if (uv && tomorrow.uvIndexMax >= 6) parts.push(`UV ${uv.label.toLowerCase()}`);
  return parts.join(' · ');
}

export function useDigest(
  enabled: boolean,
  hour: number,
  data: WeatherBundle | null,
): void {
  const lastScheduledRef = useRef(0);

  useEffect(() => {
    if (!enabled || !data) return;
    const body = buildDigestBody(data);
    if (!body) return;

    const now = Date.now();
    if (now - lastScheduledRef.current < 60 * 60 * 1000) return;
    lastScheduledRef.current = now;

    (async () => {
      try {
        await Notifications.cancelScheduledNotificationAsync(DIGEST_IDENTIFIER);
        await Notifications.scheduleNotificationAsync({
          identifier: DIGEST_IDENTIFIER,
          content: {
            title: 'Tomorrow at a glance',
            body,
            sound: false,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute: 0,
            channelId: 'weather-alerts',
          },
        });
      } catch {
        // Scheduling is best-effort.
      }
    })();
  }, [enabled, hour, data]);
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
