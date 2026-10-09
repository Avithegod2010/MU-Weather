import {
  IMPACT_MERGE_GAP_MS,
  aggregateWeatherImpacts,
  type ImpactSignal,
} from '../utils/impactTimeline';
import { aggregateAlertHistoryImpacts } from '../utils/alertImpactHistory';
import {
  isAlertDeliveryStatus,
  mergeAlertHistoryOutcomes,
  sameAlertHistoryOutcome,
} from '../utils/alertHistoryPolicy';
import { isAlertSeverityEscalation, normalizeFiredMap, shouldDeliverAlert } from '../utils/alertEscalation';
import { forecastAlertExpiresAt } from '../utils/alertValidity';
import {
  MAX_STORM_FEEDBACK_RECORDS,
  normalizeStormFeedback,
  stormFeedbackEventKey,
  upsertStormFeedback,
} from '../utils/stormFeedbackPolicy';
import { DEFAULT_ALERT_SETTINGS, evaluateAlerts, isInsideQuietWindow, localMinutesOfDay } from '../utils/alertRules';
import type { CurrentConditions, DayPoint, HourPoint } from '../api/types';
import { buildCurrentImpactTimeline } from '../utils/currentImpactTimeline';
import { parseWarnings } from '../utils/meteoalarm';
import {
  DEFAULT_OUTDOOR_PREFERENCES,
  effectiveOutdoorPreferences,
  normalizeOutdoorPreferences,
  recommendOutdoorWindows,
  stepOutdoorPreference,
  type OutdoorForecastHour,
  type OutdoorPreferences,
} from '../utils/outdoorPlanPolicy';
import { buildOutdoorForecastHours } from '../utils/outdoorPlanAdapter';
import { findLowerRiskTripDeparture } from '../utils/tripDeparture';
import { buildForecastLogCsv, buildForecastLogJson } from '../utils/forecastLogExportFormat';
import type { ForecastLogEntry } from '../utils/forecastLog';
import { describeFreshness, widgetUpdatedLabel, WIDGET_STALE_AFTER_MS } from '../utils/widgetFreshness';
import {
  assessAlertCacheFreshness,
  assessCacheFreshness,
  assessWeatherCacheFreshness,
  weatherLocationKey,
  type CacheFreshnessInput,
} from '../utils/freshnessPolicy';
import { transitionWeatherOffline } from '../utils/weatherOfflinePolicy';
import {
  findOutdoorWindowFeedback,
  MAX_OUTDOOR_WINDOW_FEEDBACK,
  normalizeOutdoorWindowFeedback,
  outdoorWindowFeedbackKey,
  summarizeOutdoorWindowFeedback,
  upsertOutdoorWindowFeedback,
} from '../utils/outdoorWindowFeedbackPolicy';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const baseTime = Date.UTC(2026, 9, 9, 10);

function testAlertHistoryOutcomes(): void {
  const evidence = {
    metricLabel: 'cmp_rain' as const,
    actual: '70%',
    threshold: '≥60%',
    source: 'Open-Meteo hourly forecast',
    observationTime: '2026-10-09T12:00',
  };
  const permissionBlocked = {
    key: 'rain', title: 'Rain expected', city: 'Raipur', at: baseTime,
    evidence, deliveryStatus: 'permission-denied' as const,
  };
  const scheduled = {
    ...permissionBlocked,
    at: baseTime + 1,
    deliveryStatus: 'scheduled' as const,
    expiresAt: baseTime + 60 * 60_000,
  };
  assert(!sameAlertHistoryOutcome(permissionBlocked, scheduled), 'a permission suppression and later scheduled outcome are both retained');
  equal(isAlertDeliveryStatus('quiet-hours'), true, 'quiet-hours is a persisted delivery outcome');
  equal(isAlertDeliveryStatus('expired'), true, 'expired forecasts are persisted as non-delivery outcomes');
  equal(isAlertDeliveryStatus('untracked'), false, 'unknown stored outcomes are rejected');

  const history = mergeAlertHistoryOutcomes(
    [permissionBlocked],
    [
      permissionBlocked,
      scheduled,
      { ...scheduled, escalated: true, at: baseTime + 2 },
    ],
    20,
  );
  equal(history.length, 3, 'repeat outcomes deduplicate while transitions and escalations remain visible');
  equal(history[0].deliveryStatus, 'scheduled', 'new outcomes are prepended newest first');
  const otherCity = { ...scheduled, city: 'Tokyo' };
  assert(!sameAlertHistoryOutcome(scheduled, otherCity), 'history event identity includes its city scope');
  equal(mergeAlertHistoryOutcomes(history, [otherCity], 3).length, 3, 'history remains bounded to its configured maximum');
}

