import { describeWmo } from './wmo';
import { formatHourLabel } from './format';
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
  title: string;
  subtitle: string;
}

export const ALERT_DEFINITIONS: AlertDefinition[] = [
  { key: 'rain', title: 'Rain Alert', subtitle: 'Warn me when significant rain is forecast in the next 12 hours' },
  { key: 'thunder', title: 'Thunderstorm Alert', subtitle: 'Warn me when thunderstorms appear in the forecast' },
  { key: 'frost', title: 'Frost Alert', subtitle: 'Alert when overnight temperatures drop to 0°C or below' },
  { key: 'uv', title: 'UV Alert', subtitle: 'Alert when the UV index reaches very high levels' },
  { key: 'pollen', title: 'Pollen Alert', subtitle: 'Alert when pollen levels are elevated (Europe only)' },
  { key: 'aqi', title: 'Air Quality Alert', subtitle: 'Alert when air quality becomes unhealthy' },
  { key: 'pressure', title: 'Pressure Alert', subtitle: 'Alert when barometric pressure drops rapidly' },
  { key: 'wind', title: 'Wind Alert', subtitle: 'Alert when strong winds or gusts are expected' },
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
      message: `Winds up to ${Math.round(Math.max(current.windGusts, current.windSpeed))} km/h. Secure loose objects outdoors.`,
      severity: current.windGusts >= 65 ? 'severe' : 'warning',
    });
  }

  return triggered;
}
