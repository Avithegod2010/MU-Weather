import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDED_KEY = '@mu_weather/onboarded_v1';

export interface OnboardingState {
  /** null = still loading the flag; false = show the intro; true = seen it. */
  done: boolean | null;
  /** Persist the flag and close the intro. Never throws. */
  complete: () => void;
}

/**
 * First-launch onboarding flag. Purely local: one AsyncStorage boolean set
 * when the user finishes (or skips) the intro, so it never shows again.
 */
export function useOnboarding(): OnboardingState {
  const [done, setDone] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(ONBOARDED_KEY);
        if (!cancelled) setDone(raw === '1');
      } catch {
        if (!cancelled) setDone(true); // storage broken - never trap the user
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const complete = useCallback(() => {
    setDone(true);
    void AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => undefined);
  }, []);

  return { done, complete };
}
