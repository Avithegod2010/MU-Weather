import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  normalizeStormFeedback,
  upsertStormFeedback,
  type StormFeedbackRecord,
  type StormFeedbackVote,
} from './stormFeedbackPolicy';

const STORAGE_KEY = '@mu_weather/storm_alert_feedback_v1';

let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

/** Local-only, bounded storm-feedback history; no coordinates or network sync. */
export async function loadStormAlertFeedback(): Promise<StormFeedbackRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return normalizeStormFeedback(raw ? JSON.parse(raw) : null);
  } catch {
    return [];
  }
}

export function saveStormAlertFeedback(
  scope: string,
  eventKey: string,
  vote: StormFeedbackVote,
  at = Date.now(),
): Promise<void> {
  if (!scope || !eventKey || !Number.isFinite(at) || at < 0) return Promise.resolve();
  return withLock(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const rows = normalizeStormFeedback(raw ? JSON.parse(raw) : null);
      const next = upsertStormFeedback(rows, { scope, eventKey, vote, at });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Non-critical, private feedback must never block the alert screen.
    }
  });
}
