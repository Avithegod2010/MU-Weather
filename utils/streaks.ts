import type { PastDayActual } from '../api/types';

export type StreakKind = 'dry' | 'wet';

export interface DayStreak {
  kind: StreakKind;
  /** Consecutive days ending with the newest day in the input. */
  days: number;
}

/**
 * Dry/wet streak ending today, from archive actuals (oldest first).
 * Dry: < 0.2 mm (trace amounts don't break a drought story).
 * Wet: >= 1.0 mm (a measurable rainy day).
 * Returns null when the newest day breaks both, or there is no data.
 */
export function currentStreak(days: PastDayActual[]): DayStreak | null {
  if (!days.length) return null;
  const ordered = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const newest = ordered[ordered.length - 1];
  const kind: StreakKind | null =
    newest.precipSum < 0.2 ? 'dry' : newest.precipSum >= 1.0 ? 'wet' : null;
  if (kind === null) return null;
  let count = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const day = ordered[i];
    const matches = kind === 'dry' ? day.precipSum < 0.2 : day.precipSum >= 1.0;
    if (!matches) break;
    count += 1;
  }
  return { kind, days: count };
}

/**
 * Longest run of `kind` anywhere in the window (input oldest first). Used for
 * the "Longest dry/wet run here" record line alongside the live streak.
 */
export function longestStreak(days: PastDayActual[], kind: StreakKind): number {
  const ordered = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  let best = 0;
  let run = 0;
  for (const day of ordered) {
    const matches = kind === 'dry' ? day.precipSum < 0.2 : day.precipSum >= 1.0;
    run = matches ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}