function testAlertEscalationAndFeedback(): void {
  const legacy = normalizeFiredMap({ rain: baseTime, bad: 'x' });
  equal(legacy.rain?.at, baseTime, 'legacy numeric cooldown timestamps are migrated');
  equal(legacy.rain?.severity, null, 'legacy cooldown severity remains unknown');
  equal(shouldDeliverAlert(baseTime + 5 * 60_000, legacy.rain, 'severe', 6 * 60 * 60_000), false, 'unknown legacy severity waits for its cooldown');

  const warning = { at: baseTime, severity: 'warning' as const };
  equal(shouldDeliverAlert(baseTime + 60_000, warning, 'warning', 6 * 60 * 60_000), false, 'same severity is deduplicated within cooldown');
  equal(shouldDeliverAlert(baseTime + 60_000, warning, 'info', 6 * 60 * 60_000), false, 'severity reduction does not bypass cooldown');
  equal(shouldDeliverAlert(baseTime + 60_000, warning, 'severe', 6 * 60 * 60_000), true, 'severity rise escalates immediately');
  equal(shouldDeliverAlert(baseTime + 6 * 60 * 60_000, warning, 'warning', 6 * 60 * 60_000), true, 'same severity is allowed once cooldown expires');
  equal(isAlertSeverityEscalation('warning', 'severe'), true, 'history can label immediate severity rises as escalations');
  equal(isAlertSeverityEscalation(null, 'severe'), false, 'unknown legacy severity is not called an escalation');

  const hourlyExpiry = forecastAlertExpiresAt({
    metricLabel: 'cmp_temp', actual: '10°', threshold: '≥8°',
    source: 'Open-Meteo hourly forecast', observationTime: '2026-01-01T12:00',
  }, 'UTC');
  equal(hourlyExpiry, Date.UTC(2026, 0, 1, 13), 'hourly alert expiry follows the cited location-local forecast hour');
  const dailyExpiry = forecastAlertExpiresAt({
    metricLabel: 'cmp_temp', actual: '0°', threshold: '≤0°',
    source: 'Open-Meteo daily forecast', observationTime: '2026-01-01',
  }, 'UTC');
  equal(dailyExpiry, Date.UTC(2026, 0, 2), 'daily alert expiry is the next location-local midnight');
  equal(forecastAlertExpiresAt({
    metricLabel: 'cmp_temp', actual: '10°', threshold: '≥8°',
    source: 'Open-Meteo hourly forecast', observationTime: '2026-10-25T02:30',
  }, 'Europe/Paris'), null, 'ambiguous DST-fold expiries are omitted instead of guessed');
  equal(forecastAlertExpiresAt(undefined, 'UTC'), null, 'alerts without valid forecast provenance have no invented expiry');

  const event = { hazard: 'storm', title: 'Thunderstorm warning', expected: ['Thunder around 14:00'] };
  const key = stormFeedbackEventKey(event);
  equal(stormFeedbackEventKey(event), key, 'storm feedback event keys survive refreshes');
  const vote = { scope: 'geo-1', eventKey: key, vote: 'useful' as const, at: baseTime };
  const replaced = upsertStormFeedback([vote], { ...vote, vote: 'not-useful', at: baseTime + 1 });
  equal(replaced.length, 1, 'feedback is one vote per event and location');
  equal(replaced[0].vote, 'not-useful', 'a changed vote replaces the previous local vote');
  const otherCity = upsertStormFeedback(replaced, { ...vote, scope: 'geo-2' });
  equal(otherCity.length, 2, 'storm usefulness history remains location-scoped');
  const capped = normalizeStormFeedback(Array.from({ length: MAX_STORM_FEEDBACK_RECORDS + 4 }, (_, index) => ({
    scope: 'geo-1', eventKey: `event-${index}`, vote: 'useful', at: baseTime + index,
  })));
  equal(capped.length, MAX_STORM_FEEDBACK_RECORDS, 'storm feedback retention is bounded');
}

