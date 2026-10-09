export const MAX_OUTDOOR_WINDOW_FEEDBACK = 120;
export const OUTDOOR_FEEDBACK_TREND_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
export const MIN_OUTDOOR_FEEDBACK_TREND_SAMPLES = 3;

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

export interface OutdoorWindowFeedbackTrend {
  sampleCount: number;
  goodFitCount: number;
  notForMeCount: number;
  sufficientlySampled: boolean;
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

/** Recent device-local trend for one rounded-coordinate location; never retunes preferences. */
export function summarizeOutdoorWindowFeedback(
  records: OutdoorWindowFeedbackRecord[],
  scope: string | null | undefined,
  now = Date.now(),
): OutdoorWindowFeedbackTrend {
  const rows = scope
    ? records.filter((row) =>
        row.scope === scope &&
        row.at >= now - OUTDOOR_FEEDBACK_TREND_WINDOW_MS &&
        row.at <= now + 5 * 60 * 1000,
      )
    : [];
  const goodFitCount = rows.filter((row) => row.vote === 'good-fit').length;
  const notForMeCount = rows.filter((row) => row.vote === 'not-for-me').length;
  return {
    sampleCount: rows.length,
    goodFitCount,
    notForMeCount,
    sufficientlySampled: rows.length >= MIN_OUTDOOR_FEEDBACK_TREND_SAMPLES,
  };
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
