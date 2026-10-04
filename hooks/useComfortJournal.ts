import { useCallback, useEffect, useState } from 'react';
import { loadComfortJournal, saveComfortEntry, localDateStamp } from '../utils/comfortJournal';
import type { ComfortJournalEntry, ComfortRating, ComfortOffset } from '../utils/comfortJournal';
import { comfortOffset } from '../utils/comfortJournal';

export interface UseComfortJournal {
  /** The rating already recorded for TODAY, or null when not yet answered. */
  today: ComfortJournalEntry | null;
  /** The derived comfort offset, or null until there is enough signal. */
  calibration: ComfortOffset | null;
  /** Total rating days stored - the journal's own progress. */
  total: number;
  ready: boolean;
  /** Record (or change) today's rating. Never throws. */
  rate: (rating: ComfortRating, reading: { tApparent: number | null; humidity: number | null; wind: number | null; tMax: number; tMin: number }) => void;
}

/**
 * Weather journal state for the home screen: today's answer plus the comfort
 * model derived from every stored rating.
 *
 * Only prompts for TODAY in v1 - there is deliberately no back-filling UI, so
 * the journal grows one day at a time from whenever the user starts rating.
 */
export function useComfortJournal(): UseComfortJournal {
  const [entries, setEntries] = useState<ComfortJournalEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadComfortJournal();
      if (cancelled) return;
      setEntries(stored);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const todayDate = localDateStamp();
  const today = entries.find((entry) => entry.date === todayDate) ?? null;
  // Recomputed from the stored list, so a new rating re-derives the model.
  const calibration = comfortOffset(entries);

  const rate = useCallback(
    (
      rating: ComfortRating,
      reading: { tApparent: number | null; humidity: number | null; wind: number | null; tMax: number; tMin: number },
    ) => {
      const entry: ComfortJournalEntry = {
        date: localDateStamp(),
        rating,
        tMax: reading.tMax,
        tMin: reading.tMin,
        tApparent: reading.tApparent,
        humidity: reading.humidity,
        wind: reading.wind,
        at: Date.now(),
      };
      // Optimistic update so the UI reflects the answer instantly; the write is
      // fire-and-forget and must never break the hero if it fails.
      setEntries((previous) => [...previous.filter((row) => row.date !== entry.date), entry]);
      void saveComfortEntry(entry).then(async () => {
        // Re-read so the cap and the sort order stay authoritative.
        const stored = await loadComfortJournal();
        setEntries(stored);
      });
    },
    [],
  );

  return { today, calibration, total: entries.length, ready, rate };
}