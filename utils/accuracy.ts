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
/* Per-metric model leaderboard                                        */
/* ------------------------------------------------------------------ */

/** The metrics a model can be ranked on, in switcher order. */
export const MODEL_METRICS = ['temp', 'wind', 'rain'] as const;
export type ModelMetric = (typeof MODEL_METRICS)[number];

/** A day counts as a hit when a model's high lands within this many °C of reality. */
export const MODEL_HIT_TOLERANCE_C = 2;
/**
 * Same idea for the daily maximum wind (km/h). Wind is far noisier than
 * temperature, so the tolerance is deliberately wide - a model within 8 km/h
 * on the daily maximum has genuinely called the day.
 */
export const MODEL_WIND_TOLERANCE_KMH = 8;

/**
 * A model cannot be ranked from a single scored day - one lucky (or unlucky)
 * comparison would decide the whole leaderboard. Below this it is omitted and
 * the view keeps showing the "still collecting" empty state.
 */
export const MIN_MODEL_COMPARED_DAYS = 2;

export interface ModelMetricRow {
  model: ModelKey;
  /** Days where this model had both a logged prediction and a real observation */
  compared: number;
  /** Share of `compared` days the model called right (0-1) */
  hitRate: number;
  /** Mean |actual - predicted| in the metric's raw unit (°C, km/h, mm) */
  mae: number;
}

export interface ModelMetricSummary {
  /** Ranked models, best first. Empty until a model has enough scored days. */
  rows: ModelMetricRow[];
  /** Distinct dates scored for this metric - the "last {n} days" caption. */
  comparedDays: number;
}

/** One scored day: the two numbers compared and whether the model called it. */
interface MetricPair {
  predicted: number;
  actual: number;
  hit: boolean;
}

/** Daily high: a plain absolute-error comparison in °C. */
function scoreTemp(entry: ModelLogEntry, actual: PastDayActual): MetricPair | null {
  return {
    predicted: entry.tMax,
    actual: actual.tMax,
    hit: Math.abs(actual.tMax - entry.tMax) <= MODEL_HIT_TOLERANCE_C,
  };
}

/**
 * Daily maximum wind. Both sides can be absent (entries logged before the
 * variable existed, archive rows with no value) - such days are simply not
 * scored, so the wind leaderboard starts empty instead of showing zeroes.
 */
function scoreWind(entry: ModelLogEntry, actual: PastDayActual): MetricPair | null {
  const predicted = entry.windMax;
  const observed = actual.windMax;
  if (typeof predicted !== 'number' || typeof observed !== 'number') return null;
  if (!Number.isFinite(predicted) || !Number.isFinite(observed)) return null;
  return {
    predicted,
    actual: observed,
    hit: Math.abs(observed - predicted) <= MODEL_WIND_TOLERANCE_KMH,
  };
}

/**
 * Daily rain total (mm). The hit test is wet/dry AGREEMENT rather than
 * "called rain": ranking on the rarer correct-rain call alone would crown the
 * wettest-forecasting model, not the most accurate one. The mean error still
 * shows how far off the totals run.
 */
function scoreRain(entry: ModelLogEntry, actual: PastDayActual): MetricPair | null {
  const predicted = entry.precipSum;
  if (typeof predicted !== 'number' || !Number.isFinite(predicted)) return null;
  return {
    predicted,
    actual: actual.precipSum,
    hit: (predicted >= RAIN_DAY_MM) === (actual.precipSum >= RAIN_DAY_MM),
  };
}

const METRIC_SCORERS: Record<
  ModelMetric,
  (entry: ModelLogEntry, actual: PastDayActual) => MetricPair | null
> = {
  temp: scoreTemp,
  wind: scoreWind,
  rain: scoreRain,
};

/**
 * Rank the comparison models for one metric, counting only days this device
 * logged for that model AT THE ACTIVE LOCATION (utils/modelAccuracyLog stores
 * the coordinates with every entry, so a Paris prediction is never scored
 * against London observations), and only models with at least
 * MIN_MODEL_COMPARED_DAYS scored days. Ties break on the mean error, then on
 * the number of scored days. An empty `rows` means "keep collecting".
 */
export function computeModelMetricAccuracy(
  log: ModelLogEntry[],
  actuals: PastDayActual[],
  location: LocationAnchor | null,
  metric: ModelMetric,
): ModelMetricSummary {
  if (!location || log.length === 0 || actuals.length === 0) {
    return { rows: [], comparedDays: 0 };
  }

  const lat = roundedCoord(location.latitude);
  const lon = roundedCoord(location.longitude);
  const scorer = METRIC_SCORERS[metric];
  const actualByDate = new Map(actuals.map((actual) => [actual.date, actual]));
  const byModel = new Map<ModelKey, { compared: number; hits: number; errorSum: number }>();
  const comparedDates = new Set<string>();

  for (const entry of log) {
    if (roundedCoord(entry.lat) !== lat || roundedCoord(entry.lon) !== lon) continue;
    const actual = actualByDate.get(entry.date);
    if (!actual) continue;
    const pair = scorer(entry, actual);
    if (!pair) continue;
    comparedDates.add(entry.date);
    const bucket = byModel.get(entry.model) ?? { compared: 0, hits: 0, errorSum: 0 };
    bucket.compared += 1;
    bucket.errorSum += Math.abs(pair.actual - pair.predicted);
    if (pair.hit) bucket.hits += 1;
    byModel.set(entry.model, bucket);
  }

  const rows: ModelMetricRow[] = [];
  for (const [model, bucket] of byModel) {
    if (bucket.compared < MIN_MODEL_COMPARED_DAYS) continue;
    rows.push({
      model,
      compared: bucket.compared,
      hitRate: bucket.hits / bucket.compared,
      mae: bucket.errorSum / bucket.compared,
    });
  }
  rows.sort((a, b) => b.hitRate - a.hitRate || a.mae - b.mae || b.compared - a.compared);
  return { rows, comparedDays: comparedDates.size };
}

/** The original temperature leaderboard shape, kept for existing callers. */
export interface ModelAccuracyRow extends ModelMetricRow {
  /** Mean |actual.tMax - model.tMax| in raw °C (alias of `mae`). */
  maeHigh: number;
}

/**
 * Temperature leaderboard, unchanged in behaviour - the metric-generalised
 * scorer above reduced to its temperature case.
 */
export function computeModelAccuracy(
  log: ModelLogEntry[],
  actuals: PastDayActual[],
  location: LocationAnchor | null,
): { rows: ModelAccuracyRow[]; comparedDays: number } {
  const summary = computeModelMetricAccuracy(log, actuals, location, 'temp');
  return {
    rows: summary.rows.map((row) => ({ ...row, maeHigh: row.mae })),
    comparedDays: summary.comparedDays,
  };
}
