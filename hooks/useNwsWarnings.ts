import { useEffect, useRef, useState } from 'react';
import { fetchNwsAlerts, inNwsArea, type NwsAlert } from '../api/nws';
import type { GeoLocation } from '../api/types';
import { weatherLocationKey } from '../utils/freshnessPolicy';

export interface NwsWarningsState {
  /** 'idle' means the location is outside NWS coverage - the card hides. */
  status: 'idle' | 'loading' | 'ok' | 'stale' | 'error';
  alerts: NwsAlert[] | null;
  updatedAt: number | null;
}

/** How often the hook re-asks the feed (matches the MeteoAlarm cadence). */
const REFRESH_MS = 5 * 60 * 1000;
/** Settle delay so a jumpy GPS fix does not fire a request per jitter. */
const SETTLE_MS = 900;

/**
 * Active NWS warnings & advisories for the active location, following the
 * useMeteoAlarm idiom: no persisted cache (warnings go stale), a gate BEFORE
 * any network so non-US locations stay at zero requests, a 900 ms settle delay
 * on location change, and feed outcomes kept distinct - a refresh failure with
 * last-known data reports 'stale' (kept, age visible in the card) instead of
 * dropping the rows, while a first-arrival failure reports 'error'.
 */
export function useNwsWarnings(location: GeoLocation | null): NwsWarningsState {
  const [state, setState] = useState<NwsWarningsState>({
    status: 'idle',
    alerts: null,
    updatedAt: null,
  });

  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;
  const locationKey = weatherLocationKey(lat, lon);
  const covered = location !== null && inNwsArea(location);
  // Last good result survives within ONE location key (interval refreshes,
  // transient failures) but is never shown under a different city.
  const lastGoodRef = useRef<{ key: string | null; alerts: NwsAlert[]; updatedAt: number } | null>(null);

  useEffect(() => {
    if (!covered || lat === null || lon === null) {
      lastGoodRef.current = null;
      setState({ status: 'idle', alerts: null, updatedAt: null });
      return undefined;
    }

    const known = lastGoodRef.current !== null && lastGoodRef.current.key === locationKey
      ? lastGoodRef.current
      : null;

    let cancelled = false;
    setState({ status: 'loading', alerts: known?.alerts ?? null, updatedAt: known?.updatedAt ?? null });

    const load = () => {
      void (async () => {
        try {
          const alerts = await fetchNwsAlerts(lat, lon);
          if (cancelled) return;
          const updatedAt = Date.now();
          lastGoodRef.current = { key: locationKey, alerts, updatedAt };
          setState({ status: 'ok', alerts, updatedAt });
        } catch {
          if (cancelled) return;
          setState((prev) => {
            const kept = prev.status === 'stale' || prev.status === 'ok' || prev.status === 'loading'
              ? lastGoodRef.current
              : null;
            if (kept && kept.key === locationKey) {
              return { status: 'stale', alerts: kept.alerts, updatedAt: kept.updatedAt };
            }
            return { status: 'error', alerts: null, updatedAt: null };
          });
        }
      })();
    };

    const settle = setTimeout(load, SETTLE_MS);
    const refresh = setInterval(load, REFRESH_MS);

    return () => {
      cancelled = true;
      clearTimeout(settle);
      clearInterval(refresh);
    };
  }, [covered, lat, lon, locationKey]);

  return state;
}