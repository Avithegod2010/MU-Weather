import React from 'react';
import { WIDGET_CORNER_RADIUS, widgetGradient, widgetPalette } from '../utils/widgetPalette';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';
import type { DayPoint, WeatherBundle } from '../api/types';
import { describeWmo } from '../utils/wmo';
import { usAqiBand } from '../utils/aqi';
import { describeFreshness, widgetUpdatedLabel } from '../utils/widgetFreshness';

const C = widgetPalette('night');

/** Short weekday names, hardcoded English like the rest of the widget chrome. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface DashboardHour {
  time: string;
  label: string;
  temp: string;
  rain: string;
}

interface DashboardDay {
  date: string;
  label: string;
  high: string;
  low: string;
}

interface WeatherWidgetDashboardProps {
  cityName: string;
  temperature: string;
  conditionLabel: string;
  maxTemp: string;
  minTemp: string;
  rainChance: string;
  precipitation: string;
  updatedLabel: string;
  /** Coarse location-local clock block, e.g. "Tue 14:00". Honest to the hour. */
  clockLabel: string;
  hours: DashboardHour[];
  days: DashboardDay[];
  /** AQI chip text ("AQI 42") or '' when the bundle has no AQI data. */
  aqiLabel: string;
  /** Band colour for the AQI chip, or null when there is no chip. */
  aqiColor: ColorProp | null;
  hasData: boolean;
  stale: boolean;
}

/**
 * Dashboard (4x3) Android home-screen widget: current conditions with a
 * coarse local-time block, a wider hourly strip, a multi-day mini strip and an
 * air-quality chip, rendered through RemoteViews by the
 * react-native-android-widget task handler.
 *
 * All styling goes through the `style` prop (fontSize/color/backgroundColor are
 * style keys in this library, not top-level props). The root and the hourly
 * cells open the app; hourly cells send an `openHour` click with the hour's ISO
 * time so the task handler can focus that hour.
 *
 * CHROME IS HARDCODED ENGLISH on purpose - widget components in this repo never
 * use the i18n store, because a widget is redrawn in a headless background JS
 * context where the stored language may never have been hydrated. The one
 * exception is the AQI *band colour*, which is a palette constant rather than
 * prose, so it is safe to reuse from utils/aqi.
 */
export function WeatherWidgetDashboard({
  cityName,
  temperature,
  conditionLabel,
  maxTemp,
  minTemp,
  rainChance,
  precipitation,
  updatedLabel,
  clockLabel,
  hours,
  days,
  aqiLabel,
  aqiColor,
  hasData,
  stale,
}: WeatherWidgetDashboardProps) {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'column',
        borderRadius: WIDGET_CORNER_RADIUS,
        padding: 14,
        backgroundGradient: widgetGradient(C),
      }}
      clickAction="OPEN_APP"
    >
      {hasData ? (
        <>
          {/* Header: app name + city, then the AQI / rain chips. */}
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <FlexWidget style={{ flexDirection: 'column' }}>
              <TextWidget text="MU Weather" style={{ fontSize: 10, color: C.subtle }} />
              <TextWidget
                text={cityName}
                style={{ fontSize: 12, fontWeight: 'bold', color: C.text, marginTop: 1 }}
              />
            </FlexWidget>
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
              {aqiLabel ? (
                <FlexWidget
                  style={{
                    backgroundColor: C.chip,
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    marginRight: 4,
                  }}
                  clickAction="openTile"
                  clickActionData={{ tile: 'aqi' }}
                  accessibilityLabel={`Air quality ${aqiLabel}`}
                >
                  <TextWidget text={aqiLabel} style={{ fontSize: 10, color: aqiColor ?? C.text }} />
                </FlexWidget>
              ) : null}
              <FlexWidget
                style={{
                  backgroundColor: C.chip,
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
                clickAction="openTile"
                clickActionData={{ tile: 'precipitation' }}
                accessibilityLabel={`Rain ${rainChance}${precipitation ? `, ${precipitation}` : ''}`}
              >
                <TextWidget
                  text={`${rainChance}${precipitation ? ` · ${precipitation}` : ''}`}
                  style={{ fontSize: 10, color: C.text }}
                />
              </FlexWidget>
            </FlexWidget>
          </FlexWidget>
          {/* Current conditions + the coarse local-time block. */}
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
              <TextWidget
                text={temperature}
                style={{ fontSize: 32, fontWeight: 'bold', color: C.text }}
              />
              <TextWidget text={conditionLabel} style={{ fontSize: 11, color: C.subtle, marginTop: 1 }} />
            </FlexWidget>
            <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
              <TextWidget
                text={clockLabel}
                style={{ fontSize: 15, fontWeight: 'bold', color: C.text }}
              />
              <TextWidget text={`H ${maxTemp}`} style={{ fontSize: 11, color: C.text, marginTop: 3 }} />
              <TextWidget text={`L ${minTemp}`} style={{ fontSize: 11, color: C.subtle, marginTop: 2 }} />
              <TextWidget
                text={updatedLabel}
                style={{
                  fontSize: 9,
                  // Stale cache: amber instead of the usual muted blue-grey.
                  color: stale ? C.stale : C.subtle,
                  marginTop: 3,
                }}
              />
            </FlexWidget>
          </FlexWidget>

          {/* Hourly strip - wider than the 4x2 because this cell is 3 rows tall. */}
          <FlexWidget
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              backgroundColor: C.strip,
              borderRadius: 12,
              padding: 8,
              marginTop: 8,
            }}
          >
            {hours.map((hour) => (
              <FlexWidget
                key={hour.time}
                style={{ flexDirection: 'column', alignItems: 'center', flex: 1 }}
                clickAction="openHour"
                clickActionData={{ time: hour.time }}
                accessibilityLabel={`${hour.label}, ${hour.temp}, ${hour.rain} chance of rain`}
              >
                <TextWidget text={hour.label} style={{ fontSize: 9, color: C.subtle }} />
                <TextWidget
                  text={hour.temp}
                  style={{ fontSize: 12, fontWeight: 'bold', color: C.text, marginTop: 3 }}
                />
                <TextWidget text={hour.rain} style={{ fontSize: 9, color: C.subtle, marginTop: 3 }} />
              </FlexWidget>
            ))}
          </FlexWidget>

          {/* Multi-day mini strip. */}
          <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            {days.map((day) => (
              <FlexWidget
                key={day.date}
                style={{ flexDirection: 'column', alignItems: 'center', flex: 1 }}
                accessibilityLabel={`${day.label}, high ${day.high}, low ${day.low}`}
              >
                <TextWidget text={day.label} style={{ fontSize: 9, color: C.subtle }} />
                <TextWidget
                  text={day.high}
                  style={{ fontSize: 12, fontWeight: 'bold', color: C.text, marginTop: 3 }}
                />
                <TextWidget text={day.low} style={{ fontSize: 9, color: C.subtle, marginTop: 2 }} />
              </FlexWidget>
            ))}
          </FlexWidget>
        </>
      ) : (
        <>
          <TextWidget text="MU Weather" style={{ fontSize: 15, fontWeight: 'bold', color: C.text }} />
          <TextWidget
            text="Open the app once to load weather"
            style={{ fontSize: 11, color: C.subtle, marginTop: 4 }}
          />
        </>
      )}
    </FlexWidget>
  );
}

