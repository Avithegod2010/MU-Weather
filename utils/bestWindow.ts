import { t } from './i18n';
import { formatHourLabel, localIsoToEpoch } from './format';
import { describeWmo } from './wmo';
import type { HourPoint } from '../api/types';

export interface BestWindow {
  /** Local wall-clock ISO of the window's first hour. */
  start: string;
  /** Local wall-clock ISO of the window's last hour. */
  end: string;
  /** 0-100 comfort score for the window. */
  score: number;
}

/**
 * Discomfort penalty for a single hour. Mirrors the ingredient list the activity
 * planner scores against (precipitation, UV, wind, apparent temperature) so the
 * two surfaces never disagree about what makes an hour unpleasant.
 */
function hourPenalty(hour: HourPoint): number {
  let penalty = 0;
  // Rain probability is the dominant term: a wet hour can never score well.
  penalty += Math.min(hour.precipProbability * 0.9, 45);
  const uv = hour.uvIndex ?? 0;
  if (hour.isDay && uv >= 8) penalty += 12;
  else if (hour.isDay && uv >= 6) penalty += 6;
  // Gusts are the thing you actually feel, so they lead the wind term.
  const wind = Math.max(hour.windSpeed, hour.windGusts / 1.4);
  if (wind >= 40) penalty += 18;
  else if (wind >= 25) penalty += 8;
  // Apparent temperature: comfortable band is 15-26 C, cost rises outside it.
  if (hour.apparent < 15) penalty += Math.min((15 - hour.apparent) * 1.6, 30);
  else if (hour.apparent > 26) penalty += Math.min((hour.apparent - 26) * 2.2, 30);
  // Thunder is an outright veto, not a nudge.
  if (describeWmo(hour.weatherCode).condition === 'thunder') penalty += 60;
  return penalty;
}

function blockScore(hours: HourPoint[]): number {
  const average = hours.reduce((sum, hour) => sum + hourPenalty(hour), 0) / Math.max(hours.length, 1);
  return Math.max(0, Math.min(100, Math.round(100 - average)));
}

/**
 * "Best time outdoors today": slide a 2-hour window across today's remaining
 * daylight hours and return the highest-scoring block. Bounded to the calendar
 * day that contains the `isNow` marker so a block never straddles midnight into
 * tomorrow. Returns null when under two usable hours remain — the card is meant
 * to disappear then rather than promise a window that has already passed.
 */
export function computeBestWindow(hourly: HourPoint[]): BestWindow | null {
  if (!hourly.length) return null;
  const nowIndex = hourly.findIndex((hour) => hour.isNow);
  const anchor = hourly[nowIndex >= 0 ? nowIndex : 0];
  const dayKey = anchor.time.slice(0, 10);
  const dayHours = hourly
    .filter((hour) => hour.isDay && hour.time.slice(0, 10) === dayKey)
    .sort((a, b) => localIsoToEpoch(a.time) - localIsoToEpoch(b.time));
  if (dayHours.length < 2) return null;

  let best: BestWindow | null = null;
  for (let i = 0; i + 1 < dayHours.length; i++) {
    const block = [dayHours[i], dayHours[i + 1]];
    const score = blockScore(block);
    if (!best || score > best.score) {
      best = { start: block[0].time, end: block[1].time, score };
    }
  }
  return best;
}

/** Localized one-liner for the card, e.g. "2 PM – 4 PM looks best today". */
export function bestWindowLine(window: BestWindow): string {
  const range = `${formatHourLabel(window.start, false)} – ${formatHourLabel(window.end, false)}`;
  return t('best_window_line').replace('{time}', range);
}
