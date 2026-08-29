import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setHapticsEnabled } from '../utils/haptics';
import { setUnits } from '../utils/format';
import type { TempUnit, WindUnit, TimeFormat } from '../utils/format';
import type { DetailAnimStyle } from '../utils/detailAnimations';
import type { HomeBackgroundKey } from '../config/backgrounds';
import type { ColorThemeKey } from '../config/colorThemes';
import { setLanguage } from '../utils/i18n';
import type { LanguageKey } from '../utils/i18n';
import type { StyleMode, ThemeMode } from '../theme/palettes';

const SETTINGS_KEY = '@mu_weather/settings_v1';

export interface AppSettings {
  hapticsEnabled: boolean;
  language: LanguageKey;
  themeMode: ThemeMode;
  styleMode: StyleMode;
  tempUnit: TempUnit;
  windUnit: WindUnit;
  timeFormat: TimeFormat;
  snarkMode: boolean;
  digestEnabled: boolean;
  digestHour: number;
  goldenHourEnabled: boolean;
  /** Local notification when the nowcast says rain starts within 60 minutes */
  rainAlertEnabled: boolean;
  backgroundAlerts: boolean;
  detailAnimation: DetailAnimStyle;
  /** Home screen background - 'dynamic' follows the live weather */
  homeBackground: HomeBackgroundKey;
  /** Fixed color theme - 'default' follows the weather/background pipeline */
  colorTheme: ColorThemeKey;
  /** Home sections / detail tiles the user switched off - hidden from home */
  hiddenTiles: string[];
}

const DEFAULT_SETTINGS: AppSettings = {
  hapticsEnabled: true,
  language: 'en',
  themeMode: 'system',
  styleMode: 'material',
  tempUnit: 'celsius',
  windUnit: 'kmh',
  timeFormat: '12h',
  snarkMode: false,
  digestEnabled: false,
  digestHour: 8,
  goldenHourEnabled: false,
  rainAlertEnabled: false,
  backgroundAlerts: true,
  detailAnimation: 'fade',
  homeBackground: 'dynamic',
  colorTheme: 'default',
  hiddenTiles: [],
};

function applySideEffects(settings: AppSettings): void {
  setHapticsEnabled(settings.hapticsEnabled);
  setLanguage(settings.language);
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
            setSettings({ ...DEFAULT_SETTINGS, ...parsed });
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
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  useEffect(() => {
    if (!ready) return;
    applySideEffects(settings);
    void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings, ready]);

  return { settings, updateSettings, ready };
}
