import { useEffect, useState } from 'react';
import { fetchEnsembleSpread } from '../api/providers';
import { isEnsembleFresh, loadEnsembleCache, saveEnsembleCache } from '../utils/ensembleCache';
import type { EnsembleSpread, GeoLocation } from '../api/types';

export interface EnsembleState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  spread: EnsembleSpread | null;
}

interface KeyedEnsembleState {
  locationKey: string | null;
  value: EnsembleState;
}

function keyFor(latitude: number | null, longitude: number | null): string | null {
  if (latitude === null || longitude === null) return null;
  // The cache and weather logs use the same ~1 km location granularity.
  return `${Math.round(latitude * 100) / 100}|${Math.round(longitude * 100) / 100}`;
}

/**
 * Ensemble spread for the given location. Cache-first: a fresh persisted row
 * renders instantly and is never refetched within its TTL; a stale row renders
 * while a background refetch replaces it. Failures leave the feature hidden
 * via `status: 'error'`.
 *
 * The returned state is keyed to the active rounded location. During the render
 * immediately after a city change it hides the previous city's spread instead
 * of letting a downstream logger associate that spread with the new location.
 */
export function useEnsemble(location: GeoLocation | null): EnsembleState {
  const [result, setResult] = useState<KeyedEnsembleState>({
    locationKey: null,
    value: { status: 'idle', spread: null },
  });
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;
  const locationKey = keyFor(lat, lon);

  useEffect(() => {
    if (lat === null || lon === null) {
      setResult({ locationKey: null, value: { status: 'idle', spread: null } });
      return;
    }
    let cancelled = false;
    setResult({ locationKey, value: { status: 'loading', spread: null } });
    void (async () => {
      const cached = await loadEnsembleCache(lat, lon);
      if (cancelled) return;
      if (cached) {
        const spread: EnsembleSpread = {
          points: cached.points,
          ...(cached.rainEpisodes ? { rainEpisodes: cached.rainEpisodes } : {}),
          members: cached.members,
          fetchedAt: cached.fetchedAt,
        };
        setResult({ locationKey, value: { status: 'ok', spread } });
        if (isEnsembleFresh(cached)) return;
      }
      const spread = await fetchEnsembleSpread(lat, lon);
      if (cancelled) return;
      if (spread) {
        void saveEnsembleCache(lat, lon, spread);
        setResult({ locationKey, value: { status: 'ok', spread } });
      } else if (!cached) {
        setResult({ locationKey, value: { status: 'error', spread: null } });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon, locationKey]);

  if (result.locationKey !== locationKey) {
    return { status: locationKey ? 'loading' : 'idle', spread: null };
  }
  return result.value;
}
