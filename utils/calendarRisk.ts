import type { DayPoint, HourPoint } from '../api/types';

export type CalendarRainRisk = 'low' | 'high';

/**
 * Rain risk of a calendar event from the forecast already on screen.
 *
 * A timed event reads the hourly bucket covering its start hour; an all-day
 * event (or a timed event whose hour fell out of the cached hourly slice)
 * falls back to the day's max probability. Nothing here fetches — the hook
 * hands in the same `daily` array the card already renders plus `hourly`.
 */
export interface CalendarRainInput {
  start: Date;
  allDay: boolean;
  daily: DayPoint[];
  hourly: HourPoint[];
}

const HIGH_RISK_THRESHOLD = 40;

function dayIndexFor(daily: DayPoint[], date: Date): number {
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return daily.findIndex((day) => day.date === stamp);
}

function hourIndexFor(hourly: HourPoint[], date: Date): number {
  return hourly.findIndex((hour) => {
    const point = new Date(hour.time);
    return (
      point.getFullYear() === date.getFullYear() &&
      point.getMonth() === date.getMonth() &&
      point.getDate() === date.getDate() &&
      point.getHours() === date.getHours()
    );
  });
}

/** Chance of rain (0-100) during the event, or null when it cannot be read. */
export function calendarEventRainChance(input: CalendarRainInput): number | null {
  if (!input.allDay) {
    const hourIndex = hourIndexFor(input.hourly, input.start);
    if (hourIndex >= 0) return input.hourly[hourIndex]?.precipProbability ?? null;
  }
  const dayIndex = dayIndexFor(input.daily, input.start);
  if (dayIndex < 0) return null;
  return input.daily[dayIndex]?.precipProbabilityMax ?? null;
}

export function calendarRainRisk(chance: number | null): CalendarRainRisk {
  return chance !== null && chance >= HIGH_RISK_THRESHOLD ? 'high' : 'low';
}
