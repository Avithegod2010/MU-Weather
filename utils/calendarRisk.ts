import type { DayPoint, HourPoint } from '../api/types';

export type CalendarRainRisk = 'low' | 'high';

/**
 * Rain risk of a calendar event from the forecast already on screen.
 *
 * A timed event's instant is shifted into the forecast location's wall clock
 * (via the bundle's UTC offset) before its hourly bucket is matched, so a
 * saved city in another timezone reads the right hour; an all-day event
 * matches on the calendar date the user sees on their device. A timed event
 * whose hour fell out of the cached hourly slice falls back to that location
 * day's max probability. Nothing here fetches — the hook hands in the same
 * `daily` array the card already renders plus `hourly`.
 */
export interface CalendarRainInput {
  start: Date;
  allDay: boolean;
  daily: DayPoint[];
  hourly: HourPoint[];
  /** WeatherBundle.utcOffsetSeconds — enables cross-timezone hour matching. */
  utcOffsetSeconds?: number;
}

const HIGH_RISK_THRESHOLD = 40;

const pad2 = (value: number) => String(value).padStart(2, '0');

/** Calendar date the user sees (device wall clock) — how an all-day event is dated. */
function deviceStamp(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Wall-clock date + hour of an instant in the forecast location's timezone.
 * Without an explicit offset this degrades to the device's own wall clock
 * (the old behaviour), which is correct when device and location agree.
 */
function locationWall(date: Date, utcOffsetSeconds?: number): { stamp: string; hour: string } {
  const offset = utcOffsetSeconds ?? -date.getTimezoneOffset() * 60;
  const shifted = new Date(date.getTime() + offset * 1000);
  return {
    stamp: `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`,
    hour: pad2(shifted.getUTCHours()),
  };
}

/** Chance of rain (0-100) during the event, or null when it cannot be read. */
export function calendarEventRainChance(input: CalendarRainInput): number | null {
  if (!input.allDay) {
    const wall = locationWall(input.start, input.utcOffsetSeconds);
    const hit = input.hourly.find(
      (hour) => hour.time.slice(0, 10) === wall.stamp && hour.time.slice(11, 13) === wall.hour,
    );
    if (hit) return hit.precipProbability;
    const dayIndex = input.daily.findIndex((day) => day.date === wall.stamp);
    if (dayIndex < 0) return null;
    return input.daily[dayIndex]?.precipProbabilityMax ?? null;
  }
  const dayIndex = input.daily.findIndex((day) => day.date === deviceStamp(input.start));
  if (dayIndex < 0) return null;
  return input.daily[dayIndex]?.precipProbabilityMax ?? null;
}

export function calendarRainRisk(chance: number | null): CalendarRainRisk {
  return chance !== null && chance >= HIGH_RISK_THRESHOLD ? 'high' : 'low';
}
