import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The personal comfort journal, and the comfort model built on top of it.
 *
 * Entirely on-device: the ratings are the user's own opinion of how a day
 * felt, they never leave the phone, and nothing here makes a network request.
 *
 * Storage follows the repo's log idiom (utils/forecastLog.ts): one key, one
 * entry per calendar date, upsert so a changed rating replaces the old one,
 * a cap so the file cannot grow forever, and full validation on load so a
 * corrupt file is treated as absent rather than thrown.
 */

export const COMFORT_JOURNAL_KEY = '@mu_weather/comfort_journal_v1';

/** Roughly six months of days; older entries are the least relevant. */
export const MAX_JOURNAL_ENTRIES = 180;

/** The three answers the prompt offers. */
export type ComfortRating = 'cold' | 'ok' | 'hot';

const RATINGS: ComfortRating[] = ['cold', 'ok', 'hot'];

export interface ComfortJournalEntry {
  /** Local calendar date `YYYY-MM-DD`. One entry per date. */
  date: string;
  rating: ComfortRating;
  /** Daily high of that day, raw °C (matches the API). */
  tMax: number;
  /** Daily low of that day, raw °C. */
  tMin: number;
  /** Apparent temperature at the moment of rating, raw °C, when available. */
  tApparent: number | null;
  /** Relative humidity % at the moment of rating, when available. */
  humidity: number | null;
  /** Wind speed km/h at the moment of rating, when available. */
  wind: number | null;
  /** Epoch ms of the rating - the upsert tiebreaker for the same date. */
  at: number;
}

function isValidEntry(value: unknown): value is ComfortJournalEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ComfortJournalEntry>;
  return (
    typeof entry.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    entry.rating !== undefined &&
    RATINGS.includes(entry.rating) &&
    typeof entry.tMax === 'number' &&
    Number.isFinite(entry.tMax) &&
    typeof entry.tMin === 'number' &&
    Number.isFinite(entry.tMin) &&
    // Optional live readings are null, never garbage.
    (entry.tApparent === null || entry.tApparent === undefined || typeof entry.tApparent === 'number') &&
    (entry.humidity === null || entry.humidity === undefined || typeof entry.humidity === 'number') &&
    (entry.wind === null || entry.wind === undefined || typeof entry.wind === 'number') &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

/** Stored ratings, oldest first. Empty on absence, corruption or bad rows. */
export async function loadComfortJournal(): Promise<ComfortJournalEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(COMFORT_JOURNAL_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  } catch {
    return [];
  }
}
/** The entry recorded for one date, or null. */
export async function loadComfortEntry(date: string): Promise<ComfortJournalEntry | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const entries = await loadComfortJournal();
  return entries.find((entry) => entry.date === date) ?? null;
}

/**
 * Upsert one rating per calendar date: a changed rating replaces the day's old
 * one, so the journal always holds at most one entry per date. Capped at the
 * newest {@link MAX_JOURNAL_ENTRIES} dates. Fire-and-forget: never throws, so
 * a storage failure cannot break the hero or the wear line.
 */
export async function saveComfortEntry(entry: ComfortJournalEntry): Promise<void> {
  try {
    const existing = await loadComfortJournal();
    const kept = existing.filter((row) => row.date !== entry.date);
    const next = [...kept, entry]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(-MAX_JOURNAL_ENTRIES);
    await AsyncStorage.setItem(COMFORT_JOURNAL_KEY, JSON.stringify(next));
  } catch {
    // Non-critical: the wear line simply stays uncalibrated.
  }
}

