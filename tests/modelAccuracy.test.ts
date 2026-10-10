import type { ModelKey } from '../api/providers';
import type { PastDayActual } from '../api/types';
import { computeModelMetricAccuracy, MIN_MODEL_RANKING_DAYS } from '../utils/accuracy';
import type { ModelLogEntry } from '../utils/modelAccuracyLog';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const location = { latitude: 48.86, longitude: 2.35 };

function fixture(model: ModelKey, date: string, tMax: number, lat = location.latitude): ModelLogEntry {
  return { model, date, lat, lon: location.longitude, tMax, tMin: 10 };
}

function actual(date: string, tMax: number): PastDayActual {
  return { date, tMax, tMin: 10, precipSum: 0, weatherCode: 1 };
}

function testSparseAndUnevenSamplesDoNotRank(): void {
  const actuals = Array.from({ length: 10 }, (_, index) => actual(`2026-01-${String(index + 1).padStart(2, '0')}`, 20));
  const sparse = [
    fixture('ecmwf_ifs025', actuals[0].date, 20),
    fixture('ecmwf_ifs025', actuals[1].date, 20),
    fixture('gfs_seamless', actuals[0].date, 25),
    fixture('gfs_seamless', actuals[1].date, 25),
  ];
  const early = computeModelMetricAccuracy(sparse, actuals, location, 'temp');
  assert(!early.rankingReady && early.commonDays === 2, 'two shared days display estimates but do not rank models');
  assert(early.rows[0].model === 'ecmwf_ifs025', 'provisional rows are alphabetical, not implicitly sorted by a lucky score');
  assert(early.rows.every((row) => row.hitRateLower95 < row.hitRateUpper95), 'small hit-rate samples carry a non-zero uncertainty interval');

  const gapped = [
    ...Array.from({ length: 7 }, (_, index) => fixture('ecmwf_ifs025', actuals[index].date, 20)),
    ...Array.from({ length: 7 }, (_, index) => fixture('gfs_seamless', actuals[index + 3].date, 20)),
  ];
  const uneven = computeModelMetricAccuracy(gapped, actuals, location, 'temp');
  assert(!uneven.rankingReady && uneven.commonDays === 4, 'models with unbalanced date coverage are not ranked on incomparable samples');
}

function testCommonSampleRankingAndUncertainty(): void {
  const actuals = Array.from({ length: 9 }, (_, index) => actual(`2026-02-${String(index + 1).padStart(2, '0')}`, 20));
  const log = [
    ...Array.from({ length: 8 }, (_, index) => fixture('ecmwf_ifs025', actuals[index].date, 20)),
    ...Array.from({ length: 9 }, (_, index) => fixture('gfs_seamless', actuals[index].date, 24)),
  ];
  const summary = computeModelMetricAccuracy(log, actuals, location, 'temp');
  assert(summary.rankingReady && summary.commonDays === MIN_MODEL_RANKING_DAYS + 1, 'ranking unlocks after a shared full week');
  assert(summary.rows.every((row) => row.compared === summary.commonDays), 'ranked models are scored on the exact same dates');
  assert(summary.rows[0].model === 'ecmwf_ifs025', 'best supported common-sample hit rate sorts first');
  const sparseInterval = computeModelMetricAccuracy(log.slice(0, 4), actuals, location, 'temp').rows[0];
  assert(summary.rows[0].hitRateUpper95 - summary.rows[0].hitRateLower95 < sparseInterval.hitRateUpper95 - sparseInterval.hitRateLower95,
    'Wilson uncertainty narrows as sample support grows');
  assert(computeModelMetricAccuracy(log, actuals, { latitude: 51.5, longitude: -0.12 }, 'temp').rows.length === 0,
    'model comparisons remain location-scoped');
}

testSparseAndUnevenSamplesDoNotRank();
testCommonSampleRankingAndUncertainty();
console.log('model accuracy support, common-date ranking, and uncertainty tests passed');
