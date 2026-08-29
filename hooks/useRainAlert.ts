import { useEffect, useMemo } from 'react';
import * as Notifications from '../utils/notifications';
import { computeNowcast } from '../utils/nowcast';
import { t } from '../utils/i18n';
import type { WeatherBundle } from '../api/types';

/** Cooldown between rain-start notifications (per rain event), in-memory only. */
const COOLDOWN_MS = 90 * 60_000;
/** Fire only when rain is expected within this window. */
const LEAD_WINDOW_MIN = 60;

// Module-level so a re-mount (or a fast settings toggle) cannot double-notify.
let lastEventKey: string | null = null;
let lastNotifiedAt = 0;

/**
 * Fires ONE local notification when the nowcast says rain is starting soon.
 * Mirrors useGoldenHour: guard behind `enabled`, check (never request)
 * permissions here, dedup per rain event, best-effort try/catch.
 */
export function useRainAlert(enabled: boolean, data: WeatherBundle | null): void {
  const nowcast = useMemo(
    () => computeNowcast(data?.minutely ?? []),
    [data],
  );

  useEffect(() => {
    if (!enabled) return;
    if (nowcast.kind !== 'starting') return;
    const minutes = nowcast.minutesUntilChange;
    if (minutes === null || minutes > LEAD_WINDOW_MIN) return;

    // Dedup key: the expected start time identifies one rain event.
    const eventKey = nowcast.changeTime ?? `start-${minutes}`;
    if (eventKey === lastEventKey) return;
    if (Date.now() - lastNotifiedAt < COOLDOWN_MS) return;

    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: t('notif_rain_title'),
            body: t('notif_rain_body').replace('{n}', String(minutes)),
            sound: false,
          },
          trigger: null,
        });
        lastEventKey = eventKey;
        lastNotifiedAt = Date.now();
      } catch {
        // Best-effort - never crash over a notification.
      }
    })();
  }, [enabled, nowcast, data?.fetchedAt]);
}
