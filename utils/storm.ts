import type { HourPoint } from '../api/types';

/** Convective available potential energy bands in J/kg. */
export type CapeBand = 'low' | 'moderate' | 'high';

export function capeBand(cape: number): CapeBand {
  if (cape >= 2500) return 'high';
  if (cape >= 1000) return 'moderate';
  return 'low';
}

/**
 * Highest CAPE hour within the next `hours` hours (nulls ignored).
 * Returns null when no hour in the window carries a CAPE value.
 */
export function peakCape(
  hourly: HourPoint[],
  hours = 12,
): { cape: number; time: string } | null {
  let best: { cape: number; time: string } | null = null;
  for (const hour of hourly.slice(0, hours)) {
    if (hour.cape === null || hour.cape === undefined) continue;
    if (!best || hour.cape > best.cape) {
      best = { cape: hour.cape, time: hour.time };
    }
  }
  return best;
}
