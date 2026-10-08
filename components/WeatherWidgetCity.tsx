import React from 'react';
import { WIDGET_CORNER_RADIUS, widgetGradient, widgetPalette } from '../utils/widgetPalette';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';
import { describeWmo } from '../utils/wmo';
import { usAqiBand } from '../utils/aqi';
import { describeFreshness, widgetUpdatedLabel } from '../utils/widgetFreshness';
import type { CitySnapshot } from '../utils/citySnapshots';

const C = widgetPalette('night');

interface WeatherWidgetCityProps {
  cityName: string;
  temperature: string;
  conditionLabel: string;
  maxTemp: string;
  minTemp: string;
  rainChance: string;
  precipitation: string;
  updatedLabel: string;
  hours: Array<{ time: string; label: string; temp: string; rain: string }>;
  aqiLabel: string;
  aqiColor: ColorProp | null;
  /** Why there is nothing to draw, when hasData is false. */
  emptyReason: 'not_configured' | 'no_data' | '';
  hasData: boolean;
  stale: boolean;
}

/** `Band.color` is a plain string; the library needs a `#rrggbb` literal. */
function asWidgetColor(color: string | undefined): ColorProp | null {
  if (color === undefined || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  return color as ColorProp;
}

/**
 * Multi-city (2x2) Android home-screen widget: the conditions of ONE saved
 * city chosen in this widget's configuration screen, not the current location.
 *
 * CHROME IS HARDCODED ENGLISH, matching every other widget component here - a
 * widget redraws in a headless background JS context where the stored language
 * may never have been hydrated. (The configuration screen that PICKS the city
 * runs in the app and IS localized; see WidgetCityConfigScreen.)
 */
export function WeatherWidgetCity({
  cityName,
  temperature,
  conditionLabel,
  maxTemp,
  minTemp,
  rainChance,
  precipitation,
  updatedLabel,
  hours,
  aqiLabel,
  aqiColor,
  emptyReason,
  hasData,
  stale,
}: WeatherWidgetCityProps) {
  const emptyMessage =
    emptyReason === 'not_configured'
      ? 'Tap and hold this widget, then choose a city'
      : 'No saved data for this city yet';
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
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <FlexWidget style={{ flexDirection: 'column' }}>
              <TextWidget text="MU Weather" style={{ fontSize: 10, color: C.subtle }} />
              <TextWidget
                text={cityName}
                style={{ fontSize: 13, fontWeight: 'bold', color: C.text, marginTop: 1 }}
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
                >
                  <TextWidget text={aqiLabel} style={{ fontSize: 10, color: aqiColor ?? C.text }} />
                </FlexWidget>
              ) : null}
              <FlexWidget
                style={{ backgroundColor: C.chip, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}
              >
                <TextWidget
                  text={`${rainChance}${precipitation ? ` · ${precipitation}` : ''}`}
                  style={{ fontSize: 10, color: C.text }}
                />
              </FlexWidget>
            </FlexWidget>
          </FlexWidget>
          <TextWidget
            text={temperature}
            style={{ fontSize: 34, fontWeight: 'bold', color: C.text, marginTop: 4 }}
          />
          <TextWidget text={conditionLabel} style={{ fontSize: 12, color: C.subtle, marginTop: 1 }} />
          <TextWidget
            text={`H ${maxTemp}  ·  L ${minTemp}`}
            style={{ fontSize: 12, color: C.text, marginTop: 6 }}
          />
          <FlexWidget
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              backgroundColor: C.chip,
              borderRadius: 12,
              padding: 6,
              marginTop: 8,
            }}
          >
            {hours.map((hour) => (
              <FlexWidget
                key={hour.time}
                style={{ flexDirection: 'column', alignItems: 'center', flex: 1 }}
                accessibilityLabel={`${hour.label}, ${hour.temp}, ${hour.rain} chance of rain`}
              >
                <TextWidget text={hour.label} style={{ fontSize: 9, color: C.subtle }} />
                <TextWidget
                  text={hour.temp}
                  style={{ fontSize: 12, fontWeight: 'bold', color: C.text, marginTop: 2 }}
                />
              </FlexWidget>
            ))}
          </FlexWidget>
          <TextWidget
            text={updatedLabel}
            style={{ fontSize: 9, color: stale ? C.stale : C.subtle, marginTop: 4 }}
          />
        </>
      ) : (
        <>
          <TextWidget text="MU Weather" style={{ fontSize: 15, fontWeight: 'bold', color: C.text }} />
          <TextWidget text={emptyMessage} style={{ fontSize: 11, color: C.subtle, marginTop: 4 }} />
        </>
      )}
    </FlexWidget>
  );
}

const EMPTY_PROPS = {
  hasData: false,
  cityName: '',
  temperature: '',
  conditionLabel: '',
  maxTemp: '',
  minTemp: '',
  rainChance: '',
  precipitation: '',
  updatedLabel: '',
  aqiLabel: '',
  aqiColor: null,
  stale: false,
} as const;

/** Placeholder for a widget the user has not pointed at a city yet. */
export function renderCityWidgetUnconfigured(): React.JSX.Element {
  return <WeatherWidgetCity {...EMPTY_PROPS} hours={[]} emptyReason="not_configured" />;
}

/** Placeholder for a configured city that has no snapshot yet. */
export function renderCityWidgetNoData(): React.JSX.Element {
  return <WeatherWidgetCity {...EMPTY_PROPS} hours={[]} emptyReason="no_data" />;
}

/** Builds the city widget from a stored per-city snapshot. */
export function renderCityWidgetFromSnapshot(snapshot: CitySnapshot): React.JSX.Element {
  const { label } = describeWmo(snapshot.weatherCode);
  const { stale } = describeFreshness(snapshot.fetchedAt);
  const band = snapshot.usAqi === null ? null : usAqiBand(snapshot.usAqi);
  const hours = snapshot.hours.slice(0, 4).map((hour) => ({
    time: hour.time,
    label: `${hour.time.slice(11, 13)}h`,
    temp: `${Math.round(hour.temperature)}°`,
    rain: `${Math.round(hour.precipProbability)}%`,
  }));
  return (
    <WeatherWidgetCity
      hasData
      stale={stale}
      emptyReason=""
      cityName={snapshot.cityName}
      temperature={`${Math.round(snapshot.temperature)}°`}
      conditionLabel={label}
      maxTemp={`${Math.round(snapshot.tMax)}°`}
      minTemp={`${Math.round(snapshot.tMin)}°`}
      rainChance={`${Math.round(snapshot.precipProbabilityMax)}%`}
      precipitation={snapshot.precipSum >= 0.1 ? `≈${snapshot.precipSum.toFixed(1)} mm` : ''}
      updatedLabel={widgetUpdatedLabel(snapshot.fetchedAt)}
      hours={hours}
      aqiLabel={snapshot.usAqi === null ? '' : `AQI ${Math.round(snapshot.usAqi)}`}
      aqiColor={band ? asWidgetColor(band.color) : null}
    />
  );
}
