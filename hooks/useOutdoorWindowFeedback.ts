import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  findOutdoorWindowFeedback,
  normalizeOutdoorWindowFeedback,
  summarizeOutdoorWindowFeedback,
  upsertOutdoorWindowFeedback,
} from '../utils/outdoorWindowFeedbackPolicy';
import type {
  OutdoorWindowFeedbackRecord,
  OutdoorWindowFeedbackTrend,
  OutdoorWindowFeedbackVote,
} from '../utils/outdoorWindowFeedbackPolicy';

const STORAGE_KEY = '@mu_weather/outdoor_window_feedback_v1';

async function loadRecords(): Promise<OutdoorWindowFeedbackRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? normalizeOutdoorWindowFeedback(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

let storageWrite: Promise<void> = Promise.resolve();

function saveRecords(records: OutdoorWindowFeedbackRecord[]): Promise<void> {
  const serialized = JSON.stringify(records);
  storageWrite = storageWrite.then(async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // Feedback is best-effort local personalization; never block the forecast.
    }
  });
  return storageWrite;
}

/** Device-local feedback for the currently shown, location-scoped window. */
export function useOutdoorWindowFeedback(
  scope: string | null,
  windowKey: string | null,
):
  {
    vote: OutdoorWindowFeedbackVote | null;
    ready: boolean;
    trend: OutdoorWindowFeedbackTrend;
    submit: (vote: OutdoorWindowFeedbackVote) => void;
  } {

  const [records, setRecords] = useState<OutdoorWindowFeedbackRecord[]>([]);
  const recordsRef = useRef<OutdoorWindowFeedbackRecord[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadRecords().then((stored) => {
      if (cancelled) return;
      // Preserve a response tapped before AsyncStorage finished hydrating.
      const merged = normalizeOutdoorWindowFeedback([...stored, ...recordsRef.current]);
      recordsRef.current = merged;
      setRecords(merged);
      setReady(true);
      void saveRecords(merged);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback((vote: OutdoorWindowFeedbackVote) => {
    if (!scope || !windowKey) return;
    const next = upsertOutdoorWindowFeedback(recordsRef.current, {
      scope,
      windowKey,
      vote,
      at: Date.now(),
    });
    recordsRef.current = next;
    setRecords(next);
    void saveRecords(next);
  }, [scope, windowKey]);

  return {
    vote: ready ? findOutdoorWindowFeedback(records, scope, windowKey) : null,
    ready,
    trend: ready
      ? summarizeOutdoorWindowFeedback(records, scope)
      : { sampleCount: 0, goodFitCount: 0, notForMeCount: 0, sufficientlySampled: false },
    submit,
  };
}
