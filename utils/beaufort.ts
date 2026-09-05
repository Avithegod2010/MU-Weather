import { t } from './i18n';
import type { StringKey } from './i18n';
import { getUnits } from './format';

/** Catalog keys for Beaufort forces 0-12, index = force. */
const BFT_KEYS: readonly StringKey[] = [
  'bft_0',
  'bft_1',
  'bft_2',
  'bft_3',
  'bft_4',
  'bft_5',
  'bft_6',
  'bft_7',
  'bft_8',
  'bft_9',
  'bft_10',
  'bft_11',
  'bft_12',
];

/** Beaufort force 0-12 from a wind speed in km/h. */
export function beaufortForce(speedKmh: number): number {
  if (speedKmh < 1) return 0;
  if (speedKmh < 6) return 1;
  if (speedKmh < 12) return 2;
  if (speedKmh < 20) return 3;
  if (speedKmh < 29) return 4;
  if (speedKmh < 39) return 5;
  if (speedKmh < 50) return 6;
  if (speedKmh < 62) return 7;
  if (speedKmh < 75) return 8;
  if (speedKmh < 89) return 9;
  if (speedKmh < 103) return 10;
  if (speedKmh < 118) return 11;
  return 12;
}

/**
 * Beaufort text for the current setting.
 * Option OFF → '' (call sites skip the text entirely);
 * option ON → e.g. "Force 4 · Moderate breeze".
 */
export function beaufortText(speedKmh: number): string {
  if (!getUnits().beaufort) return '';
  const force = beaufortForce(speedKmh);
  const label = BFT_KEYS[force] ?? 'bft_0';
  return `${t('bft_force').replace('{n}', String(force))} · ${t(label)}`;
}
