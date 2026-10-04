import type { RecordDay } from '../api/providers';

/** One record: the extreme day and the value it reached. */
export interface RecordStat {
  day: RecordDay;
  value: number;
}

export interface RecordSummary {
  /** Days actually searched. */
  days: number;
  hottest: RecordStat | null;
  wettest: RecordStat | null;
  /** Null when the archive rows carry no wind values at all. */
  windiest: RecordStat | null;
}

/**
 * Scan the window for the three record breakers. Pure, so it is directly
 * testable, and null-safe: rows without a wind value simply do not compete for
 * the windiest-day title, and a window with nothing usable returns nulls rather
 * than fake zeroes.
 *
 * Ties keep the EARLIEST date (strict `>` while scanning ascending rows), which
 * matches how weather records are usually quoted.
 */
export function computeRecords(rows: RecordDay[]): RecordSummary {
  let hottest: RecordStat | null = null;
  let wettest: RecordStat | null = null;
  let windiest: RecordStat | null = null;
  for (const day of rows) {
    if (!Number.isFinite(day.tMax)) continue;
    if (!hottest || day.tMax > hottest.value) hottest = { day, value: day.tMax };
    if (Number.isFinite(day.precipSum) && (!wettest || day.precipSum > wettest.value)) {
      wettest = { day, value: day.precipSum };
    }
    if (day.windMax !== null && Number.isFinite(day.windMax) && (!windiest || day.windMax > windiest.value)) {
      windiest = { day, value: day.windMax };
    }
  }
  return { days: rows.length, hottest, wettest, windiest };
}