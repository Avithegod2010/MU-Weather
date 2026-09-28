import { useEffect, useState } from 'react';
import { fetchHistoricalDay } from '../api/providers';
import { loadHistoricalDay, saveHistoricalDay } from '../utils/historicalCache';
import type { PastDayActual } from '../api/types';

export interface HistoricalDayState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  day: PastDayActual | null;
}

const IDLE: HistoricalDayState = { status: 'idle', day: null };

/**
 * Observed weather for one explored past date at one location. Cache-first and
 * cache-only on a hit: an observed day never changes, so a stored date is never
 * refetched (same rationale as the on-this-day and climate caches). A miss
 * costs exactly ONE ranged Archive call and is then persisted, so stepping back
 * and forth over previously explored dates works offline.
 *
 * `attempt` is bumped by the screen's retry button to force a re-fetch of a date
 * that failed (e.g. one the archive had not published yet).
 */
export function useHistoricalDay(
  lat: number | null,
  lon: number | null,
  date: string | null,
  attempt: number,
): HistoricalDayState {
  const [state, setState] = useState<HistoricalDayState>(IDLE);

  useEffect(() => {
    if (lat === null || lon === null || date === null) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', day: null });
    void (async () => {
      const cached = await loadHistoricalDay(lat, lon, date);
      if (cancelled) return;
      if (cached) {
        setState({ status: 'ok', day: cached });
        return;
      }
      const day = await fetchHistoricalDay(lat, lon, date);
      if (cancelled) return;
      if (day && day.date === date) {
        void saveHistoricalDay(lat, lon, day);
        setState({ status: 'ok', day });
      } else {
        // Network failure, or a date the archive cannot answer yet. Either way
        // the screen shows the retry row instead of guessing.
        setState({ status: 'error', day: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon, date, attempt]);

  return state;
}