import {
  clearAllEnsembleCalibrationData,
  clearEnsembleCalibrationLocation,
  loadAllEnsembleCalibrationData,
} from './ensembleCalibration';
import type { EnsembleCalibrationAnchor, EnsembleCalibrationLogEntry } from './ensembleCalibrationMath';
import {
  clearAllOutdoorWindowFeedback,
  clearOutdoorWindowFeedbackLocation,
  loadOutdoorWindowFeedback,
} from './outdoorWindowFeedback';
import type { OutdoorWindowFeedbackRecord } from './outdoorWindowFeedbackPolicy';
import {
  clearAllRainCalibrationData,
  clearRainCalibrationLocation,
  loadAllRainCalibrationData,
} from './rainCalibration';
import type {
  RainEpisodeForecastLogEntry,
  RainForecastLogEntry,
  RainLocationAnchor,
} from './rainCalibrationMath';
import {
  clearAllStormAlertFeedback,
  clearStormAlertFeedbackLocation,
  loadStormAlertFeedback,
} from './stormAlertFeedback';
import type { StormFeedbackRecord } from './stormFeedbackPolicy';

export interface LocalQualityLocationSummary {
  /** Exact scope used by local feedback rows (coordinates or a legacy scope). */
  key: string;
  latitude: number | null;
  longitude: number | null;
  feedbackScopes: string[];
  rainHourly: number;
  rainHourlyVerified: number;
  rainDaily: number;
  rainDailyVerified: number;
  ensemble: number;
  ensembleVerified: number;
  outdoorFeedback: number;
  stormFeedback: number;
  total: number;
}

export interface LocalQualityDataSummary {
  locations: LocalQualityLocationSummary[];
  totals: Omit<LocalQualityLocationSummary, 'key' | 'latitude' | 'longitude' | 'feedbackScopes'>;
}

export interface LocalQualityDataSources {
  rainHourly: RainForecastLogEntry[];
  rainDaily: RainEpisodeForecastLogEntry[];
  ensemble: EnsembleCalibrationLogEntry[];
  outdoorFeedback: OutdoorWindowFeedbackRecord[];
  stormFeedback: StormFeedbackRecord[];
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function coordinateScope(latitude: number, longitude: number): string {
  return `${rounded(latitude)}|${rounded(longitude)}`;
}

function parseCoordinateScope(scope: string): { latitude: number; longitude: number } | null {
  const parts = scope.split('|');
  if (parts.length !== 2) return null;
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude: rounded(latitude), longitude: rounded(longitude) };
}

function keyForCoordinates(latitude: number, longitude: number): string {
  return `coordinates:${coordinateScope(latitude, longitude)}`;
}

