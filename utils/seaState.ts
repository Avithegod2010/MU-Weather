import { t } from './i18n';

export type SeaBand = 'calm' | 'moderate' | 'rough';

/**
 * Combined-sea band from significant wave height, in metres.
 *
 * Thresholds follow the Douglas sea-state scale loosely: 0–2 is glassy
 * (≤0.5 m here, "calm"), 3–4 is wavelets to moderate (≤1.5 m, "moderate"),
 * 5+ is rough and small-craft caution (>1.5 m, "rough"). Rounded to two
 * memorable cutoffs because the card is guidance, not navigation — they also
 * preserve the old card's exact verdict boundaries (0.5 / 1.5 m), so coastal
 * users see the same words they saw before, now localized.
 */
export function seaBandForHeight(heightM: number): SeaBand {
  if (heightM < 0.5) return 'calm';
  if (heightM < 1.5) return 'moderate';
  return 'rough';
}

export function seaBandLabel(band: SeaBand): string {
  if (band === 'calm') return t('marine_calm');
  if (band === 'moderate') return t('marine_moderate');
  return t('marine_rough');
}

/** Band chip tint: green calm → amber moderate → red rough. */
export function seaBandColor(band: SeaBand): string {
  if (band === 'calm') return '#5BC98C';
  if (band === 'moderate') return '#E8D05A';
  return '#E85F5F';
}

/**
 * Short-period seas (< ~6 s) are steep wind-chop even when low — worth a hint
 * on the period row. Swell-dominated seas run 8–14 s; anything at/above 6 s
 * reads as organised groundswell, so only shorter periods earn the label.
 */
export function isChoppyPeriod(periodS: number | null): boolean {
  return periodS !== null && periodS < 6;
}