/** Local calendar date `YYYY-MM-DD` (matches the journal's date strings). */
export function localDateStamp(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
/* ------------------------------------------------------------------ */
/* The comfort model                                                   */
/* ------------------------------------------------------------------ */

/**
 * The default "what to wear" boundaries in raw °C, copied from
 * utils/whatToWear.ts (below 12 = jacket, above 26 = shorts). The model shifts
 * BOTH by the same offset so the 14-degree span between them is preserved.
 */
export const DEFAULT_COLD_BOUNDARY_C = 12;
export const DEFAULT_HOT_BOUNDARY_C = 26;

/** The offset is clamped to this - a calibration must stay subtle. */
export const MAX_COMFORT_OFFSET_C = 4;

/**
 * Below this many rating days there is no signal at all: one or two opinions
 * would decide the whole calibration.
 */
export const MIN_TOTAL_SAMPLES = 5;

/** The relevant side needs at least this many ratings before it is trusted. */
export const MIN_SIDE_SAMPLES = 2;

export interface ComfortOffset {
  /** Signed °C shift for both wear boundaries, clamped to ±MAX_COMFORT_OFFSET_C. */
  offsetC: number;
  /** Total rating days the offset was derived from. */
  samples: number;
  /** Ratings on the cold side, and on the hot side. */
  coldSamples: number;
  hotSamples: number;
}

/**
 * Turn the journal into a comfort offset.
 *
 * FORMULA. Each rating carries the apparent temperature at which the user felt
 * that way, so the ratings directly locate their personal boundaries:
 *   - cold side: mean apparent temperature of the 'cold'-rated days. If the
 *     user felt cold at 15°, their jacket boundary is at least 15, so the
 *     offset is 15 - 12 = +3 (jacket earlier).
 *   - hot side: mean apparent temperature of the 'hot'-rated days. Feeling hot
 *     at 22° puts the shorts boundary at 22, so the offset is 22 - 26 = -4.
 *   - Both sides with signal: the mean of the two side offsets, so a user who
 *     runs cold on one end and tolerates heat on the other lands in between.
 *   - Only one side with signal: that side's offset alone. The other boundary
 *     still shifts by the same amount, which keeps the span constant and avoids
 *     inventing signal that was never rated.
 * The result is clamped to ±4 °C.
 *
 * RETURNS NULL until there are at least MIN_TOTAL_SAMPLES rating days AND at
 * least MIN_SIDE_SAMPLES on the relevant side - with null, what-to-wear behaves
 * exactly as today. Entries without an apparent temperature are skipped, since
 * they cannot locate a boundary.
 */
export function comfortOffset(entries: ComfortJournalEntry[]): ComfortOffset | null {
  // Defensive on two levels: callers only pass validated rows, but this is an
  // exported pure function, so a null or non-object row must degrade to "no
  // signal" rather than throwing.
  const usable = (Array.isArray(entries) ? entries : []).filter(
    (entry): entry is ComfortJournalEntry =>
      !!entry &&
      typeof entry === 'object' &&
      entry.tApparent !== null &&
      entry.tApparent !== undefined &&
      typeof entry.tApparent === 'number' &&
      Number.isFinite(entry.tApparent),
  );
  const samples = usable.length;
  if (samples < MIN_TOTAL_SAMPLES) return null;

  const coldTemps = usable.filter((e) => e.rating === 'cold').map((e) => e.tApparent as number);
  const hotTemps = usable.filter((e) => e.rating === 'hot').map((e) => e.tApparent as number);

  const coldOffset =
    coldTemps.length >= MIN_SIDE_SAMPLES
      ? coldTemps.reduce((sum, value) => sum + value, 0) / coldTemps.length - DEFAULT_COLD_BOUNDARY_C
      : null;
  const hotOffset =
    hotTemps.length >= MIN_SIDE_SAMPLES
      ? hotTemps.reduce((sum, value) => sum + value, 0) / hotTemps.length - DEFAULT_HOT_BOUNDARY_C
      : null;

  if (coldOffset === null && hotOffset === null) return null;
  const raw =
    coldOffset !== null && hotOffset !== null
      ? (coldOffset + hotOffset) / 2
      : coldOffset !== null
        ? coldOffset
        : (hotOffset as number);
  if (!Number.isFinite(raw)) return null;
  const clamped = Math.max(-MAX_COMFORT_OFFSET_C, Math.min(MAX_COMFORT_OFFSET_C, raw));
  return {
    offsetC: Math.round(clamped * 10) / 10,
    samples,
    coldSamples: coldTemps.length,
    hotSamples: hotTemps.length,
  };
}

