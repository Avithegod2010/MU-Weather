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
  usAqi: number | null;
  euAqi: number | null;
  pm2_5: number | null;
  pm10: number | null;
  ozone: number | null;
  no2: number | null;
  so2: number | null;
  pollen: PollenInfo | null;
}

/** One hourly point of the air-quality forecast (~24 points, JSON-safe). */
export interface AqiHourPoint {
  time: string;
  usAqi: number | null;
  euAqi: number | null;
  pm25: number | null;
  pm10: number | null;
}

export interface MinutelyPoint {
  time: string;
  precipitation: number;
}

export interface WeatherBundle {
  location: GeoLocation;
  utcOffsetSeconds: number;
  /** Altitude of the location above sea level, in metres (null when the API omits it). */
  elevation: number | null;
  current: CurrentConditions;
  hourly: HourPoint[];
  /** Every hourly point of the forecast period (~16 days x 24h) for day deep-dives. */
  hourlyAll: HourPoint[];
  minutely: MinutelyPoint[];
  daily: DayPoint[];
  aqi: AqiInfo | null;
  /** Hourly US/EU AQI + particulate forecast for the next 24h (empty when the air-quality API fails). */
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
    apparent_temperature: Array<number | null>;
    weather_code: number[];
    precipitation: Array<number | null>;
    precipitation_probability: Array<number | null>;
    is_day: number[];
    dew_point_2m: Array<number | null>;
    visibility: Array<number | null>;
    pressure_msl: Array<number | null>;
    wind_speed_10m: Array<number | null>;
    wind_gusts_10m: Array<number | null>;
    wind_direction_10m: Array<number | null>;
    uv_index: Array<number | null>;
    relative_humidity_2m: Array<number | null>;
    cape?: Array<number | null>;
    snow_depth?: Array<number | null>;
    snowfall?: Array<number | null>;
    freezing_level_height?: Array<number | null>;
  };
  minutely_15?: {
    time: string[];
    precipitation: Array<number | null>;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: Array<number | null>;
    precipitation_probability_max: Array<number | null>;
    precipitation_sum: Array<number | null>;
    wind_speed_10m_max: Array<number | null>;
  };
}

export interface GeocodingResponse {
  results?: Array<{
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    country_code?: string;
    admin1?: string;
    timezone?: string;
    population?: number;
  }>;
}

export interface AirQualityResponse {
  current: {
    us_aqi: number | null;
    european_aqi: number | null;
    pm2_5: number | null;
    pm10: number | null;
    ozone: number | null;
    nitrogen_dioxide: number | null;
    sulphur_dioxide: number | null;
    alder: number | null;
    birch: number | null;
    grass: number | null;
    mugwort: number | null;
    olive: number | null;
    ragweed: number | null;
  };
  hourly?: {
    time: string[];
    us_aqi: Array<number | null>;
    european_aqi: Array<number | null>;
    pm2_5: Array<number | null>;
    pm10: Array<number | null>;
  };
}
