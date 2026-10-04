import { t } from './i18n';
import { formatTemp } from './format';
import { MAX_COMFORT_OFFSET_C, DEFAULT_COLD_BOUNDARY_C, DEFAULT_HOT_BOUNDARY_C } from './comfortJournal';
import type { ComfortOffset } from './comfortJournal';
import type { CurrentConditions, DayPoint } from '../api/types';

export interface WearLine {
  text: string;
}

/** Fragments are comma-joined after the base line, separated by a middot. */
const EXTRA_SEPARATOR = ' · ';
const RAIN_PROBABILITY_THRESHOLD = 40;
const UV_SUNSCREEN_THRESHOLD = 6;
const GUSTY_KMH = 40;
const WINDY_KMH = 25;

/**
 * "What to wear" one-liner: jacket / shirt / shorts picked from the apparent
 * temperature, then umbrella / sunscreen / wind warnings folded in from rain
 * probability, UV and gusts. Rendered outside the Highlights slice so it still
 * shows when Highlights is hidden.
 *
 * The temperature goes through formatTemp so a Fahrenheit user reads their own
 * unit — the thresholds stay in Celsius internally, matching the API.
 *
 * `calibration` is the personal comfort offset from the weather journal
 * (utils/comfortJournal.ts). Omitting it — or passing null, which is what the
 * journal returns until there is enough signal — keeps the default boundaries
 * and the line byte-identical to the uncalibrated output. When active, both
 * boundaries shift by the offset so someone who runs cold reaches "jacket"
 * earlier, and the shift is made visible with a short localized hint appended
 * through the same middot idiom as the other extras.
 */
export function computeWearLine(
  current: CurrentConditions,
  today: DayPoint | null,
  calibration?: ComfortOffset | null,
): WearLine {
  const feels = current.apparentTemperature;
  const extras: string[] = [];
  // Rain already falling is treated as a high probability, not as dry.
  const rainProbability = Math.max(
    current.precipitation > 0 ? 60 : 0,
    today?.precipProbabilityMax ?? 0,
  );
  if (rainProbability >= RAIN_PROBABILITY_THRESHOLD) extras.push(t('wear_umbrella'));
  if ((today?.uvIndexMax ?? 0) >= UV_SUNSCREEN_THRESHOLD) extras.push(t('wear_sunscreen'));
  if (current.windGusts >= GUSTY_KMH || current.windSpeed >= WINDY_KMH) extras.push(t('wear_windy'));

  // The offset shifts BOTH boundaries by the same amount, so the span between
  // the jacket and the shorts threshold stays the default 14 degrees. Clamped
  // here too (comfortOffset already clamps), so a corrupted offset can never
  // push the boundaries apart or invert them.
  const clampedOffset =
    calibration && Number.isFinite(calibration.offsetC)
      ? Math.max(-MAX_COMFORT_OFFSET_C, Math.min(MAX_COMFORT_OFFSET_C, calibration.offsetC))
      : 0;
  const coldBoundary = DEFAULT_COLD_BOUNDARY_C + clampedOffset;
  const hotBoundary = DEFAULT_HOT_BOUNDARY_C + clampedOffset;

  const base =
    feels < coldBoundary ? t('wear_jacket') : feels > hotBoundary ? t('wear_shorts') : t('wear_shirt');
  if (clampedOffset !== 0) {
    extras.push(t('wear_tuned'));
  }
  const suffix = extras.length ? EXTRA_SEPARATOR + extras.join(', ') : '';
  // The displayed feels-like stays the REAL apparent temperature: the offset
  // shifts the boundaries, it never falsifies the temperature itself.
  return { text: base.replace('{n}', formatTemp(feels)) + suffix };
}
