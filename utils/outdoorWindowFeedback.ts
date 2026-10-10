import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  normalizeOutdoorWindowFeedback,
  type OutdoorWindowFeedbackRecord,
} from './outdoorWindowFeedbackPolicy';

export const OUTDOOR_WINDOW_FEEDBACK_KEY = '@mu_weather/outdoor_window_feedback_v1';

let writeChain: Promise<unknown> = Promise.resolve();
const listeners = new Set<(records: OutdoorWindowFeedbackRecord[]) => void>();

function notifyListeners(records: OutdoorWindowFeedbackRecord[]): void {
  for (const listener of listeners) listener(records);
}

export function subscribeOutdoorWindowFeedback(
  listener: (records: OutdoorWindowFeedbackRecord[]) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

export async function loadOutdoorWindowFeedback(): Promise<OutdoorWindowFeedbackRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTDOOR_WINDOW_FEEDBACK_KEY);
    return normalizeOutdoorWindowFeedback(raw ? JSON.parse(raw) : null);
  } catch {
    return [];
  }
}

export function saveOutdoorWindowFeedback(records: OutdoorWindowFeedbackRecord[]): Promise<void> {
  const serialized = JSON.stringify(normalizeOutdoorWindowFeedback(records));
  return withLock(async () => {
    try {
      await AsyncStorage.setItem(OUTDOOR_WINDOW_FEEDBACK_KEY, serialized);
    } catch {
      // Feedback is optional local personalization; never block the forecast.
    }
    notifyListeners(normalizeOutdoorWindowFeedback(JSON.parse(serialized)));
  });
}

/** Delete outdoor feedback for one location scope and return the removed count. */
export function clearOutdoorWindowFeedbackLocation(scope: string): Promise<number> {
  return withLock(async () => {
    const records = await loadOutdoorWindowFeedback();
    const retained = records.filter((record) => record.scope !== scope);
    try {
      await AsyncStorage.setItem(OUTDOOR_WINDOW_FEEDBACK_KEY, JSON.stringify(retained));
    } catch {
      // Keep the settings screen responsive; a subsequent refresh reports remaining rows.
    }
    notifyListeners(retained);
    return records.length - retained.length;
  });
}

export function clearAllOutdoorWindowFeedback(): Promise<number> {
  return withLock(async () => {
    const records = await loadOutdoorWindowFeedback();
    try {
      await AsyncStorage.setItem(OUTDOOR_WINDOW_FEEDBACK_KEY, '[]');
    } catch {
      // Keep the settings screen responsive; a subsequent refresh reports remaining rows.
    }
    notifyListeners([]);
    return records.length;
  });
}
