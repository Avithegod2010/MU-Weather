import { useEffect, useState } from 'react';
import { fetchYearAgo, type HistoricalInfo } from '../api/providers';
import type { GeoLocation } from '../api/types';

export interface YearAgoState {
  status: 'idle' | 'checking' | 'ok' | 'error';
  info: HistoricalInfo | null;
}

export function useYearAgo(location: GeoLocation | null): YearAgoState {
  const [state, setState] = useState<YearAgoState>({ status: 'idle', info: null });
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    if (lat === null || lon === null) {
      setState({ status: 'idle', info: null });
      return;
    }
    let cancelled = false;
    setState({ status: 'checking', info: null });
    fetchYearAgo(lat, lon)
      .then((info) => {
        if (!cancelled) setState({ status: 'ok', info });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', info: null });
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return state;
}
