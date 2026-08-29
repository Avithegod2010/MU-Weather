import type { HealthAdviceKey } from './i18n';

export type HealthLevel = 'low' | 'moderate' | 'high';

export interface HealthRisk {
  level: HealthLevel;
  /** i18n key of the advice line the card shows under the level chip. */
  adviceKey: HealthAdviceKey;
}

/**
 * Migraine risk from the 3h pressure change (hPa).
 * Sharp pressure swings are a known migraine trigger.
 */
export function migraineRisk(pressureTrend: number): HealthRisk {
  const abs = Math.abs(pressureTrend);
  return {
    level: abs >= 2 ? 'high' : abs >= 0.5 ? 'moderate' : 'low',
    adviceKey: 'health_advice_migraine',
  };
}

/**
 * Airway irritation from pollution and humidity.
 * US AQI bands (see utils/aqi.ts): <= 50 good, <= 100 moderate, > 100 unhealthy.
 * With a null AQI the verdict rests on humidity alone.
 */
export function respiratoryRisk(aqi: number | null, humidity: number): HealthRisk {
  let level: HealthLevel;
  if (aqi === null) {
    level = humidity > 80 ? 'high' : humidity >= 60 ? 'moderate' : 'low';
  } else if (aqi > 100 || humidity > 80) {
    level = 'high';
  } else if (aqi <= 50 && humidity < 60) {
    level = 'low';
  } else {
    level = 'moderate';
  }
  return { level, adviceKey: 'health_advice_respiratory' };
}

/**
 * Influenza risk: cold AND dry air keeps viruses viable and spreading.
 */
export function fluRisk(tempC: number, humidity: number): HealthRisk {
  const cold = tempC < 10;
  const dry = humidity < 40;
  return {
    level: cold && dry ? 'high' : cold || dry ? 'moderate' : 'low',
    adviceKey: 'health_advice_flu',
  };
}
