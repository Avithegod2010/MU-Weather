import type {
  AirQualityResponse,
  AqiInfo,
  CurrentConditions,
  DayPoint,
  ForecastResponse,
  GeoLocation,
  GeocodingResponse,
  HourPoint,
  MinutelyPoint,
  PollenInfo,
  WeatherBundle,
} from './types';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export type ApiErrorKind = 'network' | 'server' | 'parse' | 'unknown';

export class ApiError extends Error {
  kind: ApiErrorKind;

  constructor(message: string, kind: ApiErrorKind) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

async function fetchJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    const isAbort = error instanceof Error && error.name === 'AbortError';
    throw new ApiError(
      isAbort ? 'The request timed out.' : 'No internet connection.',
      isAbort ? 'network' : 'network',
    );
  }
  clearTimeout(timer);
  if (!response.ok) {
    throw new ApiError(`Service responded with ${response.status}.`, 'server');
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('Received malformed data.', 'parse');
  }
}

function toEpoch(iso: string): number {
  const normalized = iso.length === 16 ? `${iso}:00Z` : iso.endsWith('Z') ? iso : `${iso}Z`;
  return new Date(normalized).getTime();
}

function buildHourly(response: ForecastResponse): HourPoint[] {
  const { hourly } = response;
  if (!hourly?.time?.length) return [];
  const localNowMs = Date.now() + response.utc_offset_seconds * 1000;
  let startIndex = hourly.time.findIndex((t) => toEpoch(t) > localNowMs - 3600_000);
  if (startIndex < 0) startIndex = Math.max(0, hourly.time.length - 24);
  const slice = hourly.time.slice(startIndex, startIndex + 24);
  return slice.map((time, offset) => {
    const index = startIndex + offset;
    return {
      time,
      temperature: hourly.temperature_2m[index] ?? 0,
      weatherCode: hourly.weather_code[index] ?? 3,
      precipProbability: hourly.precipitation_probability?.[index] ?? 0,
      precipitation: hourly.precipitation?.[index] ?? 0,
      isDay: (hourly.is_day?.[index] ?? 1) === 1,
      isNow: offset === 0,
      dewPoint: hourly.dew_point_2m?.[index] ?? null,
      visibility: hourly.visibility?.[index] ?? null,
      windSpeed: hourly.wind_speed_10m?.[index] ?? 0,
      windGusts: hourly.wind_gusts_10m?.[index] ?? 0,
      windDirection: hourly.wind_direction_10m?.[index] ?? 0,
    };
  });
}

function buildMinutely(response: ForecastResponse): MinutelyPoint[] {
  const minutely = response.minutely_15;
  if (!minutely?.time?.length) return [];
  const localNowMs = Date.now() + response.utc_offset_seconds * 1000;
  let startIndex = minutely.time.findIndex((t) => toEpoch(t) > localNowMs - 900_000);
  if (startIndex < 0) startIndex = 0;
  const slice = minutely.time.slice(startIndex, startIndex + 12);
  return slice.map((time, offset) => ({
    time,
    precipitation: minutely.precipitation?.[startIndex + offset] ?? 0,
  }));
}

function pressureTrend(response: ForecastResponse, startIndex: number): number | null {
  const pressures = response.hourly?.pressure_msl;
  if (!pressures || startIndex < 3) return null;
  const now = pressures[startIndex];
  const before = pressures[startIndex - 3];
  if (now === null || now === undefined || before === null || before === undefined) return null;
  return now - before;
}

function buildDaily(response: ForecastResponse): DayPoint[] {
  const { daily } = response;
  if (!daily?.time?.length) return [];
  return daily.time.map((date, index) => ({
    date,
    weatherCode: daily.weather_code[index] ?? 3,
    tMax: daily.temperature_2m_max[index] ?? 0,
    tMin: daily.temperature_2m_min[index] ?? 0,
    sunrise: daily.sunrise[index] ?? '',
    sunset: daily.sunset[index] ?? '',
    uvIndexMax: daily.uv_index_max?.[index] ?? 0,
    precipProbabilityMax: daily.precipitation_probability_max?.[index] ?? 0,
  }));
}

type BaseCurrentConditions = Omit<
  CurrentConditions,
  'dewPoint' | 'visibility' | 'pressureTrend'
