import { useEffect, useState } from 'react';
import { buildAqiDayPeaks, fetchAqiHistory } from '../api/openMeteo';
import type { AqiDayPeak } from '../api/types';
import { loadAqiHistory, saveAqiHistory } from '../utils/aqiHistoryCache';
import type { GeoLocation } from '../api/types';

export interface AqiHistoryState {
  status: 'idle' | 'checking' | 'ok' | 'error';
  /** Per-day peak AQI for the past ~31 days, oldest first. */
  days: AqiDayPeak[] | null;
  /** True when the shown data came from an expired cache after a failed refetch. */
  stale: boolean;
}

/**
 * Cache-first 30-day AQI history (12 h TTL). Fresh data wins; on a failed
 * refetch an EXPIRED cache is still served with stale=true — history is
 * stable, so old observations beat an empty section. Any failure with no
 * cache lands on 'error' with null days, so the section hides cleanly.
 */
export function useAqiHistory(location: GeoLocation | null): AqiHistoryState {
  const [state, setState] = useState<AqiHistoryState>({ status: 'idle', days: null, stale: false });
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    if (lat === null || lon === null) {
      setState({ status: 'idle', days: null, stale: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'checking' }));
    (async () => {
      const cached = await loadAqiHistory(lat, lon).catch(() => null);
      if (cancelled) return;
      if (cached && !cached.stale) {
        setState({ status: 'ok', days: buildAqiDayPeaks(cached.hours), stale: false });
        return;
      }
      try {
        const hours = await fetchAqiHistory(lat, lon);
        if (cancelled) return;
        if (!hours.length) throw new Error('empty history');
        await saveAqiHistory(lat, lon, hours).catch(() => undefined);
        setState({ status: 'ok', days: buildAqiDayPeaks(hours), stale: false });
      } catch {
        if (cancelled) return;
        if (cached) {
          setState({ status: 'ok', days: buildAqiDayPeaks(cached.hours), stale: true });
        } else {
          setState({ status: 'error', days: null, stale: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return state;
}
