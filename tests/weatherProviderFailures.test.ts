import { ApiError, fetchWeather } from '../api/openMeteo';
import type { ForecastResponse, GeoLocation } from '../api/types';
import { transitionWeatherOffline } from '../utils/weatherOfflinePolicy';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const location: GeoLocation = {
  id: 'geo-test',
  name: 'Test City',
  latitude: 21.25,
  longitude: 81.63,
  countryCode: 'IN',
};

function forecastFixture(): ForecastResponse {
  const today = new Date().toISOString().slice(0, 10);
  const times = Array.from({ length: 24 }, (_, hour) => `${today}T${String(hour).padStart(2, '0')}:00`);
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: 'UTC',
    utc_offset_seconds: 0,
    current: {
      time: times[Math.min(23, new Date().getUTCHours())],
      temperature_2m: 31,
      relative_humidity_2m: 45,
      apparent_temperature: 33,
      is_day: 1,
      precipitation: 0,
      weather_code: 1,
      cloud_cover: 10,
      pressure_msl: 1008,
      wind_speed_10m: 12,
      wind_direction_10m: 180,
      wind_gusts_10m: 16,
    },
    hourly: {
      time: times,
      temperature_2m: times.map(() => 31),
      apparent_temperature: times.map(() => 33),
      weather_code: times.map(() => 1),
      precipitation_probability: times.map(() => 0),
      precipitation: times.map(() => 0),
      is_day: times.map(() => 1),
      dew_point_2m: times.map(() => 18),
      visibility: times.map(() => 10000),
      pressure_msl: times.map(() => 1008),
      wind_speed_10m: times.map(() => 12),
      wind_gusts_10m: times.map(() => 16),
      wind_direction_10m: times.map(() => 180),
      uv_index: times.map(() => 5),
      relative_humidity_2m: times.map(() => 45),
      cape: times.map(() => 0),
      snow_depth: times.map(() => 0),
      snowfall: times.map(() => 0),
      freezing_level_height: times.map(() => 5000),
    },
    minutely_15: { time: [], precipitation: [] },
    daily: {
      time: [today],
      weather_code: [1],
      temperature_2m_max: [33],
      temperature_2m_min: [22],
      sunrise: [`${today}T06:00`],
      sunset: [`${today}T18:00`],
      uv_index_max: [6],
      precipitation_probability_max: [0],
      precipitation_sum: [0],
      wind_speed_10m_max: [20],
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

async function testPartialProviderFailure(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const forecast = forecastFixture();
  let requests = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests += 1;
    const url = new URL(String(input));
    if (url.hostname === 'api.open-meteo.com') return jsonResponse(forecast);
    return jsonResponse({ error: 'air quality temporarily unavailable' }, 503);
  }) as typeof fetch;
  try {
    const bundle = await fetchWeather(location);
    assert(requests === 2, 'forecast and optional air-quality providers are requested deterministically');
    assert(bundle.current.temperature === 31 && bundle.hourly.length > 0, 'primary forecast remains usable when the optional provider fails');
    assert(bundle.airQualityStatus === 'unavailable' && bundle.aqi === null && bundle.aqiHourly.length === 0,
      'an unavailable AQI provider remains explicit instead of fabricating air-quality data');
    assert(typeof bundle.current.observationTime === 'string', 'current observation retains its provider-local timestamp');
    assert(transitionWeatherOffline(true, 'success') === false,
      'a usable partial-provider forecast clears a previous offline flag');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testDeterministicPrimaryFailures(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const scenarios = [
    { kind: 'network', requestError: true, expected: 'network' as const },
    { kind: 'server', status: 503, expected: 'server' as const },
    { kind: 'parse', malformed: true, expected: 'parse' as const },
  ];
  try {
    for (const scenario of scenarios) {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.hostname === 'api.open-meteo.com') {
          if ('requestError' in scenario && scenario.requestError) throw new TypeError('offline fixture');
          if ('status' in scenario && scenario.status) return jsonResponse({}, scenario.status);
          if ('malformed' in scenario && scenario.malformed) {
            return { ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON fixture'); } } as unknown as Response;
          }
        }
        return jsonResponse({}, 503);
      }) as typeof fetch;
      let caught: unknown;
      try {
        await fetchWeather(location);
      } catch (error) {
        caught = error;
      }
      assert(caught instanceof ApiError && caught.kind === scenario.expected,
        `${scenario.kind} failures retain their deterministic ApiError classification`);
      assert(transitionWeatherOffline(false, scenario.expected === 'network' ? 'network-failure' : 'other-failure') ===
        (scenario.expected === 'network'), `${scenario.kind} errors follow the offline transition policy`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void testPartialProviderFailure()
  .then(testDeterministicPrimaryFailures)
  .then(() => console.log('offline, partial-provider, and deterministic primary-failure tests passed'))
  .catch((error: unknown) => {
    console.error(error);
    throw error;
  });
