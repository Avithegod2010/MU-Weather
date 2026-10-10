import { describeWmo } from './wmo';
import { formatHourLabel, convertWind, windUnitLabel } from './format';
import { peakCape } from './storm';
import type { StringKey } from './i18n';
import type { AlertEvidence } from './alertEvidence';
import type { Nowcast } from './nowcast';
import type { AqiInfo, CurrentConditions, DayPoint, HourPoint } from '../api/types';

export type AlertKey =
  | 'rain'
  | 'thunder'
  | 'frost'
  | 'uv'
  | 'aqi'
  | 'pressure'
  | 'wind'
  | 'pollen'
  | 'cape'
  | 'heat'
  // ── bot2: aurora + alerts + wear ──
  | 'aurora'
  | 'fog'
  | 'blackice'
  | 'coldsnap'
  | 'tempdrop'
  | 'stargazing'
  | 'raineasing'
  // ── bot1: saved-city alerts ──
  /** Not a rule of its own: enables running every rule for the saved cities too. */
  | 'favorites';

export interface AlertDefinition {
  key: AlertKey;
  title: StringKey;
  subtitle: StringKey;
}

export const ALERT_DEFINITIONS: AlertDefinition[] = [
  { key: 'rain', title: 'alert_rain_title', subtitle: 'alert_rain_sub' },
  { key: 'thunder', title: 'alert_thunder_title', subtitle: 'alert_thunder_sub' },
  { key: 'frost', title: 'alert_frost_title', subtitle: 'alert_frost_sub' },
  { key: 'uv', title: 'alert_uv_title', subtitle: 'alert_uv_sub' },
  { key: 'heat', title: 'alert_heat_title', subtitle: 'alert_heat_sub' },
  { key: 'pollen', title: 'alert_pollen_title', subtitle: 'alert_pollen_sub' },
  { key: 'aqi', title: 'alert_aqi_title', subtitle: 'alert_aqi_sub' },
  { key: 'pressure', title: 'alert_pressure_title', subtitle: 'alert_pressure_sub' },
  { key: 'wind', title: 'alert_wind_title', subtitle: 'alert_wind_sub' },
  { key: 'cape', title: 'alert_cape_title', subtitle: 'alert_cape_sub' },
  // ── bot2: aurora + alerts + wear ──
  { key: 'aurora', title: 'alert_aurora_title', subtitle: 'alert_aurora_sub' },
  { key: 'fog', title: 'alert_fog_title', subtitle: 'alert_fog_sub' },
  { key: 'blackice', title: 'alert_blackice_title', subtitle: 'alert_blackice_sub' },
  { key: 'coldsnap', title: 'alert_coldsnap_title', subtitle: 'alert_coldsnap_sub' },
  { key: 'tempdrop', title: 'alert_tempdrop_title', subtitle: 'alert_tempdrop_sub' },
  { key: 'stargazing', title: 'alert_stargazing_title', subtitle: 'alert_stargazing_sub' },
  { key: 'raineasing', title: 'alert_raineasing_title', subtitle: 'alert_raineasing_sub' },
  // ── bot1: saved-city alerts ──
  { key: 'favorites', title: 'alert_favorites_title', subtitle: 'alert_favorites_sub' },
];

export type AlertSeverity = 'info' | 'warning' | 'severe';

/**
 * TriggeredAlert keys: the built-in rule keys plus the custom rules'
 * `custom:<id>` namespace (one cooldown slot per custom rule). A separate type
 * so AlertSettings' Record over the built-in keys stays untouched.
 */
export type TriggeredAlertKey = AlertKey | `custom:${string}`;

export interface TriggeredAlert {
  key: TriggeredAlertKey;
  title: string;
  message: string;
  severity: AlertSeverity;
  /** Structured explanation for the rule, preserved in local alert history. */
  evidence?: AlertEvidence;
  /** End of the cited forecast interval, when its location timezone is known. */
  expiresAt?: number;
}

/**
 * Quiet hours: while the device clock sits inside [start, end), alert
 * notifications are silenced but the alerts themselves still fire and append
 * to the history (utils/alertHistory) - quiet means no notification, not no
 * alert. Times are minutes since midnight on the DEVICE clock; the window may
 * span midnight (1320 -> 420 = 22:00 -> 07:00) and start === end disables the
 * feature. Stored in the same alert-settings blob as the rule toggles.
 */
export interface QuietHoursSettings {
  quietHoursEnabled: boolean;
  quietStartMinutes: number;
  quietEndMinutes: number;
}

