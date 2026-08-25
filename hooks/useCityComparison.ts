import { useEffect, useState } from 'react';
import { fetchWeather } from '../api/openMeteo';
import type { GeoLocation, WeatherBundle } from '../api/types';

export const MAX_COMPARE_CITIES = 6;

export interface ComparisonEntry {
  city: GeoLocation;
  data: WeatherBundle | null;
}

export interface CityComparisonState {
  status: 'idle' | 'loading' | 'ready';
  results: ComparisonEntry[];
}

export function useCityComparison(cities: GeoLocation[], enabled: boolean): CityComparisonState {
  const [state, setState] = useState<CityComparisonState>({ status: 'idle', results: [] });

  useEffect(() => {
    if (!enabled || cities.length < 2) {
      setState({ status: 'idle', results: [] });
      return;
    }
    const targets = cities.slice(0, MAX_COMPARE_CITIES);
    let cancelled = false;
    setState({ status: 'loading', results: [] });

    void (async () => {
      const settled = await Promise.allSettled(targets.map((city) => fetchWeather(city)));
      if (cancelled) return;
      const results: ComparisonEntry[] = settled.map((outcome, index) => ({
        city: targets[index],
        data: outcome.status === 'fulfilled' ? outcome.value : null,
      }));
      setState({ status: 'ready', results });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, cities]);

  return state;
}
