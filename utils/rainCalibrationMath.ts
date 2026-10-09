import type { EnsembleSpread, GeoLocation, HourlyPrecipitationObservation } from '../api/types';
import { RAIN_EVENT_THRESHOLD_MM } from '../api/rain';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Keep enough local history for a rolling score, but never grow the log forever. */
export const MAX_RAIN_LOG_DAYS = 30;
export const MAX_RAIN_LOG_LOCATIONS = 8;
export const MAX_RAIN_LOG_ROWS_PER_LOCATION = MAX_RAIN_LOG_DAYS * 24;
export const MAX_RAIN_LOG_ROWS = MAX_RAIN_LOG_LOCATIONS * MAX_RAIN_LOG_ROWS_PER_LOCATION;
/** ICON-EPS currently returns a four-day forecast; allow a small API boundary slack. */
export const MAX_RAIN_LEAD_HOURS = 97;
/** Wait for the Archive API's usual publication lag before treating a row as observed. */
export const RAIN_OBSERVATION_DELAY_MS = 72 * HOUR_MS;
/** Score only after the log covers a useful number of hourly cases and dates. */
export const MIN_RAIN_CALIBRATION_CASES = 100;
export const MIN_RAIN_CALIBRATION_DAYS = 14;
/** Do not report a reliability-bin estimate from a handful of cases. */
export const MIN_RAIN_RELIABILITY_BIN_CASES = 20;
/** Probability bins also need spread across days, not only many correlated hours. */
export const MIN_RAIN_RELIABILITY_BIN_DAYS = 7;
/** Lead-time scores need their own support threshold to avoid noisy slices. */
export const MIN_RAIN_LEAD_BUCKET_CASES = 20;
export const MIN_RAIN_LEAD_BUCKET_DAYS = 7;

export const RAIN_LEAD_TIME_BUCKETS = [
  { startLeadHours: 0, endLeadHours: 24 },
  { startLeadHours: 24, endLeadHours: 48 },
  { startLeadHours: 48, endLeadHours: 72 },
  { startLeadHours: 72, endLeadHours: MAX_RAIN_LEAD_HOURS },
] as const;

export interface RainLocationAnchor {
  latitude: number;
  longitude: number;
}

/**
 * One latest ICON-EPS probability for one local forecast hour and rounded
 * location. `issuedAt` is when this app retrieved the forecast, not the model's
 * internal initialization time (which the current API response does not expose).
 */
export interface RainForecastLogEntry {
  lat: number;
  lon: number;
  /** Local ISO hour, matching the forecast and Archive API timezone=auto rows. */
  time: string;
  /** Epoch ms for retention and eligibility; uses the offset known at issue time. */
  validAt: number;
  /** Client retrieval time, epoch ms. */
  issuedAt: number;
  /** Forecast lead in hours at retrieval time. */
  leadHours: number;
  /** Raw ensemble wet-member share, normalized to 0-1. */
  probability: number;
  /** Verified hourly event, null until the Archive API supplies an observation. */
  observed: 0 | 1 | null;
  observedAt?: number;
}

export interface RainReliabilityBin {
  lowerPercent: number;
  upperPercent: number;
  cases: number;
  verifiedDays: number;
  meanForecast: number | null;
  observedFrequency: number | null;
  sufficientlyPopulated: boolean;
}

export interface RainLeadTimeBucket {
  startLeadHours: number;
  endLeadHours: number;
  cases: number;
  verifiedDays: number;
  /** Null until this lead range has enough independent days and hourly cases. */
  brierScore: number | null;
  /** Reliability for each probability band, gated by its own case/day support. */
  reliabilityBins: RainReliabilityBin[];
  sufficientlyPopulated: boolean;
}

interface RainCalibrationSummaryBase {
  verifiedCases: number;
  verifiedDays: number;
  requiredCases: number;
  requiredDays: number;
  reliabilityBins: RainReliabilityBin[];
  leadTimeBuckets: RainLeadTimeBucket[];
}

export type RainCalibrationSummary =
  | (RainCalibrationSummaryBase & {
      status: 'insufficient';
      brierScore: null;
    })
  | (RainCalibrationSummaryBase & {
      status: 'ready';
      /** Mean squared probability error, available only after both thresholds are met. */
      brierScore: number;
    });

/** Round coordinates to roughly 1 km, matching the existing on-device weather logs. */
export function roundedRainCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Parse a timezone-naive local timestamp as a UTC-shaped wall-clock value.
 * Subtracting the location's issue-time UTC offset gives a stable epoch without
 * relying on the phone's own timezone. The original local string is retained
 * for exact Archive API matching. A future DST transition can shift the stored
 * lead estimate by an hour; scoring still matches by the location-local string.
 */
