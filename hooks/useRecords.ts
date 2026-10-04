import { useEffect, useState } from 'react';
import { fetchLocationRecords, type LocationRecords } from '../api/providers';
import { loadRecordsCache, saveRecordsCache } from '../utils/recordsCache';
import type { GeoLocation } from '../api/types';

export interface RecordsState {
  status: 'idle' | 'loading' | 'ok';
  records: LocationRecords | null;
}

/**
 * The record-breaking archive window for the active location: cache-first with
 * a one-day TTL, a single ranged request on a miss, and the previous snapshot
 * kept when a refresh fails (records change slowly - a stale extreme is far
 * better than a card that blinks away). Renders nothing on its own.
 */
export function useRecords(location: GeoLocation | null): RecordsState {
  const [state, setState] = useState<RecordsState>({ status: 'idle', records: null });
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    if (lat === null || lon === null) {
      setState({ status: 'idle', records: null });
      return;
    }
    let cancelled = false;
    void (async () => {
      const cached = await loadRecordsCache(lat, lon);
      if (cancelled) return;
      if (cached) {
        setState({ status: 'ok', records: cached });
        return;
      }
      setState((previous) => ({ status: 'loading', records: previous.records }));
      const fetched = await fetchLocationRecords(lat, lon);
      if (cancelled) return;
      if (!fetched) {
        // Nothing usable: keep whatever was on screen, or stay empty.
        setState((previous) => ({ status: previous.records ? 'ok' : 'idle', records: previous.records }));
        return;
      }
      void saveRecordsCache(lat, lon, fetched);
      setState({ status: 'ok', records: fetched });
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return state;
}