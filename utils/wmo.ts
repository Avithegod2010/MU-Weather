import type { WeatherCondition } from '../theme/palettes';
import { t, tWmo } from './i18n';

export interface WmoInfo {
  label: string;
  condition: WeatherCondition;
}

const WMO_CONDITIONS: Record<number, WeatherCondition> = {
  0: 'clear',
  1: 'clear',
  2: 'partlyCloudy',
  3: 'cloudy',
  45: 'fog',
  48: 'fog',
  51: 'drizzle',
  53: 'drizzle',
  55: 'drizzle',
  56: 'freezing',
  57: 'freezing',
  61: 'rain',
  63: 'rain',
  65: 'rain',
  66: 'freezing',
  67: 'freezing',
  71: 'snow',
  73: 'snow',
  75: 'snow',
  77: 'snow',
  80: 'showers',
  81: 'showers',
  82: 'showers',
  85: 'snow',
  86: 'snow',
  95: 'thunder',
  96: 'thunder',
  99: 'thunder',
};

export function describeWmo(code: number | null | undefined): WmoInfo {
  if (code === null || code === undefined || WMO_CONDITIONS[code] === undefined) {
    return { label: t('wmo_unknown'), condition: 'cloudy' };
  }
  return { label: tWmo(code), condition: WMO_CONDITIONS[code] };
}
