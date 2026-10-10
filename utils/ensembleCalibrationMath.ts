import type {
  EnsembleSpread,
  HourlyWeatherObservation,
} from '../api/types';
import { localTimestampAsUtc } from './rainCalibrationMath';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Bound device-local verification data to the same horizons as rain scoring. */
export const MAX_ENSEMBLE_CALIBRATION_DAYS = 30;
export const MAX_ENSEMBLE_CALIBRATION_LOCATIONS = 8;
export const MAX_ENSEMBLE_CALIBRATION_ROWS_PER_LOCATION = MAX_ENSEMBLE_CALIBRATION_DAYS * 24 * 2;
export const MAX_ENSEMBLE_CALIBRATION_ROWS =
  MAX_ENSEMBLE_CALIBRATION_LOCATIONS * MAX_ENSEMBLE_CALIBRATION_ROWS_PER_LOCATION;
export const MAX_ENSEMBLE_CALIBRATION_LEAD_HOURS = 97;
export const ENSEMBLE_OBSERVATION_DELAY_MS = 72 * HOUR_MS;
export const MIN_CONTINUOUS_CALIBRATION_CASES = 100;
export const MIN_CONTINUOUS_CALIBRATION_DAYS = 14;
export const MIN_CONTINUOUS_LEAD_BUCKET_CASES = 20;
export const MIN_CONTINUOUS_LEAD_BUCKET_DAYS = 7;
export const MIN_ENSEMBLE_MEMBERS_PER_HOUR = 10;
export const NOMINAL_CENTRAL_INTERVAL_COVERAGE = 0.8;

export const CONTINUOUS_LEAD_TIME_BUCKETS = [
  { startLeadHours: 0, endLeadHours: 24 },
  { startLeadHours: 24, endLeadHours: 48 },
  { startLeadHours: 48, endLeadHours: 72 },
  { startLeadHours: 72, endLeadHours: MAX_ENSEMBLE_CALIBRATION_LEAD_HOURS },
] as const;

export type EnsembleCalibrationMetric = 'temperature' | 'wind';

export interface EnsembleCalibrationAnchor {
  latitude: number;
  longitude: number;
}

/** One forecast distribution and its eventual Archive API observation. */
export interface EnsembleCalibrationLogEntry {
  lat: number;
  lon: number;
  /** Forecast/archive location-local wall-clock hour. */
  time: string;
  /** Epoch based on the location offset at issue time; used for expiry only. */
  validAt: number;
  issuedAt: number;
  leadHours: number;
  metric: EnsembleCalibrationMetric;
  p10: number;
  median: number;
  p90: number;
  observed: number | null;
  observedAt?: number;
}

export interface ContinuousCalibrationBucket {
  startLeadHours: number;
  endLeadHours: number;
  cases: number;
  verifiedDays: number;
  medianAbsoluteError: number | null;
  /** Fraction of observations inside the forecast P10-P90 interval. */
  centralIntervalCoverage: number | null;
  coveredCases: number;
  /** 95% Wilson interval for observed coverage; this is sampling uncertainty, not a forecast band. */
  coverageLower95: number | null;
  coverageUpper95: number | null;
  meanIntervalWidth: number | null;
  sufficientlyPopulated: boolean;
}

export interface ContinuousCalibrationMetricSummary {
  status: 'insufficient' | 'ready';
  verifiedCases: number;
  verifiedDays: number;
  requiredCases: number;
  requiredDays: number;
  medianAbsoluteError: number | null;
  /** Fraction of observations inside the nominal 80% P10-P90 interval. */
  centralIntervalCoverage: number | null;
  coveredCases: number;
  /** 95% Wilson interval for observed coverage (sampling uncertainty). */
  coverageLower95: number | null;
  coverageUpper95: number | null;
  meanIntervalWidth: number | null;
  leadTimeBuckets: ContinuousCalibrationBucket[];
}

