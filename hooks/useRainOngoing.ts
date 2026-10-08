import { useEffect, useMemo } from 'react';
import * as Notifications from '../utils/notifications';
import { isInQuietHoursNow } from '../utils/fireAlertNotifications';
import { computeNowcast } from '../utils/nowcast';
import { localIsoToEpoch } from '../utils/format';
import { t } from '../utils/i18n';
import type { WeatherBundle } from '../api/types';

/**
 * ONE stable identifier for the whole feature: re-scheduling with it REPLACES
 * the notification that is already showing (expo-notifications matches on the
 * identifier), so this reads as one live status instead of a stream of
 * near-identical alerts.
 */
const ONGOING_IDENTIFIER = 'mu_weather_rain_ongoing';
/** Floor between re-posts, whatever the data is doing - notification hygiene. */
const MIN_UPDATE_MS = 30 * 60_000;
/** How far ahead a "starting" nowcast still counts as on the way. */
const LEAD_MIN = 60;
/** Rain further out than this no longer belongs on the home-screen status. */
const HORIZON_H = 6;
/** A bundle older than this must not keep a status notification alive. */
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

// Module-level so a re-mount cannot double-post inside the throttle window.
let lastPostedAt = 0;
let lastSignature = '';

/** Which of the three states the screen is in right now. */
type RainState = 'none' | 'now' | 'soon' | 'later';

interface RainStatus {
  state: RainState;
  /** Minutes until rain starts, when known (state 'soon'). */
  minutes: number | null;
  /** Changes whenever the notification text would change. */
  signature: string;
}

/**
 * Rain status from the nowcast plus the next few forecast hours. Pure and
 * local: no extra requests, no cache.
 */
export function rainStatus(data: WeatherBundle | null, now: number): RainStatus {
  if (!data || now - data.fetchedAt > MAX_AGE_MS) return { state: 'none', minutes: null, signature: 'none' };
  const nowcast = computeNowcast(data.minutely);
  const rainingNow = data.current.precipitation > 0;
  const soon =
    nowcast.kind === 'starting' &&
    nowcast.minutesUntilChange !== null &&
    nowcast.minutesUntilChange <= LEAD_MIN;
  const horizon = data.hourly
    .filter((hour) => localIsoToEpoch(hour.time) > now)
    .slice(0, HORIZON_H)
    .some(
      (hour) =>
        (hour.precipitation ?? 0) > 0.1 || (hour.precipProbability ?? 0) >= 60,
    );

  if (rainingNow) return { state: 'now', minutes: null, signature: `now:${data.location.name}` };
  if (soon) {
    const minutes = nowcast.minutesUntilChange ?? 0;
    return { state: 'soon', minutes, signature: `soon:${minutes}:${data.location.name}` };
  }
  if (horizon) return { state: 'later', minutes: null, signature: `later:${data.location.name}` };
  return { state: 'none', minutes: null, signature: 'none' };
}

function bodyFor(status: RainStatus, city: string): string {
  if (status.state === 'now') return t('notif_rain_ongoing_now').replace('{city}', city);
  if (status.state === 'soon') {
    return t('notif_rain_ongoing_soon')
      .replace('{n}', String(status.minutes ?? 0))
      .replace('{city}', city);
  }
  return t('notif_rain_ongoing_later').replace('{city}', city);
}

async function cancelStatus(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(ONGOING_IDENTIFIER);
  } catch {
    // Nothing scheduled (or already dismissed by the user) - nothing to do.
  }
  lastPostedAt = 0;
  lastSignature = '';
}

/**
 * Keeps ONE "rain is here / rain is coming" status notification in sync with
 * the forecast: it appears when rain is falling or on the way, refreshes at
 * most every 30 minutes, and is cancelled automatically once the rain is over
 * (or the cached data goes stale). Silent during quiet hours - it is a status,
 * not an alert - but an existing one is left alone until the rain stops.
 */
export function useRainOngoing(enabled: boolean, data: WeatherBundle | null): void {
  // A slow clock keeps "3 h stale" honest without re-running on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `data` is a refresh trigger: a new forecast resets "now".
  const now = useMemo(() => Date.now(), [data]);
  const status = useMemo(() => rainStatus(data, now), [data, now]);
  const signature = status.signature;
  const state = status.state;
  const minutes = status.minutes;

  useEffect(() => {
    if (!enabled) {
      void cancelStatus();
      return;
    }
    if (state === 'none') {
      void cancelStatus();
      return;
    }
    if (signature === lastSignature && Date.now() - lastPostedAt < MIN_UPDATE_MS) return;

    let cancelled = false;
    void (async () => {
      if (cancelled || !data) return;
      const { status: permission } = await Notifications.getPermissionsAsync();
      if (permission !== 'granted') return;
      if (await isInQuietHoursNow()) return;
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: ONGOING_IDENTIFIER,
          content: {
            title: t('notif_rain_ongoing_title'),
            body: bodyFor({ state, minutes, signature }, data.location.name),
            sound: false,
          },
          trigger: null,
        });
        lastPostedAt = Date.now();
        lastSignature = signature;
      } catch {
        // Best-effort - never crash over a notification.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, state, minutes, signature, data]);
}