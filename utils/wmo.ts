import type { WeatherCondition } from '../theme/palettes';

export interface WmoInfo {
  label: string;
  condition: WeatherCondition;
}

const WMO_MAP: Record<number, WmoInfo> = {
  0: { label: 'Clear Sky', condition: 'clear' },
  1: { label: 'Mainly Clear', condition: 'clear' },
  2: { label: 'Partly Cloudy', condition: 'partlyCloudy' },
  3: { label: 'Overcast', condition: 'cloudy' },
  45: { label: 'Foggy', condition: 'fog' },
  48: { label: 'Rime Fog', condition: 'fog' },
  51: { label: 'Light Drizzle', condition: 'drizzle' },
  53: { label: 'Drizzle', condition: 'drizzle' },
  55: { label: 'Heavy Drizzle', condition: 'drizzle' },
  56: { label: 'Freezing Drizzle', condition: 'freezing' },
  57: { label: 'Freezing Drizzle', condition: 'freezing' },
  61: { label: 'Light Rain', condition: 'rain' },
  63: { label: 'Rain', condition: 'rain' },
  65: { label: 'Heavy Rain', condition: 'rain' },
  66: { label: 'Freezing Rain', condition: 'freezing' },
  67: { label: 'Freezing Rain', condition: 'freezing' },
  71: { label: 'Light Snow', condition: 'snow' },
  73: { label: 'Snowfall', condition: 'snow' },
  75: { label: 'Heavy Snow', condition: 'snow' },
  77: { label: 'Snow Grains', condition: 'snow' },
  80: { label: 'Light Showers', condition: 'showers' },
  81: { label: 'Rain Showers', condition: 'showers' },
  82: { label: 'Violent Showers', condition: 'showers' },
  85: { label: 'Snow Showers', condition: 'snow' },
  86: { label: 'Heavy Snow Showers', condition: 'snow' },
  95: { label: 'Thunderstorm', condition: 'thunder' },
  96: { label: 'Storms with Hail', condition: 'thunder' },
  99: { label: 'Severe Storms', condition: 'thunder' },
};

export function describeWmo(code: number | null | undefined): WmoInfo {
  if (code === null || code === undefined || WMO_MAP[code] === undefined) {
    return { label: 'Unknown', condition: 'cloudy' };
  }
  return WMO_MAP[code];
}