export const FAVORITE_CITY_REFRESH_INTERVALS = [20, 30, 60] as const;
export type FavoriteCityRefreshInterval = (typeof FAVORITE_CITY_REFRESH_INTERVALS)[number];

export interface FavoriteCityRefreshSettings {
  /** Saved-city sweep only; active-location checks keep their existing cadence. */
  favoriteRefreshIntervalMinutes: FavoriteCityRefreshInterval;
}

export type AlertSettings = Record<AlertKey, boolean> & QuietHoursSettings & FavoriteCityRefreshSettings;

/** Default window: 22:00 -> 07:00. */
export const DEFAULT_QUIET_START_MINUTES = 22 * 60;
export const DEFAULT_QUIET_END_MINUTES = 7 * 60;

/**
 * Is a minute-of-day inside the quiet window? The window may span midnight
 * (22:00 -> 07:00 wraps through 00:00) and start === end means no quiet hours.
 */
export function localMinutesOfDay(date: Date): number {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return Number.NaN;
  return date.getHours() * 60 + date.getMinutes();
}

export function isInsideQuietWindow(
  minutesOfDay: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return minutesOfDay >= startMinutes && minutesOfDay < endMinutes;
  }
  return minutesOfDay >= startMinutes || minutesOfDay < endMinutes;
}

/**
 * True when at least one RULE is on. The quiet-hours fields share the settings
 * blob but are not rules - a numeric minute value must never count as "an
 * alert is enabled" and wake the background task on its own.
 */
export function isAnyRuleEnabled(settings: AlertSettings): boolean {
  return ALERT_DEFINITIONS.some((definition) => settings[definition.key] === true);
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  rain: true,
  thunder: true,
  frost: false,
  uv: false,
  pollen: false,
  aqi: false,
  pressure: false,
  wind: false,
  cape: false,
  heat: false,
  // ── bot2: aurora + alerts + wear ──
  aurora: false,
  fog: false,
  blackice: false,
  coldsnap: false,
  tempdrop: false,
  stargazing: false,
  raineasing: false,
  // ── bot1: saved-city alerts ──
  favorites: false,
  // ── notification upgrades: quiet hours ──
  quietHoursEnabled: false,
  quietStartMinutes: DEFAULT_QUIET_START_MINUTES,
  quietEndMinutes: DEFAULT_QUIET_END_MINUTES,
  favoriteRefreshIntervalMinutes: 20,
};

/** Merge untrusted persisted alert preferences over defaults for cold/background starts. */
export function normalizeAlertSettings(value: unknown): AlertSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const normalized: AlertSettings = { ...DEFAULT_ALERT_SETTINGS };
  for (const definition of ALERT_DEFINITIONS) {
    const enabled = source[definition.key];
    if (typeof enabled === 'boolean') normalized[definition.key] = enabled;
  }
  if (typeof source.quietHoursEnabled === 'boolean') normalized.quietHoursEnabled = source.quietHoursEnabled;
  for (const key of ['quietStartMinutes', 'quietEndMinutes'] as const) {
    const minutes = source[key];
    if (typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 0 && minutes < 24 * 60) {
      normalized[key] = minutes;
    }
  }
  if (FAVORITE_CITY_REFRESH_INTERVALS.includes(
    source.favoriteRefreshIntervalMinutes as FavoriteCityRefreshInterval,
  )) {
    normalized.favoriteRefreshIntervalMinutes = source.favoriteRefreshIntervalMinutes as FavoriteCityRefreshInterval;
  }
  return normalized;
}

/**
 * Inputs the rules need that are NOT part of WeatherBundle, or that cost a
 * network round-trip. Callers materialize them and hand them in so
 * evaluateAlerts itself stays synchronous and side-effect free.
 */
export interface AlertExtras {
  // ── bot2: aurora + alerts + wear ──
  /** computeNowcast(data.minutely) — the rain-easing rule reads its 15-min buckets. */
  nowcast?: Nowcast;
  /** Max Kp in the SWPC 3-day outlook; undefined when the feed failed or the latitude gate is closed. */
  auroraKpMax?: number;
}

function evidence(
  metricLabel: StringKey,
  actual: string,
  threshold: string,
  source: string,
  observationTime?: string,
): AlertEvidence {
  return { metricLabel, actual, threshold, source, ...(observationTime ? { observationTime } : {}) };
}

