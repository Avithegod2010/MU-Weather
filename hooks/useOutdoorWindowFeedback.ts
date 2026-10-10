import { useCallback, useEffect, useRef, useState } from 'react';
import {
  findOutdoorWindowFeedback,
  normalizeOutdoorWindowFeedback,
  summarizeOutdoorWindowFeedback,
  upsertOutdoorWindowFeedback,
} from '../utils/outdoorWindowFeedbackPolicy';
import {
  loadOutdoorWindowFeedback,
  saveOutdoorWindowFeedback,
  subscribeOutdoorWindowFeedback,
} from '../utils/outdoorWindowFeedback';
import type {
  OutdoorWindowFeedbackRecord,
  OutdoorWindowFeedbackTrend,
  OutdoorWindowFeedbackVote,
} from '../utils/outdoorWindowFeedbackPolicy';

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
    let changedAfterLoadStarted = false;
    const unsubscribe = subscribeOutdoorWindowFeedback((updated) => {
      changedAfterLoadStarted = true;
      recordsRef.current = updated;
      setRecords(updated);
      setReady(true);
    });
    void loadOutdoorWindowFeedback().then((stored) => {
      if (cancelled) return;
      // Preserve a response tapped before AsyncStorage finished hydrating. A
      // later manager clear/save wins over a read that began before that write.
      if (!changedAfterLoadStarted) {
        const merged = normalizeOutdoorWindowFeedback([...stored, ...recordsRef.current]);
        recordsRef.current = merged;
        setRecords(merged);
        void saveOutdoorWindowFeedback(merged);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
      unsubscribe();
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
    void saveOutdoorWindowFeedback(next);
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
