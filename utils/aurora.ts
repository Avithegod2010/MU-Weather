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

/** Observed Kp history for the sparkline (last 24 h slice of the feed). */
export interface KpHistory {
  points: KpPoint[];
  /** ISO UTC start of the newest window, for the "updated" label. */
  updatedAt: string | null;
}

/** Real-time solar-wind reading from the SWPC summary files. */
export interface SolarWind {
  /** Bulk proton speed in km/s. */
  speed: number;
  /** IMF Bz (GSM) in nT — negative is southward. */
  bz: number | null;
  /** ISO UTC tag printed by the files, for the "updated" label. */
  updatedAt: string | null;
}

/** Everything the aurora card shows beyond the Kp forecast. */
export interface AuroraExtras {
  wind: SolarWind | null;
  history: KpHistory | null;
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

/**
 * Observed planetary-Kp history, keyless JSON. Verified live 2026-09-28:
 * bare JSON array of objects
 * { time_tag: 'YYYY-MM-DDTHH:mm:ss', Kp: number, a_running: number,
 * station_count: number }, one row per 3-hour window, capital `Kp` field
 * (unlike the forecast feed's lowercase `kp`). ~4.5 KB, updated continuously.
 */
const KP_HISTORY_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

/**
 * Real-time solar-wind summary, keyless JSON. Verified live 2026-09-28:
 * single-element bare arrays
 * [{ proton_speed: 344, time_tag: 'YYYY-MM-DDTHH:mm:ssZ' }] and
 * [{ bt: 3, bz_gsm: -1, time_tag: 'YYYY-MM-DDTHH:mm:ssZ' }].
 * The summary files (~60 bytes each) are preferred over the 1-2.5 MB
 * rtsw_wind_1m/rtsw_mag_1m feeds: same cadence, no tail-parsing, no jank.
 */
const SW_SPEED_URL = 'https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json';
const SW_MAG_URL = 'https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json';

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
      const raw = entry as unknown as { time_tag: string; kp: number };
      const rawExtra = entry as unknown as { observed?: unknown; noaa_scale?: unknown };
      const scale = typeof rawExtra.noaa_scale === 'string' && rawExtra.noaa_scale ? rawExtra.noaa_scale : null;
      points.push({
        time: raw.time_tag,
        kp: raw.kp,
        noaaScale: scale,
        predicted: rawExtra.observed === 'predicted',
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

/** ISO `YYYY-MM-DDTHH:mm:ss` (with or without trailing Z) → epoch ms, NaN-safe. */
function kpTimeToEpoch(time: string): number {
  const normalized = time.endsWith('Z') ? time : `${time}Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function isValidHistoryRow(value: unknown): value is { time_tag: string; Kp: number } {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (typeof row.time_tag !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?$/.test(row.time_tag)) {
    return false;
  }
  // The history feed spells the field with a capital K — unlike the forecast's
  // lowercase `kp` — so read it explicitly and never fall back to `kp`.
  if (typeof row.Kp !== 'number' || !Number.isFinite(row.Kp) || row.Kp < 0 || row.Kp > 9) return false;
  return true;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`SWPC responded ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Last 24 h of observed Kp (8 × 3-hour windows) for the sparkline.
 * Independent of the forecast fetch: failure returns null and the card keeps
 * its existing rows. Never throws.
 */
export async function fetchKpHistory(): Promise<KpHistory | null> {
  try {
    const json = await fetchJsonWithTimeout(KP_HISTORY_URL, 12000);
    if (!Array.isArray(json)) return null;
    const rows: KpPoint[] = [];
    for (const entry of json) {
      if (!isValidHistoryRow(entry)) continue;
      rows.push({ time: entry.time_tag, kp: entry.Kp, noaaScale: null, predicted: false });
    }
    if (rows.length < 2) return null;
    rows.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const recent = rows.filter((row) => {
      const epoch = kpTimeToEpoch(row.time);
      return !Number.isNaN(epoch) && epoch >= cutoff;
    });
    // A stale feed (no rows in the last day) is worse than no sparkline.
    const slice = (recent.length >= 2 ? recent : rows).slice(-8);
    if (slice.length < 2) return null;
    return { points: slice, updatedAt: slice[slice.length - 1].time };
  } catch {
    return null;
  }
}

function pickSummaryRow(json: unknown): Record<string, unknown> | null {
  // Summary files are single-element bare arrays; take the last element so a
  // future multi-row shape still yields the freshest reading.
  if (Array.isArray(json)) {
    for (let index = json.length - 1; index >= 0; index--) {
      const entry = json[index];
      if (entry && typeof entry === 'object') return entry as Record<string, unknown>;
    }
    return null;
  }
  return json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toTimeTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?$/.test(value) ? value : null;
}

/**
 * Solar-wind speed + IMF Bz from the two ~60-byte summary files.
 * Either file may fail independently: speed alone still renders; a missing
 * speed means no row at all. Never throws.
 */
export async function fetchSolarWind(): Promise<SolarWind | null> {
  try {
    const [speedJson, magJson] = await Promise.all([
      fetchJsonWithTimeout(SW_SPEED_URL, 12000).catch(() => null),
      fetchJsonWithTimeout(SW_MAG_URL, 12000).catch(() => null),
    ]);
    const speedRow = speedJson === null ? null : pickSummaryRow(speedJson);
    const magRow = magJson === null ? null : pickSummaryRow(magJson);
    const speed = speedRow ? toFiniteNumber(speedRow.proton_speed) : null;
    if (speed === null) return null;
    const bz = magRow ? toFiniteNumber(magRow.bz_gsm) : null;
    const speedTag = speedRow ? toTimeTag(speedRow.time_tag) : null;
    const magTag = magRow ? toTimeTag(magRow.time_tag) : null;
    return { speed, bz, updatedAt: speedTag ?? magTag };
  } catch {
    return null;
  }
}

/**
 * Best-effort extras for the aurora card: solar wind + Kp history in
 * parallel. Any failure yields a null half (or a fully null result); the
 * caller renders only the halves that survived. Never throws.
 */
export async function fetchAuroraExtras(): Promise<AuroraExtras> {
  const [wind, history] = await Promise.all([fetchSolarWind(), fetchKpHistory()]);
  return { wind, history };
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