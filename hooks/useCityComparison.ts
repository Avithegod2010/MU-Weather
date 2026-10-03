import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, fetchWeather } from '../api/openMeteo';
import { loadCompareCache, saveCompareCache } from '../utils/compareCache';
import type { GeoLocation, WeatherBundle } from '../api/types';

export const MAX_COMPARE_CITIES = 6;

/** Why one city's column could not be filled. */
export type CompareFailure = 'network' | 'unknown';

export interface ComparisonEntry {
  city: GeoLocation;
  data: WeatherBundle | null;
  /** True when this row was served from the per-location cache. */
  fromCache: boolean;
  /** Present only when `data` is null, so the column can offer a retry. */
  failure: CompareFailure | null;
}

export interface CityComparisonState {
  status: 'idle' | 'loading' | 'ready';
  results: ComparisonEntry[];
  /** Re-run the fetch, bypassing the cache. Used by the retry affordance. */
  reload: () => void;
}

/**
 * Fetch a city, preferring a fresh per-location snapshot. A cache hit avoids a
 * request entirely, which is what stops re-opening the screen (or re-rendering)
 * from hammering the API.
 *
 * `ignoreCache` is set by the retry affordance: the user is explicitly asking
 * for fresh data after a failure, so a stale cached row must not be served.
 */
async function loadCity(city: GeoLocation, ignoreCache: boolean): Promise<ComparisonEntry> {
  if (!ignoreCache) {
    const cached = await loadCompareCache(city.latitude, city.longitude);
    if (cached) return { city, data: cached, fromCache: true, failure: null };
  }
  try {
    const bundle = await fetchWeather(city);
    void saveCompareCache(city.latitude, city.longitude, bundle);
    return { city, data: bundle, fromCache: false, failure: null };
  } catch (error) {
    // Match the app's existing wording split (see TripPlannerCard.describeError):
    // only a network fault is worth naming, everything else is generic.
    const kind = error instanceof ApiError && error.kind === 'network' ? 'network' : 'unknown';
    return { city, data: null, fromCache: false, failure: kind };
  }
}

export function useCityComparison(cities: GeoLocation[], enabled: boolean): CityComparisonState {
  const [state, setState] = useState<Omit<CityComparisonState, 'reload'>>({
    status: 'idle',
    results: [],
  });
  // Bumping this forces a fresh fetch even when the selected pair is unchanged.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // Stable identity for the selected set: re-picking the same pair does not
  // refetch, while an actual change (different city, or one removed) does.
  const cityKey = useMemo(
    () => cities.slice(0, MAX_COMPARE_CITIES).map((city) => city.id).join('|'),
    [cities],
  );

  useEffect(() => {
    if (!enabled || cities.length < 2) {
      setState({ status: 'idle', results: [] });
      return;
    }
    const targets = cities.slice(0, MAX_COMPARE_CITIES);
    const ignoreCache = reloadToken > 0;
    let cancelled = false;
    setState({ status: 'loading', results: [] });

    void (async () => {
      // One city's failure must not blank the other column, so settle per city
      // rather than letting a single rejection take the pair down.
      const settled = await Promise.all(targets.map((city) => loadCity(city, ignoreCache)));
      if (cancelled) return;
      setState({ status: 'ready', results: settled });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, cityKey, reloadToken]);

  return { ...state, reload };
}
