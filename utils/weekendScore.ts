import { t, tDay, tDayFull } from './i18n';
import { localIsoToEpoch } from './format';
import type { HourPoint } from '../api/types';

export interface WeekendVerdict {
  /** Localized "Saturday wins — plan outside then" line. */
  line: string;
}

/**
 * Golden-weekend chip: score this Saturday vs this Sunday with the same
 * penalty ingredients the best-window card scores hours against (rain, UV,
 * wind, apparent temperature), then crown a winner. Returns null before
 * either weekend day has hourly data in the cached slice.
 *
 * Each day scores its daylight hours; ties (within 5 points) go to Saturday
 * only when Saturday is genuinely pleasant (>= 45), otherwise reported even.
 */
export function weekendVerdict(hourly: HourPoint[], now: Date = new Date()): WeekendVerdict | null {
  if (!hourly.length) return null;
  const dayOffset = (6 - now.getDay() + 7) % 7;
  const saturday = new Date(now);
  saturday.setDate(now.getDate() + dayOffset);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  const stampOf = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const satStamp = stampOf(saturday);
  const sunStamp = stampOf(sunday);

  const scoreDay = (stamp: string): number | null => {
    const hours = hourly
      .filter((hour) => hour.isDay && hour.time.slice(0, 10) === stamp)
      .sort((a, b) => localIsoToEpoch(a.time) - localIsoToEpoch(b.time));
    if (!hours.length) return null;
    const penalties = hours.map((hour) => {
      let penalty = Math.min(hour.precipProbability * 0.9, 45);
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

  const satName = tDayFull(saturday.getDay()) || tDay(saturday.getDay());
  const sunName = tDayFull(sunday.getDay()) || tDay(sunday.getDay());
  if (Math.abs(satScore - sunScore) < 5 || (satScore < 45 && sunScore < 45)) {
    return { line: t('weekend_even').replace('{sat}', satName).replace('{sun}', sunName) };
  }
  const winner = satScore > sunScore ? satName : sunName;
  return { line: t('weekend_winner').replace('{day}', winner) };
}
