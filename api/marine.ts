import { buildMarineCacheEntry, loadMarineCache, saveMarineCache, type MarineCacheEntry } from '../utils/marine';

/** Open-Meteo Marine API: keyless, DWD ICON Wave. Attribution lives on the card footer. */
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

export type { MarineCacheEntry };

export interface MarineInfo {
  waveHeight: number | null;
  waveDirection: number | null;
  wavePeriod: number | null;
  seaSurfaceTemperature: number | null;
}

/** Full snapshot: current seas + swell + next-24 h peak. JSON-safe. */
export interface MarineSnapshot extends MarineInfo {
  swellHeight: number | null;
  swellDirection: number | null;
  swellPeriod: number | null;
  max24h: number | null;
  fetchedAt: number;
}

interface MarineHourlyPayload {
  time?: string[];
  wave_height?: (number | null)[];
  wave_direction?: (number | null)[];
  wave_period?: (number | null)[];
  swell_wave_height?: (number | null)[];
  swell_wave_direction?: (number | null)[];
  swell_wave_period?: (number | null)[];
  sea_surface_temperature?: (number | null)[];
}

interface MarineCurrentPayload {
  wave_height?: number | null;
  wave_direction?: number | null;
  wave_period?: number | null;
  sea_surface_temperature?: number | null;
}

function toFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Current seas + swell + next-24 h wave peak in ONE marine call
 * (current=…&hourly=…&forecast_days=2&timezone=auto, ~3 KB).
 * Cache-first per location (6 h TTL in utils/marine.ts); a cache hit serves
 * synchronously with no network at all. Inland (null wave_height) and any
 * failure reject so the card hides exactly as today. Never returns partial
 * data — either the full snapshot or a throw.
 */
export async function fetchMarineSnapshot(lat: number, lon: number): Promise<MarineSnapshot> {
  const cached = await loadMarineCache(lat, lon);
  if (cached) {
    return {
      waveHeight: cached.waveHeight,
      waveDirection: cached.waveDirection,
      wavePeriod: cached.wavePeriod,
      seaSurfaceTemperature: cached.seaTemp,
      swellHeight: cached.swellHeight,
      swellDirection: cached.swellDirection,
      swellPeriod: cached.swellPeriod,
      max24h: cached.max24h,
      fetchedAt: cached.fetchedAt,
    };
  }

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'wave_height,wave_direction,wave_period,sea_surface_temperature',
    hourly:
      'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature',
    forecast_days: '2',
    timezone: 'auto',
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${MARINE_URL}?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Marine responded ${response.status}`);
    const json = (await response.json()) as {
      current?: MarineCurrentPayload;
      hourly?: MarineHourlyPayload;
    };
    const current = json?.current;
    const waveHeight = current ? toFinite(current.wave_height) : null;
    // Inland (and any malformed payload): all-null current → hide the card.
    if (waveHeight === null) throw new Error('Inland location');
    const hourly = json?.hourly;
    const times = hourly?.time ?? [];
    // Current time is `YYYY-MM-DDTHH:mm` (no seconds); hourly is hourly ISO.
    // Take the next 24 hourly points at/after the current timestamp.
    const currentStamp = typeof (current as { time?: unknown }).time === 'string'
      ? ((current as { time?: unknown }).time as string)
      : '';
    let startIndex = times.findIndex((stamp) => stamp >= currentStamp);
    if (startIndex < 0) startIndex = 0;
    const window = times.slice(startIndex, startIndex + 24);
    const at = (arr: (number | null)[] | undefined, i: number): number | null =>
      arr ? toFinite(arr[startIndex + i]) : null;
    const hours = window.map((time, i) => ({
      time,
      waveHeight: at(hourly?.wave_height, i),
      waveDirection: at(hourly?.wave_direction, i),
      wavePeriod: at(hourly?.wave_period, i),
      swellHeight: at(hourly?.swell_wave_height, i),
      swellDirection: at(hourly?.swell_wave_direction, i),
      swellPeriod: at(hourly?.swell_wave_period, i),
      seaTemp: at(hourly?.sea_surface_temperature, i),
    }));
    // Swell "now" prefers the hourly grid aligned to the current stamp (the
    // current block carries no swell vars); falls back to the first hour.
    const swellNow = hours[0] ?? null;
    const heights = hours.map((hour) => hour.waveHeight);
    const finite = heights.filter((value): value is number => value !== null);
    const entry = buildMarineCacheEntry(
      lat,
      lon,
      {
        waveHeight,
        waveDirection: current ? toFinite(current.wave_direction) : null,
        wavePeriod: current ? toFinite(current.wave_period) : null,
        swellHeight: swellNow ? swellNow.swellHeight : null,
        swellDirection: swellNow ? swellNow.swellDirection : null,
        swellPeriod: swellNow ? swellNow.swellPeriod : null,
        seaTemp: current ? toFinite(current.sea_surface_temperature) : null,
      },
      hours,
      Date.now(),
    );
    void saveMarineCache(entry);
    return {
      waveHeight: entry.waveHeight,
      waveDirection: entry.waveDirection,
      wavePeriod: entry.wavePeriod,
      seaSurfaceTemperature: entry.seaTemp,
      swellHeight: entry.swellHeight,
      swellDirection: entry.swellDirection,
      swellPeriod: entry.swellPeriod,
      max24h: finite.length ? Math.max(...finite) : null,
      fetchedAt: entry.fetchedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}
