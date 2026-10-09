/**
 * Pure outdoor-window scoring core. It stays UI- and storage-free so the same
 * policy can be exercised by the Home planner and deterministic tests.
 */
export interface OutdoorPreferences {
  maxRainProbability: number;
  minTemperatureC: number;
  maxTemperatureC: number;
  maxWindKmh: number;
  maxUvIndex: number;
  maxAqi: number;
  minimumScore: number;
  minimumWindowHours: number;
}

export const DEFAULT_OUTDOOR_PREFERENCES: OutdoorPreferences = {
  maxRainProbability: 30,
  minTemperatureC: 15,
  maxTemperatureC: 27,
  maxWindKmh: 25,
  maxUvIndex: 6,
  maxAqi: 50,
  minimumScore: 65,
  minimumWindowHours: 2,
};

export interface OutdoorForecastHour {
  /** Epoch milliseconds for this forecast hour. */
  at: number;
  /** Epoch milliseconds when this forecast snapshot was retrieved. */
  fetchedAt: number | null;
  rainProbability: number | null;
  temperatureC: number | null;
  windKmh: number | null;
  uvIndex: number | null;
  aqi: number | null;
}

export type OutdoorReasonCode =
  | 'rain-within-preference'
  | 'rain-above-preference'
  | 'temperature-within-preference'
  | 'temperature-too-cold'
  | 'temperature-too-hot'
  | 'wind-within-preference'
  | 'wind-above-preference'
  | 'uv-within-preference'
  | 'uv-above-preference'
  | 'aqi-within-preference'
  | 'aqi-above-preference'
  | 'rain-unknown'
  | 'temperature-unknown'
  | 'wind-unknown'
  | 'uv-unknown'
  | 'aqi-unknown';

export interface OutdoorWindow {
  startAt: number;
  /** Exclusive end, so two hourly points at 10:00 and 11:00 describe 10:00–12:00. */
  endAt: number;
  durationHours: number;
  score: number;
  reasons: OutdoorReasonCode[];
  uncertainMetrics: ('rain' | 'temperature' | 'wind' | 'uv' | 'aqi')[];
  confidence: 'high' | 'partial';
}

export interface OutdoorPlanResult {
  status: 'ready' | 'partial' | 'stale' | 'insufficient';
  windows: OutdoorWindow[];
  staleHours: number;
  missingMetrics: ('rain' | 'temperature' | 'wind' | 'uv' | 'aqi')[];
}

export interface OutdoorPlanOptions {
  now?: number;
  staleAfterMs?: number;
  /** At least this many of the five forecast metrics must be available. */
  minimumKnownMetrics?: number;
}

export type OutdoorPreferenceControlKey = 'rain' | 'temperature' | 'wind' | 'uv' | 'aqi';

/** Apply a bounded UI step to one user's outdoor comfort preference. */
export function stepOutdoorPreference(
  input: Partial<OutdoorPreferences> | null | undefined,
  key: OutdoorPreferenceControlKey,
  delta: number,
): OutdoorPreferences {
  const preferences = normalizeOutdoorPreferences(input);
  if (!Number.isFinite(delta) || delta === 0) return preferences;
  const step = delta > 0 ? 1 : -1;
  switch (key) {
    case 'rain':
      preferences.maxRainProbability += step * 10;
      break;
    case 'temperature':
      preferences.minTemperatureC += step;
      preferences.maxTemperatureC += step;
      break;
    case 'wind':
      preferences.maxWindKmh += step * 5;
      break;
    case 'uv':
      preferences.maxUvIndex += step;
      break;
    case 'aqi':
      preferences.maxAqi += step * 10;
      break;
  }
  return normalizeOutdoorPreferences(preferences);
}

