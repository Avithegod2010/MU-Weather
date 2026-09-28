import { useEffect, useState } from 'react';
import {
  AURORA_LATITUDE_MIN,
  fetchAuroraExtras,
  fetchAuroraForecast,
  type AuroraExtras,
  type AuroraForecast,
} from '../utils/aurora';
import type { GeoLocation } from '../api/types';

export interface AuroraState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  forecast: AuroraForecast | null;
  /** Best-effort solar wind + Kp history; null until loaded or on failure. */
  extras: AuroraExtras | null;
}

/** Space weather ages fast, so readings expire after 2 hours. */
const TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Solar-wind + Kp-history readings expire after 10 minutes: the SWPC summary
 * files refresh every minute, and each fetch is ~60 bytes, so a short TTL
 * keeps the card honest without costing anything measurable.
 */
const EXTRAS_TTL_MS = 10 * 60 * 1000;

/**
 * In-memory for the session only — deliberately NOT AsyncStorage, because a Kp
 * reading restored from yesterday is worse than no reading at all.
 */
let cacheEntry: { at: number; forecast: AuroraForecast } | null = null;
let inflight: Promise<AuroraForecast | null> | null = null;
/** Extras ride their own short TTL; a failure never evicts a good reading. */
let extrasEntry: { at: number; extras: AuroraExtras } | null = null;
let extrasInflight: Promise<AuroraExtras | null> | null = null;

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

function loadExtras(): Promise<AuroraExtras | null> {
  if (extrasEntry && Date.now() - extrasEntry.at < EXTRAS_TTL_MS) {
    return Promise.resolve(extrasEntry.extras);
  }
  if (extrasInflight) return extrasInflight;
  const request = fetchAuroraExtras()
    .then((extras) => {
      // Store even a fully-null result: it stops the card re-hammering dead
      // endpoints every remount, and it expires after the same short TTL.
      extrasEntry = { at: Date.now(), extras };
      return extras;
    })
    .catch(() => (extrasEntry ? extrasEntry.extras : null))
    .finally(() => {
      extrasInflight = null;
    });
  extrasInflight = request;
  return request;
}

/**
 * NOAA SWPC planetary-Kp outlook: cache-first with a 2-hour TTL, deduped across
 * concurrent callers. Below ±45° latitude the hook stays idle, mirroring how the
 * marine card never fires inland — those users pay for no request at all.
 * A total failure leaves the card absent via 'error'.
 * Solar-wind + Kp-history extras load alongside on their own 10-minute TTL and
 * never affect the forecast status: they arrive late (or never) via `extras`.
 */
export function useAurora(location: GeoLocation | null): AuroraState {
  const [state, setState] = useState<AuroraState>({ status: 'idle', forecast: null, extras: null });
  const latitude = location?.latitude ?? null;

  useEffect(() => {
    if (latitude === null || Math.abs(latitude) < AURORA_LATITUDE_MIN) {
      setState({ status: 'idle', forecast: null, extras: null });
      return;
    }
    // A fresh cache hit is served synchronously so a remount never flashes empty.
    if (cacheEntry && Date.now() - cacheEntry.at < TTL_MS) {
      const extrasHit = extrasEntry && Date.now() - extrasEntry.at < EXTRAS_TTL_MS ? extrasEntry.extras : null;
      setState({ status: 'ok', forecast: cacheEntry.forecast, extras: extrasHit });
      if (!extrasHit) {
        let cancelled = false;
        void loadExtras().then((extras) => {
          if (cancelled || !extras) return;
          setState({ status: 'ok', forecast: cacheEntry?.forecast ?? null, extras });
        });
        return () => {
          cancelled = true;
        };
      }
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', forecast: null, extras: null });
    void loadForecast().then((forecast) => {
      if (cancelled) return;
      setState(forecast ? { status: 'ok', forecast, extras: null } : { status: 'error', forecast: null, extras: null });
      if (forecast) {
        void loadExtras().then((extras) => {
          if (cancelled || !extras) return;
          setState((prev) => (prev.forecast ? { ...prev, extras } : prev));
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [latitude]);

  return state;
}
