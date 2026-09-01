import { useEffect, useState } from 'react';
import { fetchPastDays } from '../api/providers';
import { loadPastDaysCache, savePastDaysCache, localDateStamp, utcDaysAgoStamp } from '../utils/pastDaysCache';
import type { GeoLocation, PastDayActual } from '../api/types';

/** One ranged Archive request covers both the 7-day and 30-day views. */
const WINDOW_DAYS = 30;

export interface PastDaysState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  days: PastDayActual[];
}

/**
 * Archive-API actuals for the past 30 days of the given location. A persisted
 * snapshot renders instantly, refreshes at most once per local day (archive
 * actuals never change), and falls back to the stale snapshot when the
 * Archive API is unreachable - the UI just hides the card when there is
 * nothing at all.
 */
export function usePastDays(location: GeoLocation | null): PastDaysState {
  const [state, setState] = useState<PastDaysState>({ status: 'idle', days: [] });
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    if (lat === null || lon === null) {
      setState({ status: 'idle', days: [] });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', days: [] });
    void (async () => {
      const cached = await loadPastDaysCache(lat, lon);
      if (cancelled) return;
      if (cached && cached.days.length > 0) {
        setState({ status: 'ok', days: cached.days });
        // Same-day snapshot is trusted only when the archive era has caught up
        // with it (newest row T-1 or T-2): the era lags some mornings, and a
        // pinned window would hide yesterday for the rest of the day.
        if (cached.fetchedOn === localDateStamp() && cached.days[cached.days.length - 1].date >= utcDaysAgoStamp(2)) {
          return;
        }
      }
      try {
        const days = await fetchPastDays(lat, lon, WINDOW_DAYS);
        if (cancelled) return;
        if (days.length > 0) {
          void savePastDaysCache(lat, lon, days);
          setState({ status: 'ok', days });
        } else if (!cached || cached.days.length === 0) {
          setState({ status: 'error', days: [] });
        }
        // Otherwise the stale snapshot stays on screen - good enough for history.
      } catch {
        // Defensive: fetchPastDays already swallows its own errors.
        if (!cancelled && (!cached || cached.days.length === 0)) {
          setState({ status: 'error', days: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return state;
}
