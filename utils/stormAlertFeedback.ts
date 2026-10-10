import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  normalizeStormFeedback,
  upsertStormFeedback,
  type StormFeedbackRecord,
  type StormFeedbackVote,
} from './stormFeedbackPolicy';

export const STORM_ALERT_FEEDBACK_KEY = '@mu_weather/storm_alert_feedback_v1';

let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

/** Local-only, bounded storm-feedback history; no coordinates or network sync. */
export async function loadStormAlertFeedback(): Promise<StormFeedbackRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORM_ALERT_FEEDBACK_KEY);
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
      const raw = await AsyncStorage.getItem(STORM_ALERT_FEEDBACK_KEY);
      const rows = normalizeStormFeedback(raw ? JSON.parse(raw) : null);
      const next = upsertStormFeedback(rows, { scope, eventKey, vote, at });
      await AsyncStorage.setItem(STORM_ALERT_FEEDBACK_KEY, JSON.stringify(next));
    } catch {
      // Non-critical, private feedback must never block the alert screen.
    }
  });
}

/** Delete storm-warning feedback for one rounded-coordinate or legacy scope. */
export function clearStormAlertFeedbackLocation(scope: string): Promise<number> {
  return withLock(async () => {
    const rows = await loadStormAlertFeedback();
    const retained = rows.filter((row) => row.scope !== scope);
    try {
      await AsyncStorage.setItem(STORM_ALERT_FEEDBACK_KEY, JSON.stringify(retained));
    } catch {
      // The caller refreshes the local-data count after this best-effort write.
    }
    return rows.length - retained.length;
  });
}

export function clearAllStormAlertFeedback(): Promise<number> {
  return withLock(async () => {
    const rows = await loadStormAlertFeedback();
    try {
      await AsyncStorage.setItem(STORM_ALERT_FEEDBACK_KEY, '[]');
    } catch {
      // The caller refreshes the local-data count after this best-effort write.
    }
    return rows.length;
  });
}
