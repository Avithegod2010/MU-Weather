import { fetchHourlyPrecipitationActuals } from '../api/providers';
import type { EnsembleSpread, GeoLocation } from '../api/types';
import {
  MAX_RAIN_LOG_LOCATIONS,
  MAX_RAIN_LOG_ROWS_PER_LOCATION,
  MIN_RAIN_CALIBRATION_CASES,
  applyRainObservations,
  calibratedRainProbability,
  computeRainCalibrationSummary,
  createRainForecastEntries,
  localTimestampAsUtc,
  mergeRainForecastEntries,
  rainVerificationDateRange,
  type RainForecastLogEntry,
} from '../utils/rainCalibrationMath';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function closeTo(actual: number, expected: number, epsilon: number, message: string): void {
  assert(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, got ${actual}`);
}

function makeEntry(
  time: string,
  probability: number,
  observed: 0 | 1 | null,
  lat = 48.86,
  lon = 2.35,
): RainForecastLogEntry {
  const validAt = localTimestampAsUtc(time);
  assert(validAt !== null, `valid timestamp fixture: ${time}`);
  return {
    lat,
    lon,
    time,
    validAt,
    issuedAt: validAt - 60 * 60 * 1000,
    leadHours: 1,
    probability,
    observed,
    ...(observed === null ? {} : { observedAt: validAt + 3 * 24 * 60 * 60 * 1000 }),
  };
}

const paris: GeoLocation = {
  id: 'paris',
  name: 'Paris',
  latitude: 48.8566,
  longitude: 2.3522,
};

// Local parsing is independent of the test runner's timezone.
assert(
  localTimestampAsUtc('2026-03-14T10:00') === Date.UTC(2026, 2, 14, 10),
  'local timestamp parses as a wall-clock UTC value',
);
assert(localTimestampAsUtc('2026-02-30T10:00') === null, 'invalid calendar dates are rejected');

const issuedAt = Date.UTC(2026, 2, 14, 8);
const spread: EnsembleSpread = {
  fetchedAt: issuedAt,
  members: 40,
  points: [
    { time: '2026-03-14T08:00', tP10: 3, tMedian: 5, tP90: 8, rainProb: 90 },
    { time: '2026-03-14T10:00', tP10: 3, tMedian: 5, tP90: 8, rainProb: 25 },
    { time: '2026-03-14T12:00', tP10: 3, tMedian: 5, tP90: 8, rainProb: 75 },
    { time: 'bad-time', tP10: 3, tMedian: 5, tP90: 8, rainProb: 50 },
    { time: '2026-03-14T14:00', tP10: 3, tMedian: 5, tP90: 8, rainProb: 101 },
  ],
};
const forecasts = createRainForecastEntries(spread, paris, 60 * 60);
assert(forecasts.length === 2, 'past, malformed and out-of-range forecast points are skipped');
assert(forecasts[0].time === '2026-03-14T10:00', 'future hourly point is retained');
// Europe/Paris repeats local 02:00 when daylight-saving time ends on 2026-10-25.
const ambiguous = createRainForecastEntries(
  {
    ...spread,
    fetchedAt: Date.UTC(2026, 9, 24, 22),
    points: [
      { time: '2026-10-25T02:00', tP10: 3, tMedian: 5, tP90: 8, rainProb: 25 },
      { time: '2026-10-25T02:00', tP10: 3, tMedian: 5, tP90: 8, rainProb: 75 },
    ],
  },
  paris,
  2 * 60 * 60,
);
assert(ambiguous.length === 0, 'ambiguous repeated fall-back local hours are not scored');
closeTo(forecasts[0].leadHours, 1, 0.0001, 'lead is relative to retrieval time and location offset');
closeTo(forecasts[0].probability, 0.25, 0.0001, 'member share is stored as a 0-1 probability');

// Re-fetching replaces only unverified rows; a verified event cannot be rewritten.
const first = makeEntry('2026-03-10T09:00', 0.2, null);
const newer = { ...first, issuedAt: first.issuedAt + 1000, probability: 0.8 };
const replaced = mergeRainForecastEntries([first], [newer], Date.UTC(2026, 2, 15));
assert(replaced.length === 1 && replaced[0].probability === 0.8, 'latest pre-event probability wins');
const verified = { ...first, observed: 1 as const, observedAt: first.validAt + 1 };
const preserved = mergeRainForecastEntries([verified], [newer], Date.UTC(2026, 2, 15));
assert(preserved.length === 1 && preserved[0].probability === 0.2, 'verified row is immutable');

// Hard bounds apply both per location and to the number of retained locations.
const now = Date.UTC(2026, 3, 1, 12);
const hourlyRows: RainForecastLogEntry[] = [];
for (let i = 0; i < 800; i++) {
  const time = new Date(now - (800 - i) * 60 * 60 * 1000).toISOString().slice(0, 16);
  hourlyRows.push(makeEntry(time, 0.1, null));
}
const bounded = mergeRainForecastEntries([], hourlyRows, now);
assert(bounded.length <= MAX_RAIN_LOG_ROWS_PER_LOCATION, 'one location is capped at 30 days of hourly rows');
const manyLocations = Array.from({ length: MAX_RAIN_LOG_LOCATIONS + 2 }, (_, index) => {
  const time = new Date(now - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
  return {
    ...makeEntry(time, 0.1, null, 10 + index, 20 + index),
    issuedAt: now - 1000 + index,
  };
});
const boundedLocations = mergeRainForecastEntries([], manyLocations, now);
const locationCount = new Set(boundedLocations.map((entry) => `${entry.lat}|${entry.lon}`)).size;
assert(locationCount === MAX_RAIN_LOG_LOCATIONS, 'only the eight most recently used locations are retained');
assert(!boundedLocations.some((entry) => entry.lat === 10), 'least recently issued location is pruned first');

// Verification uses the same 0.1 mm event threshold and leaves missing observations untouched.
const observationRows = [
  makeEntry('2026-03-12T00:00', 0.4, null),
  makeEntry('2026-03-12T01:00', 0.4, null),
  makeEntry('2026-03-12T02:00', 0.4, null),
];
const verifiedRows = applyRainObservations(
  observationRows,
  paris,
  [
    { time: '2026-03-12T00:00', precipitation: 0.09 },
    { time: '2026-03-12T01:00', precipitation: 0.1 },
  ],
  Date.UTC(2026, 2, 16),
);
assert(verifiedRows[0].observed === 0, 'less than the threshold verifies as dry');
assert(verifiedRows[1].observed === 1, 'threshold precipitation verifies as wet');
assert(verifiedRows[2].observed === null, 'an absent archive row remains unverified');

// Brier and reliability are withheld until both observation and date thresholds are met.
const scoredRows: RainForecastLogEntry[] = [];
for (let day = 1; day <= 14; day++) {
  for (let hour = 0; hour < 8; hour++) {
    const time = `2026-03-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`;
    const outcome = hour % 4 === 0 ? 1 : 0;
    scoredRows.push(makeEntry(time, 0.25, outcome));
  }
}
const scoreNow = Date.UTC(2026, 2, 20, 23);
const insufficient = computeRainCalibrationSummary(scoredRows.slice(0, MIN_RAIN_CALIBRATION_CASES - 1), paris, scoreNow);
assert(insufficient.status === 'insufficient', 'Brier is withheld below the verified-case threshold');
assert(insufficient.brierScore === null, 'insufficient history exposes no score');
assert(insufficient.reliabilityBins.every((bin) => bin.cases === 0), 'insufficient history exposes no partial bins');
const tooFewDates = Array.from({ length: 100 }, (_, index) => {
  const date = String(1 + Math.floor(index / 20)).padStart(2, '0');
  const hour = String(index % 20).padStart(2, '0');
  return makeEntry(`2026-03-${date}T${hour}:00`, 0.2, index % 2 as 0 | 1);
});
const tooFewDatesSummary = computeRainCalibrationSummary(tooFewDates, paris, scoreNow);
assert(tooFewDatesSummary.status === 'insufficient', 'case volume alone cannot bypass the distinct-date threshold');
assert(!tooFewDatesSummary.leadTimeBuckets[0].reliabilityBins[1].sufficientlyPopulated, 'lead-time bins remain hidden when many same-day hours do not span enough dates');
const summary = computeRainCalibrationSummary(scoredRows, paris, scoreNow);
assert(summary.status === 'ready', 'enough cases across enough dates unlock scoring');
assert(summary.verifiedCases === 112 && summary.verifiedDays === 14, 'hourly cases and distinct dates are counted');
closeTo(summary.brierScore ?? -1, 0.1875, 0.0001, 'Brier score is the mean squared probability error');
assert(summary.leadTimeBuckets.length === 4, 'lead-time verification exposes four forecast horizons');
assert(summary.leadTimeBuckets[0].sufficientlyPopulated, 'lead bucket needs both case and distinct-day thresholds');
assert(summary.leadTimeBuckets[0].cases === 112 && summary.leadTimeBuckets[0].verifiedDays === 14, 'lead bucket reports its own case and day counts');
closeTo(summary.leadTimeBuckets[0].brierScore ?? -1, 0.1875, 0.0001, 'lead bucket Brier score is computed only within that horizon');
assert(summary.leadTimeBuckets[1].brierScore === null, 'unsupported lead bucket does not publish a score');
assert(summary.reliabilityBins[1].sufficientlyPopulated, 'a populated 20-40% reliability bin is reported');
assert(summary.reliabilityBins[1].verifiedDays === 14, 'probability reliability bins report distinct verification days');
closeTo(summary.reliabilityBins[1].observedFrequency ?? -1, 0.25, 0.0001, 'bin reports observed wet frequency');
assert(summary.leadTimeBuckets[0].reliabilityBins[1].sufficientlyPopulated, 'lead-time bucket exposes supported probability-band reliability');
closeTo(summary.leadTimeBuckets[0].reliabilityBins[1].observedFrequency ?? -1, 0.25, 0.0001, 'lead-time probability band uses only that horizon');
assert(summary.leadTimeBuckets[0].reliabilityBins[1].verifiedDays === 14, 'lead-time probability band retains independent-day support');
closeTo(calibratedRainProbability(0.25, summary) ?? -1, 0.25, 0.0001, 'supported bin offers an empirical correction');
assert(calibratedRainProbability(0.9, summary) === null, 'unsupported bins do not claim a calibration');
const wrongLocation = computeRainCalibrationSummary(scoredRows, { ...paris, latitude: 51.5 }, scoreNow);
assert(wrongLocation.verifiedCases === 0, 'scores never mix locations');

const verificationRange = rainVerificationDateRange(
  [makeEntry('2026-03-01T12:00', 0.2, null), makeEntry('2026-03-14T12:00', 0.2, null)],
  Date.UTC(2026, 2, 20, 12),
);
assert(
  verificationRange?.startDate === '2026-03-01' && verificationRange.endDate === '2026-03-14',
  'archive verification requests a bounded range of eligible, lagged forecast dates',
);

async function testArchiveObservationProvider(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let requestCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    requestCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        hourly: {
          time: [
            '2026-03-12T00:00',
            '2026-03-12T01:00',
            '2026-03-12T02:00',
            '2026-03-12T03:00',
          ],
          precipitation: [0, 0.1, null, -1],
        },
      }),
    } as unknown as Response;
  }) as typeof fetch;
  try {
    const observations = await fetchHourlyPrecipitationActuals(
      paris.latitude,
      paris.longitude,
      '2026-03-12',
      '2026-03-13',
    );
    assert(observations?.length === 2, 'only complete, non-negative archive hours are accepted');
    assert(observations[0].precipitation === 0 && observations[1].precipitation === 0.1, 'dry zeroes are preserved');
    const query = new URL(requestedUrl).searchParams;
    assert(query.get('hourly') === 'precipitation', 'archive request asks for hourly precipitation');
    assert(query.get('timezone') === 'auto', 'archive request uses the forecast location timezone');
    assert(query.get('start_date') === '2026-03-12' && query.get('end_date') === '2026-03-13', 'archive date range is exact');
    const countBeforeInvalidDate = requestCount;
    assert(
      (await fetchHourlyPrecipitationActuals(paris.latitude, paris.longitude, '2026-02-30', '2026-03-13')) === null,
      'invalid archive date requests are rejected',
    );
    assert(requestCount === countBeforeInvalidDate, 'invalid dates do not reach the network');

    globalThis.fetch = (async () => ({ ok: false, status: 503 }) as Response) as typeof fetch;
    assert(
      (await fetchHourlyPrecipitationActuals(paris.latitude, paris.longitude, '2026-03-12', '2026-03-13')) === null,
      'archive service failure remains unverified instead of becoming a dry observation',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void testArchiveObservationProvider()
  .then(() => console.log('rain calibration math and archive-provider tests passed'))
  .catch((error: unknown) => {
    console.error(error);
    throw error;
  });
