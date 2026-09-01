import { useEffect, useState } from 'react';
import { fetchClimateNormals } from '../api/providers';
import { loadClimateCache, saveClimateCache } from '../utils/climateCache';
import type { GeoLocation, MonthlyNormal } from '../api/types';

export interface ClimateNormalsState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  months: MonthlyNormal[] | null;
}

/**
 * 1991-2020 climate normals for the given location. Cache-first: a persisted
 * row renders instantly and is NEVER refetched (normals are static). Only an
 * uncached location hits the Archive API once; failures leave the card
 * absent via `status: 'error'`.
 */
export function useClimateNormals(location: GeoLocation | null): ClimateNormalsState {
  const [state, setState] = useState<ClimateNormalsState>({ status: 'idle', months: null });
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    if (lat === null || lon === null) {
      setState({ status: 'idle', months: null });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', months: null });
    void (async () => {
      const cached = await loadClimateCache(lat, lon);
      if (cancelled) return;
      if (cached) {
        setState({ status: 'ok', months: cached.months });
        return;
      }
      const months = await fetchClimateNormals(lat, lon);
      if (cancelled) return;
      if (months) {
        void saveClimateCache(lat, lon, months);
        setState({ status: 'ok', months });
      } else {
        setState({ status: 'error', months: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return state;
}