export interface EnsembleCalibrationSummary {
  temperature: ContinuousCalibrationMetricSummary;
  wind: ContinuousCalibrationMetricSummary;
}

function roundedCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

function isLocationAnchor(value: EnsembleCalibrationAnchor): boolean {
  return Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90 &&
    Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180;
}

function locationKey(value: Pick<EnsembleCalibrationLogEntry, 'lat' | 'lon'>): string {
  return `${roundedCoord(value.lat)}|${roundedCoord(value.lon)}`;
}

function forecastKey(
  value: Pick<EnsembleCalibrationLogEntry, 'lat' | 'lon' | 'time' | 'metric'>,
): string {
  return `${locationKey(value)}|${value.time}|${value.metric}`;
}

function validDistribution(p10: number, median: number, p90: number): boolean {
  return Number.isFinite(p10) && Number.isFinite(median) && Number.isFinite(p90) &&
    p10 <= median && median <= p90;
}

/**
 * Convert the latest ensemble distributions into bounded location-scoped
 * hourly samples. Repeated local wall-clock hours at a DST fold are omitted,
 * because the archive's `timezone=auto` row cannot disambiguate the two instants.
 */
export function createEnsembleCalibrationEntries(
  spread: EnsembleSpread,
  location: EnsembleCalibrationAnchor,
  utcOffsetSeconds: number,
): EnsembleCalibrationLogEntry[] {
  if (
    !isLocationAnchor(location) || !Number.isFinite(utcOffsetSeconds) ||
    !Number.isFinite(spread.fetchedAt) || spread.fetchedAt <= 0 ||
    !Number.isFinite(spread.members) || !Array.isArray(spread.points)
  ) return [];

  const byTime = new Map<string, EnsembleCalibrationLogEntry[]>();
  const ambiguous = new Set<string>();
  for (const point of spread.points) {
    if (typeof point.time !== 'string') continue;
    const localEpoch = localTimestampAsUtc(point.time);
    if (localEpoch === null) continue;
    const validAt = localEpoch - utcOffsetSeconds * 1000;
    const leadHours = (validAt - spread.fetchedAt) / HOUR_MS;
    if (leadHours <= 0 || leadHours > MAX_ENSEMBLE_CALIBRATION_LEAD_HOURS) continue;
    if (ambiguous.has(point.time)) continue;
    if (byTime.has(point.time)) {
      byTime.delete(point.time);
      ambiguous.add(point.time);
      continue;
    }

    const entries: EnsembleCalibrationLogEntry[] = [];
    const temperatureMembers = point.temperatureMembers ?? spread.members;
    if (
      temperatureMembers >= MIN_ENSEMBLE_MEMBERS_PER_HOUR &&
      validDistribution(point.tP10, point.tMedian, point.tP90)
    ) {
      entries.push({
        lat: roundedCoord(location.latitude),
        lon: roundedCoord(location.longitude),
        time: point.time,
        validAt,
        issuedAt: spread.fetchedAt,
        leadHours: Number(leadHours.toFixed(3)),
        metric: 'temperature',
        p10: point.tP10,
        median: point.tMedian,
        p90: point.tP90,
        observed: null,
      });
    }
    const windMembers = point.windMembers ?? 0;
    if (
      windMembers >= MIN_ENSEMBLE_MEMBERS_PER_HOUR &&
      typeof point.windP10 === 'number' && typeof point.windMedian === 'number' &&
      typeof point.windP90 === 'number' &&
      validDistribution(point.windP10, point.windMedian, point.windP90) &&
      point.windP10 >= 0
    ) {
      entries.push({
        lat: roundedCoord(location.latitude),
        lon: roundedCoord(location.longitude),
        time: point.time,
        validAt,
        issuedAt: spread.fetchedAt,
        leadHours: Number(leadHours.toFixed(3)),
        metric: 'wind',
        p10: point.windP10,
        median: point.windMedian,
        p90: point.windP90,
        observed: null,
      });
    }
    if (entries.length > 0) byTime.set(point.time, entries);
  }
  return [...byTime.values()].flat();
}

