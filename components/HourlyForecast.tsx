import { t, tWmo } from '../utils/i18n';
import React, { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated from 'react-native-reanimated';
import { Clock, Thermometer, Umbrella, Wind, X } from '../utils/uiIcons';
import { Card } from './Card';
import { haptics } from '../utils/haptics';
import { smoothPath, scaleY, type CurvePoint } from '../utils/curve';
import type { AppTheme } from '../theme/palettes';
import { getWeatherIcon } from '../utils/icons';
import {
  compassLabel,
  convertWind,
  formatHourLabel,
  formatPrecip,
  formatTemp,
  formatVisibility,
  windUnitLabel,
} from '../utils/format';
import { inlineEntering, inlineExiting } from '../utils/detailAnimations';
import { F } from '../theme/typography';
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
  const [selected, setSelected] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const viewportWidth = useRef(0);
  const slice = hours.slice(0, 24);
  if (!slice.length) return null;

  const contentWidth = slice.length * COL_WIDTH;

  const selectHour = (index: number) => {
    haptics.select();
    setSelected((previous) => (previous === index ? null : index));
    const viewport = viewportWidth.current;
    if (viewport > 0) {
      const target = Math.min(
        Math.max(index * COL_WIDTH + COL_WIDTH / 2 - viewport / 2, 0),
        Math.max(contentWidth - viewport, 0),
      );
      scrollRef.current?.scrollTo({ x: target, animated: true });
    }
  };

  const handleScrollerLayout = (event: LayoutChangeEvent) => {
    viewportWidth.current = event.nativeEvent.layout.width;
  };

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

  const selectedHour = selected !== null ? slice[selected] ?? null : null;
  const SelectedIcon = selectedHour
    ? getWeatherIcon(selectedHour.weatherCode, selectedHour.isDay)
    : null;
  const stats: Array<{ label: string; value: string }> = [];
  if (selectedHour) {
    stats.push({ label: t('rain_chance'), value: `${Math.round(selectedHour.precipProbability)}%` });
    stats.push({ label: t('card_precipitation'), value: formatPrecip(selectedHour.precipitation) });
    stats.push({
      label: t('card_wind'),
      value: `${Math.round(convertWind(selectedHour.windSpeed))} ${windUnitLabel()}`,
    });
    stats.push({
      label: t('gusts'),
      value: `${Math.round(convertWind(selectedHour.windGusts))} ${windUnitLabel()}`,
    });
    stats.push({ label: t('f_direction'), value: compassLabel(selectedHour.windDirection) });
    if (selectedHour.humidity !== null && selectedHour.humidity !== undefined) {
      stats.push({ label: t('card_humidity'), value: `${Math.round(selectedHour.humidity)}%` });
    }
    if (selectedHour.dewPoint !== null) {
      stats.push({ label: t('dew_point'), value: formatTemp(selectedHour.dewPoint) });
    }
    if (selectedHour.pressure !== null) {
      stats.push({ label: t('card_pressure'), value: `${Math.round(selectedHour.pressure)} hPa` });
    }
    if (selectedHour.uvIndex !== null) {
      stats.push({ label: t('card_uv'), value: String(Math.round(selectedHour.uvIndex)) });
    }
    if (selectedHour.visibility !== null) {
      stats.push({ label: t('card_visibility'), value: formatVisibility(selectedHour.visibility) });
    }
  }

  return (
    <Card
      theme={theme}
      title={t('card_hourly')}
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
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        contentContainerStyle={{ width: contentWidth }}
        onLayout={handleScrollerLayout}
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

          <View style={styles.tapLayer}>
            {slice.map((hour, index) => (
              <Pressable
                key={`tap-${hour.time}`}
                onPress={() => selectHour(index)}
                style={[
                  styles.tapCell,
                  index === selected && {
                    backgroundColor: theme.isLight
                      ? 'rgba(28,36,49,0.05)'
                      : 'rgba(255,255,255,0.06)',
                    borderRadius: 14,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      {selectedHour ? (
        <Animated.View
          entering={inlineEntering()}
          exiting={inlineExiting()}
          style={[
            styles.detailPanel,
            { backgroundColor: theme.chipBg, borderColor: theme.cardBorder },
          ]}
        >
          <View style={styles.panelHead}>
            {SelectedIcon ? (
              <SelectedIcon size={19} color={theme.textPrimary} strokeWidth={2} />
            ) : null}
            <Text style={[styles.panelTitle, { color: theme.textSecondary }]} numberOfLines={1}>
              {formatHourLabel(selectedHour.time, selectedHour.isNow)} ·{' '}
              {tWmo(selectedHour.weatherCode)}
            </Text>
            <Text style={[styles.panelTemp, { color: theme.textPrimary }]}>
              {formatTemp(selectedHour.temperature)}
            </Text>
            <Pressable
              onPress={() => {
                haptics.select();
                setSelected(null);
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.panelClose, pressed && { opacity: 0.6 }]}
            >
              <X size={16} color={theme.textTertiary} strokeWidth={2.4} />
            </Pressable>
          </View>
          <View style={styles.panelGrid}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.statCell}>
                <Text style={[styles.statLabel, { color: theme.textTertiary }]} numberOfLines={1}>
                  {stat.label}
                </Text>
                <Text style={[styles.statValue, { color: theme.textPrimary }]} numberOfLines={1}>
                  {stat.value}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>
      ) : null}

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
    fontFamily: F.semibold,
  },
  curveWrap: {
    overflow: 'hidden',
  },
  tempRow: {
    marginTop: 2,
  },
  temp: {
    fontSize: 16,
    fontFamily: F.semibold,
  },
  caption: {
    fontSize: 11.5,
    marginTop: 10,    fontFamily: F.regular,

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
  tapLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  tapCell: {
    width: COL_WIDTH,
    height: '100%',
  },
  detailPanel: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    fontSize: 13.5,
    fontFamily: F.medium,
    flexShrink: 1,
  },
  panelTemp: {
    fontSize: 20,
    fontFamily: F.semibold,
    marginLeft: 'auto',
  },
  panelClose: {
    padding: 2,
  },
  panelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCell: {
    width: '48%',
    gap: 1,
  },
  statLabel: {
    fontSize: 11.5,
    fontFamily: F.regular,
  },
  statValue: {
    fontSize: 14.5,
    fontFamily: F.semibold,
  },
});
