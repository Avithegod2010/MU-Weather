export type StormFeedbackVote = 'useful' | 'not-useful';

export interface StormFeedbackRecord {
  scope: string;
  eventKey: string;
  vote: StormFeedbackVote;
  at: number;
}

export const MAX_STORM_FEEDBACK_RECORDS = 100;

function hash(value: string): string {
  // Stable non-cryptographic key; feedback is local and does not need an IDFA.
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

/** Stable event key from the impact wording, independent of refresh timestamps. */
export function stormFeedbackEventKey(input: {
  hazard: string;
  title: string;
  expected: string[];
}): string {
  return hash([input.hazard, input.title, ...input.expected].join('|'));
}

function isVote(value: unknown): value is StormFeedbackVote {
  return value === 'useful' || value === 'not-useful';
}

export function normalizeStormFeedback(value: unknown): StormFeedbackRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is StormFeedbackRecord => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Partial<StormFeedbackRecord>;
      return (
        typeof row.scope === 'string' && row.scope.length > 0 &&
        typeof row.eventKey === 'string' && row.eventKey.length > 0 &&
        isVote(row.vote) &&
        typeof row.at === 'number' && Number.isFinite(row.at) && row.at >= 0
      );
    })
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_STORM_FEEDBACK_RECORDS);
}

/** Upsert the user's one vote for an event; keep a small local-only history. */
export function upsertStormFeedback(
  rows: StormFeedbackRecord[],
  next: StormFeedbackRecord,
): StormFeedbackRecord[] {
  const kept = normalizeStormFeedback(rows).filter(
    (row) => row.scope !== next.scope || row.eventKey !== next.eventKey,
  );
  return normalizeStormFeedback([...kept, next]);
}
