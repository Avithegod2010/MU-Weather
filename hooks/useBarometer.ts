import { useEffect, useRef, useState } from 'react';
import { Barometer } from 'expo-sensors';

export interface BarometerState {
  available: boolean;
  pressure: number | null;
  trendPer10Min: number | null;
}

const WINDOW_MS = 10 * 60 * 1000;

/**
 * Live device barometer readings with a rolling 10-minute trend.
 * Self-contained: deleting this file + the flag line removes the feature.
 */
export function useBarometer(enabled: boolean): BarometerState {
  const [state, setState] = useState<BarometerState>({
    available: false,
    pressure: null,
    trendPer10Min: null,
  });
  const readingsRef = useRef<Array<{ t: number; p: number }>>([]);

  useEffect(() => {
    if (!enabled) return;
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const available = await Barometer.isAvailableAsync();
        if (!available || cancelled) {
          setState((previous) => ({ ...previous, available: false }));
          return;
        }
        Barometer.setUpdateInterval(2000);
        subscription = Barometer.addListener(({ pressure }) => {
          if (pressure === undefined || pressure === null) return;
          const now = Date.now();
          const readings = readingsRef.current;
          readings.push({ t: now, p: pressure });
          while (readings.length > 1 && now - readings[0].t > WINDOW_MS) {
            readings.shift();
          }
          const oldest = readings[0];
          const spanMinutes = (now - oldest.t) / 60000;
          const trend = spanMinutes >= 1 ? ((pressure - oldest.p) / spanMinutes) * 10 : null;
          setState({
            available: true,
            pressure,
            trendPer10Min: trend,
          });
        });
      } catch {
        if (!cancelled) {
          setState((previous) => ({ ...previous, available: false }));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (subscription) subscription.remove();
      readingsRef.current = [];
    };
  }, [enabled]);

  return state;
}
