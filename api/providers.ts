import type {
  EnsembleSpread,
  EnsembleSpreadPoint,
  HourlyPrecipitationObservation,
  PastDayActual,
  MonthlyNormal,
  OnThisDayYear,
} from './types';
import { RAIN_EVENT_THRESHOLD_MM } from './rain';
import { traceAsync } from '../utils/performanceTracing';

export interface ProviderCheck {
  status: 'idle' | 'checking' | 'ok' | 'error';
  temperature: number | null;
  /** Client time when the most recent secondary-provider check completed. */
  checkedAt?: number | null;
}

export interface HistoricalInfo {
  date: string;
  tMax: number;
  tMin: number;
  weatherCode: number;
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
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
  precipitation_sum?: (number | null)[];
  weather_code?: (number | null)[];
  wind_speed_10m_max?: (number | null)[];
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
    daily:
      'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max',
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
      const wind = daily.wind_speed_10m_max?.[i];
      days.push({
        date: daily.time[i] as string,
        tMax,
        tMin,
        precipSum: daily.precipitation_sum?.[i] ?? 0,
        weatherCode: daily.weather_code?.[i] ?? 3,
        windMax: typeof wind === 'number' ? wind : null,
      });
    }
    return days;
  } finally {
    clearTimeout(timer);
  }
}

interface ArchiveHourlyPayload {
  time?: string[];
  precipitation?: (number | null)[];
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Hourly precipitation observations for forecast verification. Times use the
 * same location-local timezone as `fetchWeather` and `fetchEnsembleSpread`, so
 * a forecast hour is matched directly rather than shifted into the phone's
 * timezone. Missing archive values are omitted, never interpreted as dry.
 */
export async function fetchHourlyPrecipitationActuals(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<HourlyPrecipitationObservation[] | null> {
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate) || startDate > endDate) {
    return null;
  }
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: startDate,
    end_date: endDate,
    hourly: 'precipitation',
    timezone: 'auto',
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const json = await response.json();
    const hourly: ArchiveHourlyPayload | undefined = json?.hourly;
    if (!Array.isArray(hourly?.time) || !Array.isArray(hourly.precipitation)) return null;
    const observations: HourlyPrecipitationObservation[] = [];
    for (let i = 0; i < hourly.time.length; i++) {
      const time = hourly.time[i];
      const precipitation = hourly.precipitation[i];
      if (
        typeof time === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time) &&
        typeof precipitation === 'number' &&
        Number.isFinite(precipitation) &&
        precipitation >= 0
      ) {
        observations.push({ time, precipitation });
      }
    }
    return observations;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Records are searched from this date. Five-plus years of ERA5 archive keeps
 * the answer meaningful (a 2020-to-date window survives most single storms)
 * while still costing a single request.
 */
export const RECORD_WINDOW_START = '2020-01-01';

/** One archive day reduced to the three record-breaking fields. */
export interface RecordDay {
  date: string;
  tMax: number;
  precipSum: number;
  /** Daily maximum 10 m wind km/h, null when the archive row has none. */
  windMax: number | null;
}

export interface LocationRecords {
  /** First date covered, `YYYY-MM-DD`. */
  from: string;
  /** Last date covered, `YYYY-MM-DD`. */
  to: string;
  rows: RecordDay[];
}

/**
 * Every archive day from RECORD_WINDOW_START to yesterday for one location, in
 * ONE ranged request. The same requestArchiveWindow helper the 30-day view and
 * the historical explorer use, just over a much wider window (~2 400 daily
 * rows, a few hundred kB) - which is far cheaper than paging per year and
 * keeps the record search exhaustive. Returns null on any failure so the card
 * simply stays hidden.
 */
