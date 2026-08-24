import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setHapticsEnabled } from '../utils/haptics';
import { setUnits } from '../utils/format';
import type { TempUnit, WindUnit, TimeFormat } from '../utils/format';
import type { StyleMode, ThemeMode } from '../theme/palettes';

const SETTINGS_KEY = '@mu_weather/settings_v1';

export interface AppSettings {
  hapticsEnabled: boolean;
  themeMode: ThemeMode;
  styleMode: StyleMode;
  tempUnit: TempUnit;
  windUnit: WindUnit;
  timeFormat: TimeFormat;
  snarkMode: boolean;
  digestEnabled: boolean;
  digestHour: number;
  goldenHourEnabled: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  hapticsEnabled: true,
  themeMode: 'system',
  styleMode: 'material',
  tempUnit: 'celsius',
  windUnit: 'kmh',
  timeFormat: '12h',
  snarkMode: false,
  digestEnabled: false,
  digestHour: 8,
  goldenHourEnabled: false,
};

function applySideEffects(settings: AppSettings): void {
  setHapticsEnabled(settings.hapticsEnabled);
  setUnits({
    temp: settings.tempUnit,
    wind: settings.windUnit,
    time: settings.timeFormat,
  });
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const merged = { ...DEFAULT_SETTINGS, ...parsed };
            setSettings(merged);
            applySideEffects(merged);
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

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      applySideEffects(next);
      return next;
    });
  }, []);

  return { settings, updateSettings, ready };
}