function testQuietHoursAcrossDst(): void {
  const springBeforeJump = new Date('2026-03-08T06:30:00Z');
  const springAfterJump = new Date('2026-03-08T07:30:00Z');
  const springMorning = new Date('2026-03-08T11:15:00Z');
  equal(localMinutesOfDay(springBeforeJump), 90, 'spring DST time before the skipped hour is device-local');
  equal(localMinutesOfDay(springAfterJump), 210, 'spring DST time after the skipped hour advances to 03:30');
  assert(isInsideQuietWindow(localMinutesOfDay(springBeforeJump), 22 * 60, 7 * 60), 'quiet window holds before spring clock jump');
  assert(isInsideQuietWindow(localMinutesOfDay(springAfterJump), 22 * 60, 7 * 60), 'quiet window holds after spring clock jump');
  assert(!isInsideQuietWindow(localMinutesOfDay(springMorning), 22 * 60, 7 * 60), 'quiet window ends by local wall clock after spring DST');

  const fallFirstOneThirty = new Date('2026-11-01T05:30:00Z');
  const fallRepeatedOneThirty = new Date('2026-11-01T06:30:00Z');
  equal(localMinutesOfDay(fallFirstOneThirty), 90, 'first repeated fall-back 01:30 is interpreted locally');
  equal(localMinutesOfDay(fallRepeatedOneThirty), 90, 'second repeated fall-back 01:30 remains quiet');
  assert(isInsideQuietWindow(localMinutesOfDay(fallRepeatedOneThirty), 22 * 60, 7 * 60), 'repeated DST hour cannot escape quiet hours');
  assert(Number.isNaN(localMinutesOfDay(new Date(Number.NaN))), 'invalid device time fails closed');
}

function testAlertRuleEvidence(): void {
  const current: CurrentConditions = {
    observationTime: '2026-10-09T14:00',
    temperature: 20,
    apparentTemperature: 20,
    humidity: 50,
    isDay: true,
    weatherCode: 3,
    pressure: 1010,
    cloudCover: 40,
    windSpeed: 10,
    windDirection: 0,
    windGusts: 12,
    precipitation: 0,
    dewPoint: null,
    visibility: 10000,
    pressureTrend: null,
  };
  const hour: HourPoint = {
    time: '2026-10-09T16:00', temperature: 21, apparent: 21, weatherCode: 61,
    precipProbability: 72, precipitation: 1, isDay: true, isNow: false, dewPoint: null,
    visibility: 9000, windSpeed: 12, windGusts: 14, windDirection: 90, uvIndex: 2,
    humidity: 55, pressure: 1010, cape: null, snowDepthM: null, snowfallCm: null, freezingLevelM: null,
  };
  const today: DayPoint = {
    date: '2026-10-09', weatherCode: 61, tMax: 25, tMin: 18,
    sunrise: '2026-10-09T06:00', sunset: '2026-10-09T18:00', uvIndexMax: 3,
    precipProbabilityMax: 72, precipSum: 2, windMax: 16,
  };
  const settings = { ...DEFAULT_ALERT_SETTINGS, rain: true, thunder: false };
  const alerts = evaluateAlerts(settings, current, [hour], today, null);
  const rain = alerts.find((alert) => alert.key === 'rain');
  assert(rain?.evidence, 'numeric alert rules attach structured evidence');
  equal(rain.evidence.actual, '72%', 'rain evidence retains the observed forecast probability');
  equal(rain.evidence.threshold, '≥60%', 'rain evidence retains the exact trigger boundary');
  equal(rain.evidence.observationTime, hour.time, 'forecast evidence retains the provider-local valid time');
}

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
  equal(rainImpact.sourceUpdatedAt, baseTime + 2_000, 'group keeps the latest overall update time');
  equal(
    rainImpact.sourceUpdates.find((update) => update.source === 'official warning')?.updatedAt,
    baseTime + 1_000,
    'group also retains the official source update time independently',
  );
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

