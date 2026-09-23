import { t } from './i18n';
import { formatTemp } from './format';
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
 */
export function computeWearLine(current: CurrentConditions, today: DayPoint | null): WearLine {
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

  const base =
    feels < 12 ? t('wear_jacket') : feels > 26 ? t('wear_shorts') : t('wear_shirt');
  const suffix = extras.length ? EXTRA_SEPARATOR + extras.join(', ') : '';
  return { text: base.replace('{n}', formatTemp(feels)) + suffix };
}
