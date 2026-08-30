import type { PastDayActual } from './types';

export interface ProviderCheck {
  status: 'idle' | 'checking' | 'ok' | 'error';
  temperature: number | null;
}

export interface HistoricalInfo {
  date: string;
  tMax: number;
  tMin: number;
  weatherCode: number;
}

export interface MarineInfo {
  waveHeight: number | null;
  waveDirection: number | null;
  wavePeriod: number | null;
  seaSurfaceTemperature: number | null;
}

export async function fetchMarine(lat: number, lon: number): Promise<MarineInfo> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'wave_height,wave_direction,wave_period,sea_surface_temperature',
    timezone: 'auto',
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://marine-api.open-meteo.com/v1/marine?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Marine responded ${response.status}`);
    const json = await response.json();
    const current = json?.current;
    if (!current) throw new Error('No marine data');
    const waveHeight = current.wave_height ?? null;
    if (waveHeight === null || waveHeight === undefined) throw new Error('Inland location');
    return {
      waveHeight,
      waveDirection: current.wave_direction ?? null,
      wavePeriod: current.wave_period ?? null,
      seaSurfaceTemperature: current.sea_surface_temperature ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchYearAgo(lat: number, lon: number): Promise<HistoricalInfo> {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  if (d.getMonth() === 1 && d.getDate() === 29) d.setDate(28);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: dateStr,
    end_date: dateStr,
    daily: 'temperature_2m_max,temperature_2m_min,weather_code',
    timezone: 'auto',
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Archive responded ${response.status}`);
    const json = await response.json();
    const daily = json?.daily;
    if (!daily?.time?.length) throw new Error('No archive data');
    return {
      date: dateStr,
      tMax: daily.temperature_2m_max?.[0] ?? 0,
      tMin: daily.temperature_2m_min?.[0] ?? 0,
      weatherCode: daily.weather_code?.[0] ?? 3,
    };
  } finally {
    clearTimeout(timer);
  }
}

interface ArchiveDailyPayload {
  time?: string[];
  temperature_2m_max?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
  precipitation_sum?: Array<number | null>;
  weather_code?: Array<number | null>;
}

function isoDaysAgo(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** One Archive API request for [start, end]; throws when the service or the window is unusable. */
async function requestArchiveWindow(
  lat: number,
  lon: number,
  start: string,
  end: string,
): Promise<PastDayActual[]> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: start,
    end_date: end,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
    timezone: 'auto',
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Archive responded ${response.status}`);
    const json = await response.json();
    const daily: ArchiveDailyPayload | undefined = json?.daily;
    if (!daily?.time?.length) throw new Error('No archive data');
    const days: PastDayActual[] = [];
    for (let i = 0; i < daily.time.length; i++) {
      const tMax = daily.temperature_2m_max?.[i];
      const tMin = daily.temperature_2m_min?.[i];
      // Skip lagging days with incomplete rows instead of inventing values.
      if (typeof tMax !== 'number' || typeof tMin !== 'number') continue;
      days.push({
        date: daily.time[i] as string,
        tMax,
        tMin,
        precipSum: daily.precipitation_sum?.[i] ?? 0,
        weatherCode: daily.weather_code?.[i] ?? 3,
      });
    }
    return days;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Actual observed weather for the past `days` days (default 7) from the
 * Open-Meteo Archive API: today-(days+1) .. today-1. The archive era
 * sometimes lags just behind the live era, so a failed or empty recent
 * window retries once with end_date stepped back to today-6 and returns
 * whatever complete days come back. Never throws: failures degrade to [].
 */
export async function fetchPastDays(lat: number, lon: number, days = 7): Promise<PastDayActual[]> {
  const start = isoDaysAgo(days + 1);
  try {
    const recent = await requestArchiveWindow(lat, lon, start, isoDaysAgo(1));
    if (recent.length > 0) return recent;
  } catch {
    // Fall through to the stepped-back retry below.
  }
  try {
    return await requestArchiveWindow(lat, lon, start, isoDaysAgo(6));
  } catch {
    return [];
  }
}

export async function fetchMetNorway(lat: number, lon: number): Promise<number> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MUWeather/1.0 (open-source weather app)',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`MET Norway responded ${response.status}`);
    const json = await response.json();
    const series = json?.properties?.timeseries;
    if (!Array.isArray(series) || series.length === 0) throw new Error('Empty series');

    const now = Date.now();
    let best: { temp: number; diff: number } | null = null;
    for (const entry of series) {
      const time = Date.parse(entry?.time ?? '');
      if (Number.isNaN(time)) continue;
      const temp = entry?.data?.instant?.details?.air_temperature;
      if (typeof temp !== 'number') continue;
      const diff = Math.abs(time - now);
      if (!best || diff < best.diff) {
        best = { temp, diff };
      }
    }
    if (!best) throw new Error('No usable timeseries entry');
    return best.temp;
  } finally {
    clearTimeout(timer);
  }
}
