export const MAX_OUTDOOR_WINDOW_FEEDBACK = 120;

export type OutdoorWindowFeedbackVote = 'good-fit' | 'not-for-me';

/**
 * One local response to one recommended outdoor window. `scope` is the
 * rounded-coordinate city key; records never leave the device.
 */
export interface OutdoorWindowFeedbackRecord {
  scope: string;
  windowKey: string;
  vote: OutdoorWindowFeedbackVote;
  at: number;
}

export function outdoorWindowFeedbackKey(startAt: number, endAt: number): string | null {
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) return null;
  return `${Math.round(startAt)}|${Math.round(endAt)}`;
}

function isValidRecord(value: unknown): value is OutdoorWindowFeedbackRecord {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<OutdoorWindowFeedbackRecord>;
  return (
    typeof row.scope === 'string' && row.scope.length > 0 && row.scope.length <= 100 &&
    typeof row.windowKey === 'string' && row.windowKey.length > 0 && row.windowKey.length <= 80 &&
    (row.vote === 'good-fit' || row.vote === 'not-for-me') &&
    typeof row.at === 'number' && Number.isFinite(row.at)
  );
}

/** Validate, deduplicate by location/window, and cap local history. */
export function normalizeOutdoorWindowFeedback(value: unknown): OutdoorWindowFeedbackRecord[] {
  if (!Array.isArray(value)) return [];
  const byWindow = new Map<string, OutdoorWindowFeedbackRecord>();
  for (const raw of value) {
    if (!isValidRecord(raw)) continue;
    const key = `${raw.scope}\u0000${raw.windowKey}`;
    const previous = byWindow.get(key);
    if (!previous || raw.at >= previous.at) byWindow.set(key, raw);
  }
  return [...byWindow.values()]
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_OUTDOOR_WINDOW_FEEDBACK);
}

export function upsertOutdoorWindowFeedback(
  records: OutdoorWindowFeedbackRecord[],
  input: OutdoorWindowFeedbackRecord,
): OutdoorWindowFeedbackRecord[] {
  return normalizeOutdoorWindowFeedback([...records, input]);
}

export function findOutdoorWindowFeedback(
  records: OutdoorWindowFeedbackRecord[],
  scope: string | null | undefined,
  windowKey: string | null | undefined,
): OutdoorWindowFeedbackVote | null {
  if (!scope || !windowKey) return null;
  return records.find((row) => row.scope === scope && row.windowKey === windowKey)?.vote ?? null;
}
