import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setHapticsEnabled } from '../utils/haptics';
import { setUnits } from '../utils/format';
import type { TempUnit, WindUnit, TimeFormat, PrecipUnit, PressureUnit } from '../utils/format';
import { setAqiScale } from '../utils/aqi';
import type { AqiScale } from '../utils/aqi';
import { setIconStyle } from '../utils/icons';
import type { IconStyle } from '../utils/icons';
import type { DetailAnimStyle } from '../utils/detailAnimations';
import type { LayoutDensity , StyleMode, ThemeMode } from '../theme/palettes';
import type { HomeBackgroundKey } from '../config/backgrounds';
import type { ColorThemeKey } from '../config/colorThemes';
import type { ModelKey } from '../api/providers';
import { setLanguage } from '../utils/i18n';
import type { LanguageKey } from '../utils/i18n';

const SETTINGS_KEY = '@mu_weather/settings_v1';

export interface AppSettings {
  hapticsEnabled: boolean;
  language: LanguageKey;
  themeMode: ThemeMode;
  styleMode: StyleMode;
  tempUnit: TempUnit;
  windUnit: WindUnit;
  precipUnit: PrecipUnit;
  /** Barometric-pressure display unit - hPa everywhere in the API */
  pressureUnit: PressureUnit;
  /** Show the Beaufort force name next to wind speeds */
  windBeaufort: boolean;
  /** Air-quality index scale - US EPA or European EEA */
  aqiScale: AqiScale;
  /** Weather icon look - outline strokes, filled shapes, or colorful hues */
  iconStyle: IconStyle;
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
  /** Default model that feeds the main forecast tile + trend/digest — can be switched
   *  in Settings → "Model comparison". When a non-primary model is selected the home
   *  forecast still uses ECMWF (the app's primary model) so downstream features never
   *  silently change behavior; the picker only controls the comparison screen default
   *  sort and which model is starred in the table header. */
  modelSource: ModelKey;
  /** History window shown in the past-days card - 7, 30 days, or the accuracy view */
  pastDaysRange: 7 | 30 | 'accuracy';
  /** Home card spacing - 'compact' tightens paddings and hero typography */
  layoutDensity: LayoutDensity;
  /**
   * Tint chips, switches and active rings with the current conditions
   * (home screen only). Ignored while the Material You theme is active -
   * the wallpaper-derived palette stays authoritative there.
   */
  weatherAccentEnabled: boolean;
  /**
   * Ring a scheduled notification `sunriseAlarmOffsetMin` minutes before
   * sunrise in the active city. Queued as an OS date trigger, so it fires
   * with the app closed, and it ignores quiet hours by design.
   */
  sunriseAlarmEnabled: boolean;
  /** Minutes before sunrise; one of 0, 15, 30, 60, 90 (the picker in Settings). */
  sunriseAlarmOffsetMin: number;
  /**
   * Keep one live notification while rain is falling or on the way, updated in
   * place and cancelled automatically when the rain is over.
   */
  rainOngoingEnabled: boolean;
  /** Sky animation: sun, stars, clouds, fog, lightning, rain and snow. Off keeps the sky still. */
  skyMotion: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  hapticsEnabled: true,
  skyMotion: true,
  language: 'en',
  themeMode: 'system',
  styleMode: 'material',
  tempUnit: 'celsius',
  windUnit: 'kmh',
  precipUnit: 'mm',
  pressureUnit: 'hPa',
  windBeaufort: false,
  aqiScale: 'us',
  iconStyle: 'outline',
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
  pastDaysRange: 7,
  layoutDensity: 'comfortable',
  weatherAccentEnabled: false,
  sunriseAlarmEnabled: false,
  sunriseAlarmOffsetMin: 30,
  rainOngoingEnabled: false,
  /** Default comparison model shown first in the model-comparison screen — can be
   *  changed in Settings → "Model comparison". Does not affect the home forecast
   *  (that always uses the primary ECMWF model); only gates the comparison screen
   *  sort order and which model is starred. */
  modelSource: 'ecmwf_ifs025',
};

function applySideEffects(settings: AppSettings): void {
  setHapticsEnabled(settings.hapticsEnabled);
  setLanguage(settings.language);
  setUnits({
    temp: settings.tempUnit,
    wind: settings.windUnit,
    precip: settings.precipUnit,
    time: settings.timeFormat,
    pressure: settings.pressureUnit,
    beaufort: settings.windBeaufort,
  });
  setAqiScale(settings.aqiScale);
  setIconStyle(settings.iconStyle);
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