const HOUR_MS = 60 * 60 * 1000;
const METRIC_WEIGHTS = { rain: 30, temperature: 25, wind: 15, uv: 15, aqi: 15 } as const;
const METRIC_KEYS = ['rain', 'temperature', 'wind', 'uv', 'aqi'] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Normalize untrusted persisted preferences to known ranges without throwing. */
export function normalizeOutdoorPreferences(
  input: Partial<OutdoorPreferences> | null | undefined,
): OutdoorPreferences {
  const values = input ?? {};
  let minTemperatureC = bounded(values.minTemperatureC, DEFAULT_OUTDOOR_PREFERENCES.minTemperatureC, -60, 60);
  let maxTemperatureC = bounded(values.maxTemperatureC, DEFAULT_OUTDOOR_PREFERENCES.maxTemperatureC, -60, 60);
  if (minTemperatureC > maxTemperatureC) {
    minTemperatureC = DEFAULT_OUTDOOR_PREFERENCES.minTemperatureC;
    maxTemperatureC = DEFAULT_OUTDOOR_PREFERENCES.maxTemperatureC;
  }
  return {
    maxRainProbability: bounded(values.maxRainProbability, DEFAULT_OUTDOOR_PREFERENCES.maxRainProbability, 0, 100),
    minTemperatureC,
    maxTemperatureC,
    maxWindKmh: bounded(values.maxWindKmh, DEFAULT_OUTDOOR_PREFERENCES.maxWindKmh, 0, 300),
    maxUvIndex: bounded(values.maxUvIndex, DEFAULT_OUTDOOR_PREFERENCES.maxUvIndex, 0, 20),
    maxAqi: bounded(values.maxAqi, DEFAULT_OUTDOOR_PREFERENCES.maxAqi, 0, 500),
    minimumScore: bounded(values.minimumScore, DEFAULT_OUTDOOR_PREFERENCES.minimumScore, 0, 100),
    minimumWindowHours: Math.round(
      bounded(values.minimumWindowHours, DEFAULT_OUTDOOR_PREFERENCES.minimumWindowHours, 1, 8),
    ),
  };
}

