import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from '../utils/notifications';
import type { WeatherBundle } from '../api/types';
import {
  DEFAULT_ALERT_SETTINGS,
  normalizeAlertSettings,
  isAnyRuleEnabled,
  type AlertKey,
  type AlertSettings,
  type QuietHoursSettings,
  type TriggeredAlert,
} from '../utils/alertRules';
import {
  fireAlertNotifications,
  loadAlertSettings,
  ALERTS_STORAGE_KEY,
} from '../utils/fireAlertNotifications';
import { fireFavoriteCityAlerts } from '../utils/favoriteCityAlerts';
import { areWidgetsInUse } from '../utils/widgetPresence';
import {
  registerBackgroundAlerts,
  unregisterBackgroundAlerts,
} from '../tasks/backgroundAlertTask';
import { SETTINGS_KEY } from './useDigest';
import {
  assessWeatherCacheFreshness,
  weatherLocationKey,
  WEATHER_CACHE_FRESH_FOR_MS,
} from '../utils/freshnessPolicy';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function useAlerts(data: WeatherBundle | null, backgroundEnabled: boolean) {
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<TriggeredAlert[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadAlertSettings();
        if (!cancelled && Object.keys(stored).length) {
          setSettings(normalizeAlertSettings(stored));
        }
      } catch {
        // Corrupt storage: fall back to defaults.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleAlert = useCallback(async (key: AlertKey) => {
    setSettings((previous) => ({ ...previous, [key]: !previous[key] }));
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
  }, []);

  /** Quiet-hours toggle + start/end steppers (Alerts screen). */
  const updateQuietHours = useCallback((patch: Partial<QuietHoursSettings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const updateFavoriteRefreshInterval = useCallback((minutes: AlertSettings['favoriteRefreshIntervalMinutes']) => {
    setSettings((previous) => ({ ...previous, favoriteRefreshIntervalMinutes: minutes }));
  }, []);

  useEffect(() => {
    if (!ready) return;
    void AsyncStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings, ready]);

  useEffect(() => {
    if (!data || !ready) {
      setActiveAlerts([]);
      return undefined;
    }
    const locationId = weatherLocationKey(data.location.latitude, data.location.longitude);
    const isFresh = () => Boolean(
      locationId && assessWeatherCacheFreshness({
        snapshotLocationId: locationId,
        currentLocationId: locationId,
        fetchedAt: data.fetchedAt,
      }).alertsMayBeTreatedAsCurrent,
    );
    if (!isFresh()) {
      setActiveAlerts([]);
      return undefined;
    }
    let cancelled = false;
    void fireAlertNotifications(settings, data).then((triggered) => {
      setActiveAlerts(!cancelled && isFresh() ? triggered : []);
    });
    // Saved-city cadence is user-controlled inside the sweep utility; the
    // background task also calls it for app-closed coverage. Active-location
    // alert delivery above does not use this saved-city throttle.
    void fireFavoriteCityAlerts(settings, data);
    const staleInMs = Math.max(0, data.fetchedAt + WEATHER_CACHE_FRESH_FOR_MS - Date.now() + 1);
    const staleTimer = setTimeout(() => setActiveAlerts([]), staleInMs);
    return () => {
      cancelled = true;
      clearTimeout(staleTimer);
    };
  }, [data, settings, ready]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      // The digest shares the SETTINGS_KEY blob (hooks/useDigest). A digest-only
      // user - background on, digest on, no alert rules, no widgets - still
      // needs the task: without it the daily digest fires with a body captured
      // whenever the app was last open. The task's own early return already
      // passes for the digest, so registration is the whole fix.
      let digestOn = false;
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        const stored = raw ? (JSON.parse(raw) as { digestEnabled?: boolean }) : null;
        digestOn = stored?.digestEnabled === true;
      } catch {
        // Corrupt settings: treat as off rather than blocking registration.
      }
      if (cancelled) return;

      const anyAlertEnabled = isAnyRuleEnabled(settings);
      if (backgroundEnabled && (anyAlertEnabled || digestOn)) {
        void registerBackgroundAlerts();
        return;
      }
      // Widget-only users: a placed widget promises 30-minute freshness (its own
      // updatePeriodMillis), so the background task keeps the bundle fresh for it
      // too - roughly one weather fetch per 30 minutes while a widget is placed.
      // The master background toggle still wins: off means no background work.
      const inUse = await areWidgetsInUse();
      if (cancelled) return;
      if (backgroundEnabled && inUse) {
        void registerBackgroundAlerts();
      } else {
        void unregisterBackgroundAlerts();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backgroundEnabled, settings, ready]);

  return { settings, toggleAlert, updateQuietHours, updateFavoriteRefreshInterval, activeAlerts, ready };
}
