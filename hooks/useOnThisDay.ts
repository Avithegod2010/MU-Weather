import { useEffect, useState } from 'react';
import { fetchOnThisDayYears } from '../api/providers';
import { loadOnThisDayCache, saveOnThisDayCache } from '../utils/onThisDayCache';
import type { GeoLocation, OnThisDayYear } from '../api/types';

export interface OnThisDayState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  years: OnThisDayYear[] | null;
}

/** Today's calendar day as `MM-DD`; Feb 29 falls back to Feb 28. */
function todayMonthDay(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return month === '02' && day === '29' ? '02-28' : `${month}-${day}`;
}

/**
 * Observed weather on today's calendar day in past years. Cache-first: a
 * persisted row renders instantly and is NEVER refetched (history is static,
 * same rationale as climate normals). Rows are keyed to the calendar day, so
 * a row fetched yesterday never shows today - the card wakes up fresh each
 * morning with one Archive fetch. Failures leave the card absent via
 * `status: 'error'`.
 */
export function useOnThisDay(location: GeoLocation | null): OnThisDayState {
  const [state, setState] = useState<OnThisDayState>({ status: 'idle', years: null });
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;
  const monthDay = todayMonthDay();

  useEffect(() => {
    if (lat === null || lon === null) {
      setState({ status: 'idle', years: null });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', years: null });
    void (async () => {
      const cached = await loadOnThisDayCache(lat, lon, monthDay);
      if (cancelled) return;
      if (cached) {
        setState({ status: 'ok', years: cached.years });
        return;
      }
      const years = await fetchOnThisDayYears(lat, lon);
      if (cancelled) return;
      if (years) {
        void saveOnThisDayCache(lat, lon, monthDay, years);
        setState({ status: 'ok', years });
      } else {
        setState({ status: 'error', years: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon, monthDay]);

  return state;
}