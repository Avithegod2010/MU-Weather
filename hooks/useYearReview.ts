import { useEffect, useState } from 'react';
import { loadYearRows } from '../utils/yearLog';
import type { GeoLocation } from '../api/types';

export interface YearReviewState {
  status: 'idle' | 'ok';
  /** Rows recorded for the current year, oldest first. */
  rows: Awaited<ReturnType<typeof loadYearRows>>;
}

/**
 * Reads the on-device year log for the active city. Storage only - no request
 * is made here; rows arrive through utils/recordYearActuals (fed by the
 * past-days fetch), so this hook is free and instant.
 */
export function useYearReview(location: GeoLocation | null): YearReviewState {
  const [state, setState] = useState<YearReviewState>({ status: 'idle', rows: [] });
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    if (lat === null || lon === null) {
      setState({ status: 'idle', rows: [] });
      return;
    }
    let cancelled = false;
    void (async () => {
      const rows = await loadYearRows(lat, lon);
      if (!cancelled) setState({ status: 'ok', rows });
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return state;
}