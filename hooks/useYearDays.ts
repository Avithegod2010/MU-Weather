import { useEffect, useState } from 'react';
import type { GeoLocation, PastDayActual } from '../api/types';
import {
  fetchYearDays,
  loadYearDaysCache,
  saveYearDaysCache,
  localDateStampYear,
  utcDaysAgoStampYear,
} from '../utils/yearDaysCache';

export interface YearDaysState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  days: PastDayActual[];
}

/**
 * Archive-API actuals for the past 365 days of the given location, feeding the
 * year heatmap. A persisted snapshot renders instantly and refreshes at most
 * once per local day; a refresh failure keeps the stale snapshot on screen
 * (history is history), and only a location with nothing at all lands on
 * 'error' so the section can hide.
 */
export function useYearDays(location: GeoLocation | null): YearDaysState {
  const [state, setState] = useState<YearDaysState>({ status: 'idle', days: [] });
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
      const cached = await loadYearDaysCache(lat, lon);
      if (cancelled) return;
      if (cached && cached.days.length > 0) {
        setState({ status: 'ok', days: cached.days });
        // Same-day snapshot is trusted once the archive era has caught up with
        // it (ERA5 lags up to ~5 days on some mornings).
        if (
          cached.fetchedOn === localDateStampYear() &&
          cached.days[cached.days.length - 1].date >= utcDaysAgoStampYear(5)
        ) {
          return;
        }
      }
      try {
        const days = await fetchYearDays(lat, lon);
        if (cancelled) return;
        if (days.length > 0) {
          void saveYearDaysCache(lat, lon, days);
          setState({ status: 'ok', days });
        } else if (!cached || cached.days.length === 0) {
          setState({ status: 'error', days: [] });
        }
      } catch {
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
