import { describeWmo } from './wmo';
import { formatHourLabel, convertWind, windUnitLabel } from './format';
import type { StringKey } from './i18n';
import type { AqiInfo, CurrentConditions, DayPoint, HourPoint } from '../api/types';

export type AlertKey =
  | 'rain'
  | 'thunder'
  | 'frost'
  | 'uv'
  | 'aqi'
  | 'pressure'
  | 'wind'
  | 'pollen';

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
  { key: 'pollen', title: 'alert_pollen_title', subtitle: 'alert_pollen_sub' },
  { key: 'aqi', title: 'alert_aqi_title', subtitle: 'alert_aqi_sub' },
  { key: 'pressure', title: 'alert_pressure_title', subtitle: 'alert_pressure_sub' },
  { key: 'wind', title: 'alert_wind_title', subtitle: 'alert_wind_sub' },
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
};

export function evaluateAlerts(
  settings: AlertSettings,
  current: CurrentConditions,
  hourly: HourPoint[],
  today: DayPoint | null,
  aqi: AqiInfo | null,
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

  return triggered;
}
