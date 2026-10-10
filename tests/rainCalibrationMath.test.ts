import {
  fetchEnsembleSpread,
  fetchHourlyPrecipitationActuals,
  fetchHourlyWeatherActuals,
} from '../api/providers';
import type { EnsembleSpread, GeoLocation } from '../api/types';
import { summarizeEnsembleRainEpisodes } from '../utils/ensembleRainEpisodeMath';
import { alignEnsembleRainProbabilities } from '../utils/rainChartOverlay';
import {
  MAX_RAIN_LOG_LOCATIONS,
  MAX_RAIN_LOG_ROWS_PER_LOCATION,
  MIN_RAIN_CALIBRATION_CASES,
  applyRainEpisodeObservations,
  applyRainObservations,
  calibratedRainProbability,
  computeRainEpisodeCalibrationSummary,
  computeRainCalibrationSummary,
  createRainEpisodeForecastEntries,
  createRainForecastEntries,
  isRainEpisodeForecastLogEntry,
  localTimestampAsUtc,
  mergeRainEpisodeForecastEntries,
  mergeRainForecastEntries,
  rainEpisodeVerificationDateRange,
  rainVerificationDateRange,
  type RainEpisodeForecastLogEntry,
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
    { time: '2026-03-14T08:00', tP10: 3, tMedian: 5, tP90: 8, rainProb: 90, rainMembers: 40 },
    { time: '2026-03-14T10:00', tP10: 3, tMedian: 5, tP90: 8, rainProb: 25, rainMembers: 40 },
    { time: '2026-03-14T12:00', tP10: 3, tMedian: 5, tP90: 8, rainProb: 75, rainMembers: 40 },
    { time: 'bad-time', tP10: 3, tMedian: 5, tP90: 8, rainProb: 50, rainMembers: 40 },
    { time: '2026-03-14T14:00', tP10: 3, tMedian: 5, tP90: 8, rainProb: 101, rainMembers: 40 },
  ],
};
const forecasts = createRainForecastEntries(spread, paris, 60 * 60);
assert(forecasts.length === 2, 'past, malformed and out-of-range forecast points are skipped');
assert(forecasts[0].time === '2026-03-14T10:00', 'future hourly point is retained');
const unsupportedRain = createRainForecastEntries({
  ...spread,
  points: [{ ...spread.points[1], rainProb: null, rainMembers: 0 }],
}, paris, 60 * 60);
assert(unsupportedRain.length === 0, 'missing precipitation-member support cannot be logged as a zero-percent forecast');
const legacyRainPoint = { ...spread.points[1], rainProb: 0 };
delete legacyRainPoint.rainMembers;
assert(createRainForecastEntries({ ...spread, points: [legacyRainPoint] }, paris, 60 * 60).length === 0,
  'legacy ensemble cache rows without per-hour rain support are not treated as calibrated dry forecasts');

const overlayHours = [
  { time: '2026-03-14T10:00' },
  { time: '2026-03-14T11:00' },
  { time: '2026-03-14T12:00' },
  { time: '2026-03-14T13:00' },
  { time: '2026-03-14T14:00' },
  { time: '2026-03-14T15:00' },
];
const overlay = alignEnsembleRainProbabilities(overlayHours, [
  { time: '2026-03-14T11:00', rainProb: 70, rainMembers: 20 },
  { time: '2026-03-14T10:00', rainProb: 25, rainMembers: 10 },
  { time: '2026-03-14T12:00', rainProb: 40, rainMembers: 9 },
  { time: '2026-03-14T13:00', rainProb: null, rainMembers: 20 },
  { time: '2026-03-14T14:00', rainProb: 101, rainMembers: 20 },
  { time: '2026-03-14T15:00', rainProb: 50 },
]);
assert(overlay[0]?.probability === 25 && overlay[1]?.probability === 70,
  'hourly ensemble rain shares align by local timestamp rather than array order');
assert(overlay[0]?.members === 10, 'hourly overlay retains its support count');
assert(overlay.slice(2).every((point) => point === null),
  'null, malformed, or under-supported hourly ensemble shares are omitted from the overlay');
const repeatedLocalHour = '2026-10-25T02:00';
assert(alignEnsembleRainProbabilities(
  [{ time: repeatedLocalHour }, { time: repeatedLocalHour }],
  [{ time: repeatedLocalHour, rainProb: 50, rainMembers: 20 }],
).every((point) => point === null), 'repeated local forecast hours are omitted instead of ambiguously aligned');
assert(alignEnsembleRainProbabilities(
  [{ time: repeatedLocalHour }],
  [
    { time: repeatedLocalHour, rainProb: 25, rainMembers: 20 },
    { time: repeatedLocalHour, rainProb: 75, rainMembers: 20 },
  ],
)[0] === null, 'duplicate ensemble timestamps are omitted instead of selecting one member share');