/**
 * `Band.color` is a plain `string`, but this library's style props require the
 * `#rrggbb` template-literal type. Validate rather than cast, so a malformed
 * band colour can never reach RemoteViews.
 */
function asWidgetColor(color: string | undefined): ColorProp | null {
  if (color === undefined || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  // The guard above proves this is a `#rrggbb` literal, which ColorProp requires.
  return color as ColorProp;
}

/**
 * Local-time weekday and hour for a location-local ISO string.
 *
 * `bundle.hourly[].time` is the forecast location's wall clock (the API is
 * queried with the location's timezone), and the same naive-string-to-UTC trick
 * `utils/format.ts` uses means reading the UTC fields back yields exactly the
 * local weekday/hour - independent of the device's own timezone.
 */
function localWeekdayHour(iso: string): { weekday: string; hour: string } | null {
  if (typeof iso !== 'string' || iso.length < 13) return null;
  const date = new Date(iso.length === 16 ? `${iso}:00Z` : `${iso}Z`);
  if (Number.isNaN(date.getTime())) return null;
  return {
    weekday: WEEKDAYS[date.getUTCDay()] ?? '--',
    // Zero-pad so a single-digit hour keeps the same width as a two-digit one
    // and the strip cells stay visually aligned.
    hour: `${String(date.getUTCHours()).padStart(2, '0')}:00`,
  };
}

/** Same local-weekday rule for the daily strip's "YYYY-MM-DD" dates. */
function localDayLabel(date: string): string {
  if (typeof date !== 'string' || date.length < 10) return '--';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '--';
  return WEEKDAYS[parsed.getUTCDay()] ?? '--';
}

/** Headless-context convenience: builds the dashboard from a cached bundle. */
export function renderWeatherWidgetDashboardFromBundle(
  bundle: WeatherBundle,
): React.JSX.Element {
  const today = bundle.daily[0];
  const { label } = describeWmo(bundle.current.weatherCode);
  const { stale } = describeFreshness(bundle.fetchedAt);
  const nowPoint = bundle.hourly.find((hour) => hour.isNow) ?? bundle.hourly[0];
  const clock = nowPoint ? localWeekdayHour(nowPoint.time) : null;
  // US AQI is the scale the app defaults to; the chip disappears entirely when
  // the air-quality request failed (bundle.aqi is null) or has no US reading.
  const usAqi = bundle.aqi?.usAqi ?? null;
  const band = usAqi === null ? null : usAqiBand(usAqi);
  const hours: DashboardHour[] = bundle.hourly.slice(0, 6).map((hour) => ({
    time: hour.time,
    label: `${hour.time.slice(11, 13)}h`,
    temp: `${Math.round(hour.temperature)}°`,
    rain: `${Math.round(hour.precipProbability)}%`,
  }));
  const days: DashboardDay[] = bundle.daily.slice(0, 5).map((day: DayPoint) => ({
    date: day.date,
    label: localDayLabel(day.date),
    high: `${Math.round(day.tMax)}°`,
    low: `${Math.round(day.tMin)}°`,
  }));
  return (
    <WeatherWidgetDashboard
      hasData
      stale={stale}
      cityName={bundle.location.name}
      temperature={`${Math.round(bundle.current.temperature)}°`}
      conditionLabel={label}
      maxTemp={`${Math.round(today ? today.tMax : bundle.current.temperature)}°`}
      minTemp={`${Math.round(today ? today.tMin : bundle.current.temperature)}°`}
      rainChance={today ? `${Math.round(today.precipProbabilityMax)}%` : '--'}
      precipitation={today && today.precipSum >= 0.1 ? `≈${today.precipSum.toFixed(1)} mm` : ''}
      updatedLabel={widgetUpdatedLabel(bundle.fetchedAt)}
      clockLabel={clock ? `${clock.weekday} ${clock.hour}` : '--'}
      hours={hours}
      days={days}
      aqiLabel={usAqi === null ? '' : `AQI ${Math.round(usAqi)}`}
      aqiColor={band ? asWidgetColor(band.color) : null}
    />
  );
}
