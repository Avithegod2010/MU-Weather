import { useEffect, useState } from 'react';
import { fetchMarineSnapshot, type MarineSnapshot } from '../api/marine';
import type { GeoLocation } from '../api/types';

export interface MarineState {
  status: 'idle' | 'checking' | 'ok' | 'error';
  info: MarineSnapshot | null;
}

/**
 * Coastal-only snapshot: current seas + swell + next-24 h peak, cache-first
 * (6 h TTL per location). Inland and any failure land on 'error' with null
 * info, so the card hides exactly as before — never an error row.
 */
export function useMarine(location: GeoLocation | null): MarineState {
  const [state, setState] = useState<MarineState>({ status: 'idle', info: null });
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    if (lat === null || lon === null) {
      setState({ status: 'idle', info: null });
      return;
    }
    let cancelled = false;
    setState({ status: 'checking', info: null });
    fetchMarineSnapshot(lat, lon)
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
