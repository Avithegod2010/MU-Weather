import { useEffect, useState } from 'react';
import { fetchMarine, type MarineInfo } from '../api/providers';
import type { GeoLocation } from '../api/types';

export interface MarineState {
  status: 'idle' | 'checking' | 'ok' | 'error';
  info: MarineInfo | null;
}

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
    fetchMarine(lat, lon)
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
