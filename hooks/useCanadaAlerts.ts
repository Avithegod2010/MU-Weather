import { useEffect, useRef, useState } from 'react';
import { fetchCanadaAlerts, inCanadaArea, type CanadaAlert } from '../api/canada';
import type { GeoLocation } from '../api/types';
import { weatherLocationKey } from '../utils/freshnessPolicy';
import { getLanguage } from '../utils/i18n';

export interface CanadaAlertsState {
  /** 'idle' means the location is outside ECCC coverage - the card hides. */
  status: 'idle' | 'loading' | 'ok' | 'stale' | 'error';
  alerts: CanadaAlert[] | null;
  updatedAt: number | null;
}

/** How often the hook re-asks the feed (matches the NWS/MeteoAlarm cadence). */
const REFRESH_MS = 5 * 60 * 1000;
/** Settle delay so a jumpy GPS fix does not fire a request per jitter. */
const SETTLE_MS = 900;

/**
 * Active Environment Canada warnings for the active location, following the
 * useNwsWarnings idiom: no persisted cache (warnings go stale), a gate BEFORE
 * any network so non-CA locations stay at zero requests, a 900 ms settle delay
 * on location change, and feed outcomes kept distinct - a refresh failure with
 * last-known data reports 'stale' instead of dropping the rows, while a
 * first-arrival failure reports 'error'.
 */
export function useCanadaAlerts(location: GeoLocation | null): CanadaAlertsState {
  const [state, setState] = useState<CanadaAlertsState>({
    status: 'idle',
    alerts: null,
    updatedAt: null,
  });

  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;
  const locationKey = weatherLocationKey(lat, lon);
  const covered = location !== null && inCanadaArea(location);
  const lastGoodRef = useRef<{ key: string | null; alerts: CanadaAlert[]; updatedAt: number } | null>(null);

  useEffect(() => {
    if (!covered || lat === null || lon === null) {
      lastGoodRef.current = null;
      setState({ status: 'idle', alerts: null, updatedAt: null });
      return undefined;
    }

    const known = lastGoodRef.current !== null && lastGoodRef.current.key === locationKey
      ? lastGoodRef.current
      : null;
    const language = getLanguage();

    let cancelled = false;
    setState({ status: 'loading', alerts: known?.alerts ?? null, updatedAt: known?.updatedAt ?? null });

    const load = () => {
      void (async () => {
        try {
          const alerts = await fetchCanadaAlerts(lat, lon, language);
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