function testAlertHistoryIntegration(): void {
  const grouped = aggregateAlertHistoryImpacts([
    {
      key: 'rain', title: 'Rain expected', message: 'Bring a rain layer.', severity: 'warning', at: baseTime, city: 'Raipur',
      evidence: { metricLabel: 'cmp_rain', actual: '70%', threshold: '≥60%', source: 'Open-Meteo hourly forecast', observationTime: '2026-10-09T14:00' },
    },
    { key: 'rain', title: 'Heavy rainfall expected', message: 'Avoid flooded roads.', severity: 'severe', at: baseTime + 12 * 60_000, city: 'Raipur' },
    { key: 'rain', title: 'Rain expected', message: 'Rain in Bilaspur.', severity: 'warning', at: baseTime + 15 * 60_000, city: 'Bilaspur' },
    { key: 'wind', title: 'Windy', message: 'Secure loose items.', severity: 'warning', at: baseTime + 10 * 60_000, city: 'Raipur' },
  ]);
  equal(grouped.length, 3, 'only repeated notifications for the same rule and city group');
  const raipurRain = grouped.find((impact) => impact.hazard === 'Raipur:rain');
  assert(raipurRain, 'same-city rain group exists');
  equal(raipurRain.signalIds.length, 2, 'repeated alert history rows collapse into one timeline item');
  equal(raipurRain.severity, 'severe', 'history group keeps the strongest severity');
  assert(raipurRain.safetyMessages.includes('Avoid flooded roads.'), 'severe history copy remains available');
  assert(raipurRain.reasons.some((reason) => reason.includes('≥60%') && reason.includes('Open-Meteo')), 'alert history retains the observed value provenance and threshold');
  assert(grouped.some((impact) => impact.hazard === 'Bilaspur:rain'), 'separate city history never merges');
}

