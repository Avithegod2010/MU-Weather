import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchWeather } from '../api/openMeteo';
import type { GeoLocation, WeatherBundle } from '../api/types';

export type WeatherStatus = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';

export function useWeather(location: GeoLocation | null) {
  const [data, setData] = useState<WeatherBundle | null>(null);
  const [status, setStatus] = useState<WeatherStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (target: GeoLocation | null, isRefresh: boolean) => {
      if (!target) {
        setStatus('idle');
        return;
      }
      const id = ++requestId.current;
      setStatus(isRefresh ? 'refreshing' : 'loading');
      setErrorMessage(null);
      try {
        const bundle = await fetchWeather(target);
        if (requestId.current !== id) return;
        setData(bundle);
        setStatus('success');
      } catch (error) {
        if (requestId.current !== id) return;
        if (error instanceof ApiError && error.kind === 'network') {
          setErrorMessage('No internet connection. Check your network and try again.');
        } else if (error instanceof ApiError && error.kind === 'server') {
          setErrorMessage('The weather service is having trouble right now.');
        } else {
          setErrorMessage('Could not load the weather. Please try again.');
        }
        setStatus('error');
      }
    },
    [],
  );

  useEffect(() => {
    setData(null);
    void load(location, false);
  }, [location, load]);

  const refresh = useCallback(() => {
    void load(location, true);
  }, [location, load]);

  const hasData = data !== null;

  return { data, status, errorMessage, refresh, hasStaleData: hasData };
}