/** Validate rows loaded from untrusted device-local JSON. */
export function isEnsembleCalibrationLogEntry(value: unknown): value is EnsembleCalibrationLogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<EnsembleCalibrationLogEntry>;
  return (
    typeof entry.lat === 'number' && Number.isFinite(entry.lat) && entry.lat >= -90 && entry.lat <= 90 &&
    typeof entry.lon === 'number' && Number.isFinite(entry.lon) && entry.lon >= -180 && entry.lon <= 180 &&
    typeof entry.time === 'string' && localTimestampAsUtc(entry.time) !== null &&
    typeof entry.validAt === 'number' && Number.isFinite(entry.validAt) &&
    typeof entry.issuedAt === 'number' && Number.isFinite(entry.issuedAt) && entry.issuedAt > 0 &&
    typeof entry.leadHours === 'number' && Number.isFinite(entry.leadHours) &&
    entry.leadHours > 0 && entry.leadHours <= MAX_ENSEMBLE_CALIBRATION_LEAD_HOURS &&
    (entry.metric === 'temperature' || entry.metric === 'wind') &&
    typeof entry.p10 === 'number' && typeof entry.median === 'number' && typeof entry.p90 === 'number' &&
    validDistribution(entry.p10, entry.median, entry.p90) &&
    (entry.metric !== 'wind' || entry.p10 >= 0) &&
    (entry.observed === null || (typeof entry.observed === 'number' && Number.isFinite(entry.observed))) &&
    (entry.observed === null
      ? entry.observedAt === undefined
      : typeof entry.observedAt === 'number' && Number.isFinite(entry.observedAt) && entry.observedAt > 0)
  );
}

/** Replace only unverified forecasts with a newer issue; retain verified rows. */
export function mergeEnsembleCalibrationEntries(
  existing: EnsembleCalibrationLogEntry[],
  additions: EnsembleCalibrationLogEntry[],
  now = Date.now(),
): EnsembleCalibrationLogEntry[] {
  const byForecast = new Map<string, EnsembleCalibrationLogEntry>();
  for (const entry of existing) byForecast.set(forecastKey(entry), entry);
  for (const addition of additions) {
    const key = forecastKey(addition);
    const previous = byForecast.get(key);
    if (previous?.observed !== null && previous?.observed !== undefined) continue;
    if (!previous || addition.issuedAt > previous.issuedAt) byForecast.set(key, addition);
  }

  const cutoff = now - MAX_ENSEMBLE_CALIBRATION_DAYS * DAY_MS;
  const futureLimit = now + MAX_ENSEMBLE_CALIBRATION_LEAD_HOURS * HOUR_MS;
  const byLocation = new Map<string, EnsembleCalibrationLogEntry[]>();
  for (const entry of byForecast.values()) {
    if (entry.validAt < cutoff || entry.validAt > futureLimit) continue;
    const key = locationKey(entry);
    const group = byLocation.get(key);
    if (group) group.push(entry);
    else byLocation.set(key, [entry]);
  }
  const locations = [...byLocation.entries()]
    .map(([key, entries]) => ({
      key,
      entries: entries
        .sort((a, b) => a.validAt - b.validAt || a.issuedAt - b.issuedAt || a.metric.localeCompare(b.metric))
        .slice(-MAX_ENSEMBLE_CALIBRATION_ROWS_PER_LOCATION),
      latestIssue: Math.max(...entries.map((entry) => entry.issuedAt)),
    }))
    .sort((a, b) => b.latestIssue - a.latestIssue)
    .slice(0, MAX_ENSEMBLE_CALIBRATION_LOCATIONS);
  return locations
    .flatMap((row) => row.entries)
    .sort((a, b) => a.validAt - b.validAt || a.issuedAt - b.issuedAt || a.metric.localeCompare(b.metric))
    .slice(-MAX_ENSEMBLE_CALIBRATION_ROWS);
}