export async function fetchLocationRecords(
  lat: number,
  lon: number,
): Promise<LocationRecords | null> {
  const end = isoDaysAgo(1);
  try {
    const days = await requestArchiveWindow(lat, lon, RECORD_WINDOW_START, end);
    if (days.length === 0) return null;
    const rows: RecordDay[] = days.map((day) => ({
      date: day.date,
      tMax: day.tMax,
      precipSum: day.precipSum,
      windMax: typeof day.windMax === 'number' ? day.windMax : null,
    }));
    return { from: RECORD_WINDOW_START, to: end, rows };
  } catch {
    return null;
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

/**
 * 1991-2020 climate normals for a location from the Open-Meteo Archive API
 * (era5_seamless blends ERA5 and ERA5-Land). One big ranged request over the
 * whole 30-year window; the ~11k daily rows are aggregated client-side into
 * 12 monthly rows and the raw payload is discarded. Never throws: any failure
 * degrades to null and the caller stays cache-only.
 */
export async function fetchClimateNormals(lat: number, lon: number): Promise<MonthlyNormal[] | null> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: '1991-01-01',
    end_date: '2020-12-31',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    models: 'era5_seamless',
    timezone: 'auto',
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Archive responded ${response.status}`);
    const json = await response.json();
    const daily: ArchiveDailyPayload | undefined = json?.daily;
    if (!daily?.time?.length) throw new Error('No archive data');

    // Accumulate per-calendar-month sums; temps and precip skip null rows
    // independently so a lagging day cannot poison a month.
    const buckets = Array.from({ length: 12 }, () => ({
      tMax: 0,
      tMin: 0,
      precip: 0,
      tempDays: 0,
      precipDays: 0,
    }));
    for (let i = 0; i < daily.time.length; i++) {
      const date = daily.time[i];
      if (typeof date !== 'string' || date.length < 7) continue;
      const monthIndex = Number(date.slice(5, 7)) - 1;
      if (monthIndex < 0 || monthIndex > 11) continue;
      const bucket = buckets[monthIndex];
      const tMax = daily.temperature_2m_max?.[i];
      const tMin = daily.temperature_2m_min?.[i];
      if (typeof tMax === 'number' && typeof tMin === 'number') {
        bucket.tMax += tMax;
        bucket.tMin += tMin;
        bucket.tempDays += 1;
      }
      const precip = daily.precipitation_sum?.[i];
      if (typeof precip === 'number') {
        bucket.precip += precip;
        bucket.precipDays += 1;
      }
    }

    const months: MonthlyNormal[] = [];
    // ~30 era years (1991-2020); derived from the bucket so a truncated
    // payload changes the divisor consistently instead of faking a total.
    const eraYears = daily.time.length / 366;
    for (let m = 0; m < 12; m++) {
      const bucket = buckets[m];
      if (bucket.tempDays === 0 || bucket.precipDays === 0) return null;
      months.push({
        month: m + 1,
        tMaxMean: Math.round((bucket.tMax / bucket.tempDays) * 10) / 10,
        tMinMean: Math.round((bucket.tMin / bucket.tempDays) * 10) / 10,
        precipMean: Math.round((bucket.precip / eraYears) * 10) / 10,
      });
    }
    return months;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
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

/** One single-day Archive-API observation; null when that day/region is unusable. */
async function fetchArchiveDay(lat: number, lon: number, dateStr: string): Promise<HistoricalInfo | null> {
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
    const tMax = daily.temperature_2m_max?.[0];
    const tMin = daily.temperature_2m_min?.[0];
    // Skip days with incomplete rows instead of inventing values (the row
    // would otherwise be cached indefinitely by this feature).
    if (typeof tMax !== 'number' || typeof tMin !== 'number') return null;
    return {
      date: dateStr,
      tMax,
      tMin,
      weatherCode: daily.weather_code?.[0] ?? 3,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Observed weather on today's calendar day across the last `years` years
 * (default 10), via parallel single-day Archive-API requests. Feb 29 falls
 * back to Feb 28 like fetchYearAgo. Rows come back newest-first, only years
 * with usable data. Returns null only when EVERY request failed (network/
 * service down) so the caller can show nothing rather than an empty card.
 */
export async function fetchOnThisDayYears(lat: number, lon: number, years = 10): Promise<OnThisDayYear[] | null> {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  let day = String(d.getDate()).padStart(2, '0');
  if (month === '02' && day === '29') day = '28';
  const monthDay = `${month}-${day}`;
  const currentYear = d.getFullYear();

  const requests = [];
  for (let offset = 1; offset <= years; offset++) {
    const targetYear = currentYear - offset;
    requests.push(
      fetchArchiveDay(lat, lon, `${targetYear}-${monthDay}`).then((info) =>
        info ? { ...info, year: targetYear } : null,
      ),
    );
  }
  const results = await Promise.all(requests);
  const rows = results
    .filter((row): row is OnThisDayYear => row !== null)
    .sort((a, b) => b.year - a.year);
  return rows.length > 0 ? rows : null;
}

/**
 * Observed weather for ONE arbitrary past date (YYYY-MM-DD) - the historical
 * explorer. A single ranged Archive call (start_date = end_date) parsed by the
 * same `requestArchiveWindow` helper the 30-day view uses, so the row shape and
 * the "skip incomplete rows" rule are identical. Returns null when the archive
 * has no usable row (service down, or a date inside its few-days lag) so the
 * screen can offer a retry instead of inventing numbers. Never throws.
 */
export async function fetchHistoricalDay(
  lat: number,
  lon: number,
  date: string,
): Promise<PastDayActual | null> {
  try {
    const days = await requestArchiveWindow(lat, lon, date, date);
    return days[0] ?? null;
  } catch {
    return null;
  }
}

const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble';

interface EnsembleApiResponse {
  hourly?: {
    time?: string[];
  } & Record<string, (number | null)[] | string[] | undefined>;
}

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

/**
 * Hourly ensemble spread for the next 4 days from the Ensemble API
 * (ICON-EPS seamless: control + 39 members). Percentiles are computed
 * client-side over the member arrays. Returns null on any failure - the
 * caller hides the feature. Members that lack a precipitation array still
 * count toward temperature percentiles; rain probability uses only members
 * that reported precipitation.
 */
async function fetchEnsembleSpreadImpl(lat: number, lon: number): Promise<EnsembleSpread | null> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: 'temperature_2m,precipitation,wind_speed_10m',
    forecast_days: '4',
    timezone: 'auto',
    models: 'icon_seamless',
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${ENSEMBLE_URL}?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Ensemble responded ${response.status}`);
    const json = (await response.json()) as EnsembleApiResponse;
    const hourly = json?.hourly;
    const times = hourly?.time;
    if (!hourly || !Array.isArray(times) || times.length === 0) return null;

    const memberTempKeys = Object.keys(hourly).filter(
      (key) => /^temperature_2m_member\d+$/.test(key) && Array.isArray(hourly[key]),
    );
    if (memberTempKeys.length === 0) return null;

    const memberWindKeys = Object.keys(hourly).filter(
      (key) => /^wind_speed_10m_member\d+$/.test(key) && Array.isArray(hourly[key]),
    );
    const points: EnsembleSpreadPoint[] = [];
    for (let i = 0; i < times.length; i++) {
      const temps: number[] = [];
      const winds: number[] = [];
      let wetMembers = 0;
      let precipMembers = 0;
      for (const key of memberTempKeys) {
        const tempsArray = hourly[key] as (number | null)[];
        const value = tempsArray[i];
        if (typeof value === 'number') temps.push(value);
        const precipKey = key.replace('temperature_2m', 'precipitation');
        const precipArray = hourly[precipKey];
        if (Array.isArray(precipArray)) {
          const precip = (precipArray as (number | null)[])[i];
          if (typeof precip === 'number') {
            precipMembers += 1;
            if (precip >= RAIN_EVENT_THRESHOLD_MM) wetMembers += 1;
          }
        }
      }
      for (const key of memberWindKeys) {
        const value = (hourly[key] as (number | null)[])[i];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) winds.push(value);
      }
      if (temps.length === 0) continue;
      temps.sort((a, b) => a - b);
      winds.sort((a, b) => a - b);
      points.push({
        time: times[i],
        tP10: percentile(temps, 10),
        tMedian: percentile(temps, 50),
        tP90: percentile(temps, 90),
        ...(winds.length > 0
          ? {
              windP10: percentile(winds, 10),
              windMedian: percentile(winds, 50),
              windP90: percentile(winds, 90),
              windMembers: winds.length,
            }
          : {}),
        rainProb: precipMembers > 0 ? (wetMembers / precipMembers) * 100 : 0,
      });
    }
    if (points.length === 0) return null;
    return { points, members: memberTempKeys.length, fetchedAt: Date.now() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}


