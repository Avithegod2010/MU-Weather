import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchWeather } from '../api/openMeteo';
import type { GeoLocation, WeatherBundle } from '../api/types';
import { loadLastWeather, saveLastWeather } from '../utils/storage';
import { logForecast } from '../utils/forecastLog';
import { refreshWeatherWidgets } from '../widget/weatherWidgetTask';
import { traceAsync, traceSync } from '../utils/performanceTracing';
import { transitionWeatherOffline } from '../utils/weatherOfflinePolicy';

export type WeatherStatus = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';

/** The cache holds the last fetched city only; never show it for another one. */
function isSameLocation(a: GeoLocation, b: GeoLocation): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

export function useWeather(location: GeoLocation | null) {
  const [data, setData] = useState<WeatherBundle | null>(null);
  const [status, setStatus] = useState<WeatherStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** True once a network-kind failure hit, cleared by the next successful fetch. */
  const [offline, setOffline] = useState(false);
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
        traceSync('app.weather-accept-response', () => {
          freshRef.current = true;
          setData(bundle);
          setStatus('success');
          setOffline((previous) => transitionWeatherOffline(previous, 'success'));
        });
        // Non-critical: persist for the next cold start, record the daily
        // predictions for forecast-vs-actual, and redraw the home-screen widget.
        // Keep the work off the fetch path while exposing its duration to a
        // development Android trace when profiling is enabled.
        void traceAsync('app.weather-post-fetch-side-effects', async () => {
          await Promise.allSettled([
            traceAsync('app.weather-cache-write', () => saveLastWeather(bundle)),
            traceAsync('app.forecast-log-write', () => logForecast(bundle)),
            traceAsync('app.widget-refresh', () => refreshWeatherWidgets()),
          ]);
        }).catch(() => undefined);
      } catch (error) {
        if (requestId.current !== id) return;
        if (error instanceof ApiError && error.kind === 'network') {
          setErrorMessage('No internet connection. Check your network and try again.');
          setOffline((previous) => transitionWeatherOffline(previous, 'network-failure'));
        } else if (error instanceof ApiError && error.kind === 'server') {
          setErrorMessage('The weather service is having trouble right now.');
          setOffline((previous) => transitionWeatherOffline(previous, 'other-failure'));
        } else {
          setErrorMessage('Could not load the weather. Please try again.');
          setOffline((previous) => transitionWeatherOffline(previous, 'other-failure'));
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
      const cached = await traceAsync('app.weather-cache-read', () => loadLastWeather());
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

  return { data, status, errorMessage, refresh, offline, hasStaleData: hasData };
}
