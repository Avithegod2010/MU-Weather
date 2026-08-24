import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { WeatherBundle } from '../api/types';
import {
  DEFAULT_ALERT_SETTINGS,
  evaluateAlerts,
  type AlertKey,
  type AlertSettings,
  type TriggeredAlert,
} from '../utils/alertRules';

const SETTINGS_KEY = '@mu_weather/alerts_v1';
const FIRED_KEY = '@mu_weather/alert_fired_v1';
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannel(): Promise<void> {
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

export function useAlerts(data: WeatherBundle | null) {
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<TriggeredAlert[]>([]);
  const firedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            setSettings({ ...DEFAULT_ALERT_SETTINGS, ...parsed });
          }
        }
        const firedRaw = await AsyncStorage.getItem(FIRED_KEY);
        if (!cancelled && firedRaw) {
          const parsed = JSON.parse(firedRaw);
          if (parsed && typeof parsed === 'object') {
            firedRef.current = parsed;
          }
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
    setSettings((previous) => {
      const next = { ...previous, [key]: !previous[key] };
      void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await ensureChannel();
      await Notifications.requestPermissionsAsync();
    }
  }, []);

  useEffect(() => {
    if (!data || !ready) {
      setActiveAlerts([]);
      return;
    }
    const triggered = evaluateAlerts(
      settings,
      data.current,
      data.hourly,
      data.daily[0] ?? null,
      data.aqi,
    );
    setActiveAlerts(triggered);

    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
      await ensureChannel();

      const now = Date.now();
      const firedNext = { ...firedRef.current };
      let changed = false;
      for (const alert of triggered) {
        const lastFired = firedRef.current[alert.key] ?? 0;
        if (now - lastFired < COOLDOWN_MS) continue;
        firedNext[alert.key] = now;
        changed = true;
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: alert.title,
              body: alert.message,
              sound: alert.severity === 'severe',
            },
            trigger: null,
          });
        } catch {
          // Notification delivery is best-effort.
        }
      }
      if (changed) {
        firedRef.current = firedNext;
        void AsyncStorage.setItem(FIRED_KEY, JSON.stringify(firedNext)).catch(() => {});
      }
    })();
  }, [data, settings, ready]);

  return { settings, toggleAlert, activeAlerts, ready };
}
