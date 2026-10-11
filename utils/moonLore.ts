import { t } from './i18n';

/**
 * A playful folklore line for the moon deep-dive, bucketed by lunar age.
 * Explicitly lore, not advice: planting-by-the-moon, tides and old sayings.
 * The card frames these with the `moon_lore_title` disclaimer key.
 */
export function moonLoreLine(ageDays: number): string {
  if (ageDays < 1.85 || ageDays >= 27.68) return t('moon_lore_new');
  if (ageDays < 7.38) return t('moon_lore_crescent');
  if (ageDays < 9.23) return t('moon_lore_quarter');
  if (ageDays < 14.77) return t('moon_lore_gibbous');
  if (ageDays < 16.61) return t('moon_lore_full');
  if (ageDays < 22.15) return t('moon_lore_waning');
  if (ageDays < 24.0) return t('moon_lore_last_quarter');
  return t('moon_lore_old');
}
