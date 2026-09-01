import { useEffect, useState } from 'react';
import { getLanguage } from '../utils/i18n';
import {
  fetchMeteoAlarmWarnings,
  meteoalarmSlugFor,
  type MeteoAlarmWarning,
} from '../utils/meteoalarm';
import type { GeoLocation } from '../api/types';

export interface MeteoAlarmState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  warnings: MeteoAlarmWarning[] | null;
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
  const [state, setState] = useState<MeteoAlarmState>({ status: 'idle', warnings: null });

  const countryCode = location?.countryCode ?? null;
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    // Not a member country (or no location yet): idle immediately, no fetch.
    if (!countryCode || lat === null || lon === null || !meteoalarmSlugFor(countryCode)) {
      setState({ status: 'idle', warnings: null });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading', warnings: null });
    const load = () => {
      void (async () => {
        const warnings = await fetchMeteoAlarmWarnings(countryCode, lat, lon, getLanguage());
        if (cancelled) return;
        setState((prev) => {
          // Refresh failure with warnings already shown: keep them rather
          // than blanking the card; only the initial load reports 'error'.
          if (warnings === null && prev.warnings) return prev;
          if (warnings === null) return { status: 'error', warnings: null };
          return { status: 'ok', warnings };
        });
      })();
    };
    load();
    const refresh = setInterval(load, REFRESH_CHECK_MS);

    return () => {
      cancelled = true;
      clearInterval(refresh);
    };
  }, [countryCode, lat, lon]);

  return state;
}
