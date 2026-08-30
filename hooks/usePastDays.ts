import { useEffect, useState } from 'react';
import { fetchPastDays } from '../api/providers';
import type { GeoLocation, PastDayActual } from '../api/types';

export interface PastDaysState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  days: PastDayActual[];
}

/**
 * Archive-API actuals for the past week of the given location.
 * Fetch failures degrade to an empty list - the UI just hides the card.
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
    fetchPastDays(lat, lon)
      .then((days) => {
        if (!cancelled) setState({ status: days.length > 0 ? 'ok' : 'error', days });
      })
      .catch(() => {
        // Defensive: fetchPastDays already swallows its own errors.
        if (!cancelled) setState({ status: 'error', days: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return state;
}
