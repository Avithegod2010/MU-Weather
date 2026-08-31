import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchWeather } from '../api/openMeteo';
import type { GeoLocation, WeatherBundle } from '../api/types';
import { loadLastWeather, saveLastWeather } from '../utils/storage';
import { logForecast } from '../utils/forecastLog';
import { refreshWeatherWidgets } from '../widget/weatherWidgetTask';

export type WeatherStatus = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';

/** The cache holds the last fetched city only; never show it for another one. */
function isSameLocation(a: GeoLocation, b: GeoLocation): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

export function useWeather(location: GeoLocation | null) {
  const [data, setData] = useState<WeatherBundle | null>(null);
  const [status, setStatus] = useState<WeatherStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestId = useRef(0);
  /** True once a live fetch has landed for the current location round. */
  const freshRef = useRef(false);

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
        freshRef.current = true;
        setData(bundle);
        setStatus('success');
        // Non-critical: persist for the next cold start, record the daily
        // predictions for forecast-vs-actual, and redraw the home-screen widget.
        void saveLastWeather(bundle);
        void logForecast(bundle);
        void refreshWeatherWidgets();
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
    let cancelled = false;
    // Hydrate from the cached bundle for this location before the fetch
    // resolves, so the UI renders instantly with the last known conditions.
    // Cache failure or a slow response must never break the live flow.
    void (async () => {
      const cached = await loadLastWeather();
      if (cancelled || freshRef.current) return;
      if (cached && location && isSameLocation(cached.location, location)) {
        setData(cached);
      }
    })();
    freshRef.current = false;
    setData(null);
    void load(location, false);
    return () => {
      cancelled = true;
    };
  }, [location, load]);

  const refresh = useCallback(() => {
    void load(location, true);
  }, [location, load]);

  const hasData = data !== null;

  return { data, status, errorMessage, refresh, hasStaleData: hasData };
}
