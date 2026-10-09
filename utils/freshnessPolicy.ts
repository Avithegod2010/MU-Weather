/**
 * Cache-age and location policy shared by weather and alert consumers.
 * Assessment is pure: callers provide timestamps and location keys, and stale
 * alert payloads are never marked current.
 */
export type CacheFreshnessState = 'fresh' | 'stale' | 'expired' | 'wrong-location';

export interface CacheFreshnessInput {
  snapshotLocationId: string | null | undefined;
  currentLocationId: string | null | undefined;
  fetchedAt: number | null | undefined;
  now?: number;
  freshForMs?: number;
  expireAfterMs?: number;
  futureToleranceMs?: number;
}

export interface CacheFreshnessAssessment {
  state: CacheFreshnessState;
  reason: 'location-mismatch' | 'location-unknown' | 'missing-timestamp' | 'invalid-policy' | 'timestamp-in-future' | 'within-fresh-window' | 'beyond-fresh-window' | 'past-expiry';
  ageMs: number | null;
  /** Fresh and stale payloads may be shown as explicitly cached/offline data. */
  mayDisplayCached: boolean;
  /** True only while the data is inside the freshness interval. */
  mayTreatAsCurrent: boolean;
  /** In particular, stale cached alerts must not be interpreted as active now. */
  alertsMayBeTreatedAsCurrent: boolean;
}

export interface CacheFreshnessPolicy {
  freshForMs?: number;
  expireAfterMs?: number;
  futureToleranceMs?: number;
}

const DEFAULT_FRESH_FOR_MS = 15 * 60 * 1000;
const DEFAULT_EXPIRE_AFTER_MS = 6 * 60 * 60 * 1000;
const DEFAULT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** App-level freshness window: preserve existing 3 h stale-banner behavior. */
export const WEATHER_CACHE_FRESH_FOR_MS = 3 * HOUR_MS;
/** Align expired-cache behavior with the existing 24 h AsyncStorage cap. */
export const WEATHER_CACHE_EXPIRE_AFTER_MS = 24 * HOUR_MS;

export const WEATHER_CACHE_FRESHNESS_POLICY: CacheFreshnessPolicy = {
  freshForMs: WEATHER_CACHE_FRESH_FOR_MS,
  expireAfterMs: WEATHER_CACHE_EXPIRE_AFTER_MS,
};

function assessment(
  state: CacheFreshnessState,
  reason: CacheFreshnessAssessment['reason'],
  ageMs: number | null,
): CacheFreshnessAssessment {
  const mayDisplayCached = state === 'fresh' || state === 'stale';
  const mayTreatAsCurrent = state === 'fresh';
  return {
    state,
    reason,
    ageMs,
    mayDisplayCached,
    mayTreatAsCurrent,
    alertsMayBeTreatedAsCurrent: mayTreatAsCurrent,
  };
}

/** Classify a cached weather/alert snapshot without mutating it. */
export function assessCacheFreshness(
  input: CacheFreshnessInput,
  policy: CacheFreshnessPolicy = {},
): CacheFreshnessAssessment {
  const now = input.now ?? Date.now();
  const freshForMs = policy.freshForMs ?? input.freshForMs ?? DEFAULT_FRESH_FOR_MS;
  const expireAfterMs = policy.expireAfterMs ?? input.expireAfterMs ?? DEFAULT_EXPIRE_AFTER_MS;
  const futureToleranceMs = policy.futureToleranceMs ?? input.futureToleranceMs ?? DEFAULT_FUTURE_TOLERANCE_MS;

  // Location takes priority: even a recent payload must never be shown for a
  // different selected place or silently relabeled as the current location.
  if (
    typeof input.snapshotLocationId !== 'string' ||
    input.snapshotLocationId.length === 0 ||
    typeof input.currentLocationId !== 'string' ||
    input.currentLocationId.length === 0
  ) {
    return assessment('wrong-location', 'location-unknown', null);
  }
  if (input.snapshotLocationId !== input.currentLocationId) {
    return assessment('wrong-location', 'location-mismatch', null);
  }
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(freshForMs) ||
    !Number.isFinite(expireAfterMs) ||
    !Number.isFinite(futureToleranceMs) ||
    freshForMs < 0 ||
    expireAfterMs <= freshForMs ||
    futureToleranceMs < 0
  ) {
    return assessment('expired', 'invalid-policy', null);
  }
  if (!Number.isFinite(input.fetchedAt)) {
    return assessment('expired', 'missing-timestamp', null);
  }

  const rawAge = now - (input.fetchedAt as number);
  if (rawAge < -futureToleranceMs) {
    return assessment('expired', 'timestamp-in-future', rawAge);
  }
  const ageMs = Math.max(0, rawAge);
  if (ageMs >= expireAfterMs) return assessment('expired', 'past-expiry', ageMs);
  if (ageMs >= freshForMs) return assessment('stale', 'beyond-fresh-window', ageMs);
  return assessment('fresh', 'within-fresh-window', ageMs);
}

/** Stable ~1 km coordinate key, matching the app's location-scoped caches. */
export function weatherLocationKey(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  if (
    typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) {
    return null;
  }
  return `${Math.round(latitude * 100) / 100}|${Math.round(longitude * 100) / 100}`;
}

/** Apply the app's shared weather-cache TTLs to any cached weather snapshot. */
export function assessWeatherCacheFreshness(
  input: CacheFreshnessInput,
): CacheFreshnessAssessment {
  return assessCacheFreshness(input, WEATHER_CACHE_FRESHNESS_POLICY);
}

/** Convenience wrapper that makes the alert-currentness rule explicit at call sites. */
export function assessAlertCacheFreshness(
  input: CacheFreshnessInput,
  policy?: CacheFreshnessPolicy,
): CacheFreshnessAssessment {
  return assessCacheFreshness(input, policy);
}
