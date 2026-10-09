import {
  IMPACT_MERGE_GAP_MS,
  aggregateWeatherImpacts,
  type ImpactSignal,
} from '../utils/impactTimeline';
import {
  DEFAULT_OUTDOOR_PREFERENCES,
  normalizeOutdoorPreferences,
  recommendOutdoorWindows,
  type OutdoorForecastHour,
  type OutdoorPreferences,
} from '../utils/outdoorPlanPolicy';
import {
  assessAlertCacheFreshness,
  assessCacheFreshness,
  type CacheFreshnessInput,
} from '../utils/freshnessPolicy';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const baseTime = Date.UTC(2026, 9, 9, 10);

function signal(overrides: Partial<ImpactSignal> & Pick<ImpactSignal, 'id'>): ImpactSignal {
  const { id, ...otherOverrides } = overrides;
  return {
    id,
    hazard: 'rain',
    source: 'forecast',
    severity: 'warning',
    startsAt: baseTime,
    endsAt: baseTime + 60 * 60 * 1000,
    sourceUpdatedAt: baseTime - 60 * 60 * 1000,
    title: 'Rain expected',
    expected: 'Intermittent rain',
    whyItMatters: 'Paths may become wet',
    action: 'Carry a rain layer',
    ...otherOverrides,
  };
}

function testImpactAggregation(): void {
  const initialForecast = signal({ id: 'forecast-rain', sourceUpdatedAt: baseTime - 60_000 });
  const refreshedForecast = signal({
    id: 'forecast-rain',
    source: 'hourly forecast',
    sourceUpdatedAt: baseTime,
    expected: 'Rain likely during the commute',
  });
  const official = signal({
    id: 'official-rain',
    source: 'official warning',
    severity: 'severe',
    startsAt: baseTime + 20 * 60_000,
    endsAt: baseTime + 90 * 60_000,
    sourceUpdatedAt: baseTime + 1_000,
    title: 'Severe rainfall warning',
    expected: 'Heavy rainfall and localized flooding',
    whyItMatters: 'Low-lying roads may flood quickly',
    action: 'Avoid flooded roads',
    safetyCopy: 'Move to higher ground if flooding begins.',
  });
  const nowcast = signal({
    id: 'nowcast-rain',
    source: 'nowcast',
    severity: 'info',
    startsAt: baseTime + 80 * 60_000,
    endsAt: baseTime + 120 * 60_000,
    sourceUpdatedAt: baseTime + 2_000,
    title: 'Rain continuing nearby',
    expected: 'Showers continue nearby',
    whyItMatters: 'Rain may persist',
    action: 'Allow extra travel time',
  });
  const separateRain = signal({
    id: 'later-rain',
    startsAt: baseTime + 3 * 60 * 60_000,
    endsAt: baseTime + 4 * 60 * 60_000,
  });
  const wind = signal({
    id: 'wind',
    hazard: 'wind',
    source: 'forecast',
    startsAt: baseTime,
    endsAt: baseTime + 2 * 60 * 60_000,
    title: 'Windy conditions',
    expected: 'Strong gusts',
    whyItMatters: 'Exposed areas may be uncomfortable',
    action: 'Secure loose items',
  });
  const impacts = aggregateWeatherImpacts([
    initialForecast,
    refreshedForecast,
    official,
    nowcast,
    separateRain,
    wind,
    { ...signal({ id: 'bad' }), endsAt: baseTime - 1 },
  ]);
  equal(impacts.length, 3, 'same-hazard overlapping and nearby signals group, separate periods do not');
  const rainImpact = impacts.find((impact) => impact.signalIds.includes('official-rain'));
  assert(rainImpact, 'merged rain impact exists');
  equal(rainImpact.severity, 'severe', 'strongest severity is retained');
  equal(rainImpact.title, 'Severe rainfall warning', 'the severe signal leads presentation');
  equal(rainImpact.sources.length, 3, 'duplicate signal IDs are upserted to their latest version');
  assert(rainImpact.sources.includes('hourly forecast'), 'latest forecast source is used');
  assert(!rainImpact.sources.includes('forecast'), 'superseded source is not double-counted');
  assert(rainImpact.safetyMessages.includes('Move to higher ground if flooding begins.'), 'severe safety copy is preserved verbatim');
  assert(rainImpact.actions.includes('Avoid flooded roads'), 'severe safety action is preserved');
  assert(rainImpact.signalIds.includes('nowcast-rain'), 'overlapping nowcast merges into the same impact');
  const later = impacts.find((impact) => impact.signalIds.includes('later-rain'));
  assert(later && later.signalIds.length === 1, 'separated event stays distinct');
  equal(IMPACT_MERGE_GAP_MS, 30 * 60_000, 'merge tolerance is explicit');
  const exactGap = aggregateWeatherImpacts([
    signal({ id: 'gap-first' }),
    signal({
      id: 'gap-exact',
      startsAt: baseTime + 90 * 60_000,
      endsAt: baseTime + 120 * 60_000,
    }),
  ]);
  equal(exactGap.length, 1, 'an exact 30-minute gap is merged');
  const beyondGap = aggregateWeatherImpacts([
    signal({ id: 'gap-first' }),
    signal({
      id: 'gap-beyond',
      startsAt: baseTime + 90 * 60_000 + 1,
      endsAt: baseTime + 120 * 60_000,
    }),
  ]);
  equal(beyondGap.length, 2, 'a gap beyond the merge tolerance stays separate');

  const olderWins = aggregateWeatherImpacts([
    refreshedForecast,
    { ...initialForecast, sourceUpdatedAt: baseTime - 2 * 60_000 },
  ]);
  equal(olderWins.length, 1, 'repeated source ID remains a single signal');
  assert(olderWins[0].expected.includes('Rain likely during the commute'), 'older duplicate cannot replace a newer update');
}