function validMetric(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validInRange(value: number | null, minimum: number, maximum: number): value is number {
  return validMetric(value) && value >= minimum && value <= maximum;
}

function cappedFraction(excess: number, scale: number): number {
  return Math.min(1, Math.max(0, excess / Math.max(1, scale)));
}

interface ScoredHour {
  input: OutdoorForecastHour;
  score: number;
  reasons: OutdoorReasonCode[];
  uncertain: MetricKey[];
  stale: boolean;
  knownCount: number;
}

function scoreHour(
  hour: OutdoorForecastHour,
  preferences: OutdoorPreferences,
  now: number,
  staleAfterMs: number,
): ScoredHour | null {
  if (!Number.isFinite(hour.at)) return null;
  const fetchedAt = hour.fetchedAt;
  const stale =
    !validMetric(fetchedAt) ||
    fetchedAt > now + 5 * 60 * 1000 ||
    now - fetchedAt >= staleAfterMs;
  const reasons: OutdoorReasonCode[] = [];
  const uncertain: MetricKey[] = [];
  let penalty = 0;
  let knownCount = 0;

  if (validInRange(hour.rainProbability, 0, 100)) {
    knownCount += 1;
    if (hour.rainProbability <= preferences.maxRainProbability) {
      reasons.push('rain-within-preference');
    } else {
      reasons.push('rain-above-preference');
      penalty += METRIC_WEIGHTS.rain * cappedFraction(
        hour.rainProbability - preferences.maxRainProbability,
        100 - preferences.maxRainProbability,
      );
    }
  } else {
    uncertain.push('rain');
    reasons.push('rain-unknown');
  }

  if (validInRange(hour.temperatureC, -100, 80)) {
    knownCount += 1;
    if (hour.temperatureC < preferences.minTemperatureC) {
      reasons.push('temperature-too-cold');
      penalty += METRIC_WEIGHTS.temperature * cappedFraction(
        preferences.minTemperatureC - hour.temperatureC,
        20,
      );
    } else if (hour.temperatureC > preferences.maxTemperatureC) {
      reasons.push('temperature-too-hot');
      penalty += METRIC_WEIGHTS.temperature * cappedFraction(
        hour.temperatureC - preferences.maxTemperatureC,
        20,
      );
    } else {
      reasons.push('temperature-within-preference');
    }
  } else {
    uncertain.push('temperature');
    reasons.push('temperature-unknown');
  }

  if (validInRange(hour.windKmh, 0, 300)) {
    knownCount += 1;
    if (hour.windKmh <= preferences.maxWindKmh) reasons.push('wind-within-preference');
    else {
      reasons.push('wind-above-preference');
      penalty += METRIC_WEIGHTS.wind * cappedFraction(hour.windKmh - preferences.maxWindKmh, 60);
    }
  } else {
    uncertain.push('wind');
    reasons.push('wind-unknown');
  }

  if (validInRange(hour.uvIndex, 0, 30)) {
    knownCount += 1;
    if (hour.uvIndex <= preferences.maxUvIndex) reasons.push('uv-within-preference');
    else {
      reasons.push('uv-above-preference');
      penalty += METRIC_WEIGHTS.uv * cappedFraction(hour.uvIndex - preferences.maxUvIndex, 10);
    }
  } else {
    uncertain.push('uv');
    reasons.push('uv-unknown');
  }

  if (validInRange(hour.aqi, 0, 1000)) {
    knownCount += 1;
    if (hour.aqi <= preferences.maxAqi) reasons.push('aqi-within-preference');
    else {
      reasons.push('aqi-above-preference');
      penalty += METRIC_WEIGHTS.aqi * cappedFraction(hour.aqi - preferences.maxAqi, 150);
    }
  } else {
    uncertain.push('aqi');
    reasons.push('aqi-unknown');
  }

  // Unknown inputs are not treated as ideal conditions; each costs 8 points.
  penalty += uncertain.length * 8;
  return {
    input: hour,
    score: Math.max(0, Math.min(100, Math.round(100 - penalty))),
    reasons,
    uncertain,
    stale,
    knownCount,
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Score hourly inputs and group fresh, consecutive comfortable hours into windows. */
export function recommendOutdoorWindows(
  hours: OutdoorForecastHour[],
  inputPreferences: Partial<OutdoorPreferences> | null | undefined,
  options: OutdoorPlanOptions = {},
): OutdoorPlanResult {
  const preferences = normalizeOutdoorPreferences(inputPreferences);
  const now = options.now ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? 3 * HOUR_MS;
  const minimumKnownMetrics = Math.round(
    bounded(options.minimumKnownMetrics, 3, 1, METRIC_KEYS.length),
  );
  if (!Number.isFinite(now) || !Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
    return { status: 'insufficient', windows: [], staleHours: 0, missingMetrics: [...METRIC_KEYS] };
  }

  const byTime = new Map<number, OutdoorForecastHour>();
  for (const hour of hours) {
    // Plan only complete future slots; a forecast hour that has already begun
    // cannot be presented as a full, upcoming outdoor window.
    if (!Number.isFinite(hour.at) || hour.at < now) continue;
    const previous = byTime.get(hour.at);
    if (!previous || (validMetric(hour.fetchedAt) && (!validMetric(previous.fetchedAt) || hour.fetchedAt > previous.fetchedAt))) {
      byTime.set(hour.at, hour);
    }
  }
  const scored = [...byTime.values()]
    .sort((a, b) => a.at - b.at)
    .map((hour) => scoreHour(hour, preferences, now, staleAfterMs))
    .filter((hour): hour is ScoredHour => hour !== null);
  if (scored.length === 0) {
    return { status: 'insufficient', windows: [], staleHours: 0, missingMetrics: [...METRIC_KEYS] };
  }

  const staleHours = scored.filter((hour) => hour.stale).length;
  const missingMetrics = METRIC_KEYS.filter((metric) =>
    scored.some((hour) => hour.uncertain.includes(metric)),
  );
  const hasFresh = staleHours < scored.length;
  const hasFreshUsableInputs = scored.some(
    (hour) => !hour.stale && hour.knownCount >= minimumKnownMetrics,
  );
  const status: OutdoorPlanResult['status'] = !hasFresh
    ? 'stale'
    : !hasFreshUsableInputs
      ? 'insufficient'
      : missingMetrics.length > 0 || staleHours > 0
        ? 'partial'
        : 'ready';

  const candidates = scored.filter(
    (hour) =>
      !hour.stale &&
      hour.knownCount >= minimumKnownMetrics &&
      hour.score >= preferences.minimumScore,
  );
  const windows: OutdoorWindow[] = [];
  let segment: ScoredHour[] = [];
  const flush = () => {
    if (segment.length >= preferences.minimumWindowHours) {
      windows.push({
        startAt: segment[0].input.at,
        endAt: segment[segment.length - 1].input.at + HOUR_MS,
        durationHours: segment.length,
        score: Math.round(segment.reduce((sum, hour) => sum + hour.score, 0) / segment.length),
        reasons: unique(segment.flatMap((hour) => hour.reasons)),
        uncertainMetrics: unique(segment.flatMap((hour) => hour.uncertain)),
        confidence: segment.some((hour) => hour.uncertain.length > 0) ? 'partial' : 'high',
      });
    }
    segment = [];
  };

  for (const hour of candidates) {
    const previous = segment[segment.length - 1];
    if (previous && Math.abs(hour.input.at - previous.input.at - HOUR_MS) > 5 * 60 * 1000) flush();
    segment.push(hour);
  }
  flush();
  windows.sort((a, b) => b.score - a.score || a.startAt - b.startAt);
  return { status, windows, staleHours, missingMetrics };
}