function testCurrentImpactTimeline(): void {
  const now = baseTime + 5 * 60_000;
  const impacts = buildCurrentImpactTimeline(
    [
      {
        key: 'rain', title: 'Rain expected', message: '70% chance of rain.', severity: 'warning',
        evidence: { metricLabel: 'cmp_rain', actual: '70%', threshold: '≥60%', source: 'Open-Meteo hourly forecast', observationTime: '2026-10-09T14:00' },
      },
      { key: 'raineasing', title: 'Rain easing', message: 'Rain may ease soon.', severity: 'info' },
    ],
    [
      {
        id: 'official-flood-1',
        event: 'Flood warning',
        headline: 'Flood risk',
        description: 'Flooding may affect low roads.',
        instruction: 'Avoid flooded roads.',
        severity: 'Severe',
        levelColor: 'orange',
        expires: new Date(baseTime + 2 * 60 * 60_000).toISOString(),
        areaDesc: 'Central area',
        senderName: 'Warning office',
      },
      {
        id: 'official-localized',
        event: 'Avis météorologique',
        headline: '',
        description: 'A separate local warning.',
        severity: 'Moderate',
        levelColor: 'yellow',
        expires: new Date(baseTime + 2 * 60 * 60_000).toISOString(),
        areaDesc: null,
        senderName: null,
      },
    ],
    baseTime,
    baseTime,
    now,
    { forecast: 'Forecast', official: 'MeteoAlarm' },
  );
  const rain = impacts.find((impact) => impact.signalIds.includes('official:official-flood-1'));
  assert(rain, 'current official and forecast rain signals share the timeline');
  equal(rain.signalIds.length, 3, 'overlapping forecast/nowcast/official signals merge');
  assert(rain.reasons.some((reason) => reason.includes('≥60%') && reason.includes('2026-10-09 14:00')), 'active alert impact exposes its observation time and triggering threshold');
  equal(rain.severity, 'severe', 'current timeline preserves official severe priority');
  assert(rain.safetyMessages.includes('Avoid flooded roads.'), 'official safety instruction is preserved');
  assert(impacts.some((impact) => impact.hazard === 'official:official-localized'), 'unrecognized localized warnings stay separate rather than risk a false merge');

  const expiryAt = baseTime + 30 * 60_000;
  const expiringWarning = [{
    id: 'expiring-storm',
    event: 'Thunderstorm warning',
    headline: 'Storm risk',
    description: 'Strong thunderstorms are possible.',
    instruction: 'Stay indoors during lightning.',
    severity: 'Severe' as const,
    levelColor: 'orange' as const,
    expires: new Date(expiryAt).toISOString(),
    areaDesc: null,
    senderName: null,
  }];
  const officialUpdatedAt = expiryAt - 10 * 60_000;
  const beforeExpiry = buildCurrentImpactTimeline([], expiringWarning, baseTime, officialUpdatedAt, expiryAt - 1, { forecast: 'Forecast', official: 'MeteoAlarm' });
  const atExpiry = buildCurrentImpactTimeline([], expiringWarning, baseTime, officialUpdatedAt, expiryAt, { forecast: 'Forecast', official: 'MeteoAlarm' });
  equal(beforeExpiry.length, 1, 'official warning remains visible immediately before its expiry');
  equal(atExpiry.length, 0, 'official warning expires exactly at its CAP expiry timestamp');

  const staleSources = buildCurrentImpactTimeline(
    [{ key: 'rain', title: 'Old rain', message: 'Old forecast alert.', severity: 'warning' }],
    [{
      id: 'old-official',
      event: 'Flood warning',
      headline: 'Flood risk',
      description: 'Old official warning.',
      instruction: 'Avoid flooded roads.',
      severity: 'Severe',
      levelColor: 'orange',
      expires: new Date(baseTime + 2 * 60 * 60_000).toISOString(),
      areaDesc: null,
      senderName: null,
    }],
    baseTime - 4 * 60 * 60_000,
    baseTime - 20 * 60_000,
    now,
    { forecast: 'Forecast', official: 'MeteoAlarm' },
  );
  equal(staleSources.length, 0, 'stale forecast and official feeds are omitted even if the warning expiry is future');
}

