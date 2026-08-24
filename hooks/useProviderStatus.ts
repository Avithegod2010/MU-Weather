import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchMetNorway, type ProviderCheck } from '../api/providers';
import type { AccuracyEntry } from './useDigest';
import type { GeoLocation } from '../api/types';

const ACCURACY_KEY = '@mu_weather/accuracy_v1';
const MAX_HISTORY = 20;
const MIN_RECORD_INTERVAL = 30 * 60 * 1000;

export interface ProviderStatusResult {
  check: ProviderCheck;
  history: AccuracyEntry[];
}

export function useProviderStatus(
  location: GeoLocation | null,
  primaryTemp: number | null,
): ProviderStatusResult {
  const [check, setCheck] = useState<ProviderCheck>({ status: 'idle', temperature: null });
  const [history, setHistory] = useState<AccuracyEntry[]>([]);
  const lat = location?.latitude ?? null;
  const lon = location?.longitude ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ACCURACY_KEY);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setHistory(parsed as AccuracyEntry[]);
        }
      } catch {
        // Corrupt storage: start empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const recordAccuracy = useCallback(async (metTemp: number) => {
    if (primaryTemp === null) return;
    const delta = Math.abs(metTemp - primaryTemp);
    try {
      const raw = await AsyncStorage.getItem(ACCURACY_KEY);
      const entries: AccuracyEntry[] = raw ? JSON.parse(raw) : [];
      const last = entries[entries.length - 1];
      if (last && Date.now() - last.t < MIN_RECORD_INTERVAL) return;
      const next = [...entries, { t: Date.now(), d: Number(delta.toFixed(2)) }].slice(-MAX_HISTORY);
      await AsyncStorage.setItem(ACCURACY_KEY, JSON.stringify(next));
      setHistory(next);
    } catch {
      // Non-critical bookkeeping.
    }
  }, [primaryTemp]);

  useEffect(() => {
    if (check.status === 'ok' && check.temperature !== null && primaryTemp !== null) {
      void recordAccuracy(check.temperature);
    }
  }, [check.status, check.temperature, recordAccuracy, primaryTemp]);

  return { check, history };
}
