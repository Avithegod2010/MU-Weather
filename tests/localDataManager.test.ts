import {
  ENSEMBLE_CALIBRATION_KEY,
} from '../utils/ensembleCalibration';
import {
  OUTDOOR_WINDOW_FEEDBACK_KEY,
} from '../utils/outdoorWindowFeedback';
import {
  RAIN_LOG_KEY,
} from '../utils/rainCalibration';
import {
  STORM_ALERT_FEEDBACK_KEY,
} from '../utils/stormAlertFeedback';
import {
  clearAllLocalQualityData,
  clearLocalQualityDataForLocation,
  loadLocalQualityDataSummary,
} from '../utils/localDataManager';
import type { EnsembleCalibrationLogEntry } from '../utils/ensembleCalibrationMath';
import type { OutdoorWindowFeedbackRecord } from '../utils/outdoorWindowFeedbackPolicy';
import type { RainEpisodeForecastLogEntry, RainForecastLogEntry } from '../utils/rainCalibrationMath';
import type { StormFeedbackRecord } from '../utils/stormFeedbackPolicy';

declare const testStorage: {
  setItem: (key: string, value: string) => Promise<void>;
  getItem: (key: string) => Promise<string | null>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const now = Date.now();
const forecastTime = new Date(now + 2 * 60 * 60_000).toISOString().slice(0, 16);
const forecastDate = forecastTime.slice(0, 10);

function rainHourly(lat: number, lon: number, time: string): RainForecastLogEntry {
  return {
    lat,
    lon,
    time,
    validAt: now + 2 * 60 * 60_000,
    issuedAt: now,
    leadHours: 2,
    probability: 0.4,
    observed: null,
  };
}

function rainDaily(lat: number, lon: number): RainEpisodeForecastLogEntry {
  return {
    lat,
    lon,
    date: forecastDate,
    validAt: now + 12 * 60 * 60_000,
    issuedAt: now,
    leadHours: 14,
    probability: 0.4,
    members: 12,
    forecastHours: 24,
    observed: null,
  };
}

function ensemble(lat: number, lon: number): EnsembleCalibrationLogEntry {
  return {
    lat,
    lon,
    time: forecastTime,
    validAt: now + 2 * 60 * 60_000,
    issuedAt: now,
    leadHours: 2,
    metric: 'temperature',
    p10: 10,
    median: 12,
    p90: 14,
    observed: null,
  };
}

async function seed(): Promise<void> {
  const at = now - 1000;
  await testStorage.setItem(RAIN_LOG_KEY, JSON.stringify({
    version: 2,
    entries: [rainHourly(10, 20, forecastTime), rainHourly(30, 40, forecastTime)],
    episodes: [rainDaily(10, 20)],
    verificationStamps: [{ lat: 10, lon: 20, attemptedAt: at }],
  }));
  await testStorage.setItem(ENSEMBLE_CALIBRATION_KEY, JSON.stringify({
    version: 1,
    entries: [ensemble(10, 20), ensemble(30, 40)],
  }));
  const outdoor: OutdoorWindowFeedbackRecord[] = [
    { scope: '10|20', windowKey: 'a|b', vote: 'good-fit', at },
    { scope: '30|40', windowKey: 'c|d', vote: 'not-for-me', at },
  ];
  const storm: StormFeedbackRecord[] = [
    { scope: '10|20', eventKey: 'storm-a', vote: 'useful', at },
    { scope: '30|40', eventKey: 'storm-b', vote: 'not-useful', at },
    { scope: 'current', eventKey: 'legacy', vote: 'useful', at },
  ];
  await testStorage.setItem(OUTDOOR_WINDOW_FEEDBACK_KEY, JSON.stringify(outdoor));
  await testStorage.setItem(STORM_ALERT_FEEDBACK_KEY, JSON.stringify(storm));
}

async function main(): Promise<void> {
  await seed();
  const before = await loadLocalQualityDataSummary();
  equal(before.locations.length, 3, 'calibration and feedback group into two coordinate scopes plus one legacy scope');
  const first = before.locations.find((row) => row.key === 'coordinates:10|20');
  assert(first, 'the coordinate-scoped row is present');
  equal(first.rainHourly, 1, 'hourly rain sample count is visible per location');
  equal(first.rainDaily, 1, 'daily event sample count is visible per location');
  equal(first.ensemble, 1, 'ensemble distribution count is visible per location');
  equal(first.outdoorFeedback, 1, 'outdoor feedback count shares the location scope');
  equal(first.stormFeedback, 1, 'storm feedback count shares the location scope');
  equal(first.total, 5, 'location total counts each retained local record once');
  equal(before.totals.total, 10, 'all local data counts aggregate across coordinate and legacy scopes');

  await clearLocalQualityDataForLocation(first);
  const afterLocationClear = await loadLocalQualityDataSummary();
  assert(!afterLocationClear.locations.some((row) => row.key === first.key), 'clearing one location removes all its calibration and feedback data');
  const otherLocation = afterLocationClear.locations.find((row) => row.key === 'coordinates:30|40');
  assert(otherLocation && otherLocation.total === 4, 'other locations remain intact after a scoped clear');
  const legacy = afterLocationClear.locations.find((row) => row.key === 'legacy:current');
  assert(legacy && legacy.stormFeedback === 1, 'unmapped legacy feedback remains separately visible and clearable');

  await clearAllLocalQualityData();
  const afterAllClear = await loadLocalQualityDataSummary();
  equal(afterAllClear.totals.total, 0, 'clear-all empties only the optional local quality datasets');
  console.log('local data manager counts, location grouping, scoped clearing, legacy feedback, and clear-all tests passed');
}

void main().catch((error: unknown) => {
  console.error(error);
  throw error;
});