export function fetchEnsembleSpread(lat: number, lon: number): Promise<EnsembleSpread | null> {
  return traceAsync('open-meteo.fetch-ensemble', () => fetchEnsembleSpreadImpl(lat, lon));
}

// ── Multi-model comparison (F2) ──

export type ModelKey =
  | 'ecmwf_ifs025'
  | 'gfs_seamless'
  | 'icon_seamless'
  | 'meteofrance_seamless'
  | 'jma_seamless'
  | 'metno_nordic';

/** Short display labels for the comparison table + settings picker. */
export const MODEL_LABELS: Record<ModelKey, string> = {
  ecmwf_ifs025: 'ECMWF',
  gfs_seamless: 'GFS',
  icon_seamless: 'ICON',
  meteofrance_seamless: 'Météo-France',
  jma_seamless: 'JMA',
  metno_nordic: 'MET Nordic',
};

export const MODEL_KEYS: ModelKey[] = [
  'ecmwf_ifs025',
  'gfs_seamless',
  'icon_seamless',
  'meteofrance_seamless',
  'jma_seamless',
  'metno_nordic',
];

export interface ModelForecastDay {
  date: string;
  tMax: number;
  tMin: number;
  precipProb: number | null;
  /** Daily precipitation total (mm) - the rain-accuracy metric. */
  precipSum: number | null;
  /** Daily maximum 10 m wind (km/h) - the wind-accuracy metric. */
  windMax: number | null;
  weatherCode: number;
}