/** Match local archive hours and attach observations once per metric/hour. */
export function applyEnsembleCalibrationObservations(
  entries: EnsembleCalibrationLogEntry[],
  location: EnsembleCalibrationAnchor,
  observations: HourlyWeatherObservation[],
  observedAt = Date.now(),
): EnsembleCalibrationLogEntry[] {
  if (!isLocationAnchor(location) || !Number.isFinite(observedAt) || observedAt <= 0) return entries;
  const lat = roundedCoord(location.latitude);
  const lon = roundedCoord(location.longitude);
  const actualsByTime = new Map<string, Partial<Record<EnsembleCalibrationMetric, number>>>();
  for (const row of observations) {
    if (typeof row.time !== 'string' || localTimestampAsUtc(row.time) === null) continue;
    const actuals: Partial<Record<EnsembleCalibrationMetric, number>> = {};
    if (typeof row.temperature === 'number' && Number.isFinite(row.temperature)) {
      actuals.temperature = row.temperature;
    }
    if (typeof row.windSpeed === 'number' && Number.isFinite(row.windSpeed) && row.windSpeed >= 0) {
      actuals.wind = row.windSpeed;
    }
    actualsByTime.set(row.time, actuals);
  }
  return entries.map((entry) => {
    if (roundedCoord(entry.lat) !== lat || roundedCoord(entry.lon) !== lon || entry.observed !== null) {
      return entry;
    }
    const actual = actualsByTime.get(entry.time)?.[entry.metric];
    if (actual === undefined) return entry;
    return { ...entry, observed: actual, observedAt };
  });
}

