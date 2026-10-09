import type { EnsembleSpread, HourlyWeatherObservation } from '../api/types';
import {
  applyEnsembleCalibrationObservations,
  computeEnsembleCalibrationSummary,
  createEnsembleCalibrationEntries,
  ensembleVerificationDateRange,
  isEnsembleCalibrationLogEntry,
  mergeEnsembleCalibrationEntries,
  MIN_CONTINUOUS_CALIBRATION_CASES,
  MIN_CONTINUOUS_CALIBRATION_DAYS,
  MIN_ENSEMBLE_MEMBERS_PER_HOUR,
  type EnsembleCalibrationLogEntry,
} from '../utils/ensembleCalibrationMath';
import { localTimestampAsUtc } from '../utils/rainCalibrationMath';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const paris = { latitude: 48.86, longitude: 2.35 };
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeEntry(
  time: string,
  metric: 'temperature' | 'wind',
  observed: number | null,
  leadHours = 6,
  lat = 48.86,
  lon = 2.35,
): EnsembleCalibrationLogEntry {
  const validAt = localTimestampAsUtc(time);
  assert(validAt !== null, `valid local time: ${time}`);
  return {
    lat,
    lon,
    time,
    validAt,
    issuedAt: validAt - leadHours * HOUR,
    leadHours,
    metric,
    p10: 10,
    median: 12,
    p90: 14,
    observed,
    ...(observed === null ? {} : { observedAt: validAt + DAY }),
  };
}

function testForecastLoggingAndObservationMatching(): void {
  const fetchedAt = Date.UTC(2026, 0, 1, 0);
  const spread: EnsembleSpread = {
    fetchedAt,
    members: 40,
    points: [
      {
        time: '2026-01-01T02:00', tP10: 4, tMedian: 6, tP90: 8,
        temperatureMembers: 39, windP10: 2, windMedian: 4, windP90: 7,
        windMembers: 35, rainProb: 50,
      },
      {
        time: '2026-01-01T03:00', tP10: 4, tMedian: 6, tP90: 8,
        temperatureMembers: 9, windP10: 2, windMedian: 4, windP90: 7,
        windMembers: 9, rainProb: 50,
      },
    ],
  };
  const created = createEnsembleCalibrationEntries(spread, paris, 0);
  assert(created.length === 2, 'temperature and wind each log only when at least ten members are available');
  assert(created.every(isEnsembleCalibrationLogEntry), 'created rows pass the untrusted-storage validator');
  assert(created[0].time === '2026-01-01T02:00' && created[0].leadHours === 2, 'location-local time and lead are kept');

  const observations: HourlyWeatherObservation[] = [
    { time: '2026-01-01T02:00', precipitation: 0, temperature: 6.5, windSpeed: 5 },
    { time: '2026-01-01T03:00', precipitation: 0, temperature: null, windSpeed: null },
  ];
  const attached = applyEnsembleCalibrationObservations(created, paris, observations, fetchedAt + 5 * DAY);
  assert(attached.every((entry) => entry.observed !== null), 'actuals attach by local hour and metric');
  assert(attached[0].observed === 6.5 && attached[1].observed === 5, 'temperature and wind values remain metric-specific');
  const wrongLocation = applyEnsembleCalibrationObservations(
    created,
    { latitude: 35.68, longitude: 139.69 },
    observations,
    fetchedAt + 5 * DAY,
  );
  assert(wrongLocation.every((entry) => entry.observed === null), 'observations never cross location scope');

  const duplicateHour = createEnsembleCalibrationEntries({
    ...spread,
    points: [spread.points[0], { ...spread.points[0] }],
  }, paris, 0);
  assert(duplicateHour.length === 0, 'ambiguous repeated local DST-fold hours are omitted');
}

function testSampleGatesAndMetrics(): void {
  const samples: EnsembleCalibrationLogEntry[] = [];
  const start = Date.UTC(2026, 0, 1);
  for (let day = 0; day < MIN_CONTINUOUS_CALIBRATION_DAYS; day++) {
    for (let hour = 0; hour < 8; hour++) {
      const at = start + day * DAY + hour * HOUR;
      const time = new Date(at).toISOString().slice(0, 16);
      samples.push(
        makeEntry(time, 'temperature', 13, 6),
        makeEntry(time, 'wind', 12.5, 6),
      );
    }
  }
  const fewCases = computeEnsembleCalibrationSummary(
    samples.slice(0, (MIN_CONTINUOUS_CALIBRATION_CASES - 1) * 2),
    paris,
  );
  assert(fewCases.temperature.status === 'insufficient', 'temperature score stays hidden below the 100-case gate');
  assert(fewCases.temperature.medianAbsoluteError === null, 'insufficient cases do not expose a noisy error score');
  assert(fewCases.wind.status === 'insufficient', 'wind score is independently gated');

  const fewDates = computeEnsembleCalibrationSummary(samples.slice(0, 100 * 2), paris);
  assert(fewDates.temperature.status === 'insufficient', '100 cases over too few dates remain gated');
  assert(fewDates.temperature.verifiedDays < MIN_CONTINUOUS_CALIBRATION_DAYS, 'the independent date minimum is enforced');

  const ready = computeEnsembleCalibrationSummary(samples, paris);
  assert(ready.temperature.status === 'ready' && ready.wind.status === 'ready', 'both metrics unlock only after case and date gates');
  assert(ready.temperature.verifiedDays === MIN_CONTINUOUS_CALIBRATION_DAYS, 'unique verified dates are counted');
  assert(ready.temperature.medianAbsoluteError === 1, 'median absolute error uses the ensemble median');
  assert(ready.temperature.centralIntervalCoverage === 1, 'central interval coverage is measured against P10-P90');
  assert(ready.temperature.meanIntervalWidth === 4, 'mean interval width is exposed alongside coverage');
  assert(ready.temperature.leadTimeBuckets[0].sufficientlyPopulated, 'lead-time bucket has its own case/day gate');
  const otherLocation = computeEnsembleCalibrationSummary(samples, { latitude: 0, longitude: 0 });
  assert(otherLocation.temperature.verifiedCases === 0, 'summary is explicitly scoped to the requested location');
}

function testRangeRetentionAndValidation(): void {
  const now = Date.UTC(2026, 1, 10);
  const eligible = [
    makeEntry('2026-02-05T01:00', 'temperature', null),
    makeEntry('2026-02-06T02:00', 'wind', null),
    makeEntry('2026-02-09T03:00', 'temperature', null),
  ];
  const range = ensembleVerificationDateRange(eligible, now);
  assert(range?.startDate === '2026-02-05' && range.endDate === '2026-02-06', 'archive range covers only due unverified hours');
  assert(ensembleVerificationDateRange([makeEntry('2026-02-10T03:00', 'wind', null)], now) === null,
    'recent forecasts wait for the Archive publication delay');

  const old = makeEntry('2025-12-01T03:00', 'temperature', null);
  const retained = mergeEnsembleCalibrationEntries([...eligible, old], [], now);
  assert(retained.every((entry) => entry.validAt >= now - 30 * DAY), 'local log drops rows older than 30 days');
  const invalid = { ...eligible[0], p10: 20, median: 10, p90: 30 };
  assert(!isEnsembleCalibrationLogEntry(invalid), 'reversed percentiles are rejected from stored data');
  assert(MIN_ENSEMBLE_MEMBERS_PER_HOUR === 10, 'minimum ensemble member support is explicit');
}

testForecastLoggingAndObservationMatching();
testSampleGatesAndMetrics();
testRangeRetentionAndValidation();
console.log('ensemble calibration math tests passed');