function testMeteoAlarmInstructions(): void {
  const expiry = new Date(baseTime + 60 * 60_000).toISOString();
  const warnings = parseWarnings(
    {
      warnings: [
        {
          alert: {
            status: 'Actual',
            identifier: 'cap-instruction-1',
            info: [
              {
                language: 'en-US',
                event: 'Flood warning',
                headline: 'Flood risk',
                description: 'Flooding is possible.',
                instruction: 'Avoid flooded roads.',
                severity: 'Severe',
                expires: expiry,
              },
              {
                language: 'es-ES',
                event: 'Aviso de inundación',
                headline: 'Riesgo de inundación',
                description: 'Es posible que haya inundaciones.',
                instruction: 'Evite las carreteras inundadas.',
                severity: 'Severe',
                expires: expiry,
              },
            ],
          },
        },
      ],
    },
    baseTime,
    'es',
  );
  equal(warnings.length, 1, 'active CAP warning is parsed');
  equal(warnings[0].instruction, 'Evite las carreteras inundadas.', 'language-matched protective instruction is carried through CAP parsing');
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

function testTripDepartureSuggestions(): void {
  const days: DayPoint[] = Array.from({ length: 9 }, (_, index) => ({
    date: `2026-10-${String(index + 9).padStart(2, '0')}`,
    weatherCode: 1,
    tMax: 24,
    tMin: 16,
    sunrise: '',
    sunset: '',
    uvIndexMax: 3,
    precipProbabilityMax: index === 2 ? 85 : 10,
    precipSum: index === 2 ? 8 : 0,
    windMax: 12,
  }));
  const suggestion = findLowerRiskTripDeparture(days, 1, 2, DEFAULT_OUTDOOR_PREFERENCES, 3);
  assert(suggestion, 'nearby lower-risk departure is suggested');
  equal(suggestion.startIndex, 3, 'suggestion shifts to the nearest window that is Pareto-better');
  equal(suggestion.startDate, days[3].date, 'departure recommendation carries the location-local date');
  assert(suggestion.lowerRiskMetrics.includes('rain'), 'suggestion names the improved risk dimensions');

  const heatTradeoff = days.map((day, index) => ({
    ...day,
    precipProbabilityMax: index === 2 ? 85 : 10,
    tMax: index === 3 || index === 4 ? 40 : 24,
  }));
  equal(findLowerRiskTripDeparture(heatTradeoff, 1, 2, DEFAULT_OUTDOOR_PREFERENCES, 3), null, 'planner refuses a hidden rain-for-heat tradeoff');
  equal(findLowerRiskTripDeparture(days, 3, 2, DEFAULT_OUTDOOR_PREFERENCES, 3), null, 'planner offers no shift when every nearby option is equally comfortable');
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
  equal(stepOutdoorPreference(null, 'rain', 1).maxRainProbability, 40, 'rain tolerance steps in 10-point increments');
  equal(stepOutdoorPreference(null, 'wind', -1).maxWindKmh, 20, 'wind comfort threshold steps in 5 km/h increments');
  const warmer = stepOutdoorPreference(null, 'temperature', 1);
  equal(warmer.minTemperatureC, 16, 'temperature preference can shift warmer');
  equal(warmer.maxTemperatureC, 28, 'temperature range width remains stable when shifted');
  const journalAdjusted = effectiveOutdoorPreferences({ ...DEFAULT_OUTDOOR_PREFERENCES, journalTemperatureOffsetC: 2.5 });
  equal(journalAdjusted.minTemperatureC, DEFAULT_OUTDOOR_PREFERENCES.minTemperatureC + 2.5, 'explicit journal adjustment shifts the lower comfort boundary');
  equal(journalAdjusted.maxTemperatureC, DEFAULT_OUTDOOR_PREFERENCES.maxTemperatureC + 2.5, 'journal adjustment keeps the comfort range width stable');
  equal(effectiveOutdoorPreferences(DEFAULT_OUTDOOR_PREFERENCES).minTemperatureC, DEFAULT_OUTDOOR_PREFERENCES.minTemperatureC, 'journal feedback never changes preferences before user approval');

  const adapted = buildOutdoorForecastHours(
    [{
      time: '2026-10-09T12:00',
      apparent: 22,
      precipProbability: 20,
      windSpeed: 10,
      windGusts: 15,
      uvIndex: 4,
    } as unknown as HourPoint],
    [{ time: '2026-10-09T12:00', usAqi: 42, euAqi: 22, pm25: null, pm10: null }],
    baseTime,
    5.5 * 60 * 60,
    'us',
  );
  equal(adapted[0].at, Date.UTC(2026, 9, 9, 6, 30), 'local forecast times convert to UTC using the location offset');
  equal(adapted[0].aqi, 42, 'outdoor model joins the selected hourly AQI feed');

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

function testWidgetCacheAge(): void {
  const now = baseTime;
  const recent = describeFreshness(now - 12 * 60_000, now);
  equal(recent.relative, '12 min ago', 'widget reports relative cache age');
  equal(recent.stale, false, 'recent widget cache is not marked stale');
  const boundary = describeFreshness(now - WIDGET_STALE_AFTER_MS, now);
  equal(boundary.stale, false, 'widget stale warning starts strictly after its boundary');
  const old = describeFreshness(now - WIDGET_STALE_AFTER_MS - 1, now);
  equal(old.stale, true, 'old widget cache is explicitly marked stale');
  assert(widgetUpdatedLabel(now - 2 * 60 * 60_000, now).includes('2 h ago'), 'widget label shows both update time and cache age');
}

function testPrivacyAwareForecastExport(): void {
  const rows: ForecastLogEntry[] = [
    { date: '2026-10-09', timezone: 'Asia/Kolkata', tMax: 31, tMin: 23, precipSum: 2.5 },
    { date: '2026-10-10', timezone: 'UTC+05:30', tMax: 30, tMin: 22, precipSum: 0 },
  ];
  const tempOnly = buildForecastLogCsv(rows, { includeTemperature: true, includePrecipitation: false }, baseTime);
  assert(tempOnly.includes('# schema_version=1') && tempOnly.includes('# coordinates_included=false'), 'CSV export declares schema and coordinate exclusion');
  assert(tempOnly.includes('Asia/Kolkata') && tempOnly.includes('UTC+05:30'), 'CSV export retains timezone per forecast row');
  assert(tempOnly.includes('t_max_c,t_min_c') && !tempOnly.includes('precip_sum_mm'), 'CSV category selection excludes unrequested precipitation');
  const rainJson = JSON.parse(buildForecastLogJson(rows, { includeTemperature: false, includePrecipitation: true }, baseTime)) as {
    schemaVersion: number;
    metadata: { coordinatesIncluded: boolean; timeZone: string };
    forecasts: Record<string, unknown>[];
  };
  equal(rainJson.schemaVersion, 1, 'JSON export has an explicit schema version');
  equal(rainJson.metadata.coordinatesIncluded, false, 'JSON metadata confirms precise coordinates are excluded');
  equal(rainJson.metadata.timeZone, 'mixed', 'JSON metadata discloses mixed timezone scope');
  assert('precipitationMm' in rainJson.forecasts[0] && !('temperatureC' in rainJson.forecasts[0]), 'JSON export includes only selected categories');
  equal(buildForecastLogCsv(rows, { includeTemperature: false, includePrecipitation: false }), '', 'empty category selection creates no misleading export');
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

function testOutdoorWindowFeedback(): void {
  const windowKey = outdoorWindowFeedbackKey(baseTime + 60_000, baseTime + 3_660_000);
  assert(windowKey, 'valid recommended window has a stable feedback key');
  equal(outdoorWindowFeedbackKey(baseTime, baseTime), null, 'zero-length windows cannot receive feedback');
  const raipur = weatherLocationKey(21.25, 81.63);
  assert(raipur, 'test city has a valid location scope');
  const entry = { scope: raipur, windowKey, vote: 'good-fit' as const, at: baseTime };
  const rows = upsertOutdoorWindowFeedback([], entry);
  const revised = upsertOutdoorWindowFeedback(rows, { ...entry, vote: 'not-for-me', at: baseTime + 1 });
  equal(revised.length, 1, 'a changed vote replaces feedback for the same location and window');
  equal(findOutdoorWindowFeedback(revised, raipur, windowKey), 'not-for-me', 'window feedback is retrievable for its city');
  equal(findOutdoorWindowFeedback(revised, '51.51|-0.13', windowKey), null, 'feedback never follows a window to another location');
  const trendRows = [
    { ...entry, windowKey: 'trend-1', vote: 'good-fit' as const, at: baseTime - 2 },
    { ...entry, windowKey: 'trend-2', vote: 'not-for-me' as const, at: baseTime - 1 },
    { ...entry, scope: '51.51|-0.13', windowKey: 'other-city', vote: 'good-fit' as const, at: baseTime },
    { ...entry, windowKey: 'old', vote: 'good-fit' as const, at: baseTime - 91 * 24 * 60 * 60 * 1000 },
  ];
  const initialTrend = summarizeOutdoorWindowFeedback(trendRows, raipur, baseTime);
  equal(initialTrend.sampleCount, 2, 'feedback trends are recent and location-scoped');
  equal(initialTrend.sufficientlySampled, false, 'feedback trend stays hidden below its three-response minimum');
  const enoughFeedback = upsertOutdoorWindowFeedback(trendRows, {
    ...entry,
    windowKey: 'trend-3',
    vote: 'good-fit',
    at: baseTime,
  });
  const trend = summarizeOutdoorWindowFeedback(enoughFeedback, raipur, baseTime);
  equal(trend.sampleCount, 3, 'recent location-scoped feedback count is exposed');
  equal(trend.goodFitCount, 2, 'good-fit trend count is local to the current city');
  equal(trend.notForMeCount, 1, 'not-for-me trend count is kept distinct');
  equal(trend.sufficientlySampled, true, 'trend unlocks at three local responses');
  const capped = normalizeOutdoorWindowFeedback(Array.from({ length: MAX_OUTDOOR_WINDOW_FEEDBACK + 3 }, (_, index) => ({
    scope: raipur,
    windowKey: `window-${index}`,
    vote: 'good-fit',
    at: baseTime + index,
  })));
  equal(capped.length, MAX_OUTDOOR_WINDOW_FEEDBACK, 'outdoor-window feedback retention is bounded');
}

function testOfflineRecovery(): void {
  let offline = false;
  offline = transitionWeatherOffline(offline, 'network-failure');
  equal(offline, true, 'a network failure enables the offline state');
  offline = transitionWeatherOffline(offline, 'success');
  equal(offline, false, 'the next successful refresh clears the offline state');
  offline = transitionWeatherOffline(offline, 'other-failure');
  equal(offline, false, 'a server or parse failure is not mislabeled as offline');
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

  const appFresh = assessWeatherCacheFreshness(freshnessInput({ fetchedAt: baseTime - 2 * 60 * 60_000 }));
  equal(appFresh.state, 'fresh', 'weather remains current inside the app three-hour window');
  const appStale = assessWeatherCacheFreshness(freshnessInput({ fetchedAt: baseTime - 3 * 60 * 60_000 }));
  equal(appStale.state, 'stale', 'weather alerts become non-current at the app stale boundary');
  assert(!appStale.alertsMayBeTreatedAsCurrent, 'stale app cache cannot trigger current alerts');
  const appExpired = assessWeatherCacheFreshness(freshnessInput({ fetchedAt: baseTime - 24 * 60 * 60_000 }));
  equal(appExpired.state, 'expired', 'app weather cache expires at 24 hours');
  equal(weatherLocationKey(21.25, 81.63), '21.25|81.63', 'weather cache keys are rounded location-scoped');
  equal(weatherLocationKey(91, 0), null, 'invalid coordinates cannot create a cache identity');
}

testAlertEscalationAndFeedback();
testAlertHistoryOutcomes();
testQuietHoursAcrossDst();
testAlertRuleEvidence();
testImpactAggregation();
testAlertHistoryIntegration();
testCurrentImpactTimeline();
testMeteoAlarmInstructions();
testOutdoorPlanning();
testTripDepartureSuggestions();
testOutdoorWindowFeedback();
testOfflineRecovery();
testFreshnessPolicy();
testPrivacyAwareForecastExport();
testWidgetCacheAge();
console.log('weather policy tests passed');
