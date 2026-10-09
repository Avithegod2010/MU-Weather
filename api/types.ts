export interface GeoLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  countryCode?: string;
  admin1?: string;
}

export interface CurrentConditions {
  /** Provider-local observation timestamp; absent in legacy cached bundles. */
  observationTime?: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  isDay: boolean;
  weatherCode: number;
  pressure: number;
  cloudCover: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  precipitation: number;
  dewPoint: number | null;
  visibility: number | null;
  pressureTrend: number | null;
}

export interface HourPoint {
  time: string;
  temperature: number;
  apparent: number;
  weatherCode: number;
  precipProbability: number;
  precipitation: number;
  isDay: boolean;
  isNow: boolean;
  dewPoint: number | null;
  visibility: number | null;
  windSpeed: number;
  windGusts: number;
  windDirection: number;
  uvIndex: number | null;
  humidity: number | null;
  pressure: number | null;
  cape: number | null;
  snowDepthM: number | null;
  snowfallCm: number | null;
  freezingLevelM: number | null;
}

export interface DayPoint {
  date: string;
  weatherCode: number;
  tMax: number;
  tMin: number;
  sunrise: string;
  sunset: string;
  uvIndexMax: number;
  precipProbabilityMax: number;
  precipSum: number;
  windMax: number;
}

export interface PollenInfo {
  alder: number | null;
  birch: number | null;
  grass: number | null;
  mugwort: number | null;
  olive: number | null;
  ragweed: number | null;
}

export interface AqiInfo {
  /** Provider-local timestamp for the current air-quality observation. */
  observationTime?: string;
  usAqi: number | null;
  euAqi: number | null;
  pm2_5: number | null;
  pm10: number | null;
  ozone: number | null;
  no2: number | null;
  so2: number | null;
  pollen: PollenInfo | null;
}

/** One hourly point of the air-quality forecast (JSON-safe). */
export interface AqiHourPoint {
  time: string;
  usAqi: number | null;
  euAqi: number | null;
  pm25: number | null;
  pm10: number | null;
}

/**
 * One day's peak AQI, derived client-side from the hourly forecast
 * (the API serves hourly only - no daily AQI aggregates). JSON-safe.
 */
export interface AqiDayPeak {
  /** Calendar day `YYYY-MM-DD` in the forecast location's timezone. */
  date: string;
  /** Peak US AQI of the day's hours (null when the day has no data). */
  usPeak: number | null;
  /** Peak European AQI of the day's hours (null when the day has no data). */
  euPeak: number | null;
}

export interface MinutelyPoint {
  time: string;
  precipitation: number;
}

export interface WeatherBundle {
  location: GeoLocation;
  /** IANA timezone from the forecast provider; optional for older cached bundles. */
  timezone?: string;
  utcOffsetSeconds: number;
  /** Whether the separate air-quality provider returned a usable current payload. */
  airQualityStatus?: 'available' | 'unavailable';
  /** Fetch time for the separate air-quality provider, when successful. */
  airQualityFetchedAt?: number | null;
  /** Altitude of the location above sea level, in metres (null when the API omits it). */
  elevation: number | null;
  current: CurrentConditions;
  hourly: HourPoint[];
  /** Every hourly point of the forecast period (~16 days x 24h) for day deep-dives. */
  hourlyAll: HourPoint[];
  minutely: MinutelyPoint[];
  daily: DayPoint[];
  aqi: AqiInfo | null;
  /** Hourly US/EU AQI + particulate forecast, rolling 120 h (empty when the air-quality API fails). */
  aqiHourly: AqiHourPoint[];
  fetchedAt: number;
}

/** One day of observed weather from the Archive API (JSON-safe). */
export interface PastDayActual {
  date: string;
  tMax: number;
  tMin: number;
  precipSum: number;
  weatherCode: number;
  /**
   * Daily maximum 10 m wind in km/h, used by the per-metric model leaderboard.
   * Optional so archive snapshots persisted before the variable was requested
   * still validate; null when the archive row has no value.
   */
  windMax?: number | null;
}

/** One hourly weather observation returned by the Archive API. */
export interface HourlyWeatherObservation {
  /** Local ISO hour in the queried location's timezone. */
  time: string;
  /** Millimetres in the forecast hour; null means the archive has no value. */
  precipitation: number | null;
  /** Degrees Celsius; null means the archive has no value. */
  temperature: number | null;
  /** Kilometres per hour, matching the ensemble provider's default units. */
  windSpeed: number | null;
}

