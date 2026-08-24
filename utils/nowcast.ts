import { formatHourLabel } from './format';
import type { MinutelyPoint } from '../api/types';

export type NowcastKind = 'dry' | 'starting' | 'stopping' | 'ongoing';

export interface Nowcast {
  kind: NowcastKind;
  headline: string;
  minutesUntilChange: number | null;
  changeTime: string | null;
  peakMm: number;
  wet: boolean;
}

const WET_THRESHOLD = 0.02;

export function computeNowcast(minutely: MinutelyPoint[]): Nowcast {
  if (!minutely.length) {
    return { kind: 'dry', headline: 'No minute-level data', minutesUntilChange: null, changeTime: null, peakMm: 0, wet: false };
  }

  const peakMm = minutely.reduce((max, point) => Math.max(max, point.precipitation), 0);
  const currentlyWet = minutely[0].precipitation >= WET_THRESHOLD;

  if (!currentlyWet) {
    const startIndex = minutely.findIndex((point) => point.precipitation >= WET_THRESHOLD);
    if (startIndex === -1) {
      return {
        kind: 'dry',
        headline: 'No rain expected in the next 3 hours',
        minutesUntilChange: null,
        changeTime: null,
        peakMm,
        wet: false,
      };
    }
    const minutes = startIndex * 15;
    const time = minutely[startIndex].time;
    return {
      kind: 'starting',
      headline:
        minutes <= 45
          ? `Rain starting in about ${minutes} min`
          : `Rain expected around ${formatHourLabel(time, false)}`,
      minutesUntilChange: minutes,
      changeTime: time,
      peakMm,
      wet: false,
    };
  }

  const stopIndex = minutely.findIndex((point) => point.precipitation < WET_THRESHOLD);
  if (stopIndex === -1) {
    return {
      kind: 'ongoing',
      headline: 'Rain continuing through the next 3 hours',
      minutesUntilChange: null,
      changeTime: null,
      peakMm,
      wet: true,
    };
  }
  const minutes = stopIndex * 15;
  const time = minutely[stopIndex].time;
  return {
    kind: 'stopping',
    headline: minutes <= 45 ? `Rain easing in about ${minutes} min` : `Rain easing around ${formatHourLabel(time, false)}`,
    minutesUntilChange: minutes,
    changeTime: time,
    peakMm,
    wet: true,
  };
}
