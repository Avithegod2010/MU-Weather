import type { ForecastLogEntry } from './forecastLog';
import type { PastDayActual } from '../api/types';

export interface AccuracyStats {
  /** Days where a logged forecast matched an actual */
  compared: number;
  /** Mean |actual.tMax - forecast.tMax| in raw °C */
  maeHigh: number;
  /** Mean |actual.tMin - forecast.tMin| in raw °C */
  maeLow: number;
  /** Days where "was it a rain day?" call agreed (>= 1.0 mm on both sides) */
  rainCorrect: number;
  /** Biggest |ΔtMax| day, signed actual - forecast (rounded) */
  worstMiss: { date: string; delta: number } | null;
}

/** Rain-day threshold, matching the 30-day "wet days" definition. */
const RAIN_DAY_MM = 1.0;

/**
 * Personal forecast accuracy over the matched days: mean absolute errors for
 * the daily high/low, rain-day hit count, and the single worst miss.
 * Returns null when nothing can be compared yet.
 */
export function computeAccuracy(
  log: ForecastLogEntry[],
  actuals: PastDayActual[]
): AccuracyStats | null {
  if (log.length === 0 || actuals.length === 0) return null;

  const byDate = new Map(log.map((entry) => [entry.date, entry]));
  let compared = 0;
  let highErrorSum = 0;
  let lowErrorSum = 0;
  let rainCorrect = 0;
  let worstMiss: AccuracyStats['worstMiss'] = null;

  for (const actual of actuals) {
    const forecast = byDate.get(actual.date);
    if (!forecast) continue;
    compared += 1;

    const highDelta = actual.tMax - forecast.tMax;
    const lowDelta = actual.tMin - forecast.tMin;
    highErrorSum += Math.abs(highDelta);
    lowErrorSum += Math.abs(lowDelta);

    const actualRain = actual.precipSum >= RAIN_DAY_MM;
    const forecastRain = forecast.precipSum >= RAIN_DAY_MM;
    if (actualRain === forecastRain) rainCorrect += 1;

    const delta = Math.round(highDelta);
    if (!worstMiss || Math.abs(delta) > Math.abs(worstMiss.delta)) {
      worstMiss = { date: actual.date, delta };
    }
  }

  if (compared === 0) return null;
  return {
    compared,
    maeHigh: highErrorSum / compared,
    maeLow: lowErrorSum / compared,
    rainCorrect,
    worstMiss,
  };
}