/** Date range for unverified, archive-ready forecasts at one location. */
export function ensembleVerificationDateRange(
  entries: EnsembleCalibrationLogEntry[],
  now = Date.now(),
): { startDate: string; endDate: string } | null {
  const cutoff = now - ENSEMBLE_OBSERVATION_DELAY_MS;
  const oldest = now - MAX_ENSEMBLE_CALIBRATION_DAYS * DAY_MS;
  const dates = entries
    .filter((entry) => entry.observed === null && entry.validAt <= cutoff && entry.validAt >= oldest)
    .map((entry) => entry.time.slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  return dates.length > 0 ? { startDate: dates[0], endDate: dates[dates.length - 1] } : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Wilson score interval avoids impossible bounds and behaves better for small binomial samples. */
function wilson95(successes: number, trials: number): { lower: number; upper: number } | null {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || trials <= 0 || successes < 0 || successes > trials) {
    return null;
  }
  const z = 1.959963984540054;
  const proportion = successes / trials;
  const zSquared = z * z;
  const denominator = 1 + zSquared / trials;
  const center = (proportion + zSquared / (2 * trials)) / denominator;
  const margin = (z * Math.sqrt((proportion * (1 - proportion) / trials) + zSquared / (4 * trials * trials))) / denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

function summarizeBucket(
  samples: EnsembleCalibrationLogEntry[],
  startLeadHours: number,
  endLeadHours: number,
): ContinuousCalibrationBucket {
  const bucket = samples.filter((sample) =>
    sample.leadHours > startLeadHours && sample.leadHours <= endLeadHours && sample.observed !== null,
  );
  const days = new Set(bucket.map((sample) => sample.time.slice(0, 10)));
  const absoluteErrors = bucket.map((sample) => Math.abs((sample.observed as number) - sample.median));
  const covered = bucket.filter((sample) =>
    (sample.observed as number) >= sample.p10 && (sample.observed as number) <= sample.p90,
  ).length;
  const coverageInterval = wilson95(covered, bucket.length);
  return {
    startLeadHours,
    endLeadHours,
    cases: bucket.length,
    verifiedDays: days.size,
    medianAbsoluteError: median(absoluteErrors),
    centralIntervalCoverage: bucket.length > 0 ? covered / bucket.length : null,
    coveredCases: covered,
    coverageLower95: coverageInterval?.lower ?? null,
    coverageUpper95: coverageInterval?.upper ?? null,
    meanIntervalWidth: bucket.length > 0
      ? bucket.reduce((sum, sample) => sum + sample.p90 - sample.p10, 0) / bucket.length
      : null,
    sufficientlyPopulated:
      bucket.length >= MIN_CONTINUOUS_LEAD_BUCKET_CASES && days.size >= MIN_CONTINUOUS_LEAD_BUCKET_DAYS,
  };
}

function emptyMetricSummary(): ContinuousCalibrationMetricSummary {
  return {
    status: 'insufficient',
    verifiedCases: 0,
    verifiedDays: 0,
    requiredCases: MIN_CONTINUOUS_CALIBRATION_CASES,
    requiredDays: MIN_CONTINUOUS_CALIBRATION_DAYS,
    medianAbsoluteError: null,
    centralIntervalCoverage: null,
    coveredCases: 0,
    coverageLower95: null,
    coverageUpper95: null,
    meanIntervalWidth: null,
    leadTimeBuckets: CONTINUOUS_LEAD_TIME_BUCKETS.map(({ startLeadHours, endLeadHours }) =>
      summarizeBucket([], startLeadHours, endLeadHours),
    ),
  };
}

function summarizeMetric(
  entries: EnsembleCalibrationLogEntry[],
  metric: EnsembleCalibrationMetric,
): ContinuousCalibrationMetricSummary {
  const samples = entries.filter((entry) => entry.metric === metric && entry.observed !== null);
  const verifiedDays = new Set(samples.map((entry) => entry.time.slice(0, 10))).size;
  const absoluteErrors = samples.map((sample) => Math.abs((sample.observed as number) - sample.median));
  const covered = samples.filter((sample) =>
    (sample.observed as number) >= sample.p10 && (sample.observed as number) <= sample.p90,
  ).length;
  const coverageInterval = wilson95(covered, samples.length);
  const supported = samples.length >= MIN_CONTINUOUS_CALIBRATION_CASES &&
    verifiedDays >= MIN_CONTINUOUS_CALIBRATION_DAYS;
  return {
    status: supported ? 'ready' : 'insufficient',
    verifiedCases: samples.length,
    verifiedDays,
    requiredCases: MIN_CONTINUOUS_CALIBRATION_CASES,
    requiredDays: MIN_CONTINUOUS_CALIBRATION_DAYS,
    medianAbsoluteError: supported ? median(absoluteErrors) : null,
    centralIntervalCoverage: supported ? covered / samples.length : null,
    coveredCases: supported ? covered : 0,
    coverageLower95: supported ? coverageInterval?.lower ?? null : null,
    coverageUpper95: supported ? coverageInterval?.upper ?? null : null,
    meanIntervalWidth: supported
      ? samples.reduce((sum, sample) => sum + sample.p90 - sample.p10, 0) / samples.length
      : null,
    leadTimeBuckets: CONTINUOUS_LEAD_TIME_BUCKETS.map(({ startLeadHours, endLeadHours }) =>
      summarizeBucket(samples, startLeadHours, endLeadHours),
    ),
  };
}

/** Report only after enough hourly cases across distinct calendar dates accrue. */
export function computeEnsembleCalibrationSummary(
  entries: EnsembleCalibrationLogEntry[],
  location?: EnsembleCalibrationAnchor | null,
): EnsembleCalibrationSummary {
  const scoped = location && isLocationAnchor(location)
    ? entries.filter((entry) =>
        roundedCoord(entry.lat) === roundedCoord(location.latitude) &&
        roundedCoord(entry.lon) === roundedCoord(location.longitude),
      )
    : [];
  if (!location || !isLocationAnchor(location)) {
    return { temperature: emptyMetricSummary(), wind: emptyMetricSummary() };
  }
  return {
    temperature: summarizeMetric(scoped, 'temperature'),
    wind: summarizeMetric(scoped, 'wind'),
  };
}