function outdoorHour(at: number, overrides: Partial<OutdoorForecastHour> = {}): OutdoorForecastHour {
  return {
    at,
    fetchedAt: baseTime,
    rainProbability: 10,
    temperatureC: 22,
    windKmh: 10,
    uvIndex: 2,
    aqi: 30,
    ...overrides,
  };
}

function testOutdoorPlanning(): void {
  const normalized = normalizeOutdoorPreferences({
    maxRainProbability: 101,
    minTemperatureC: 30,
    maxTemperatureC: 10,
    maxWindKmh: -5,
    minimumWindowHours: 99,
  });
  equal(normalized.maxRainProbability, 100, 'probability preference is clamped');
  equal(normalized.maxWindKmh, 0, 'negative wind preference is clamped');
  equal(normalized.minTemperatureC, DEFAULT_OUTDOOR_PREFERENCES.minTemperatureC, 'inverted temperature range restores safe defaults');
  equal(normalized.maxTemperatureC, DEFAULT_OUTDOOR_PREFERENCES.maxTemperatureC, 'both ends of an inverted range restore together');
  equal(normalized.minimumWindowHours, 8, 'window length is bounded');

  const start = baseTime + 2 * 60 * 60_000;
  const good = recommendOutdoorWindows(
    [outdoorHour(start), outdoorHour(start + 60 * 60_000)],
    null,
    { now: baseTime },
  );
  equal(good.status, 'ready', 'fresh, complete data produces a ready plan');
  equal(good.windows.length, 1, 'two comfortable adjacent hours form a window');
  equal(good.windows[0].durationHours, 2, 'window duration counts hourly slots');
  equal(good.windows[0].endAt, start + 2 * 60 * 60_000, 'window end is exclusive');
  equal(good.windows[0].confidence, 'high', 'complete metric set gives high confidence');
  assert(good.windows[0].reasons.includes('rain-within-preference'), 'window carries human-adaptable positive reasons');

  const riskPreferences: OutdoorPreferences = {
    ...DEFAULT_OUTDOOR_PREFERENCES,
    minimumScore: 85,
    minimumWindowHours: 1,
  };
  const ranked = recommendOutdoorWindows(
    [
      outdoorHour(start, { rainProbability: 95, temperatureC: 40, windKmh: 60, uvIndex: 12, aqi: 180 }),
      outdoorHour(start + 60 * 60_000),
    ],
    riskPreferences,
    { now: baseTime },
  );
  equal(ranked.windows.length, 1, 'high-risk hour is excluded by the chosen score threshold');
  equal(ranked.windows[0].startAt, start + 60 * 60_000, 'remaining recommendation ranks the comfortable slot');

  const partial = recommendOutdoorWindows(
    [
      outdoorHour(start, { aqi: null }),
      outdoorHour(start + 60 * 60_000, { aqi: null }),
    ],
    null,
    { now: baseTime },
  );
  equal(partial.status, 'partial', 'missing AQI remains visibly partial');
  equal(partial.windows[0].confidence, 'partial', 'missing input lowers confidence');
  assert(partial.windows[0].uncertainMetrics.includes('aqi'), 'unknown metrics are disclosed instead of treated as ideal');
  assert(partial.windows[0].reasons.includes('aqi-unknown'), 'unknown metric reason is included');

  const oldFetchedAt = baseTime - 4 * 60 * 60_000;
  const stale = recommendOutdoorWindows(
    [outdoorHour(start, { fetchedAt: oldFetchedAt }), outdoorHour(start + 60 * 60_000, { fetchedAt: oldFetchedAt })],
    null,
    { now: baseTime },
  );
  equal(stale.status, 'stale', 'all stale forecast hours produce a stale status');
  equal(stale.staleHours, 2, 'staleness count is reported');
  equal(stale.windows.length, 0, 'stale forecast hours cannot become recommendations');

  const mixed = recommendOutdoorWindows(
    [
      outdoorHour(start, { fetchedAt: oldFetchedAt }),
      outdoorHour(start + 60 * 60_000),
      outdoorHour(start + 2 * 60 * 60_000),
    ],
    null,
    { now: baseTime },
  );
  equal(mixed.status, 'partial', 'mixed stale and fresh forecast data is disclosed');
  equal(mixed.staleHours, 1, 'only old hours count stale');
  equal(mixed.windows.length, 1, 'fresh adjacent hours remain independently usable');
  equal(mixed.windows[0].durationHours, 2, 'stale point does not bridge a recommendation window');

  const pastOnly = recommendOutdoorWindows(
    [outdoorHour(baseTime - 60 * 60_000), outdoorHour(baseTime - 2 * 60 * 60_000)],
    null,
    { now: baseTime },
  );
  equal(pastOnly.status, 'insufficient', 'past forecast slots cannot be presented as future opportunities');
  equal(pastOnly.windows.length, 0, 'past forecast slots do not create outdoor windows');

  const insufficient = recommendOutdoorWindows(
    [outdoorHour(start, { rainProbability: null, temperatureC: null, windKmh: null })],
    null,
    { now: baseTime },
  );
  equal(insufficient.status, 'insufficient', 'too few known metrics receive an explicit insufficient status');
  equal(insufficient.windows.length, 0, 'too few known metrics do not produce a recommendation');
  assert(insufficient.missingMetrics.includes('rain'), 'missing metric summary is provided');
}

