import { useEffect, useState } from 'react';
import * as Calendar from 'expo-calendar';
import type { DayPoint } from '../api/types';

export interface CalendarEventWithWeather {
  id: string;
  title: string;
  start: Date;
  allDay: boolean;
  dayLabel: string;
  icon: string | null;
  tMax: number | null;
  tMin: number | null;
}

export interface CalendarWeatherState {
  status: 'idle' | 'checking' | 'granted' | 'denied' | 'empty' | 'ready';
  events: CalendarEventWithWeather[];
}

function dayLabelFor(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, tomorrow)) return 'Tomorrow';
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
}

export function useCalendarWeather(
  enabled: boolean,
  daily: DayPoint[],
): CalendarWeatherState {
  const [state, setState] = useState<CalendarWeatherState>({ status: 'idle', events: [] });

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle', events: [] });
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        setState((previous) => ({ ...previous, status: 'checking' }));
        const { status } = await Calendar.requestCalendarPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setState({ status: 'denied', events: [] });
          return;
        }
        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        if (cancelled) return;
        const calendarIds = calendars.map((calendar) => calendar.id);
        if (!calendarIds.length) {
          setState({ status: 'empty', events: [] });
          return;
        }
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        const events = await Calendar.getEventsAsync(calendarIds, start, end);
        if (cancelled) return;

        const mapped: CalendarEventWithWeather[] = events
          .filter((event) => event.title && event.title.trim().length > 0)
          .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
          .slice(0, 6)
          .map((event) => {
            const eventDate = new Date(event.startDate);
            const dayIndex = daily.findIndex((day) => {
              const dayDate = new Date(`${day.date}T00:00:00`);
              return (
                dayDate.getDate() === eventDate.getDate() &&
                dayDate.getMonth() === eventDate.getMonth()
              );
            });
            const day = dayIndex >= 0 ? daily[dayIndex] : null;
            return {
              id: event.id,
              title: event.title,
              start: eventDate,
              allDay: event.allDay ?? false,
              dayLabel: dayLabelFor(eventDate),
              tMax: day ? day.tMax : null,
              tMin: day ? day.tMin : null,
              icon: day ? String(day.weatherCode) : null,
            };
          });

        setState({ status: mapped.length ? 'ready' : 'empty', events: mapped });
      } catch {
        if (!cancelled) setState({ status: 'denied', events: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, daily]);

  return state;
}
