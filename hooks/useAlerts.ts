import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from '../utils/notifications';
import type { WeatherBundle } from '../api/types';
import {
  DEFAULT_ALERT_SETTINGS,
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
          setSettings({ ...DEFAULT_ALERT_SETTINGS, ...stored } as AlertSettings);
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

  useEffect(() => {
    if (!ready) return;
    void AsyncStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings, ready]);

  useEffect(() => {
    if (!data || !ready) {
      setActiveAlerts([]);
      return;
    }
    void fireAlertNotifications(settings, data).then((triggered) => {
      setActiveAlerts(triggered);
    });
    // Saved-city sweep, throttled to one pass every 20 minutes inside the util
    // (the background task fires it too, for the app-closed case).
    void fireFavoriteCityAlerts(settings, data);
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

  return { settings, toggleAlert, updateQuietHours, activeAlerts, ready };
}
