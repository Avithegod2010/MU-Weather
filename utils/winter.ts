import type { HourPoint } from '../api/types';
import { getUnits } from './format';

const CM_PER_INCH = 2.54;
const FT_PER_M = 3.28084;

/** Relevance window: snow matters only inside the next 72 hours. */
const RELEVANCE_HOURS = 72;
/** Minimum snow depth on the ground (0.5 cm) that counts as "relevant". */
const MIN_DEPTH_CM = 0.5;

/**
 * Snow is relevant when the forecast shows falling snow within 72 hours
 * or snow already lying on the ground during that window.
 */
export function snowRelevant(hourly: HourPoint[]): boolean {
  for (const hour of hourly.slice(0, RELEVANCE_HOURS)) {
    if (hour.snowfallCm !== null && hour.snowfallCm > 0) return true;
    if (hour.snowDepthM !== null && hour.snowDepthM * 100 >= MIN_DEPTH_CM) return true;
  }
  return false;
}

/** Total new snowfall (cm) over the next 24 hours; null-valued hours count as 0. */
export function snowfallNext24(hourly: HourPoint[]): number {
  let total = 0;
  for (const hour of hourly.slice(0, 24)) {
    if (hour.snowfallCm !== null && hour.snowfallCm > 0) total += hour.snowfallCm;
  }
  return total;
}

/** Current snow depth in cm (API serves metres); null when no hourly depth is reported. */
export function snowDepthNow(hourly: HourPoint[]): number | null {
  for (const hour of hourly) {
    if (hour.snowDepthM !== null) return hour.snowDepthM * 100;
  }
  return null;
}

/**
 * Snow depth amount with unit, e.g. "12.0 cm" or "4.72 in": cm normally,
 * inches when the user chose inches for precipitation (inverse of the
 * mm-based formatPrecip helpers, which is why this lives in its own util).
 */
export function formatSnowDepth(cm: number): string {
  return formatSnowAmount(cm);
}

/** Fresh-snow amount with unit, e.g. "3.5 cm" or "0.12 in". */
export function formatSnowfall(cm: number): string {
  return formatSnowAmount(cm);
}

function formatSnowAmount(cm: number): string {
  if (getUnits().precip === 'inches') {
    return `${(cm / CM_PER_INCH).toFixed(2)} in`;
  }
  const rounded = cm >= 10 ? Math.round(cm) : Math.round(cm * 10) / 10;
  return `${rounded} cm`;
}

/**
 * Altitudes (freezing level, elevation): metres normally, feet when the user
 * chose mph for wind - mirroring the wind-unit convention in utils/format.ts.
 */
export function formatAltitude(m: number): { value: string; unit: string } {
  if (getUnits().wind === 'mph') {
    return { value: `${Math.round(m * FT_PER_M)}`, unit: 'ft' };
  }
  return { value: `${Math.round(m)}`, unit: 'm' };
}
