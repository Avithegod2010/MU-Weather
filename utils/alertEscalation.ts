import type { AlertSeverity } from './alertRules';

/** Persisted stamp for one location/rule cooldown slot. */
export interface AlertFireStamp {
  at: number;
  /** Null means this came from a legacy numeric timestamp or an explicit snooze. */
  severity: AlertSeverity | null;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  severe: 2,
};

function isSeverity(value: unknown): value is AlertSeverity {
  return value === 'info' || value === 'warning' || value === 'severe';
}

/** Upgrade the old `{ key: epochMs }` map without discarding active cooldowns. */
export function normalizeFiredMap(value: unknown): Record<string, AlertFireStamp> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, AlertFireStamp> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key) continue;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      result[key] = { at: raw, severity: null };
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const stamp = raw as Partial<AlertFireStamp>;
    if (
      typeof stamp.at === 'number' &&
      Number.isFinite(stamp.at) &&
      (stamp.severity === null || isSeverity(stamp.severity))
    ) {
      result[key] = { at: stamp.at, severity: stamp.severity ?? null };
    }
  }
  return result;
}

/**
 * A same/lower-severity repeat respects the cooldown; a severity rise is sent
 * immediately as an escalation. Legacy timestamps have unknown severity and
 * therefore wait for their existing cooldown rather than spuriously escalating.
 */
export function shouldDeliverAlert(
  now: number,
  previous: AlertFireStamp | null | undefined,
  severity: AlertSeverity,
  cooldownMs: number,
): boolean {
  if (!Number.isFinite(now) || !Number.isFinite(cooldownMs) || cooldownMs < 0) return false;
  if (!previous || !Number.isFinite(previous.at)) return true;
  if (previous.severity && SEVERITY_RANK[severity] > SEVERITY_RANK[previous.severity]) return true;
  return now - previous.at >= cooldownMs;
}
