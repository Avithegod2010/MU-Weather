import { useEffect, useState } from 'react';
import { fetchEnsembleSpread } from '../api/providers';
import { isEnsembleFresh, loadEnsembleCache, saveEnsembleCache } from '../utils/ensembleCache';
import type { EnsembleSpread, GeoLocation } from '../api/types';

export interface EnsembleState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  spread: EnsembleSpread | null;
}

/**
 * Ensemble spread for the given location. Cache-first: a fresh persisted row
 * renders instantly and is never refetched within its TTL; a stale row renders
 * while a background refetch replaces it. Failures leave the feature hidden
 * via `status: 'error'`.
 */
export function useEnsemble(location: GeoLocation | null): EnsembleState {
  const [state, setState] = useState<EnsembleState>({ status: 'idle', spread: null });
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    if (lat === null || lon === null) {
      setState({ status: 'idle', spread: null });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', spread: null });
    void (async () => {
      const cached = await loadEnsembleCache(lat, lon);
      if (cancelled) return;
      if (cached) {
        const spread: EnsembleSpread = {
          points: cached.points,
          members: cached.members,
          fetchedAt: cached.fetchedAt,
        };
        setState({ status: 'ok', spread });
        if (isEnsembleFresh(cached)) return;
      }
      const spread = await fetchEnsembleSpread(lat, lon);
      if (cancelled) return;
      if (spread) {
        void saveEnsembleCache(lat, lon, spread);
        setState({ status: 'ok', spread });
      } else if (!cached) {
        setState({ status: 'error', spread: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return state;
}
