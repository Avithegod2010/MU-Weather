import type { AlertEvidence } from './alertEvidence';

export type AlertDeliveryStatus =
  | 'scheduled'
  | 'quiet-hours'
  | 'permission-denied'
  | 'scheduling-failed'
  | 'expired';

export interface AlertHistoryOutcomeIdentity {
  key: string;
  title: string;
  city?: string;
  at: number;
  evidence?: AlertEvidence;
  deliveryStatus?: AlertDeliveryStatus;
  escalated?: boolean;
  expiresAt?: number;
}

const HISTORY_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;

export function isAlertDeliveryStatus(value: unknown): value is AlertDeliveryStatus {
  return value === 'scheduled' || value === 'quiet-hours' ||
    value === 'permission-denied' || value === 'scheduling-failed' || value === 'expired';
}

/** Stable event grouping prevents refresh/permission retries from flooding the short history. */
export function alertHistoryEventSignature(entry: AlertHistoryOutcomeIdentity): string {
  const city = entry.city?.trim() ?? '';
  const evidence = entry.evidence;
  const identity = evidence?.observationTime
    ? `${evidence.source}|${evidence.observationTime}`
    : `${entry.title}|${Math.floor(entry.at / HISTORY_DEDUPE_WINDOW_MS)}`;
  return `${city}|${entry.key}|${identity}`;
}

/** Keep a transition when its outcome differs, but ignore repeat copies of the same result. */
export function sameAlertHistoryOutcome(
  a: AlertHistoryOutcomeIdentity,
  b: AlertHistoryOutcomeIdentity,
): boolean {
  return alertHistoryEventSignature(a) === alertHistoryEventSignature(b) &&
    (a.deliveryStatus ?? 'legacy') === (b.deliveryStatus ?? 'legacy') &&
    Boolean(a.escalated) === Boolean(b.escalated) &&
    (a.expiresAt ?? null) === (b.expiresAt ?? null);
}

/** Prepend distinct new outcomes while preserving newest-first bounded storage. */
export function mergeAlertHistoryOutcomes<T extends AlertHistoryOutcomeIdentity>(
  existing: T[],
  additions: T[],
  maximum: number,
): T[] {
  const distinct: T[] = [];
  for (const entry of additions) {
    if (distinct.some((candidate) => sameAlertHistoryOutcome(candidate, entry))) continue;
    if (existing.some((candidate) => sameAlertHistoryOutcome(candidate, entry))) continue;
    distinct.push(entry);
  }
  return [...distinct, ...existing].slice(0, Math.max(0, Math.floor(maximum)));
}
