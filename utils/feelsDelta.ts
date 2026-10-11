import { t } from './i18n';
import { getUnits } from './format';

export type FeelsDirection = 'warmer' | 'colder';

/**
 * "Feels 4° colder than it is — the wind's doing": the gap between the actual
 * and apparent temperature, localized and unit-aware (a 4° gap in °C reads as
 * 7° in °F, so the threshold scales by 9/5). Returns null when the gap is
 * below the notice threshold.
 */
export function feelsDeltaLine(actual: number, apparent: number): string | null {
  const gapC = actual - apparent;
  const thresholdC = 1.5;
  if (Math.abs(gapC) < thresholdC) return null;
  const inFahrenheit = getUnits().temp === 'fahrenheit';
  const gap = Math.round(Math.abs(gapC * (inFahrenheit ? 9 / 5 : 1)));
  const direction: FeelsDirection = gapC > 0 ? 'colder' : 'warmer';
  return t(direction === 'colder' ? 'feels_colder' : 'feels_warmer').replace('{n}', String(gap));
}
