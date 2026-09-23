export interface KpPoint {
  /** ISO UTC start of the 3-hour Kp window. */
  time: string;
  /** Planetary Kp for the window (0-9, thirds like 2.33/2.67). */
  kp: number;
  /** NOAA G-scale tag as printed by the feed (e.g. 'G1'), or null. */
  noaaScale: string | null;
  /** True once the feeder marks the row predicted rather than observed. */
  predicted: boolean;
}

export interface AuroraForecast {
  points: KpPoint[];
  /** Highest Kp among *predicted* (not yet observed) rows. */
  kpMaxPredicted: number | null;
  /** Highest Kp in the whole payload, for the card headline. */
  kpMax: number | null;
}

/**
 * NOAA SWPC 3-day planetary-Kp forecast, keyless JSON. Verified live shape
 * 2026-09-23: a bare JSON array of objects
 * { time_tag: 'YYYY-MM-DDTHH:mm:ss', kp: number, observed: 'observed' |
 * 'estimated' | 'predicted', noaa_scale: 'G1' | null }. Rows are 3-hour
 * windows; the tail of the array flips to 'predicted'. Rows with a non-null
 * noaa_scale carry values like 'G1'. ~7 KB payload, 12 s timeout, never throws.
 */
const KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';

/** NOAA G-scale from Kp (public scale: G1 starts at Kp 5). */
export function gScaleForKp(kp: number): string | null {
  if (kp >= 9) return 'G5';
  if (kp >= 8) return 'G4';
  if (kp >= 7) return 'G3';
  if (kp >= 6) return 'G2';
  if (kp >= 5) return 'G1';
  return null;
}

function isValidRow(value: unknown): value is KpPoint {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<Record<'time' | 'observed' | 'noaaScale', unknown>> & {
    kp?: unknown;
  } & { time_tag?: unknown };
  const time = (row as Record<string, unknown>).time_tag;
  const kp = row.kp;
  if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(time)) return false;
  if (typeof kp !== 'number' || !Number.isFinite(kp) || kp < 0 || kp > 9) return false;
  return true;
}

export async function fetchAuroraForecast(): Promise<AuroraForecast | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(KP_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`SWPC responded ${response.status}`);
    const json: unknown = await response.json();
    if (!Array.isArray(json)) throw new Error('SWPC payload is not an array');
    const points: KpPoint[] = [];
    for (const entry of json) {
      if (!isValidRow(entry)) continue;
      const raw = entry as unknown as { time_tag: string; kp: number; observed?: unknown; noaa_scale?: unknown };
      const scale = typeof raw.noaa_scale === 'string' && raw.noaa_scale ? raw.noaa_scale : null;
      points.push({
        time: raw.time_tag,
        kp: raw.kp,
        noaaScale: scale,
        predicted: raw.observed === 'predicted',
      });
    }
    if (!points.length) throw new Error('SWPC payload has no usable rows');
    points.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    const predicted = points.filter((point) => point.predicted);
    const kpMax = Math.max(...points.map((point) => point.kp));
    return {
      points,
      kpMax,
      kpMaxPredicted: predicted.length ? Math.max(...predicted.map((point) => point.kp)) : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Highest predicted Kp only — the one number the aurora alert rule needs.
 * Returns null on any failure so the caller treats it as "no data".
 */
export async function fetchAuroraMaxKp(): Promise<number | null> {
  const forecast = await fetchAuroraForecast();
  return forecast?.kpMaxPredicted ?? null;
}

/** Card auto-hide line, mirroring how the marine card auto-hides inland. */
export const AURORA_LATITUDE_MIN = 45;

/**
 * Rough naked-eye chance from 3-day max Kp + latitude. Kp 5 needs ~60-65°,
 * each extra Kp point buys roughly 5° south; above ~Kp 8-9 the oval reaches
 * mid-latitudes. Purely indicative — clouds, moon and light pollution win.
 */
export type AuroraChance = 'high' | 'maybe' | 'low';

export function auroraVisibilityChance(kpMax: number, latitude: number): AuroraChance {
  const absLat = Math.abs(latitude);
  const needed = 66 - (kpMax - 3) * 5;
  if (absLat + 4 >= needed || kpMax >= 8) return 'high';
  if (absLat + 12 >= needed || kpMax >= 6) return 'maybe';
  return 'low';
}