import { t } from './i18n';
import { formatTemp, convertWind, windUnitLabel, formatClockParts } from './format';
import { describeWmo } from './wmo';
import { windshieldFrostLine } from './frostLine';
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
        ? t('hl_rain_soon').replace('{n}', String(nowcast.minutesUntilChange))
        : t('hl_rain_incoming').replace('{n}', String(Math.round(nowcast.minutesUntilChange / 15) * 15)),
    });
  } else if (nowcast.wet) {
    highlights.push({
      icon: 'rain',
      text: nowcast.kind === 'stopping'
        ? t('hl_rain_easing')
        : t('hl_rain_steady'),
    });
  }

  if (window.length) {
    const storm = window.find((hour) => describeWmo(hour.weatherCode).condition === 'thunder');
    if (storm) {
      highlights.push({ icon: 'thunder', text: t('hl_thunder') });
    }
  }

  if (today && tomorrow) {
    const diff = Math.round(tomorrow.tMax - today.tMax);
    if (diff >= 2) {
      highlights.push({ icon: 'tempUp', text: t('hl_warmer').replace('{high}', formatTemp(tomorrow.tMax)).replace('{low}', formatTemp(today.tMax)) });
    } else if (diff <= -2) {
      highlights.push({ icon: 'tempDown', text: t('hl_cooler').replace('{high}', formatTemp(tomorrow.tMax)) });
    }
  }

  if (today) {
    const swing = Math.round(today.tMax - today.tMin);
    if (swing >= 14) {
      highlights.push({ icon: 'swing', text: t('hl_swing').replace('{low}', formatTemp(today.tMin)).replace('{high}', formatTemp(today.tMax)) });
    }
  }

  if (data.current.windGusts >= 40) {
    highlights.push({ icon: 'wind', text: t('hl_gusts').replace('{n}', String(Math.round(convertWind(data.current.windGusts)))).replace('{unit}', windUnitLabel()) });
  }

  if (today && today.uvIndexMax >= 6) {
    highlights.push({ icon: 'uv', text: t('hl_uv').replace('{n}', String(Math.round(today.uvIndexMax))).replace('{from}', formatClockParts(11, 0)).replace('{to}', formatClockParts(15, 0)) });
  }

  if (today && today.tMin <= 0) {
    const base = t('hl_frost').replace('{t}', formatTemp(today.tMin));
    const scrape = windshieldFrostLine(today, data.hourly);
    highlights.push({ icon: 'frost', text: scrape ? base + ' ' + scrape : base });
  }

  if (data.aqi?.usAqi != null && data.aqi.usAqi > 150) {
    highlights.push({ icon: 'aqi', text: t('hl_aqi').replace('{n}', String(Math.round(data.aqi.usAqi))) });
  }

  return highlights.slice(0, 4);
}
