import type { DayPoint, WeatherBundle } from '../api/types';

/**
 * Pure scoring + comparison rules for the two-city side-by-side view.
 *
 * Kept free of React and of AsyncStorage so the rules can be probed directly
 * (boundary cases: zero days, every day wet, exact ties) and so the same
 * functions serve both the panel and the verdict line.
 */

/** Matches the trip planner's threshold so "wet day" means one thing app-wide. */
export const WET_DAY_PROB_THRESHOLD = 50;

/** Days compared in the row-by-row table. */
export const COMPARE_DAYS = 7;

/** Difference below which two values count as equal, so neither side is "better". */
const TIE_EPSILON = {
  tempC: 0.5,
  percent: 2,
  precipMm: 0.2,
  windKmh: 1.5,
  uv: 0.5,
} as const;

/** What counts as "better" for one table row. */
export type BetterRule =
  | 'warmest'
  | 'coolest'
  /** Lowest precipitation TOTAL in mm - epsilon is millimetres. */
  | 'driest'
  /** Lowest rain CHANCE in percent - epsilon is percentage points. */
  | 'least_rainy'
  | 'calmest'
  | 'sunniest';

export interface TwoCityDayRow {
  date: string;
  a: DayPoint | null;
  b: DayPoint | null;
  /** Index of the better side for this row: 0 = A, 1 = B, -1 = tie/unknown. */
  better: number;
}

/** Index of the better of two values, or -1 when they tie or one is missing. */
export function betterIndex(
  a: number | null | undefined,
  b: number | null | undefined,
  rule: BetterRule,
): number {
  if (a === null || a === undefined || b === null || b === undefined) return -1;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return -1;
  const delta =
    rule === 'warmest' || rule === 'sunniest' ? a - b : b - a; // lower is better for the rest
  // The epsilon must match the rule's UNIT: comparing 10% with 11% rain chance
  // is noise, while comparing 1.0 mm with 1.1 mm of rain is also noise - but a
  // millimetre epsilon would wrongly decide a percent comparison.
  const epsilon =
    rule === 'warmest' || rule === 'coolest'
      ? TIE_EPSILON.tempC
      : rule === 'sunniest'
        ? TIE_EPSILON.uv
        : rule === 'driest'
          ? TIE_EPSILON.precipMm
          : TIE_EPSILON.percent;
  if (Math.abs(delta) < epsilon) return -1;
  return delta > 0 ? 0 : 1;
}

/** Wind uses its own epsilon; kept separate so the rules read plainly. */
export function betterWindIndex(a: number | null, b: number | null): number {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return -1;
  const delta = b - a; // calmer (lower) wins
  if (Math.abs(delta) < TIE_EPSILON.windKmh) return -1;
  return delta > 0 ? 0 : 1;
}

/** The `daily` slice both sides compare, capped at {@link COMPARE_DAYS}. */
export function alignedDays(
  bundleA: WeatherBundle | null,
  bundleB: WeatherBundle | null,
): TwoCityDayRow[] {
  const daysA = bundleA?.daily ?? [];
  const daysB = bundleB?.daily ?? [];
  const count = Math.min(COMPARE_DAYS, Math.max(daysA.length, daysB.length));
  const rows: TwoCityDayRow[] = [];
  for (let index = 0; index < count; index += 1) {
    const a = daysA[index] ?? null;
    const b = daysB[index] ?? null;
    rows.push({
      // Prefer A's date so the row has a label even when only B has data.
      date: (a ?? b)?.date ?? '',
      a,
      b,
      better: -1,
    });
  }
  return rows;
}

/** The verdict comparison is about which city is pleasantier over the window. */
export interface WeekVerdict {
  /** 0 = A wins, 1 = B wins, -1 = too close to call. */
  winner: number;
  wetA: number;
  wetB: number;
  totalDays: number;
  /** True when neither city had any comparable days. */
  empty: boolean;
}

/**
 * Week verdict built on the trip planner's wet-day idea: a day counts as wet at
 * >= 50% rain probability. The city with fewer wet days wins; an exact tie in
 * wet days is broken by total precipitation, and a tie there is a genuine tie.
 */
export function weekVerdict(
  bundleA: WeatherBundle | null,
  bundleB: WeatherBundle | null,
): WeekVerdict {
  const daysA = bundleA?.daily.length ?? 0;
  const daysB = bundleB?.daily.length ?? 0;
  // Compare only the days BOTH cities actually forecast. Using the longer
  // window would let a city with more rows look drier simply by having more
  // days in which to be dry.
  const sharedDays = Math.min(COMPARE_DAYS, daysA, daysB);
  if (!bundleA || !bundleB || sharedDays === 0) {
    return { winner: -1, wetA: 0, wetB: 0, totalDays: sharedDays, empty: true };
  }
  const window = (bundle: WeatherBundle) => bundle.daily.slice(0, sharedDays);
  const wetA = window(bundleA).filter((d) => d.precipProbabilityMax >= WET_DAY_PROB_THRESHOLD).length;
  const wetB = window(bundleB).filter((d) => d.precipProbabilityMax >= WET_DAY_PROB_THRESHOLD).length;
  if (wetA !== wetB) {
    return { winner: wetA < wetB ? 0 : 1, wetA, wetB, totalDays: sharedDays, empty: false };
  }
  // Same number of wet days: the drier city wins.
  const sum = (bundle: WeatherBundle) =>
    window(bundle).reduce((total, d) => total + d.precipSum, 0);
  const totalA = sum(bundleA);
  const totalB = sum(bundleB);
  if (Math.abs(totalA - totalB) < TIE_EPSILON.precipMm) {
    return { winner: -1, wetA, wetB, totalDays: sharedDays, empty: false };
  }
  return { winner: totalA < totalB ? 0 : 1, wetA, wetB, totalDays: sharedDays, empty: false };
}