/** One verified hourly precipitation value returned by the Archive API. */
export interface HourlyPrecipitationObservation {
  /** Local ISO hour in the queried location's timezone. */
  time: string;
  precipitation: number;
}

/** One month of 1991-2020 climate normals (JSON-safe), month 1-12. */
export interface MonthlyNormal {
  month: number;
  /** Mean of the daily highs (°C) across the era for this calendar month. */
  tMaxMean: number;
  /** Mean of the daily lows (°C) across the era for this calendar month. */
  tMinMean: number;
  /** Mean monthly precipitation TOTAL (mm) for this calendar month across the era. */
  precipMean: number;
}

/** One hourly ensemble-spread point (JSON-safe). Percentiles are over all members. */
export interface EnsembleSpreadPoint {
  /** Local ISO hour, matches HourPoint.time. */
  time: string;
  /** 10th percentile 2 m temperature across ensemble members (°C). */
  tP10: number;
  /** Ensemble median 2 m temperature (°C). */
  tMedian: number;
  /** 90th percentile 2 m temperature across ensemble members (°C). */
  tP90: number;
  /** Number of members with temperature data at this hour (legacy cache rows omit it). */
  temperatureMembers?: number;
  /** 10th-percentile 10 m wind speed across members (km/h), when supplied. */
  windP10?: number;
  /** Median 10 m wind speed across members (km/h), when supplied. */
  windMedian?: number;
  /** 90th-percentile 10 m wind speed across members (km/h), when supplied. */
  windP90?: number;
  /** Number of members with wind data at this hour. */
  windMembers?: number;
  /** Member-derived rain probability 0-100 (share of members with precipitation >= 0.1 mm). */
  rainProb: number;
}

/** Ensemble spread for one location, fetched from the Ensemble API (JSON-safe). */
export interface EnsembleSpread {
  points: EnsembleSpreadPoint[];
  /** Number of members the percentiles were computed over. */
  members: number;
  /** Epoch ms of the fetch - ensembles go stale, cache entries expire. */
  fetchedAt: number;
}

/** Weather observed on today's calendar day in one past year (JSON-safe). */
export interface OnThisDayYear {
  /** The past calendar year this row describes. */
  year: number;
  /** ISO date the observation is for (YYYY-MM-DD). */
  date: string;
  tMax: number;
  tMin: number;
  weatherCode: number;
}

export interface ForecastResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  utc_offset_seconds: number;
  elevation?: number;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    is_day: number;
    precipitation: number;
    weather_code: number;
    cloud_cover: number;
    pressure_msl: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: (number | null)[];
    weather_code: number[];
    precipitation: (number | null)[];
    precipitation_probability: (number | null)[];
    is_day: number[];
    dew_point_2m: (number | null)[];
    visibility: (number | null)[];
    pressure_msl: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
    uv_index: (number | null)[];
    relative_humidity_2m: (number | null)[];
    cape?: (number | null)[];
    snow_depth?: (number | null)[];
    snowfall?: (number | null)[];
    freezing_level_height?: (number | null)[];
  };
  minutely_15?: {
    time: string[];
    precipitation: (number | null)[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: (number | null)[];
    precipitation_probability_max: (number | null)[];
    precipitation_sum: (number | null)[];
    wind_speed_10m_max: (number | null)[];
  };
}

export interface GeocodingResponse {
  results?: {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    country_code?: string;
    admin1?: string;
    timezone?: string;
    population?: number;
  }[];
}

export interface AirQualityResponse {
  current: {
    time?: string;
    us_aqi: number | null;
    european_aqi: number | null;
    pm2_5: number | null;
    pm10: number | null;
    ozone: number | null;
    nitrogen_dioxide: number | null;
    sulphur_dioxide: number | null;
    alder_pollen: number | null;
    birch_pollen: number | null;
    grass_pollen: number | null;
    mugwort_pollen: number | null;
    olive_pollen: number | null;
    ragweed_pollen: number | null;
  };
  hourly?: {
    time: string[];
    us_aqi: (number | null)[];
    european_aqi: (number | null)[];
    pm2_5: (number | null)[];
    pm10: (number | null)[];
  };
}
