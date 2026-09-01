import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WeatherBundle } from '../api/types';
import { describeWmo } from '../utils/wmo';

const C = {
  dark: {
    bgFrom: '#0D1631',
    bgTo: '#22345C',
    text: '#FFFFFF',
    subtle: '#B9C6DC',
    chip: '#2A3C63',
    strip: '#1A2947',
  },
} as const;

interface WeatherWidgetLargeProps {
  temperature: string;
  conditionLabel: string;
  maxTemp: string;
  minTemp: string;
  rainChance: string;
  precipitation: string;
  updatedLabel: string;
  hours: Array<{ label: string; temp: string; rain: string }>;
  /** Whether data exists at all - false renders the no-data placeholder. */
  hasData: boolean;
}

/**
 * Large (4x2) Android home-screen widget: current conditions plus an hourly
 * strip for the next few hours, rendered through RemoteViews by the
 * react-native-android-widget task handler. All styling goes through the
 * `style` prop (fontSize/color/backgroundColor are style keys in this
 * library, not top-level props). Tap opens the app.
 */
export function WeatherWidgetLarge({
  temperature,
  conditionLabel,
  maxTemp,
  minTemp,
  rainChance,
  precipitation,
  updatedLabel,
  hours,
  hasData,
}: WeatherWidgetLargeProps) {
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
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
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
                text={`${rainChance}${precipitation ? ` · ${precipitation}` : ''}`}
                style={{ fontSize: 10, color: C.dark.text }}
              />
            </FlexWidget>
          </FlexWidget>
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
              <TextWidget
                text={temperature}
                style={{ fontSize: 34, fontWeight: 'bold', color: C.dark.text }}
              />
              <TextWidget text={conditionLabel} style={{ fontSize: 12, color: C.dark.subtle, marginTop: 2 }} />
            </FlexWidget>
            <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
              <TextWidget text={`H ${maxTemp}`} style={{ fontSize: 12, color: C.dark.text }} />
              <TextWidget text={`L ${minTemp}`} style={{ fontSize: 12, color: C.dark.subtle, marginTop: 4 }} />
              <TextWidget text={updatedLabel} style={{ fontSize: 9, color: C.dark.subtle, marginTop: 4 }} />
            </FlexWidget>
          </FlexWidget>
          <FlexWidget
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              backgroundColor: C.dark.strip,
              borderRadius: 12,
              padding: 8,
              marginTop: 10,
            }}
          >
            {hours.map((hour) => (
              <FlexWidget
                key={hour.label}
                style={{ flexDirection: 'column', alignItems: 'center', flex: 1 }}
              >
                <TextWidget text={hour.label} style={{ fontSize: 10, color: C.dark.subtle }} />
                <TextWidget
                  text={hour.temp}
                  style={{ fontSize: 13, fontWeight: 'bold', color: C.dark.text, marginTop: 3 }}
                />
                <TextWidget text={hour.rain} style={{ fontSize: 9, color: C.dark.subtle, marginTop: 3 }} />
              </FlexWidget>
            ))}
          </FlexWidget>
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

/** Headless-context convenience: builds the large widget from a cached bundle. */
export function renderWeatherWidgetLargeFromBundle(bundle: WeatherBundle): React.JSX.Element {
  const today = bundle.daily[0];
  const { label } = describeWmo(bundle.current.weatherCode);
  const hours = bundle.hourly.slice(0, 5).map((hour) => ({
    // hour.time is ISO "YYYY-MM-DDTHH:mm" - the HH part is enough for a strip label.
    label: `${hour.time.slice(11, 13)}h`,
    temp: `${Math.round(hour.temperature)}°`,
    rain: `${Math.round(hour.precipProbability)}%`,
  }));
  return (
    <WeatherWidgetLarge
      hasData
      temperature={`${Math.round(bundle.current.temperature)}°`}
      conditionLabel={label}
      maxTemp={`${Math.round(today ? today.tMax : bundle.current.temperature)}°`}
      minTemp={`${Math.round(today ? today.tMin : bundle.current.temperature)}°`}
      rainChance={today ? `${Math.round(today.precipProbabilityMax)}%` : '--'}
      precipitation={
        today && today.precipSum >= 0.1 ? `≈${today.precipSum.toFixed(1)} mm` : ''
      }
      updatedLabel={`Updated ${new Date(bundle.fetchedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`}
      hours={hours}
    />
  );
}
