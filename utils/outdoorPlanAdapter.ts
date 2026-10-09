import type { AqiHourPoint, HourPoint, WeatherBundle } from '../api/types';
import { localIsoToEpoch } from './format';
import {
  recommendOutdoorWindows,
  type OutdoorForecastHour,
  type OutdoorPlanOptions,
  type OutdoorPlanResult,
  type OutdoorPreferences,
} from './outdoorPlanPolicy';

export type OutdoorAqiScale = 'us' | 'european';

/** Join hourly weather and air-quality values by the provider's local ISO hour. */
export function buildOutdoorForecastHours(
  hours: HourPoint[],
  aqiHours: AqiHourPoint[],
  fetchedAt: number,
  utcOffsetSeconds: number,
  aqiScale: OutdoorAqiScale,
): OutdoorForecastHour[] {
  const aqiByTime = new Map(aqiHours.map((point) => [point.time, point]));
  return hours.flatMap((hour) => {
    const wallClockEpoch = localIsoToEpoch(hour.time);
    if (!Number.isFinite(wallClockEpoch)) return [];
    const aqiPoint = aqiByTime.get(hour.time);
    const aqi = aqiScale === 'us'
      ? aqiPoint?.usAqi ?? aqiPoint?.euAqi ?? null
      : aqiPoint?.euAqi ?? aqiPoint?.usAqi ?? null;
    return [{
      // API hour labels are location-local wall time. Apply the forecast's
      // current offset before comparing against the device epoch clock.
      at: wallClockEpoch - utcOffsetSeconds * 1000,
      fetchedAt,
      rainProbability: Number.isFinite(hour.precipProbability) ? hour.precipProbability : null,
      temperatureC: Number.isFinite(hour.apparent) ? hour.apparent : null,
      windKmh: Number.isFinite(hour.windSpeed) && Number.isFinite(hour.windGusts)
        ? Math.max(hour.windSpeed, hour.windGusts)
        : Number.isFinite(hour.windSpeed)
          ? hour.windSpeed
          : Number.isFinite(hour.windGusts)
            ? hour.windGusts
            : null,
      uvIndex: Number.isFinite(hour.uvIndex) ? hour.uvIndex : null,
      aqi: typeof aqi === 'number' && Number.isFinite(aqi) ? aqi : null,
    }];
  });
}

/** Apply the pure outdoor policy to one fetched weather bundle. */
export function planOutdoorWeather(
  bundle: Pick<WeatherBundle, 'hourly' | 'aqiHourly' | 'fetchedAt' | 'utcOffsetSeconds'>,
  preferences: Partial<OutdoorPreferences> | null | undefined,
  aqiScale: OutdoorAqiScale,
  options: OutdoorPlanOptions = {},
): OutdoorPlanResult {
  const hours = buildOutdoorForecastHours(
    bundle.hourly,
    bundle.aqiHourly,
    bundle.fetchedAt,
    bundle.utcOffsetSeconds,
    aqiScale,
  );
  return recommendOutdoorWindows(hours, preferences, options);
}
