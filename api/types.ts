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
  pm2_5: number | null;
  pm10: number | null;
  ozone: number | null;
  no2: number | null;
  so2: number | null;
  pollen: PollenInfo | null;
}

export interface MinutelyPoint {
  time: string;
  precipitation: number;
}

export interface WeatherBundle {
  location: GeoLocation;
  utcOffsetSeconds: number;
  current: CurrentConditions;
  hourly: HourPoint[];
  minutely: MinutelyPoint[];
  daily: DayPoint[];
  aqi: AqiInfo | null;
  fetchedAt: number;
}

export interface ForecastResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  utc_offset_seconds: number;
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
}