function buildSummary(sources: LocalQualityDataSources): LocalQualityDataSummary {
  const locations = new Map<string, LocalQualityLocationSummary>();
  const ensureCoordinates = (latitude: number, longitude: number): LocalQualityLocationSummary => {
    const lat = rounded(latitude);
    const lon = rounded(longitude);
    const key = keyForCoordinates(lat, lon);
    const existing = locations.get(key);
    if (existing) return existing;
    const created: LocalQualityLocationSummary = {
      key,
      latitude: lat,
      longitude: lon,
      feedbackScopes: [],
      rainHourly: 0,
      rainHourlyVerified: 0,
      rainDaily: 0,
      rainDailyVerified: 0,
      ensemble: 0,
      ensembleVerified: 0,
      outdoorFeedback: 0,
      stormFeedback: 0,
      total: 0,
    };
    locations.set(key, created);
    return created;
  };
  const ensureScope = (scope: string): LocalQualityLocationSummary => {
    const parsed = parseCoordinateScope(scope);
    if (parsed) {
      const summary = ensureCoordinates(parsed.latitude, parsed.longitude);
      if (!summary.feedbackScopes.includes(scope)) summary.feedbackScopes.push(scope);
      return summary;
    }
    const key = `legacy:${scope}`;
    const existing = locations.get(key);
    if (existing) return existing;
    const created: LocalQualityLocationSummary = {
      key,
      latitude: null,
      longitude: null,
      feedbackScopes: [scope],
      rainHourly: 0,
      rainHourlyVerified: 0,
      rainDaily: 0,
      rainDailyVerified: 0,
      ensemble: 0,
      ensembleVerified: 0,
      outdoorFeedback: 0,
      stormFeedback: 0,
      total: 0,
    };
    locations.set(key, created);
    return created;
  };

  for (const row of sources.rainHourly) {
    const summary = ensureCoordinates(row.lat, row.lon);
    summary.rainHourly += 1;
    if (row.observed !== null) summary.rainHourlyVerified += 1;
  }
  for (const row of sources.rainDaily) {
    const summary = ensureCoordinates(row.lat, row.lon);
    summary.rainDaily += 1;
    if (row.observed !== null) summary.rainDailyVerified += 1;
  }
  for (const row of sources.ensemble) {
    const summary = ensureCoordinates(row.lat, row.lon);
    summary.ensemble += 1;
    if (row.observed !== null) summary.ensembleVerified += 1;
  }
  for (const row of sources.outdoorFeedback) ensureScope(row.scope).outdoorFeedback += 1;
  for (const row of sources.stormFeedback) ensureScope(row.scope).stormFeedback += 1;

  const rows = [...locations.values()].map((location) => ({
    ...location,
    feedbackScopes: [...new Set(location.feedbackScopes)].sort(),
    total: location.rainHourly + location.rainDaily + location.ensemble +
      location.outdoorFeedback + location.stormFeedback,
  }));
  rows.sort((a, b) => {
    if (a.latitude === null) return b.latitude === null ? a.key.localeCompare(b.key) : 1;
    if (b.latitude === null) return -1;
    return a.latitude - b.latitude || (a.longitude ?? 0) - (b.longitude ?? 0);
  });
  const totals = rows.reduce<LocalQualityDataSummary['totals']>((sum, row) => ({
    rainHourly: sum.rainHourly + row.rainHourly,
    rainHourlyVerified: sum.rainHourlyVerified + row.rainHourlyVerified,
    rainDaily: sum.rainDaily + row.rainDaily,
    rainDailyVerified: sum.rainDailyVerified + row.rainDailyVerified,
    ensemble: sum.ensemble + row.ensemble,
    ensembleVerified: sum.ensembleVerified + row.ensembleVerified,
    outdoorFeedback: sum.outdoorFeedback + row.outdoorFeedback,
    stormFeedback: sum.stormFeedback + row.stormFeedback,
    total: sum.total + row.total,
  }), {
    rainHourly: 0,
    rainHourlyVerified: 0,
    rainDaily: 0,
    rainDailyVerified: 0,
    ensemble: 0,
    ensembleVerified: 0,
    outdoorFeedback: 0,
    stormFeedback: 0,
    total: 0,
  });
  return { locations: rows, totals };
}

/** Counts bounded calibration and feedback rows by rounded location scope. */
export async function loadLocalQualityDataSummary(): Promise<LocalQualityDataSummary> {
  const [rain, ensemble, outdoorFeedback, stormFeedback] = await Promise.all([
    loadAllRainCalibrationData(),
    loadAllEnsembleCalibrationData(),
    loadOutdoorWindowFeedback(),
    loadStormAlertFeedback(),
  ]);
  return buildSummary({
    rainHourly: rain.hourly,
    rainDaily: rain.episodes,
    ensemble,
    outdoorFeedback,
    stormFeedback,
  });
}

/** Pure reducer used by tests and by the local-only manager. */
export function summarizeLocalQualityData(sources: LocalQualityDataSources): LocalQualityDataSummary {
  return buildSummary(sources);
}

/** Clear calibration and feedback rows for one displayed location. */
export async function clearLocalQualityDataForLocation(
  location: LocalQualityLocationSummary,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  const anchor: RainLocationAnchor & EnsembleCalibrationAnchor | null =
    location.latitude !== null && location.longitude !== null
      ? { latitude: location.latitude, longitude: location.longitude }
      : null;
  if (anchor) {
    tasks.push(clearRainCalibrationLocation(anchor));
    tasks.push(clearEnsembleCalibrationLocation(anchor));
  }
  for (const scope of location.feedbackScopes) {
    tasks.push(clearOutdoorWindowFeedbackLocation(scope));
    tasks.push(clearStormAlertFeedbackLocation(scope));
  }
  await Promise.all(tasks);
}

/** Clear all of these optional local quality datasets without touching preferences or alert rules. */
export async function clearAllLocalQualityData(): Promise<void> {
  await Promise.all([
    clearAllRainCalibrationData(),
    clearAllEnsembleCalibrationData(),
    clearAllOutdoorWindowFeedback(),
    clearAllStormAlertFeedback(),
  ]);
}
