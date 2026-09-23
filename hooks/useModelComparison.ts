import { useEffect, useState } from 'react';
import { fetchModelForecast, type ModelForecast } from '../api/providers';
import type { GeoLocation } from '../api/types';

export interface ModelComparisonState {
  status: 'idle' | 'loading' | 'ready';
  results: ModelForecast[];
}

/**
 * Tomorrow-through-7-day forecasts from every comparison model for the active
 * location. Only fetched while the screen is open (one request); regional
 * models absent for the location are simply missing from `results`.
 */
export function useModelComparison(location: GeoLocation | null, enabled: boolean): ModelComparisonState {
  const [state, setState] = useState<ModelComparisonState>({ status: 'idle', results: [] });
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    if (!enabled || lat === null || lon === null) {
      setState({ status: 'idle', results: [] });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', results: [] });
    void (async () => {
      const results = await fetchModelForecast(lat, lon);
      if (cancelled) return;
      setState({ status: 'ready', results: results ?? [] });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, lat, lon]);

  return state;
}
