import { useEffect } from 'react';
import { fetchModelForecast } from '../api/providers';
import {
  isModelLogStale,
  logModelPredictions,
  markModelLogFetched,
} from '../utils/modelAccuracyLog';
import type { GeoLocation } from '../api/types';

/**
 * Keeps the per-model prediction log warm for the accuracy leaderboard: at most
 * one multi-model request every six hours (TTL-gated in utils/modelAccuracyLog),
 * logged per (location, date, model) so the accuracy view can rank the models
 * for the city the user is in.
 *
 * Renders nothing and is entirely best-effort - a failed request simply leaves
 * the log as it was, so this hook never affects the home screen.
 */
export function useModelAccuracyLog(location: GeoLocation | null, enabled: boolean): void {
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    if (!enabled || lat === null || lon === null) return;
    let cancelled = false;
    void (async () => {
      if (!(await isModelLogStale())) return;
      const results = await fetchModelForecast(lat, lon);
      if (cancelled || !results || results.length === 0) return;
      await logModelPredictions(results, { latitude: lat, longitude: lon });
      await markModelLogFetched();
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, lat, lon]);
}
