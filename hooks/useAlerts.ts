import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from '../utils/notifications';
import type { WeatherBundle } from '../api/types';
import {
  DEFAULT_ALERT_SETTINGS,
  type AlertKey,
  type AlertSettings,
  type TriggeredAlert,
} from '../utils/alertRules';
import {
  fireAlertNotifications,
  loadAlertSettings,
  ALERTS_STORAGE_KEY,
} from '../utils/fireAlertNotifications';
import {
  registerBackgroundAlerts,
  unregisterBackgroundAlerts,
} from '../tasks/backgroundAlertTask';

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
  }, [data, settings, ready]);

  useEffect(() => {
    if (!ready) return;
    const anyAlertEnabled = Object.values(settings).some(Boolean);
    const shouldRegister = backgroundEnabled && anyAlertEnabled;
    if (shouldRegister) {
      void registerBackgroundAlerts();
    } else {
      void unregisterBackgroundAlerts();
    }
  }, [backgroundEnabled, settings, ready]);

  return { settings, toggleAlert, activeAlerts, ready };
}
