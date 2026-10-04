import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WeatherBundle } from '../api/types';
import { computeTwilight } from '../utils/twilight';
import { describeFreshness, widgetUpdatedLabel } from '../utils/widgetFreshness';

const C = {
  dark: {
    bgFrom: '#2A1E3F',
    bgTo: '#5A3B63',
    text: '#FFFFFF',
    subtle: '#D8C7D8',
    chip: '#3E2C55',
    /** Gold, matching the sun card's arc colour so the two read as one family. */
    gold: '#EFC25C',
    stale: '#F0B429',
  },
} as const;

interface WeatherWidgetSunProps {
  /** False renders the placeholder (no cached bundle at all). */
  hasData: boolean;
  cityName: string;
  /** 'Sunrise' or 'Sunset' - whichever happens next. */
  eventLabel: string;
  /** The next event's clock time, 24h (widget chrome is 24h by convention). */
  eventTime: string;
  /** "in 2 h 14 m", or "" when the moment has arrived. */
  countdown: string;
  /** The other event today, e.g. "Sunset 20:31". */
  otherLine: string;
  /** Shown when the location is in polar day/night (no sunrise or sunset). */
  polarNote: string;
  updatedLabel: string;
  stale: boolean;
}

/**
 * Sunrise/sunset countdown home-screen widget (2x2).
 *
 * All the math is local (utils/twilight computes it from the location's
 * coordinates in the cached bundle), so the widget needs no network of its own
 * and costs nothing to redraw: the system redraws it every 30 minutes and the
 * countdown simply re-derives itself.
 *
 * Times render 24h like the other widgets' hour strips - a headless widget task
 * has no access to the user's time-format setting, and mixed formats across
 * widgets would be worse than one consistent choice.
 */
export function WeatherWidgetSun({
  hasData,
  cityName,
  eventLabel,
  eventTime,
  countdown,
  otherLine,
  polarNote,
  updatedLabel,
  stale,
}: WeatherWidgetSunProps) {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        borderRadius: 20,
        padding: 14,
        backgroundGradient: { from: C.dark.bgFrom, to: C.dark.bgTo, orientation: 'TOP_BOTTOM' },
      }}
      clickAction="OPEN_APP"
    >
      {hasData ? (
        <>
          <FlexWidget
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <TextWidget text="MU Weather" style={{ fontSize: 11, color: C.dark.subtle }} />
            <FlexWidget
              style={{
                backgroundColor: C.dark.chip,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <TextWidget
                text={polarNote || countdown}
                style={{ fontSize: 10, color: polarNote ? C.dark.subtle : C.dark.gold }}
              />
            </FlexWidget>
          </FlexWidget>
          <TextWidget
            text={cityName}
            style={{ fontSize: 13, fontWeight: 'bold', color: C.dark.text, marginTop: 4 }}
          />
          {polarNote ? null : (
            <>
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 }}>
                <TextWidget
                  text={eventTime}
                  style={{ fontSize: 32, fontWeight: 'bold', color: C.dark.gold }}
                />
                <TextWidget
                  text={`  ${eventLabel}`}
                  style={{ fontSize: 13, color: C.dark.text, marginBottom: 6 }}
                />
</FlexWidget>
              <TextWidget
                text={otherLine}
                style={{ fontSize: 11, color: C.dark.subtle, marginTop: 4 }}
              />
            </>
          )}
          <TextWidget
            text={updatedLabel}
            style={{ fontSize: 9, color: stale ? C.dark.stale : C.dark.subtle, marginTop: 6 }}
          />
        </>
      ) : (
        <>
          <TextWidget text="MU Weather" style={{ fontSize: 15, fontWeight: 'bold', color: C.dark.text }} />
          <TextWidget
            text="Open the app once to load weather"
            style={{ fontSize: 11, color: C.dark.subtle, marginTop: 4 }}
          />
        </>
      )}
    </FlexWidget>
  );
}
/** Zero-padded 24h clock, the format every widget in this app uses. */
function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "2 h 14 m" / "14 m" / "" once the moment has passed. */
function countdownTo(target: Date, now: Date): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return '';
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} m`;
  return `${hours} h ${String(minutes).padStart(2, '0')} m`;
}

/** One upcoming solar event, as the widget shows it. */
interface SunEvent {
  date: Date;
  label: string;
}

/**
 * Headless-context convenience: builds the sun widget from a cached bundle.
 *
 * Picks whichever of today's sunrise/sunset is next; when both have passed (or
 * the sun never rises or sets at high latitudes) it looks at tomorrow, and when
 * there is no sunrise or sunset at all it says so instead of showing a time.
 */
export function renderWeatherWidgetSunFromBundle(bundle: WeatherBundle): React.JSX.Element {
  const now = new Date();
  const { latitude, longitude } = bundle.location;
  const today = computeTwilight(now, latitude, longitude);
  const tomorrow = computeTwilight(new Date(now.getTime() + 86400000), latitude, longitude);
  const { stale } = describeFreshness(bundle.fetchedAt);

  // For each event, use today's date when it is still ahead of us, otherwise
// fall back to tomorrow's. Two things make that necessary: computeTwilight
// keys off the UTC calendar day (so in the small hours "today" can be the
// previous local day), and a widget redraw can happen any time of day.
  const events: SunEvent[] = [];
  for (const candidate of [
    { label: 'Sunrise', todayDate: today.sunrise, tomorrowDate: tomorrow.sunrise },
    { label: 'Sunset', todayDate: today.sunset, tomorrowDate: tomorrow.sunset },
  ]) {
    const date =
      candidate.todayDate && candidate.todayDate.getTime() > now.getTime()
        ? candidate.todayDate
        : candidate.tomorrowDate;
    if (date && date.getTime() > now.getTime()) events.push({ date, label: candidate.label });
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  const next = events[0] ?? null;

  const polarNote = next === null ? 'No sunrise or sunset here today' : '';
  const sunriseEvent = events.find((entry) => entry.label === 'Sunrise');
  const sunsetEvent = events.find((entry) => entry.label === 'Sunset');
  const other = !next
    ? ''
    : next.label === 'Sunrise'
      ? sunsetEvent
        ? `Sunset ${clock(sunsetEvent.date)}`
        : ''
      : sunriseEvent
        ? `Sunrise ${clock(sunriseEvent.date)}`
        : '';

  return (
    <WeatherWidgetSun
      hasData
      stale={stale}
      cityName={bundle.location.name}
      eventLabel={next ? next.label : ''}
      eventTime={next ? clock(next.date) : '--:--'}
      countdown={next ? countdownTo(next.date, now) : ''}
      otherLine={other}
      polarNote={polarNote}
      updatedLabel={widgetUpdatedLabel(bundle.fetchedAt)}
    />
  );
}
