import type { ForecastLogEntry } from './forecastLog';
import { roundedCoord, type LocationAnchor, type ModelLogEntry } from './modelAccuracyLog';
import type { ModelKey } from '../api/providers';
import type { PastDayActual } from '../api/types';

export interface AccuracyStats {
  /** Days where a logged forecast matched an actual */
  compared: number;
  /** Mean |actual.tMax - forecast.tMax| in raw °C */
  maeHigh: number;
  /** Mean |actual.tMin - forecast.tMin| in raw °C */
  maeLow: number;
  /** Actual rain days whose forecast also called rain (>= 1.0 mm) */
  rainCorrect: number;
  /** Actual rain days in the compared window — the denominator for rainCorrect */
  rainTotal: number;
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
  let rainTotal = 0;
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
    if (actualRain) {
      rainTotal += 1;
      if (forecastRain) rainCorrect += 1;
    }

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
    rainTotal,
    worstMiss,
  };
}

/* ------------------------------------------------------------------ */
/* Per-model leaderboard (multi-model accuracy)                        */
/* ------------------------------------------------------------------ */

/** A day counts as a hit when a model's high lands within this many °C of reality. */
export const MODEL_HIT_TOLERANCE_C = 2;

/**
 * A model cannot be ranked from a single scored day - one lucky (or unlucky)
 * comparison would decide the whole leaderboard. Below this it is omitted and
 * the view keeps showing the "still collecting" empty state.
 */
export const MIN_MODEL_COMPARED_DAYS = 2;

export interface ModelAccuracyRow {
  model: ModelKey;
  /** Days where this model had both a logged prediction and a real observation */
  compared: number;
  /** Share of `compared` days within MODEL_HIT_TOLERANCE_C of the observed high (0-1) */
  hitRate: number;
  /** Mean |actual.tMax - model.tMax| in raw °C */
  maeHigh: number;
}

export interface ModelAccuracySummary {
  /** Ranked models, best first. Empty until at least one model has enough days. */
  rows: ModelAccuracyRow[];
  /** Distinct dates on which at least one model was scored - the "last {n} days". */
  comparedDays: number;
}

/**
 * Rank the comparison models by how often their daily high landed within
 * MODEL_HIT_TOLERANCE_C of what actually happened, counting only the days this
 * device logged for that model AT THE ACTIVE LOCATION (utils/modelAccuracyLog
 * stores the coordinates with every entry, so a Paris prediction is never
 * scored against London observations), and only models with at least
 * MIN_MODEL_COMPARED_DAYS scored days. Ties break on the mean error, then on
 * the number of compared days. An empty `rows` means "keep collecting".
 */
export function computeModelAccuracy(
  log: ModelLogEntry[],
  actuals: PastDayActual[],
  location: LocationAnchor | null,
): ModelAccuracySummary {
  if (!location || log.length === 0 || actuals.length === 0) {
    return { rows: [], comparedDays: 0 };
  }

  const lat = roundedCoord(location.latitude);
  const lon = roundedCoord(location.longitude);
  const actualByDate = new Map(actuals.map((actual) => [actual.date, actual]));
  const byModel = new Map<ModelKey, { compared: number; hits: number; errorSum: number }>();
  const comparedDates = new Set<string>();

  for (const entry of log) {
    if (roundedCoord(entry.lat) !== lat || roundedCoord(entry.lon) !== lon) continue;
    const actual = actualByDate.get(entry.date);
    if (!actual) continue;
    comparedDates.add(entry.date);
    const bucket = byModel.get(entry.model) ?? { compared: 0, hits: 0, errorSum: 0 };
    const error = Math.abs(actual.tMax - entry.tMax);
    bucket.compared += 1;
    bucket.errorSum += error;
    if (error <= MODEL_HIT_TOLERANCE_C) bucket.hits += 1;
    byModel.set(entry.model, bucket);
  }

  const rows: ModelAccuracyRow[] = [];
  for (const [model, bucket] of byModel) {
    if (bucket.compared < MIN_MODEL_COMPARED_DAYS) continue;
    rows.push({
      model,
      compared: bucket.compared,
      hitRate: bucket.hits / bucket.compared,
      maeHigh: bucket.errorSum / bucket.compared,
    });
  }
  rows.sort(
    (a, b) => b.hitRate - a.hitRate || a.maeHigh - b.maeHigh || b.compared - a.compared,
  );
  return { rows, comparedDays: comparedDates.size };
}