// Europe/Paris repeats local 02:00 when daylight-saving time ends on 2026-10-25.
const ambiguous = createRainForecastEntries(
  {
    ...spread,
    fetchedAt: Date.UTC(2026, 9, 24, 22),
    points: [
      { time: '2026-10-25T02:00', tP10: 3, tMedian: 5, tP90: 8, rainProb: 25, rainMembers: 40 },
      { time: '2026-10-25T02:00', tP10: 3, tMedian: 5, tP90: 8, rainProb: 75, rainMembers: 40 },
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

function testJointMemberRainEpisodeVerification(): void {
  const date = '2026-01-02';
  const times = Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, '0')}:00`);
  const members = Array.from({ length: 10 }, (_, memberIndex) => ({
    memberId: `member-${memberIndex}`,
    precipitation: times.map((_, hour) => memberIndex < 3 && (hour === 5 || hour === 6) ? 0.2 : 0),
  }));
  const joint = summarizeEnsembleRainEpisodes(times, members);
  assert(joint.length === 1 && joint[0].forecastHours === 24, 'only a complete local day produces an event forecast');
  closeTo(joint[0].probability, 0.3, 1e-12, 'correlated wet members count once for a local-day event instead of multiplying hourly probabilities');
  assert(summarizeEnsembleRainEpisodes(times.slice(1), members).length === 0, 'a partial local day is not scored as a full-day event');
  const missingHourWithDuplicate = [...times.filter((_, index) => index !== 17), times[16]];
  assert(summarizeEnsembleRainEpisodes(missingHourWithDuplicate, members).length === 0,
    'a duplicated hour cannot make an incomplete ensemble day look complete');
  assert(summarizeEnsembleRainEpisodes([...times, times[16]], members).length === 0,
    'a 25-row day with a duplicate hour is not treated as full hourly coverage');
  const halfHourTimes = times.map((time, index) => index === 10 ? `${date}T10:30` : time);
  assert(summarizeEnsembleRainEpisodes(halfHourTimes, members).length === 0,
    'non-top-of-hour timestamps cannot fill missing full-hour coverage');

  const fetchedAt = Date.UTC(2026, 0, 1, 10);
  const location = { latitude: 48.86, longitude: 2.35 };
  const spread: EnsembleSpread = {
    fetchedAt,
    members: 10,
    points: [],
    rainEpisodes: joint,
  };
  const created = createRainEpisodeForecastEntries(spread, location, 0);
  assert(created.length === 1 && isRainEpisodeForecastLogEntry(created[0]), 'joint daily event estimate is persisted as a validated forecast row');
  closeTo(created[0].probability, 0.3, 1e-12, 'daily event forecast retains the member-derived probability without an independence transform');
  const newer = { ...created[0], issuedAt: fetchedAt + 1, probability: 0.5 };
  const merged = mergeRainEpisodeForecastEntries(created, [newer], fetchedAt + 2);
  assert(merged.length === 1 && merged[0].probability === 0.5, 'unverified daily event forecasts keep the latest issue for that place/date');

  const observedAt = Date.UTC(2026, 0, 5);
  const observations = times.map((time, hour) => ({ time, precipitation: hour === 7 ? 0.2 : 0 }));
  const oldEnough = { ...created[0], validAt: Date.UTC(2026, 0, 2), observed: null };
  const partial = applyRainEpisodeObservations([oldEnough], location, observations.slice(0, 12), observedAt);
  assert(partial[0].observed === null, 'partial archive data never becomes a false dry-day outcome');
  const missingArchiveHourWithDuplicate = [...observations.filter((_, index) => index !== 17), observations[16]];
  const duplicateCoverage = applyRainEpisodeObservations([oldEnough], location, missingArchiveHourWithDuplicate, observedAt);
  assert(duplicateCoverage[0].observed === null,
    'duplicate archive hours cannot turn an incomplete local day into an observation');
  const overcompleteDuplicate = applyRainEpisodeObservations([oldEnough], location, [...observations, observations[16]], observedAt);
  assert(overcompleteDuplicate[0].observed === null, 'an extra duplicate archive row invalidates daily verification');
  const complete = applyRainEpisodeObservations([oldEnough], location, observations, observedAt);
  assert(complete[0].observed === 1, 'one or more wet archive hours verifies one local-day rain episode');
  assert(rainEpisodeVerificationDateRange([oldEnough], observedAt)?.startDate === date, 'daily verification requests use the event date');

  const monthEnd = Date.UTC(2026, 0, 31);
  const verifiedDays: RainEpisodeForecastLogEntry[] = Array.from({ length: 14 }, (_, index) => {
    const dayDate = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
    const validAt = Date.UTC(2026, 0, 1 + index);
    return {
      ...oldEnough,
      date: dayDate,
      validAt,
      issuedAt: validAt - 12 * 60 * 60 * 1000,
      observed: index < 4 ? 1 : 0,
      observedAt: validAt + 4 * 24 * 60 * 60 * 1000,
    };
  });
  const eventSummary = computeRainEpisodeCalibrationSummary(verifiedDays, location, monthEnd);
  assert(eventSummary.status === 'ready' && eventSummary.verifiedDays === 14, 'daily event scoring is gated on fourteen complete dates');
  assert(eventSummary.brierScore !== null && eventSummary.meanForecastProbability !== null, 'supported local-day events report Brier and mean probability');
  assert(computeRainEpisodeCalibrationSummary(verifiedDays, { latitude: 40, longitude: -74 }, monthEnd).verifiedCases === 0,
    'daily event calibration is scoped to its rounded location');
}

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
          temperature_2m: [6, -2, null, 4],
          wind_speed_10m: [0, 2, 5, -1],
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
    const weatherObservations = await fetchHourlyWeatherActuals(
      paris.latitude,
      paris.longitude,
      '2026-03-12',
      '2026-03-13',
    );
    assert(weatherObservations?.length === 4, 'archive rows remain when only temperature or wind is populated');
    assert(weatherObservations[0].temperature === 6 && weatherObservations[0].windSpeed === 0, 'temperature and calm-wind actuals retain zero/positive values');
    assert(weatherObservations[1].temperature === -2, 'negative temperatures are valid archive observations');
    assert(weatherObservations[3].precipitation === null && weatherObservations[3].windSpeed === null, 'invalid negative precipitation/wind values become missing, not actuals');
    const query = new URL(requestedUrl).searchParams;
    assert(
      query.get('hourly') === 'precipitation,temperature_2m,wind_speed_10m',
      'one archive request supplies precipitation and the continuous verification variables',
    );
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

async function testEnsembleRainSupport(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const times = Array.from({ length: 24 }, (_, hour) => `2026-03-11T${String(hour).padStart(2, '0')}:00`);
  const makePayload = (precipitationMembers: number) => {
    const hourly: Record<string, unknown> = { time: times };
    for (let member = 0; member < 10; member++) {
      hourly[`temperature_2m_member${member}`] = Array(24).fill(12);
      if (member < precipitationMembers) {
        hourly[`precipitation_member${member}`] = times.map((_, hour) =>
          member < 3 && hour === 7 ? 0.2 : 0,
        );
      }
    }
    return { hourly };
  };
  try {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => makePayload(5),
    }) as Response) as typeof fetch;
    const lowSupport = await fetchEnsembleSpread(paris.latitude, paris.longitude);
    assert(lowSupport?.points[0].rainProb === null && lowSupport.points[0].rainMembers === 5,
      'fewer than ten hourly precipitation members yield unavailable, not zero, rain probability');
    assert(lowSupport?.rainEpisodes?.length === 0,
      'daily event estimates are omitted below the minimum complete-day member support');

    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => makePayload(10),
    }) as Response) as typeof fetch;
    const supported = await fetchEnsembleSpread(paris.latitude, paris.longitude);
    assert(supported?.points[7].rainProb === 30 && supported.points[7].rainMembers === 10,
      'hourly event probability uses only supported precipitation members');
    assert(supported?.rainEpisodes?.length === 1 && supported.rainEpisodes[0].members === 10,
      'a complete local day produces a joint-member daily event probability with its support count');
    closeTo(supported?.rainEpisodes?.[0].probability ?? -1, 0.3, 1e-12,
      'daily chance counts members with any wet hour instead of multiplying hourly chances');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

testJointMemberRainEpisodeVerification();

void testArchiveObservationProvider()
  .then(() => testEnsembleRainSupport())
  .then(() => console.log('rain calibration math and archive-provider tests passed'))
  .catch((error: unknown) => {
    console.error(error);
    throw error;
  });
