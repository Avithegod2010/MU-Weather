import { t, tDay, tDayFull } from './i18n';
import { describeWmo } from './wmo';
import type { HourPoint } from '../api/types';

export interface WeekendVerdict {
  /** Localized "Saturday wins — plan outside then" line. */
  line: string;
}

/**
 * Golden-weekend chip: score this Saturday vs this Sunday with the same
 * penalty ingredients the best-window card scores hours against (rain, UV,
 * wind, apparent temperature, thunder as an outright veto), then crown a
 * winner. Returns null before either weekend day has hourly data.
 *
 * Each day scores its daylight hours from the current hour onward. Ties
 * (within 5 points) and weekends where both days score below 45 are reported
 * even. All date math runs on the forecast location's wall-clock stamps
 * derived from the data itself, so a saved city in another timezone scores
 * its own weekend rather than the device's.
 */
export function weekendVerdict(hourly: HourPoint[]): WeekendVerdict | null {
  if (!hourly.length) return null;
  // The isNow hour carries the location's current wall-clock stamp.
  const nowIso = hourly.find((hour) => hour.isNow)?.time ?? '';
  const todayStamp = (nowIso || hourly[0].time).slice(0, 10);
  const todayMs = Date.parse(`${todayStamp}T00:00:00Z`);
  if (Number.isNaN(todayMs)) return null;
  const dayOffset = (6 - new Date(todayMs).getUTCDay() + 7) % 7;
  const satStamp = new Date(todayMs + dayOffset * 86_400_000).toISOString().slice(0, 10);
  const sunStamp = new Date(todayMs + (dayOffset + 1) * 86_400_000).toISOString().slice(0, 10);

  const scoreDay = (stamp: string): number | null => {
    const hours = hourly
      .filter(
        (hour) =>
          hour.isDay &&
          hour.time.slice(0, 10) === stamp &&
          // Hours earlier today have already happened — they don't vote.
          (!nowIso || hour.time >= nowIso),
      )
      .sort((a, b) => (a.time < b.time ? -1 : 1));
    if (!hours.length) return null;
    const penalties = hours.map((hour) => {
      let penalty = Math.min(hour.precipProbability * 0.9, 45);
      // Thunder is an outright veto, not a nudge (mirrors utils/bestWindow.ts).
      if (describeWmo(hour.weatherCode).condition === 'thunder') penalty += 60;
      const uv = hour.uvIndex ?? 0;
      if (uv >= 8) penalty += 12;
      else if (uv >= 6) penalty += 6;
      const wind = Math.max(hour.windSpeed, hour.windGusts / 1.4);
      if (wind >= 40) penalty += 18;
      else if (wind >= 25) penalty += 8;
      if (hour.apparent < 15) penalty += Math.min((15 - hour.apparent) * 1.6, 30);
      else if (hour.apparent > 26) penalty += Math.min((hour.apparent - 26) * 2.2, 30);
      return penalty;
    });
    const average = penalties.reduce((sum, value) => sum + value, 0) / penalties.length;
    return Math.max(0, Math.min(100, Math.round(100 - average)));
  };

  const satScore = scoreDay(satStamp);
  const sunScore = scoreDay(sunStamp);
  if (satScore === null || sunScore === null) return null;

  const satName = tDayFull(6) || tDay(6);
  const sunName = tDayFull(0) || tDay(0);
  if (Math.abs(satScore - sunScore) < 5 || (satScore < 45 && sunScore < 45)) {
    return { line: t('weekend_even').replace('{sat}', satName).replace('{sun}', sunName) };
  }
  const winner = satScore > sunScore ? satName : sunName;
  return { line: t('weekend_winner').replace('{day}', winner) };
}
