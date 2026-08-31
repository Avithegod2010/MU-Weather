import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WeatherBundle } from '../api/types';
import { describeWmo } from '../utils/wmo';

const C = {
  dark: { bgFrom: '#0D1631', bgTo: '#22345C', text: '#FFFFFF', subtle: '#B9C6DC', chip: '#2A3C63' },
  light: { bgFrom: '#DCE9FB', bgTo: '#F7FAFF', text: '#1C2431', subtle: '#5A6B80', chip: '#FFFFFF' },
} as const;

interface WeatherWidgetProps {
  temperature: string;
  conditionLabel: string;
  maxTemp: string;
  minTemp: string;
  rainChance: string;
  precipitation: string;
  updatedLabel: string;
  /** Whether data exists at all - false renders the no-data placeholder. */
  hasData: boolean;
}

/**
 * Android home-screen widget UI, rendered through RemoteViews by the
 * react-native-android-widget task handler. All styling goes through the
 * `style` prop (fontSize/color/backgroundColor are style keys in this
 * library, not top-level props). Tap opens the app.
 */
export function WeatherWidget({
  temperature,
  conditionLabel,
  maxTemp,
  minTemp,
  rainChance,
  precipitation,
  updatedLabel,
  hasData,
}: WeatherWidgetProps) {
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
          <TextWidget
            text={temperature}
            style={{ fontSize: 38, fontWeight: 'bold', color: C.dark.text, marginTop: 4 }}
          />
          <TextWidget
            text={conditionLabel}
            style={{ fontSize: 12, color: C.dark.subtle, marginTop: 2 }}
          />
          <TextWidget
            text={`H ${maxTemp}  ·  L ${minTemp}`}
            style={{ fontSize: 12, color: C.dark.text, marginTop: 8 }}
          />
          <TextWidget
            text={updatedLabel}
            style={{ fontSize: 9, color: C.dark.subtle, marginTop: 4 }}
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

/** Headless-context convenience: builds the widget from a cached bundle. */
export function renderWeatherWidgetFromBundle(bundle: WeatherBundle): React.JSX.Element {
  const today = bundle.daily[0];
  const { label } = describeWmo(bundle.current.weatherCode);
  return (
    <WeatherWidget
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
    />
  );
}
