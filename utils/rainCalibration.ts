import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EnsembleSpread, HourlyPrecipitationObservation } from '../api/types';
import {
  applyRainObservations,
  createRainForecastEntries,
  isRainForecastLogEntry,
  mergeRainForecastEntries,
  roundedRainCoord,
  type RainForecastLogEntry,
  type RainLocationAnchor,
} from './rainCalibrationMath';

const RAIN_LOG_KEY = '@mu_weather/rain_calibration_v1';
/** Retry observation retrieval periodically; Archive rows may still be lagging. */
const OBSERVATION_FETCH_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_VERIFICATION_STAMPS = 8;

interface VerificationStamp {
  lat: number;
  lon: number;
  attemptedAt: number;
}

interface RainCalibrationFile {
  version: 1;
  entries: RainForecastLogEntry[];
  verificationStamps: VerificationStamp[];
}

const EMPTY_FILE: RainCalibrationFile = { version: 1, entries: [], verificationStamps: [] };

/** AsyncStorage is not transactional; serialize writers to avoid lost upserts. */
let writeChain: Promise<unknown> = Promise.resolve();

function withRainLogLock<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

function isValidStamp(value: unknown): value is VerificationStamp {
  if (!value || typeof value !== 'object') return false;
  const stamp = value as Partial<VerificationStamp>;
  return (
    typeof stamp.lat === 'number' && Number.isFinite(stamp.lat) && stamp.lat >= -90 && stamp.lat <= 90 &&
    typeof stamp.lon === 'number' && Number.isFinite(stamp.lon) && stamp.lon >= -180 && stamp.lon <= 180 &&
    typeof stamp.attemptedAt === 'number' && Number.isFinite(stamp.attemptedAt) && stamp.attemptedAt > 0
  );
}

function locationKey(
  location: RainLocationAnchor | Pick<RainForecastLogEntry, 'lat' | 'lon'>,
): string {
  const latitude = 'latitude' in location ? location.latitude : location.lat;
  const longitude = 'longitude' in location ? location.longitude : location.lon;
  return `${roundedRainCoord(latitude)}|${roundedRainCoord(longitude)}`;
}

async function loadFile(): Promise<RainCalibrationFile> {
  try {
    const raw = await AsyncStorage.getItem(RAIN_LOG_KEY);
    if (!raw) return EMPTY_FILE;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_FILE;
    const file = parsed as Partial<RainCalibrationFile>;
    if (file.version !== 1 || !Array.isArray(file.entries)) return EMPTY_FILE;
    const entries = mergeRainForecastEntries(
      file.entries.filter(isRainForecastLogEntry),
      [],
    );
    const retainedLocations = new Set(entries.map((entry) => locationKey(entry)));
    const verificationStamps = (Array.isArray(file.verificationStamps)
      ? file.verificationStamps.filter(isValidStamp)
      : [])
      .filter((stamp) => retainedLocations.has(locationKey(stamp)))
      .sort((a, b) => b.attemptedAt - a.attemptedAt)
      .slice(0, MAX_VERIFICATION_STAMPS);
    return { version: 1, entries, verificationStamps };
  } catch {
    return EMPTY_FILE;
  }
}

async function persist(file: RainCalibrationFile): Promise<void> {
  try {
    await AsyncStorage.setItem(RAIN_LOG_KEY, JSON.stringify(file));
  } catch {
    // Calibration is best-effort and must never interrupt a weather refresh.
  }
}

/** Local forecast rows for one rounded location, oldest valid hour first. */
export async function loadRainForecastLog(
  location: RainLocationAnchor,
): Promise<RainForecastLogEntry[]> {
  const file = await loadFile();
  const key = locationKey(location);
  return file.entries
    .filter((entry) => locationKey(entry) === key)
    .sort((a, b) => a.validAt - b.validAt || a.issuedAt - b.issuedAt);
}

/**
 * Log one latest raw ensemble probability per future hour. Coordinates are
 * rounded locally; this history is never uploaded or included in data exports.
 */
export function logRainForecast(
  spread: EnsembleSpread,
  location: RainLocationAnchor,
  utcOffsetSeconds: number,
): Promise<void> {
  return withRainLogLock(async () => {
    try {
      const additions = createRainForecastEntries(spread, location, utcOffsetSeconds);
      if (additions.length === 0) return;
      const file = await loadFile();
      const entries = mergeRainForecastEntries(file.entries, additions);
      const retainedLocations = new Set(entries.map((entry) => locationKey(entry)));
      const verificationStamps = file.verificationStamps.filter((stamp) =>
        retainedLocations.has(locationKey(stamp)),
      );
      await persist({ version: 1, entries, verificationStamps });
    } catch {
      // Non-critical local logging must not break the forecast screen.
    }
  });
}

/** Apply verified Archive API observations without replacing an earlier outcome. */
export function saveRainObservations(
  location: RainLocationAnchor,
  observations: HourlyPrecipitationObservation[],
  observedAt = Date.now(),
): Promise<void> {
  if (observations.length === 0) return Promise.resolve();
  return withRainLogLock(async () => {
    try {
      const file = await loadFile();
      const entries = applyRainObservations(file.entries, location, observations, observedAt);
      await persist({ ...file, entries });
    } catch {
      // Non-critical local logging must not break the forecast screen.
    }
  });
}

/** True when this location's Archive API verification attempt is due. */
export async function isRainObservationFetchDue(
  location: RainLocationAnchor,
  now = Date.now(),
): Promise<boolean> {
  const key = locationKey(location);
  const stamp = (await loadFile()).verificationStamps.find((row) => locationKey(row) === key);
  return !stamp || stamp.attemptedAt > now || now - stamp.attemptedAt >= OBSERVATION_FETCH_TTL_MS;
}

/** Record even a failed archive attempt so a service outage cannot cause a tight retry loop. */
export function markRainObservationFetchAttempt(
  location: RainLocationAnchor,
  attemptedAt = Date.now(),
): Promise<void> {
  return withRainLogLock(async () => {
    try {
      const file = await loadFile();
      const byLocation = new Map(
        file.verificationStamps.map((stamp) => [locationKey(stamp), stamp]),
      );
      byLocation.set(locationKey(location), {
        lat: roundedRainCoord(location.latitude),
        lon: roundedRainCoord(location.longitude),
        attemptedAt,
      });
      const verificationStamps = [...byLocation.values()]
        .sort((a, b) => b.attemptedAt - a.attemptedAt)
        .slice(0, MAX_VERIFICATION_STAMPS);
      await persist({ ...file, verificationStamps });
    } catch {
      // Non-critical bookkeeping.
    }
  });
}
