import { t } from './i18n';
import type { StringKey } from './i18n';

/** Structured, serializable evidence explaining one fired alert rule. */
export interface AlertEvidence {
  /** Existing localized catalog key for the measured metric. */
  metricLabel: StringKey;
  /** Human-formatted value in the app's selected units. */
  actual: string;
  /** Exact rule boundary or condition that caused this alert to trigger. */
  threshold: string;
  /** Provider/feed identity; kept explicit rather than inferred from the title. */
  source: string;
  /** Provider-local observation or forecast-valid time, when supplied. */
  observationTime?: string;
}

/** Minimal shape gate for history loaded from untrusted on-device JSON. */
export function isValidAlertEvidence(value: unknown): value is AlertEvidence {
  if (!value || typeof value !== 'object') return false;
  const evidence = value as Partial<AlertEvidence>;
  return (
    typeof evidence.metricLabel === 'string' &&
    typeof evidence.actual === 'string' &&
    typeof evidence.threshold === 'string' &&
    typeof evidence.source === 'string' &&
    (evidence.observationTime === undefined || typeof evidence.observationTime === 'string')
  );
}

/** Present the rule inputs separately from the notification's short advice. */
export function formatAlertEvidence(evidence: AlertEvidence): string {
  const time = evidence.observationTime?.replace('T', ' ') || '—';
  return t('alert_evidence_line')
    .replace('{metric}', t(evidence.metricLabel))
    .replace('{actual}', evidence.actual)
    .replace('{threshold}', evidence.threshold)
    .replace('{source}', evidence.source)
    .replace('{time}', time);
}
