import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EnsembleSpread, HourlyWeatherObservation } from '../api/types';
import {
  applyEnsembleCalibrationObservations,
  createEnsembleCalibrationEntries,
  isEnsembleCalibrationLogEntry,
  mergeEnsembleCalibrationEntries,
  type EnsembleCalibrationAnchor,
  type EnsembleCalibrationLogEntry,
} from './ensembleCalibrationMath';
import { roundedRainCoord } from './rainCalibrationMath';

export const ENSEMBLE_CALIBRATION_KEY = '@mu_weather/ensemble_calibration_v1';

interface EnsembleCalibrationFile {
  version: 1;
  entries: EnsembleCalibrationLogEntry[];
}

const EMPTY_FILE: EnsembleCalibrationFile = { version: 1, entries: [] };
let writeChain: Promise<unknown> = Promise.resolve();

function withLogLock<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

function locationKey(
  location: EnsembleCalibrationAnchor | Pick<EnsembleCalibrationLogEntry, 'lat' | 'lon'>,
): string {
  const latitude = 'latitude' in location ? location.latitude : location.lat;
  const longitude = 'longitude' in location ? location.longitude : location.lon;
  return `${roundedRainCoord(latitude)}|${roundedRainCoord(longitude)}`;
}

async function loadFile(): Promise<EnsembleCalibrationFile> {
  try {
    const raw = await AsyncStorage.getItem(ENSEMBLE_CALIBRATION_KEY);
    if (!raw) return EMPTY_FILE;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_FILE;
    const file = parsed as Partial<EnsembleCalibrationFile>;
    if (file.version !== 1 || !Array.isArray(file.entries)) return EMPTY_FILE;
    return {
      version: 1,
      entries: mergeEnsembleCalibrationEntries(
        file.entries.filter(isEnsembleCalibrationLogEntry),
        [],
      ),
    };
  } catch {
    return EMPTY_FILE;
  }
}

async function persist(file: EnsembleCalibrationFile): Promise<void> {
  try {
    await AsyncStorage.setItem(ENSEMBLE_CALIBRATION_KEY, JSON.stringify(file));
  } catch {
    // Best-effort local calibration must never block or fail a weather refresh.
  }
}

/** Latest hourly ensemble distributions for one rounded location, oldest first. */
export async function loadEnsembleCalibrationLog(
  location: EnsembleCalibrationAnchor,
): Promise<EnsembleCalibrationLogEntry[]> {
  const key = locationKey(location);
  return (await loadFile()).entries
    .filter((entry) => locationKey(entry) === key)
    .sort((a, b) => a.validAt - b.validAt || a.issuedAt - b.issuedAt || a.metric.localeCompare(b.metric));
}

/** Snapshot used by the local-data manager; no calibration rows leave the device. */
export async function loadAllEnsembleCalibrationData(): Promise<EnsembleCalibrationLogEntry[]> {
  return (await loadFile()).entries;
}

/** Delete ensemble-calibration observations and forecasts for one rounded location. */
export function clearEnsembleCalibrationLocation(
  location: EnsembleCalibrationAnchor,
): Promise<number> {
  return withLogLock(async () => {
    const file = await loadFile();
    const key = locationKey(location);
    const entries = file.entries.filter((entry) => locationKey(entry) !== key);
    await persist({ version: 1, entries });
    return file.entries.length - entries.length;
  });
}

/** Delete all device-local ensemble calibration observations and forecasts. */
export function clearAllEnsembleCalibrationData(): Promise<number> {
  return withLogLock(async () => {
    const file = await loadFile();
    await persist(EMPTY_FILE);
    return file.entries.length;
  });
}

/** Store one latest temperature/wind distribution for each valid ensemble hour. */
export function logEnsembleCalibrationForecast(
  spread: EnsembleSpread,
  location: EnsembleCalibrationAnchor,
  utcOffsetSeconds: number,
): Promise<void> {
  return withLogLock(async () => {
    try {
      const additions = createEnsembleCalibrationEntries(spread, location, utcOffsetSeconds);
      if (additions.length === 0) return;
      const file = await loadFile();
      const entries = mergeEnsembleCalibrationEntries(file.entries, additions);
      await persist({ version: 1, entries });
    } catch {
      // Forecast logging is an optional local quality measurement.
    }
  });
}

/** Attach available archive values without replacing an earlier observation. */
export function saveEnsembleCalibrationObservations(
  location: EnsembleCalibrationAnchor,
  observations: HourlyWeatherObservation[],
  observedAt = Date.now(),
): Promise<void> {
  if (observations.length === 0) return Promise.resolve();
  return withLogLock(async () => {
    try {
      const file = await loadFile();
      const entries = applyEnsembleCalibrationObservations(
        file.entries,
        location,
        observations,
        observedAt,
      );
      await persist({ ...file, entries });
    } catch {
      // Missing archive data can be retried later; never make weather loading wait.
    }
  });
}
