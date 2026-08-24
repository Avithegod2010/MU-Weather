import { useEffect, useState } from 'react';
import { fetchMetNorway, type ProviderCheck } from '../api/providers';
import type { GeoLocation } from '../api/types';

export function useProviderStatus(location: GeoLocation | null): ProviderCheck {
  const [check, setCheck] = useState<ProviderCheck>({ status: 'idle', temperature: null });
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    if (lat === null || lon === null) {
      setCheck({ status: 'idle', temperature: null });
      return;
    }
    let cancelled = false;
    setCheck({ status: 'checking', temperature: null });
    fetchMetNorway(lat, lon)
      .then((temperature) => {
        if (!cancelled) setCheck({ status: 'ok', temperature });
      })
      .catch(() => {
        if (!cancelled) setCheck({ status: 'error', temperature: null });
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return check;
}
