import { describeWmo } from './wmo';
import { formatHourLabel, convertWind, windUnitLabel } from './format';
import { peakCape } from './storm';
import type { StringKey } from './i18n';
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
  | 'raineasing';

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
];

export type AlertSeverity = 'info' | 'warning' | 'severe';

export interface TriggeredAlert {
  key: AlertKey;
  title: string;
  message: string;
  severity: AlertSeverity;
}

export type AlertSettings = Record<AlertKey, boolean>;

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
};

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
      });
    }
  }

  if (settings.frost && today && today.tMin <= 0) {
    triggered.push({
      key: 'frost',
      title: 'Frost alert',
      message: `Overnight low of ${Math.round(today.tMin)}° — frost is likely. Protect plants & pipes.`,
      severity: 'warning',
    });
  }

  if (settings.uv && today && today.uvIndexMax >= 6) {
    const extreme = today.uvIndexMax >= 8;
    triggered.push({
      key: 'uv',
      title: extreme ? 'Extreme UV today' : 'High UV today',
      message: `UV index peaks at ${Math.round(today.uvIndexMax)}. Sunscreen and shade advised between 11 AM – 3 PM.`,
      severity: extreme ? 'severe' : 'warning',
    });
  }

  if (settings.heat && today && today.tMax >= 30) {
    triggered.push({
      key: 'heat',
      title: 'Heat warning',
      message: `High of ${Math.round(today.tMax)}° today. Stay hydrated, avoid the midday sun, and check on vulnerable people.`,
      severity: today.tMax >= 35 ? 'severe' : 'warning',
    });
  }

  if (settings.pollen && aqi?.pollen) {
    const types: Array<[string, number | null]> = [
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
      });
    }
  }

  if (settings.aqi && aqi?.usAqi !== null && aqi?.usAqi !== undefined && aqi.usAqi > 150) {
    triggered.push({
      key: 'aqi',
      title: aqi.usAqi > 200 ? 'Air quality very unhealthy' : 'Air quality unhealthy',
      message: `AQI is ${Math.round(aqi.usAqi)}. Limit prolonged outdoor exertion.`,
      severity: aqi.usAqi > 200 ? 'severe' : 'warning',
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
    });
  }

  if (settings.wind && (current.windGusts >= 45 || current.windSpeed >= 35)) {
    triggered.push({
      key: 'wind',
      title: 'Strong wind warning',
      message: `Winds up to ${Math.round(convertWind(Math.max(current.windGusts, current.windSpeed)))} ${windUnitLabel()}. Secure loose objects outdoors.`,
      severity: current.windGusts >= 65 ? 'severe' : 'warning',
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
    });
  }

  // Rapid temperature drop: more than 8 degrees within any 6-hour slide.
  if (settings.tempdrop && window.length >= 2) {
    let worstDrop = 0;
    for (let i = 0; i < window.length; i++) {
      for (let j = i + 1; j < window.length && j <= i + 6; j++) {
        worstDrop = Math.max(worstDrop, window[i].temperature - window[j].temperature);
      }
    }
    if (worstDrop > 8) {
      triggered.push({
        key: 'tempdrop',
        title: 'Temperature dropping fast',
        message: `A drop of ${Math.round(worstDrop)}° is coming in the next few hours — grab an extra layer.`,
        severity: 'warning',
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
    });
  }

  return triggered;
}