>;

function buildCurrent(response: ForecastResponse): BaseCurrentConditions {
  const c = response.current;
  return {
    temperature: c.temperature_2m,
    apparentTemperature: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    isDay: c.is_day === 1,
    weatherCode: c.weather_code,
    pressure: c.pressure_msl,
    cloudCover: c.cloud_cover,
    windSpeed: c.wind_speed_10m,
    windDirection: c.wind_direction_10m,
    windGusts: c.wind_gusts_10m,
    precipitation: c.precipitation,
  };
}

export async function fetchWeather(location: GeoLocation): Promise<WeatherBundle> {
  const forecastParams = new URLSearchParams({
    latitude: location.latitude.toFixed(4),
    longitude: location.longitude.toFixed(4),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,' +
      'weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly:
      'temperature_2m,weather_code,precipitation_probability,precipitation,is_day,' +
      'dew_point_2m,visibility,pressure_msl,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
    minutely_15: 'precipitation',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '16',
  }).toString();

  const aqiParams = new URLSearchParams({
    latitude: location.latitude.toFixed(4),
    longitude: location.longitude.toFixed(4),
    current: 'us_aqi,pm2_5,pm10,alder,birch,grass,mugwort,olive,ragweed',
    timezone: 'auto',
  }).toString();

  const [forecastResult, aqiResult] = await Promise.allSettled([
    fetchJson<ForecastResponse>(`${FORECAST_URL}?${forecastParams}`),
    fetchJson<AirQualityResponse>(`${AIR_QUALITY_URL}?${aqiParams}`, 12000),
  ]);

  if (forecastResult.status === 'rejected') {
    throw forecastResult.reason instanceof ApiError
      ? forecastResult.reason
      : new ApiError('Something went wrong.', 'unknown');
  }

  const forecast = forecastResult.value;
  let aqi: AqiInfo | null = null;
  if (aqiResult.status === 'fulfilled' && aqiResult.value?.current) {
    const ac = aqiResult.value.current;
    const pollen: PollenInfo = {
      alder: ac.alder,
      birch: ac.birch,
      grass: ac.grass,
      mugwort: ac.mugwort,
      olive: ac.olive,
      ragweed: ac.ragweed,
    };
    const pollenAvailable = Object.values(pollen).some((value) => value !== null && value !== undefined);
    aqi = {
      usAqi: ac.us_aqi,
      pm2_5: ac.pm2_5,
      pm10: ac.pm10,
      pollen: pollenAvailable ? pollen : null,
    };
  }

  const hourly = buildHourly(forecast);
  const currentHour = hourly[0] ?? null;

  const nowIndex = forecast.hourly?.time?.length
    ? forecast.hourly.time.findIndex(
        (t) => toEpoch(t) > Date.now() + forecast.utc_offset_seconds * 1000 - 3600_000,
      )
    : -1;

  const current: CurrentConditions = {
    ...buildCurrent(forecast),
    dewPoint: currentHour?.dewPoint ?? null,
    visibility: currentHour?.visibility ?? null,
    pressureTrend: pressureTrend(forecast, nowIndex),
  };

  return {
    location,
    utcOffsetSeconds: forecast.utc_offset_seconds,
    current,
    hourly,
    minutely: buildMinutely(forecast),
    daily: buildDaily(forecast),
    aqi,
    fetchedAt: Date.now(),
  };
}

export async function searchCities(query: string): Promise<GeoLocation[]> {
  const params = new URLSearchParams({
    name: query.trim(),
    count: '12',
    language: 'en',
    format: 'json',
  }).toString();

  const data = await fetchJson<GeocodingResponse>(`${GEOCODING_URL}?${params}`);
  if (!data.results?.length) return [];

  const seen = new Set<string>();
  const results: GeoLocation[] = [];
  for (const result of data.results) {
    const key = `${result.name}|${result.admin1 ?? ''}|${result.country ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      id: `geo-${result.id}`,
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      country: result.country,
      countryCode: result.country_code,
      admin1: result.admin1,
    });
  }
  return results;
}

export function formatLocationSubtitle(location: GeoLocation): string {
  return [location.admin1, location.country].filter(Boolean).join(', ');
}
