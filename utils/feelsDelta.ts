import { t } from './i18n';
import { getUnits } from './format';

export type FeelsDirection = 'warmer' | 'colder';

/** Live conditions that can explain a feels-like gap. */
export interface FeelsContext {
  /** km/h (Open-Meteo default unit). */
  windSpeed: number;
  /** Relative humidity, 0-100. */
  humidity: number;
  /** 0-100. */
  cloudCover: number;
  isDay: boolean;
}

/** Which clause of the feels_cause_* family fits the direction and conditions. */
function causeKey(direction: FeelsDirection, ctx?: FeelsContext): 'feels_cause_wind' | 'feels_cause_humidity' | 'feels_cause_sun' | null {
  if (!ctx) return null;
  if (direction === 'colder') {
    if (ctx.windSpeed >= 25) return 'feels_cause_wind';
    if (ctx.humidity >= 75) return 'feels_cause_humidity';
    return null;
  }
  if (ctx.humidity >= 75) return 'feels_cause_humidity';
  if (ctx.isDay && ctx.cloudCover <= 20) return 'feels_cause_sun';
  return null;
}

/**
 * "Feels 4° colder than it is — the wind's doing": the gap between the actual
 * and apparent temperature, localized and unit-aware (a 4° gap in °C reads as
 * 7° in °F, so the threshold scales by 9/5). Returns null when the gap is
 * below the notice threshold. When live conditions explain the gap, the
 * matching feels_cause_* clause is appended.
 */
export function feelsDeltaLine(actual: number, apparent: number, ctx?: FeelsContext): string | null {
  const gapC = actual - apparent;
  const thresholdC = 1.5;
  if (Math.abs(gapC) < thresholdC) return null;
  const inFahrenheit = getUnits().temp === 'fahrenheit';
  const gap = Math.round(Math.abs(gapC * (inFahrenheit ? 9 / 5 : 1)));
  const direction: FeelsDirection = gapC > 0 ? 'colder' : 'warmer';
  const line = t(direction === 'colder' ? 'feels_colder' : 'feels_warmer').replace('{n}', String(gap));
  const cause = causeKey(direction, ctx);
  return cause ? `${line} ${t(cause)}` : line;
}