function freshnessInput(overrides: Partial<CacheFreshnessInput> = {}): CacheFreshnessInput {
  return {
    snapshotLocationId: 'raipur',
    currentLocationId: 'raipur',
    fetchedAt: baseTime,
    now: baseTime,
    ...overrides,
  };
}

function testFreshnessPolicy(): void {
  const fresh = assessCacheFreshness(freshnessInput({ fetchedAt: baseTime - 60_000 }));
  equal(fresh.state, 'fresh', 'recent cache is fresh');
  assert(fresh.mayTreatAsCurrent && fresh.alertsMayBeTreatedAsCurrent, 'fresh alert data may be current');

  const staleAge = 15 * 60_000;
  const stale = assessAlertCacheFreshness(freshnessInput({ fetchedAt: baseTime - staleAge }));
  equal(stale.state, 'stale', 'freshness boundary becomes stale');
  assert(stale.mayDisplayCached, 'stale snapshot can be labeled and shown as cached');
  assert(!stale.mayTreatAsCurrent && !stale.alertsMayBeTreatedAsCurrent, 'stale alerts cannot be treated as current');

  const expiredAge = 6 * 60 * 60_000;
  const expired = assessCacheFreshness(freshnessInput({ fetchedAt: baseTime - expiredAge }));
  equal(expired.state, 'expired', 'expiry boundary is expired');
  assert(!expired.mayDisplayCached, 'expired cache is not usable for display');

  const wrongLocation = assessCacheFreshness(
    freshnessInput({ currentLocationId: 'bilaspur' }),
  );
  equal(wrongLocation.state, 'wrong-location', 'a recent snapshot for another location is rejected');
  assert(!wrongLocation.mayDisplayCached && !wrongLocation.alertsMayBeTreatedAsCurrent, 'wrong-location data is never usable as current');

  const unknownLocation = assessCacheFreshness(freshnessInput({ snapshotLocationId: null }));
  equal(unknownLocation.state, 'wrong-location', 'missing location identity fails closed');
  equal(unknownLocation.reason, 'location-unknown', 'unknown-location reason is explicit');

  const futureWithinTolerance = assessCacheFreshness(
    freshnessInput({ fetchedAt: baseTime + 60_000 }),
  );
  equal(futureWithinTolerance.state, 'fresh', 'small clock skew is tolerated and age clamps to zero');
  equal(futureWithinTolerance.ageMs, 0, 'slightly future timestamp reports a non-negative age');
  const farFuture = assessCacheFreshness(freshnessInput({ fetchedAt: baseTime + 10 * 60_000 }));
  equal(farFuture.state, 'expired', 'implausibly future timestamp fails closed');
  equal(farFuture.reason, 'timestamp-in-future', 'future timestamp is diagnosable');

  const missingTime = assessCacheFreshness(freshnessInput({ fetchedAt: null }));
  equal(missingTime.state, 'expired', 'missing timestamp is not called fresh');
  const invalidPolicy = assessCacheFreshness(freshnessInput(), { freshForMs: 60_000, expireAfterMs: 30_000 });
  equal(invalidPolicy.reason, 'invalid-policy', 'invalid thresholds are rejected');
}

testImpactAggregation();
testOutdoorPlanning();
testFreshnessPolicy();
console.log('weather policy tests passed');
