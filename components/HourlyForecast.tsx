import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Clock, Thermometer, Umbrella, Wind } from '../utils/uiIcons';
import { Card } from './Card';
import { haptics } from '../utils/haptics';
import { smoothPath, scaleY } from '../utils/curve';
import type { AppTheme } from '../theme/palettes';
import { getWeatherIcon } from '../utils/icons';
import { formatHourLabel, formatTemp, convertWind, windUnitLabel } from '../utils/format';
import type { HourPoint } from '../api/types';

interface HourlyForecastProps {
  theme: AppTheme;
  hours: HourPoint[];
}

type HourView = 'temp' | 'rain' | 'wind';

const COL_WIDTH = 72;
const CURVE_HEIGHT = 72;
const CURVE_PADDING = 16;

export function HourlyForecast({ theme, hours }: HourlyForecastProps) {
  const [view, setView] = useState<HourView>('temp');
  const slice = hours.slice(0, 24);
  if (!slice.length) return null;

  const contentWidth = slice.length * COL_WIDTH;

  let points: CurvePoint[];
  let lineColor: string;
  let formatValue: (hour: HourPoint) => string;

  if (view === 'rain') {
    lineColor = '#6FA8DC';
    points = slice.map((hour, index) => ({
      x: index * COL_WIDTH + COL_WIDTH / 2,
      y: scaleY(Math.min(hour.precipProbability, 100), 0, 100, CURVE_PADDING, CURVE_HEIGHT - CURVE_PADDING),
    }));
    formatValue = (hour) => `${Math.round(hour.precipProbability)}%`;
  } else if (view === 'wind') {
    lineColor = '#8FD0B8';
    const maxSpeed = Math.max(
      10,
      ...slice.map((hour) => Math.max(hour.windSpeed, hour.windGusts)),
    ) * 1.15;
    points = slice.map((hour, index) => ({
      x: index * COL_WIDTH + COL_WIDTH / 2,
      y: scaleY(hour.windSpeed, 0, maxSpeed, CURVE_PADDING, CURVE_HEIGHT - CURVE_PADDING),
    }));
    formatValue = (hour) => `${Math.round(convertWind(hour.windSpeed))}`;
  } else {
    lineColor = theme.isLight ? 'rgba(28,36,49,0.32)' : 'rgba(255,255,255,0.42)';
    const temps = slice.map((hour) => hour.temperature);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    points = slice.map((hour, index) => ({
      x: index * COL_WIDTH + COL_WIDTH / 2,
      y: scaleY(hour.temperature, min, max, CURVE_PADDING, CURVE_HEIGHT - CURVE_PADDING),
    }));
    formatValue = (hour) => formatTemp(hour.temperature);
  }

  const path = smoothPath(points);
  const dotFill = theme.isLight ? '#FFFFFF' : '#F6F9FD';

  const toggleIcons: Array<{ key: HourView; icon: typeof Wind }> = [
    { key: 'temp', icon: Thermometer },
    { key: 'rain', icon: Umbrella },
    { key: 'wind', icon: Wind },
  ];

  return (
    <Card
      theme={theme}
      title="Hourly Forecast"
      icon={Clock}
      headerRight={
        <View style={[styles.toggleWrap, { backgroundColor: theme.chipBg }]}>
          {toggleIcons.map((entry) => {
            const ToggleIcon = entry.icon;
            const active = view === entry.key;
            return (
              <Pressable
                key={entry.key}
                onPress={() => {
                  if (!active) {
                    haptics.select();
                    setView(entry.key);
                  }
                }}
                style={[
                  styles.toggleButton,
                  active && { backgroundColor: theme.isLight ? '#FFFFFF' : '#F4F6FA' },
                ]}
              >
                <ToggleIcon
                  size={14}
                  color={active ? (theme.isLight ? '#1C2431' : '#1C2431') : theme.textTertiary}
                  strokeWidth={2.3}
                />
              </Pressable>
            );
          })}
        </View>
      }
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        contentContainerStyle={{ width: contentWidth }}
      >
        <View style={{ width: contentWidth }}>
          <View style={styles.row}>
            {slice.map((hour) => (
              <View key={`t-${hour.time}`} style={[styles.col, { width: COL_WIDTH }]}>
                <Text
                  style={[
                    styles.time,
                    { color: hour.isNow ? theme.textPrimary : theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {formatHourLabel(hour.time, hour.isNow)}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.row, styles.iconRow]}>
            {slice.map((hour) => {
              const Icon = getWeatherIcon(hour.weatherCode, hour.isDay);
              return (
                <View key={`i-${hour.time}`} style={[styles.col, { width: COL_WIDTH }]}>
                  <Icon size={23} color={theme.textPrimary} strokeWidth={1.7} />
                </View>
              );
            })}
          </View>

          <View style={[styles.curveWrap, { height: CURVE_HEIGHT, width: contentWidth }]}>
            <Svg width={contentWidth} height={CURVE_HEIGHT}>
              <Path
                d={path}
                stroke={lineColor}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
              />
              {points.map((point, index) => (
                <Circle
                  key={`d-${slice[index].time}`}
                  cx={point.x}
                  cy={point.y}
                  r={slice[index].isNow ? 5.5 : 4}
                  fill={dotFill}
                  stroke={lineColor}
                  strokeWidth={2}
                />
              ))}
            </Svg>
          </View>

          <View style={[styles.row, styles.tempRow]}>
            {slice.map((hour) => (
              <View key={`v-${hour.time}`} style={[styles.col, { width: COL_WIDTH }]}>
                <Text
                  style={[
                    styles.temp,
                    { color: hour.isNow ? theme.textPrimary : theme.textSecondary },
                  ]}
                >
                  {formatValue(hour)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        {view === 'temp'
          ? 'Temperature · next 24 hours'
          : view === 'rain'
            ? 'Chance of precipitation · next 24 hours'
            : `Sustained wind speed in ${windUnitLabel()} · next 24 hours`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  iconRow: {
    marginTop: 12,
    marginBottom: 4,
  },
  col: {
    alignItems: 'center',
  },
  time: {
    fontSize: 13,
    fontWeight: '600',
  },
  curveWrap: {
    overflow: 'hidden',
  },
  tempRow: {
    marginTop: 2,
  },
  temp: {
    fontSize: 16,
    fontWeight: '600',
  },
  caption: {
    fontSize: 11.5,
    marginTop: 10,
  },
  toggleWrap: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  toggleButton: {
    width: 30,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
