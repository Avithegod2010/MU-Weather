import { useEffect, useState } from 'react';
import { AURORA_LATITUDE_MIN, fetchAuroraForecast, type AuroraForecast } from '../utils/aurora';
import type { GeoLocation } from '../api/types';

export interface AuroraState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  forecast: AuroraForecast | null;
}

/** Space weather ages fast, so readings expire after 2 hours. */
const TTL_MS = 2 * 60 * 60 * 1000;

/**
 * In-memory for the session only — deliberately NOT AsyncStorage, because a Kp
 * reading restored from yesterday is worse than no reading at all.
 */
let cacheEntry: { at: number; forecast: AuroraForecast } | null = null;
let inflight: Promise<AuroraForecast | null> | null = null;

function loadForecast(): Promise<AuroraForecast | null> {
  if (cacheEntry && Date.now() - cacheEntry.at < TTL_MS) return Promise.resolve(cacheEntry.forecast);
  if (inflight) return inflight;
  const request = fetchAuroraForecast()
    .then((forecast) => {
      if (forecast) {
        cacheEntry = { at: Date.now(), forecast };
        return forecast;
      }
      // A failed refresh must never evict a reading we already have.
      return cacheEntry ? cacheEntry.forecast : null;
    })
    .catch(() => (cacheEntry ? cacheEntry.forecast : null))
    .finally(() => {
      inflight = null;
    });
  inflight = request;
  return request;
}

/**
 * NOAA SWPC planetary-Kp outlook: cache-first with a 2-hour TTL, deduped across
 * concurrent callers. Below ±45° latitude the hook stays idle, mirroring how the
 * marine card never fires inland — those users pay for no request at all.
 * A total failure leaves the card absent via 'error'.
 */
export function useAurora(location: GeoLocation | null): AuroraState {
  const [state, setState] = useState<AuroraState>({ status: 'idle', forecast: null });
  const latitude = location?.latitude ?? null;

  useEffect(() => {
    if (latitude === null || Math.abs(latitude) < AURORA_LATITUDE_MIN) {
      setState({ status: 'idle', forecast: null });
      return;
    }
    // A fresh cache hit is served synchronously so a remount never flashes empty.
    if (cacheEntry && Date.now() - cacheEntry.at < TTL_MS) {
      setState({ status: 'ok', forecast: cacheEntry.forecast });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', forecast: null });
    void loadForecast().then((forecast) => {
      if (cancelled) return;
      setState(forecast ? { status: 'ok', forecast } : { status: 'error', forecast: null });
    });
    return () => {
      cancelled = true;
    };
  }, [latitude]);

  return state;
}