export function localTimestampAsUtc(time: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const epoch = Date.UTC(year, month - 1, day, hour, minute, second);
  const parsed = new Date(epoch);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  ) {
    return null;
  }
  return epoch;
}

/** True for finite latitude/longitude values in their geographic ranges. */
function isLocationAnchor(value: RainLocationAnchor): boolean {
  return (
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

/** Build the bounded hourly candidates from one successful ensemble snapshot. */
export function createRainForecastEntries(
  spread: EnsembleSpread,
  location: RainLocationAnchor,
  utcOffsetSeconds: number,
): RainForecastLogEntry[] {
  if (
    !isLocationAnchor(location) ||
    !Number.isFinite(utcOffsetSeconds) ||
    !Number.isFinite(spread.fetchedAt) ||
    spread.fetchedAt <= 0 ||
    !Array.isArray(spread.points)
  ) {
    return [];
  }

  const byTime = new Map<string, RainForecastLogEntry>();
  const ambiguousLocalHours = new Set<string>();
  for (const point of spread.points) {
    if (
      typeof point.time !== 'string' ||
      !Number.isFinite(point.rainProb) ||
      point.rainProb < 0 ||
      point.rainProb > 100
    ) {
      continue;
    }
    const localEpoch = localTimestampAsUtc(point.time);
    if (localEpoch === null) continue;
    const validAt = localEpoch - utcOffsetSeconds * 1000;
    const leadHours = (validAt - spread.fetchedAt) / HOUR_MS;
    if (leadHours <= 0 || leadHours > MAX_RAIN_LEAD_HOURS) continue;
    // A repeated local wall-clock hour at the autumn DST fold cannot be
    // matched unambiguously to a timezone=auto archive value; omit that hour.
    if (ambiguousLocalHours.has(point.time)) continue;
    if (byTime.has(point.time)) {
      byTime.delete(point.time);
      ambiguousLocalHours.add(point.time);
      continue;
    }
    byTime.set(point.time, {
      lat: roundedRainCoord(location.latitude),
      lon: roundedRainCoord(location.longitude),
      time: point.time,
      validAt,
      issuedAt: spread.fetchedAt,
      leadHours: Number(leadHours.toFixed(3)),
      probability: point.rainProb / 100,
      observed: null,
    });
  }
  return [...byTime.values()];
}

/** Validate untrusted AsyncStorage data before it enters scoring. */
export function isRainForecastLogEntry(value: unknown): value is RainForecastLogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RainForecastLogEntry>;
  return (
    typeof entry.lat === 'number' && Number.isFinite(entry.lat) && entry.lat >= -90 && entry.lat <= 90 &&
    typeof entry.lon === 'number' && Number.isFinite(entry.lon) && entry.lon >= -180 && entry.lon <= 180 &&
    typeof entry.time === 'string' && localTimestampAsUtc(entry.time) !== null &&
    typeof entry.validAt === 'number' && Number.isFinite(entry.validAt) &&
    typeof entry.issuedAt === 'number' && Number.isFinite(entry.issuedAt) && entry.issuedAt > 0 &&
    typeof entry.leadHours === 'number' && Number.isFinite(entry.leadHours) &&
    entry.leadHours > 0 && entry.leadHours <= MAX_RAIN_LEAD_HOURS &&
    typeof entry.probability === 'number' && Number.isFinite(entry.probability) &&
    entry.probability >= 0 && entry.probability <= 1 &&
    (entry.observed === null || entry.observed === 0 || entry.observed === 1) &&
    (entry.observed === null
      ? entry.observedAt === undefined
      : typeof entry.observedAt === 'number' && Number.isFinite(entry.observedAt) && entry.observedAt > 0)
  );
}

function locationKey(entry: Pick<RainForecastLogEntry, 'lat' | 'lon'>): string {
  return `${roundedRainCoord(entry.lat)}|${roundedRainCoord(entry.lon)}`;
}

function forecastKey(entry: Pick<RainForecastLogEntry, 'lat' | 'lon' | 'time'>): string {
  return `${locationKey(entry)}|${entry.time}`;
}

/**
 * Keep one latest pre-event forecast per location/hour. Repeated refreshes
 * replace only unverified forecasts, so the same observation is never counted
 * multiple times merely because the app refreshed. Verified rows are immutable.
 */
export function mergeRainForecastEntries(
  existing: RainForecastLogEntry[],
  additions: RainForecastLogEntry[],
  now = Date.now(),
): RainForecastLogEntry[] {
  const byHour = new Map<string, RainForecastLogEntry>();
  for (const entry of existing) byHour.set(forecastKey(entry), entry);
  for (const addition of additions) {
    const key = forecastKey(addition);
    const previous = byHour.get(key);
    if (previous?.observed !== null && previous?.observed !== undefined) continue;
    if (!previous || addition.issuedAt > previous.issuedAt) byHour.set(key, addition);
  }

  const cutoff = now - MAX_RAIN_LOG_DAYS * DAY_MS;
  const futureLimit = now + MAX_RAIN_LEAD_HOURS * HOUR_MS;
  const byLocation = new Map<string, RainForecastLogEntry[]>();
  for (const entry of byHour.values()) {
    if (entry.validAt < cutoff || entry.validAt > futureLimit) continue;
    const key = locationKey(entry);
    const group = byLocation.get(key);
    if (group) group.push(entry);
    else byLocation.set(key, [entry]);
  }

  const recentLocations = [...byLocation.entries()]
    .map(([key, entries]) => ({
      key,
      entries: entries
        .sort((a, b) => a.validAt - b.validAt || a.issuedAt - b.issuedAt)
        .slice(-MAX_RAIN_LOG_ROWS_PER_LOCATION),
      latestIssue: Math.max(...entries.map((entry) => entry.issuedAt)),
    }))
    .sort((a, b) => b.latestIssue - a.latestIssue)
    .slice(0, MAX_RAIN_LOG_LOCATIONS);

  return recentLocations
    .flatMap((location) => location.entries)
    .sort((a, b) => a.validAt - b.validAt || a.issuedAt - b.issuedAt)
    .slice(-MAX_RAIN_LOG_ROWS);
}

/** Attach each real hourly observation to its matching, still-unverified forecast. */
export function applyRainObservations(
  entries: RainForecastLogEntry[],
  location: RainLocationAnchor,
  observations: HourlyPrecipitationObservation[],
  observedAt = Date.now(),
): RainForecastLogEntry[] {
  if (!isLocationAnchor(location) || !Number.isFinite(observedAt) || observedAt <= 0) return entries;
  const lat = roundedRainCoord(location.latitude);
  const lon = roundedRainCoord(location.longitude);
  const precipitationByTime = new Map<string, number>();
  for (const observation of observations) {
    if (
      typeof observation.time === 'string' &&
      localTimestampAsUtc(observation.time) !== null &&
      typeof observation.precipitation === 'number' &&
      Number.isFinite(observation.precipitation) &&
      observation.precipitation >= 0
    ) {
      precipitationByTime.set(observation.time, observation.precipitation);
    }
  }
  return entries.map((entry) => {
    if (roundedRainCoord(entry.lat) !== lat || roundedRainCoord(entry.lon) !== lon || entry.observed !== null) {
      return entry;
    }
    const precipitation = precipitationByTime.get(entry.time);
    if (precipitation === undefined) return entry;
    return {
      ...entry,
      observed: precipitation >= RAIN_EVENT_THRESHOLD_MM ? 1 : 0,
      observedAt,
    };
  });
}

/** Date range for complete, not-yet-verified hours within the archive lookback. */
export function rainVerificationDateRange(
  entries: RainForecastLogEntry[],
  now = Date.now(),
): { startDate: string; endDate: string } | null {
  const cutoff = now - RAIN_OBSERVATION_DELAY_MS;
  const oldest = now - MAX_RAIN_LOG_DAYS * DAY_MS;
  const dates = entries
    .filter((entry) => entry.observed === null && entry.validAt <= cutoff && entry.validAt >= oldest)
    .map((entry) => entry.time.slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  if (dates.length === 0) return null;
  return { startDate: dates[0], endDate: dates[dates.length - 1] };
}

function emptyReliabilityBins(): RainReliabilityBin[] {
  return Array.from({ length: 5 }, (_, index): RainReliabilityBin => ({
    lowerPercent: index * 20,
    upperPercent: (index + 1) * 20,
    cases: 0,
    verifiedDays: 0,
    meanForecast: null,
    observedFrequency: null,
    sufficientlyPopulated: false,
  }));
}

function summarizeReliabilityBins(samples: RainForecastLogEntry[]): RainReliabilityBin[] {
  const counts = Array.from({ length: 5 }, () => ({ count: 0, probabilitySum: 0, eventSum: 0, days: new Set<string>() }));
  for (const sample of samples) {
    if (sample.observed === null || !Number.isFinite(sample.probability)) continue;
    const index = Math.min(4, Math.floor(Math.min(1, Math.max(0, sample.probability)) * 5));
    const bin = counts[index];
    bin.count += 1;
    bin.probabilitySum += sample.probability;
    bin.eventSum += sample.observed;
    bin.days.add(sample.time.slice(0, 10));
  }
  return counts.map((bin, index): RainReliabilityBin => ({
    lowerPercent: index * 20,
    upperPercent: (index + 1) * 20,
    cases: bin.count,
    verifiedDays: bin.days.size,
    meanForecast: bin.count > 0 ? bin.probabilitySum / bin.count : null,
    observedFrequency: bin.count > 0 ? bin.eventSum / bin.count : null,
    sufficientlyPopulated:
      bin.count >= MIN_RAIN_RELIABILITY_BIN_CASES && bin.days.size >= MIN_RAIN_RELIABILITY_BIN_DAYS,
  }));
}

function summarizeRainLeadTimes(samples: RainForecastLogEntry[]): RainLeadTimeBucket[] {
  return RAIN_LEAD_TIME_BUCKETS.map(({ startLeadHours, endLeadHours }) => {
    const bucket = samples.filter(
      (sample) => sample.leadHours > startLeadHours && sample.leadHours <= endLeadHours,
    );
    const verifiedDays = new Set(bucket.map((sample) => sample.time.slice(0, 10))).size;
    const sufficientlyPopulated =
      bucket.length >= MIN_RAIN_LEAD_BUCKET_CASES && verifiedDays >= MIN_RAIN_LEAD_BUCKET_DAYS;
    const squaredErrorSum = bucket.reduce((sum, sample) => {
      const error = sample.probability - (sample.observed as 0 | 1);
      return sum + error * error;
    }, 0);
    return {
      startLeadHours,
      endLeadHours,
      cases: bucket.length,
      verifiedDays,
      brierScore: sufficientlyPopulated ? squaredErrorSum / bucket.length : null,
      reliabilityBins: summarizeReliabilityBins(bucket),
      sufficientlyPopulated,
    };
  });
}

/**
 * Brier score and reliability bins for the raw hourly member-share forecasts.
 * This is hourly verification only: it does not multiply hourly dry
 * probabilities or otherwise infer a daily rain probability.
 */
export function computeRainCalibrationSummary(
  entries: RainForecastLogEntry[],
  location: GeoLocation | RainLocationAnchor | null,
  now = Date.now(),
): RainCalibrationSummary {
  const emptyBins = emptyReliabilityBins();
  const emptySummary: RainCalibrationSummary = {
    status: 'insufficient',
    verifiedCases: 0,
    verifiedDays: 0,
    requiredCases: MIN_RAIN_CALIBRATION_CASES,
    requiredDays: MIN_RAIN_CALIBRATION_DAYS,
    brierScore: null,
    reliabilityBins: emptyBins,
    leadTimeBuckets: summarizeRainLeadTimes([]),
  };
  if (!location || !isLocationAnchor(location)) return emptySummary;

  const lat = roundedRainCoord(location.latitude);
  const lon = roundedRainCoord(location.longitude);
  const cutoff = now - MAX_RAIN_LOG_DAYS * DAY_MS;
  const samples = entries.filter(
    (entry) =>
      roundedRainCoord(entry.lat) === lat &&
      roundedRainCoord(entry.lon) === lon &&
      entry.observed !== null &&
      entry.validAt >= cutoff &&
      entry.validAt <= now,
  );
  const days = new Set(samples.map((entry) => entry.time.slice(0, 10)));
  const leadTimeBuckets = summarizeRainLeadTimes(samples);
  const enoughHistory =
    samples.length >= MIN_RAIN_CALIBRATION_CASES && days.size >= MIN_RAIN_CALIBRATION_DAYS;
  if (!enoughHistory) {
    return { ...emptySummary, verifiedCases: samples.length, verifiedDays: days.size, leadTimeBuckets };
  }

  let squaredErrorSum = 0;
  for (const sample of samples) {
    const outcome = sample.observed as 0 | 1;
    const error = sample.probability - outcome;
    squaredErrorSum += error * error;
  }
  const reliabilityBins = summarizeReliabilityBins(samples);
  return {
    status: 'ready',
    verifiedCases: samples.length,
    verifiedDays: days.size,
    requiredCases: MIN_RAIN_CALIBRATION_CASES,
    requiredDays: MIN_RAIN_CALIBRATION_DAYS,
    brierScore: squaredErrorSum / samples.length,
    reliabilityBins,
    leadTimeBuckets,
  };
}

/**
 * Optional empirical correction for a chart marker. Null means history or that
 * particular probability bin is not strong enough; callers should keep the
 * raw member share and label it as uncalibrated in that case.
 */
export function calibratedRainProbability(
  rawProbability: number,
  summary: RainCalibrationSummary,
): number | null {
  if (summary.status !== 'ready' || !Number.isFinite(rawProbability)) return null;
  const probability = Math.min(1, Math.max(0, rawProbability));
  const index = Math.min(4, Math.floor(probability * 5));
  const bin = summary.reliabilityBins[index];
  return bin?.sufficientlyPopulated ? bin.observedFrequency : null;
}