export interface ModelForecast {
  model: ModelKey;
  days: ModelForecastDay[];
}

interface MultiModelDaily {
  time?: string[];
  [suffixed: string]: unknown;
}

/**
 * One forecast-API call with every comparison model; the response carries
 * suffixed daily keys (temperature_2m_max_<model>, ...). Regional models can
 * be silently absent for a location (metno_nordic outside the Nordics) - those
 * models simply return null and the UI shows a dash.
 */
export async function fetchModelForecast(lat: number, lon: number): Promise<ModelForecast[] | null> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    daily:
      'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,weather_code',
    forecast_days: '7',
    timezone: 'auto',
    models: MODEL_KEYS.join(','),
  }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Forecast responded ${response.status}`);
    const json = (await response.json()) as { daily?: MultiModelDaily };
    const daily = json?.daily;
    const times = daily?.time;
    if (!daily || !Array.isArray(times) || times.length === 0) return null;

    const result: ModelForecast[] = [];
    for (const model of MODEL_KEYS) {
      const maxes = daily[`temperature_2m_max_${model}`];
      const mins = daily[`temperature_2m_min_${model}`];
      if (!Array.isArray(maxes) || !Array.isArray(mins)) continue; // region-unsupported model
      const probs = daily[`precipitation_probability_max_${model}`];
      const sums = daily[`precipitation_sum_${model}`];
      const winds = daily[`wind_speed_10m_max_${model}`];
      const codes = daily[`weather_code_${model}`];
      const days: ModelForecastDay[] = [];
      for (let i = 0; i < times.length; i++) {
        const tMax = maxes[i];
        const tMin = mins[i];
        if (typeof tMax !== 'number' || typeof tMin !== 'number') continue;
        const sum = Array.isArray(sums) ? sums[i] : undefined;
        const wind = Array.isArray(winds) ? winds[i] : undefined;
        days.push({
          date: times[i],
          tMax,
          tMin,
          precipProb: Array.isArray(probs) && typeof probs[i] === 'number' ? (probs[i] as number) : null,
          precipSum: typeof sum === 'number' ? sum : null,
          windMax: typeof wind === 'number' ? wind : null,
          weatherCode: Array.isArray(codes) && typeof codes[i] === 'number' ? (codes[i] as number) : 3,
        });
      }
      if (days.length > 0) result.push({ model, days });
    }
    return result.length > 0 ? result : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
