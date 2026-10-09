import { useEffect, useState } from 'react';
import { getLanguage } from '../utils/i18n';
import {
  fetchMeteoAlarmWarnings,
  meteoalarmSlugFor,
  meteoAlarmCacheFetchedAt,
  type MeteoAlarmWarning,
} from '../utils/meteoalarm';
import type { GeoLocation } from '../api/types';
import { weatherLocationKey } from '../utils/freshnessPolicy';

export interface MeteoAlarmState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  warnings: MeteoAlarmWarning[] | null;
  updatedAt: number | null;
  locationKey: string | null;
  /** Internal scope prevents one location/language response flashing for another. */
  requestKey: string | null;
}

/** How often the hook asks the module cache whether the feed went stale. */
const REFRESH_CHECK_MS = 5 * 60 * 1000;

/**
 * Official MeteoAlarm warnings for the active location. Unlike the other
 * location hooks there is NO persisted cache - warnings go stale, so the
 * module-level TTL cache in utils/meteoalarm.ts decides when to refetch:
 * 'idle' instantly for non-member countries (zero network churn), otherwise
 * a fetch now plus a periodic check that refetches once the TTL expires.
 * Failures leave the card absent (no crash, never throws).
 */
export function useMeteoAlarm(location: GeoLocation | null): MeteoAlarmState {
  const [state, setState] = useState<MeteoAlarmState>({
    status: 'idle',
    warnings: null,
    updatedAt: null,
    locationKey: null,
    requestKey: null,
  });

  const countryCode = location?.countryCode ?? null;
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;
  const language = getLanguage();
  const locationKey = weatherLocationKey(lat, lon);
  const requestKey = countryCode && lat !== null && lon !== null && meteoalarmSlugFor(countryCode)
    ? `${countryCode.toUpperCase()}|${language}|${locationKey ?? ''}|${lat}|${lon}`
    : null;

  useEffect(() => {
    // Not a member country (or no location yet): idle immediately, no network.
    if (!requestKey || !countryCode || lat === null || lon === null) return undefined;

    let cancelled = false;
    const load = () => {
      void (async () => {
        const warnings = await fetchMeteoAlarmWarnings(countryCode, lat, lon, language);
        if (cancelled) return;
        setState(() => {
          // A failed refresh is not evidence that old warnings are still active.
          if (warnings === null) {
            return {
              status: 'error',
              warnings: null,
              updatedAt: null,
              locationKey,
              requestKey,
            };
          }
          return {
            status: 'ok',
            warnings,
            updatedAt: meteoAlarmCacheFetchedAt(countryCode, language),
            locationKey,
            requestKey,
          };
        });
      })();
    };
    load();
    const refresh = setInterval(load, REFRESH_CHECK_MS);

    return () => {
      cancelled = true;
      clearInterval(refresh);
    };
  }, [countryCode, lat, lon, language, locationKey, requestKey]);

  if (!requestKey) {
    return {
      status: 'idle',
      warnings: null,
      updatedAt: null,
      locationKey: null,
      requestKey: null,
    };
  }
  if (state.requestKey !== requestKey) {
    // Derive loading for a new location/language rather than synchronously
    // setting state in the effect; old warnings cannot flash as current.
    return { status: 'loading', warnings: null, updatedAt: null, locationKey, requestKey };
  }
  return state;
}
