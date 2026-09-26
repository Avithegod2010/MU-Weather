import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AlertSeverity } from './alertRules';

/**
 * One alert that actually fired (past its cooldown) on this device. The alert
 * rules themselves are stateless - this is the only place the app remembers
 * what it told the user, so the Alerts screen can show a short history instead
 * of letting each notification vanish.
 */
export interface AlertHistoryEntry {
  /** Stored as a plain string so rows survive an AlertKey rename. */
  key: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  /** City the alert belongs to; omitted for the location the user is in. */
  city?: string;
  /** Delivery time, epoch milliseconds. */
  at: number;
}

const HISTORY_KEY = '@mu_weather/alert_history_v1';
/** Newest 20 alerts - enough to spot a pattern, small enough to stay free. */
export const MAX_ALERT_HISTORY = 20;

/**
 * The history blob is read-modify-written by several paths (the in-app alert
 * evaluation, the saved-city sweep, the background task). AsyncStorage has no
 * transactions, so two overlapping callers would lose whichever write lands
 * second; this module-level chain runs every writer alone, one at a time.
 */
let writeChain: Promise<unknown> = Promise.resolve();

function withHistoryLock<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => undefined);
  return run;
}

function isSeverity(value: unknown): value is AlertSeverity {
  return value === 'info' || value === 'warning' || value === 'severe';
}

function isValidEntry(value: unknown): value is AlertHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<AlertHistoryEntry>;
  return (
    typeof entry.key === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.message === 'string' &&
    isSeverity(entry.severity) &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at) &&
    (entry.city === undefined || typeof entry.city === 'string')
  );
}

/** Recorded alerts, NEWEST FIRST. Empty when absent or corrupt. */
export async function loadAlertHistory(): Promise<AlertHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

/**
 * Prepend freshly delivered alerts and keep the newest MAX_ALERT_HISTORY.
 * Serialized against every other writer of the blob (see withHistoryLock).
 * Fire-and-forget: history must never break alert delivery.
 */
export function appendAlertHistory(entries: AlertHistoryEntry[]): Promise<void> {
  if (entries.length === 0) return Promise.resolve();
  return withHistoryLock(async () => {
    try {
      const next = [...entries, ...(await loadAlertHistory())].slice(0, MAX_ALERT_HISTORY);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // Non-critical bookkeeping.
    }
  });
}

export function clearAlertHistory(): Promise<void> {
  return withHistoryLock(async () => {
    try {
      await AsyncStorage.removeItem(HISTORY_KEY);
    } catch {
      // Non-critical.
    }
  });
}