export function evaluateAlerts(
  settings: AlertSettings,
  current: CurrentConditions,
  hourly: HourPoint[],
  today: DayPoint | null,
  aqi: AqiInfo | null,
  extras: AlertExtras = {},
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];
  const window = hourly.slice(0, 12);

  if (settings.rain && window.length) {
    const peak = window.reduce((best, hour) =>
      hour.precipProbability > best.precipProbability ? hour : best,
    );
    if (peak.precipProbability >= 60) {
      const severe = peak.precipProbability >= 85 || peak.precipitation >= 4;
      triggered.push({
        key: 'rain',
        title: severe ? 'Heavy rainfall expected' : 'Rain expected',
        message: `${severe ? 'Heavy rainfall' : 'Rain'} is likely around ${formatHourLabel(peak.time, false)} — ${Math.round(peak.precipProbability)}% chance.`,
        severity: severe ? 'severe' : 'warning',
        evidence: evidence('cmp_rain', `${Math.round(peak.precipProbability)}%`, '≥60%', 'Open-Meteo hourly forecast', peak.time),
      });
    }
  }

  if (settings.thunder && window.length) {
    const stormHour = window.find((hour) => {
      const { condition } = describeWmo(hour.weatherCode);
      return condition === 'thunder';
    });
    if (stormHour) {
      triggered.push({
        key: 'thunder',
        title: 'Thunderstorm warning',
        message: `A thunderstorm is forecast around ${formatHourLabel(stormHour.time, false)}. Stay alert for lightning.`,
        severity: 'severe',
        evidence: evidence('card_storm', describeWmo(stormHour.weatherCode).label, 'thunderstorm forecast', 'Open-Meteo hourly forecast', stormHour.time),
      });
    }
  }

  if (settings.frost && today && today.tMin <= 0) {
    triggered.push({
      key: 'frost',
      title: 'Frost alert',
      message: `Overnight low of ${Math.round(today.tMin)}° — frost is likely. Protect plants & pipes.`,
      severity: 'warning',
      evidence: evidence('cmp_temp', `${Math.round(today.tMin)}°C`, '≤0°C', 'Open-Meteo daily forecast', today.date),
    });
  }

  if (settings.uv && today && today.uvIndexMax >= 6) {
    const extreme = today.uvIndexMax >= 8;
    triggered.push({
      key: 'uv',
      title: extreme ? 'Extreme UV today' : 'High UV today',
      message: `UV index peaks at ${Math.round(today.uvIndexMax)}. Sunscreen and shade advised between 11 AM – 3 PM.`,
      severity: extreme ? 'severe' : 'warning',
      evidence: evidence('card_uv', String(Math.round(today.uvIndexMax)), '≥6', 'Open-Meteo daily forecast', today.date),
    });
  }

  if (settings.heat && today && today.tMax >= 30) {
    triggered.push({
      key: 'heat',
      title: 'Heat warning',
      message: `High of ${Math.round(today.tMax)}° today. Stay hydrated, avoid the midday sun, and check on vulnerable people.`,
      severity: today.tMax >= 35 ? 'severe' : 'warning',
      evidence: evidence('cmp_temp', `${Math.round(today.tMax)}°C`, '≥30°C', 'Open-Meteo daily forecast', today.date),
    });
  }

  if (settings.pollen && aqi?.pollen) {
    const types: [string, number | null][] = [
      ['grass', aqi.pollen.grass],
      ['birch', aqi.pollen.birch],
      ['alder', aqi.pollen.alder],
      ['mugwort', aqi.pollen.mugwort],
      ['olive', aqi.pollen.olive],
      ['ragweed', aqi.pollen.ragweed],
    ];
    const worst = types.reduce<[string, number]>((best, [name, value]) => {
      const v = value ?? 0;
      return v > best[1] ? [name, v] : best;
    }, ['', 0]);
    if (worst[1] >= 30) {
      triggered.push({
        key: 'pollen',
        title: 'Pollen alert',
        message: `Elevated ${worst[0]} pollen (${Math.round(worst[1])} grains/m³). Allergy sufferers take care.`,
        severity: worst[1] >= 75 ? 'severe' : 'warning',
        evidence: evidence('card_pollen', `${Math.round(worst[1])} grains/m³ (${worst[0]})`, '≥30 grains/m³', 'Open-Meteo air-quality feed', aqi.observationTime),
      });
    }
  }

  if (settings.aqi && aqi?.usAqi !== null && aqi?.usAqi !== undefined && aqi.usAqi > 150) {
    triggered.push({
      key: 'aqi',
      title: aqi.usAqi > 200 ? 'Air quality very unhealthy' : 'Air quality unhealthy',
      message: `AQI is ${Math.round(aqi.usAqi)}. Limit prolonged outdoor exertion.`,
      severity: aqi.usAqi > 200 ? 'severe' : 'warning',
      evidence: evidence('cmp_aqi', String(Math.round(aqi.usAqi)), '>150', 'Open-Meteo air-quality feed', aqi.observationTime),
    });
  }

  if (
    settings.pressure &&
    current.pressureTrend !== null &&
    current.pressureTrend <= -1.5
  ) {
    triggered.push({
      key: 'pressure',
      title: 'Pressure dropping fast',
      message: `Barometric pressure fell ${Math.abs(current.pressureTrend).toFixed(1)} hPa in 3 hours — a storm front may be approaching.`,
      severity: current.pressureTrend <= -3 ? 'severe' : 'warning',
      evidence: evidence('card_pressure', `${current.pressureTrend.toFixed(1)} hPa / 3 h`, '≤−1.5 hPa / 3 h', 'Open-Meteo current conditions', current.observationTime),
    });
  }

  if (settings.wind && (current.windGusts >= 45 || current.windSpeed >= 35)) {
    triggered.push({
      key: 'wind',
      title: 'Strong wind warning',
      message: `Winds up to ${Math.round(convertWind(Math.max(current.windGusts, current.windSpeed)))} ${windUnitLabel()}. Secure loose objects outdoors.`,
      severity: current.windGusts >= 65 ? 'severe' : 'warning',
      evidence: evidence(
        'cmp_wind',
        `${Math.round(convertWind(current.windGusts >= 45 ? current.windGusts : current.windSpeed))} ${windUnitLabel()}`,
        `${current.windGusts >= 45 ? '≥45' : '≥35'} ${windUnitLabel()}`,
        'Open-Meteo current conditions',
        current.observationTime,
      ),
    });
  }

  if (settings.cape && window.length) {
    const anyThunder = window.some((hour) => describeWmo(hour.weatherCode).condition === 'thunder');
    const peak = peakCape(window, 12);
    if (!anyThunder && peak && peak.cape >= 2500) {
      triggered.push({
        key: 'cape',
        title: 'Storm conditions building',
        message: `Instability is high (CAPE ${Math.round(peak.cape).toLocaleString('en-US')} J/kg). Thunderstorms could develop around ${formatHourLabel(peak.time, false)} even though none are forecast yet.`,
        severity: 'warning',
        evidence: evidence('card_storm', `${Math.round(peak.cape)} J/kg`, '≥2500 J/kg', 'Open-Meteo hourly forecast', peak.time),
      });
    }
  }

  // ── bot2: aurora + alerts + wear ──

  // Fog: visibility is dropping in the live conditions or the next few hours.
  if (settings.fog && window.length) {
    const foggyNow = current.visibility !== null && current.visibility < 2000;
    const foggyHour = window.slice(0, 6).find(
      (hour) =>
        (hour.visibility !== null && hour.visibility < 2000) ||
        describeWmo(hour.weatherCode).condition === 'fog',
    );
    if (foggyNow || foggyHour) {
      triggered.push({
        key: 'fog',
        title: 'Fog alert',
        message: foggyNow
          ? 'Visibility is low right now — drive carefully and use low beams.'
          : `Fog is expected around ${formatHourLabel(foggyHour!.time, false)} — plan for low visibility.`,
        severity: 'warning',
        evidence: evidence(
          'card_visibility',
          foggyNow
            ? `${Math.round(current.visibility ?? 0)} m`
            : foggyHour?.visibility !== null && foggyHour?.visibility !== undefined
              ? `${Math.round(foggyHour.visibility)} m`
              : 'forecast fog condition',
          '<2000 m or fog code',
          foggyNow ? 'Open-Meteo current conditions' : 'Open-Meteo hourly forecast',
          foggyNow ? current.observationTime : foggyHour?.time,
        ),
      });
    }
  }

  // Black ice / road risk: near-freezing temperatures plus precipitation on the ground soon.
  if (settings.blackice && window.length) {
    const icyHour = window.slice(0, 9).find(
      (hour) => hour.temperature <= 1.5 && hour.temperature >= -4 && hour.precipProbability >= 30,
    );
    if (icyHour) {
      triggered.push({
        key: 'blackice',
        title: 'Icy roads possible',
        message: `Temperatures near freezing with precipitation around ${formatHourLabel(icyHour.time, false)} — roads and sidewalks may ice over.`,
        severity: 'warning',
        evidence: evidence('cmp_temp', `${Math.round(icyHour.temperature)}°C and ${Math.round(icyHour.precipProbability)}% rain chance`, '−4°C to 1.5°C and ≥30% rain chance', 'Open-Meteo hourly forecast', icyHour.time),
      });
    }
  }

  // Cold snap: today's low dives well below -10C.
  if (settings.coldsnap && today && today.tMin < -10) {
    triggered.push({
      key: 'coldsnap',
      title: 'Cold snap tonight',
      message: `Overnight low of ${Math.round(today.tMin)}° — dress in layers and protect exposed pipes.`,
      severity: today.tMin <= -20 ? 'severe' : 'warning',
      evidence: evidence('cmp_temp', `${Math.round(today.tMin)}°C`, '<−10°C', 'Open-Meteo daily forecast', today.date),
    });
  }

  // Rapid temperature drop: more than 8 degrees within any 6-hour slide.
  if (settings.tempdrop && window.length >= 2) {
    let worstDrop = 0;
    let worstDropTime = window[0].time;
    for (let i = 0; i < window.length; i++) {
      for (let j = i + 1; j < window.length && j <= i + 6; j++) {
        const drop = window[i].temperature - window[j].temperature;
        if (drop > worstDrop) {
          worstDrop = drop;
          worstDropTime = window[j].time;
        }
      }
    }
    if (worstDrop > 8) {
      triggered.push({
        key: 'tempdrop',
        title: 'Temperature dropping fast',
        message: `A drop of ${Math.round(worstDrop)}° is coming in the next few hours — grab an extra layer.`,
        severity: 'warning',
        evidence: evidence('cmp_temp', `${Math.round(worstDrop)}°C fall`, '>8°C fall in up to 6 h', 'Open-Meteo hourly forecast', worstDropTime),
      });
    }
  }

  // Stargazing: tonight's skies look great (clear night hours, low rain chance).
  if (settings.stargazing && hourly.length) {
    const nightHours = hourly.filter(
      (hour, index) =>
        index >= 6 &&
        !hour.isDay &&
        (describeWmo(hour.weatherCode).condition === 'clear' ||
          describeWmo(hour.weatherCode).condition === 'partlyCloudy'),
    );
    if (nightHours.length >= 3 && (today?.precipProbabilityMax ?? 100) < 30) {
      triggered.push({
        key: 'stargazing',
        title: 'Great night for stargazing',
        message: 'Clear skies are expected after dark — look up tonight.',
        severity: 'info',
        evidence: evidence(
          'card_storm',
          `${nightHours.length} clear night hours; ${Math.round(today?.precipProbabilityMax ?? 0)}% rain chance`,
          '≥3 clear night hours and <30% daily rain chance',
          'Open-Meteo forecast',
          nightHours[0]?.time,
        ),
      });
    }
  }

  // Rain easing soon: the nowcast's 15-minute buckets already show the break ending.
  if (settings.raineasing && extras.nowcast?.wet) {
    const { minutesUntilChange, changeTime } = extras.nowcast;
    if (minutesUntilChange !== null && minutesUntilChange <= 60 && changeTime) {
      triggered.push({
        key: 'raineasing',
        title: 'Rain easing soon',
        message: `Rain should ease off around ${formatHourLabel(changeTime, false)} — worth waiting a few minutes.`,
        severity: 'info',
        evidence: evidence('cmp_rain', `${minutesUntilChange} min until change`, '≤60 min', 'Open-Meteo 15-minute nowcast', changeTime),
      });
    }
  }

  // Aurora: geomagnetic activity is high in the 3-day SWPC outlook and the
  // location is far enough north/south to see it. Kp arrives via AlertExtras
  // because evaluateAlerts itself stays synchronous.
  if (settings.aurora && extras.auroraKpMax !== undefined && extras.auroraKpMax >= 5) {
    triggered.push({
      key: 'aurora',
      title: 'Aurora possible tonight',
      message: `Geomagnetic activity is high (Kp ${extras.auroraKpMax.toFixed(1)}). Find dark skies and look toward the poles.`,
      severity: extras.auroraKpMax >= 7 ? 'severe' : 'warning',
      evidence: evidence('card_aurora', `Kp ${extras.auroraKpMax.toFixed(1)}`, '≥5 Kp', 'NOAA SWPC outlook'),
    });
  }

  return triggered;
}
