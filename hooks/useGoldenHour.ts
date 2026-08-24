import { useEffect, useMemo } from 'react';
import * as Notifications from 'expo-notifications';
import { findGoldenBlueHours } from '../utils/sunCalc';
import { wasNotifiedToday, markNotifiedToday } from './useDigest';
import type { WeatherBundle } from '../api/types';

const NOTIFY_KEY = '@mu_weather/golden_notified_v1';

export function useGoldenHour(enabled: boolean, data: WeatherBundle | null): void {
  const lat = data?.location.latitude ?? null;
  const lon = data?.location.longitude ?? null;

  const windows = useMemo(
    () => (lat !== null && lon !== null ? findGoldenBlueHours(lat, lon) : null),
    [lat, lon],
  );

  useEffect(() => {
    if (!enabled || !windows) return;
    const candidates = [windows.goldenMorning, windows.goldenEvening].filter(
      (w): w is NonNullable<typeof w> => w !== null,
    );
    if (!candidates.length) return;

    const now = Date.now();
    const upcoming = candidates.find((window) => {
      const minutesUntil = (window.start.getTime() - now) / 60000;
      return minutesUntil >= 0 && minutesUntil <= 60;
    });
    if (!upcoming) return;

    const dayKey = `${NOTIFY_KEY}_${new Date().toDateString()}_${upcoming.start.getHours()}`;
    (async () => {
      if (await wasNotifiedToday(dayKey)) return;
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
      const minutes = Math.round((upcoming.start.getTime() - now) / 60000);
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Golden hour soon',
            body: `Golden light starts in about ${minutes} min — perfect for photos.`,
            sound: false,
          },
          trigger: null,
        });
        await markNotifiedToday(dayKey);
      } catch {
        // Best-effort.
      }
    })();
  }, [enabled, windows, data?.fetchedAt]);
}
