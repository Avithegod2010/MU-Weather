import { formatTemp } from './format';
import { describeWmo } from './wmo';
import { computeNowcast } from './nowcast';
import type { Nowcast } from './nowcast';
import type { WeatherBundle } from '../api/types';

export type HighlightIcon =
  | 'rain'
  | 'thunder'
  | 'tempUp'
  | 'tempDown'
  | 'swing'
  | 'wind'
  | 'uv'
  | 'frost'
  | 'aqi';

export interface Highlight {
  icon: HighlightIcon;
  text: string;
}

export function computeHighlights(data: WeatherBundle, nowcast: Nowcast): Highlight[] {
  const highlights: Highlight[] = [];
  const today = data.daily[0] ?? null;
  const tomorrow = data.daily[1] ?? null;
  const window = data.hourly.slice(0, 12);

  if (nowcast.kind === 'starting' && nowcast.minutesUntilChange !== null && nowcast.minutesUntilChange <= 90) {
    highlights.push({
      icon: 'rain',
      text: nowcast.minutesUntilChange <= 45
        ? `Umbrella alert — rain begins in about ${nowcast.minutesUntilChange} minutes`
        : `Rain is on its way — expect it within the next ${Math.round(nowcast.minutesUntilChange / 15) * 15} minutes`,
    });
  } else if (nowcast.wet) {
    highlights.push({
      icon: 'rain',
      text: nowcast.kind === 'stopping'
        ? 'Rain is falling now but should ease off soon'
        : 'Steady rain right now — keep the umbrella handy',
    });
  }

  if (window.length) {
    const storm = window.find((hour) => describeWmo(hour.weatherCode).condition === 'thunder');
    if (storm) {
      highlights.push({ icon: 'thunder', text: 'Thunderstorms appear in today\'s forecast — best to plan indoor time' });
    }
  }

  if (today && tomorrow) {
    const diff = Math.round(tomorrow.tMax - today.tMax);
    if (diff >= 2) {
      highlights.push({ icon: 'tempUp', text: `Warmer tomorrow — up to ${formatTemp(tomorrow.tMax)} (today ${formatTemp(today.tMax)})` });
    } else if (diff <= -2) {
      highlights.push({ icon: 'tempDown', text: `Cooler tomorrow — topping out near ${formatTemp(tomorrow.tMax)}` });
    }
  }

  if (today) {
    const swing = Math.round(today.tMax - today.tMin);
    if (swing >= 14) {
      highlights.push({ icon: 'swing', text: `Big temperature swing today — ${formatTemp(today.tMin)} to ${formatTemp(today.tMax)}, dress in layers` });
    }
  }

  if (data.current.windGusts >= 40) {
    highlights.push({ icon: 'wind', text: `Gusty conditions — gusts reaching ${Math.round(data.current.windGusts)} km/h` });
  }

  if (today && today.uvIndexMax >= 6) {
    highlights.push({ icon: 'uv', text: `Very high UV today (${Math.round(today.uvIndexMax)}) — sunscreen between 11 AM and 3 PM` });
  }

  if (today && today.tMin <= 0) {
    highlights.push({ icon: 'frost', text: `Frost likely tonight — lows near ${formatTemp(today.tMin)}` });
  }

  if (data.aqi?.usAqi != null && data.aqi.usAqi > 150) {
    highlights.push({ icon: 'aqi', text: `Air quality is poor (AQI ${Math.round(data.aqi.usAqi)}) — limit outdoor exertion` });
  }

  return highlights.slice(0, 4);
}
