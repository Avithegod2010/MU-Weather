import { SlidingGroup, SlidingItem } from './Sliding';
import { t, tWmo } from '../utils/i18n';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SkiaSeriesChart } from './SkiaSeriesChart';
import Animated from 'react-native-reanimated';
import { Clock, Thermometer, Umbrella, Wind, X } from '../utils/uiIcons';
import { Card } from './Card';
import { haptics } from '../utils/haptics';
import { scaleY, type CurvePoint } from '../utils/curve';
import type { AppTheme } from '../theme/palettes';
import { WeatherIcon } from './WeatherIcon';
import {
  compassLabel,
  convertWind,
  formatHourLabel,
  formatPrecip,
  formatPressure,
  formatTemp,
  formatVisibility,
  windUnitLabel,
} from '../utils/format';
import { inlineEntering, inlineExiting } from '../utils/detailAnimations';
import { F } from '../theme/typography';
import type { HourPoint } from '../api/types';

/** External (widget deep-link) request to open one specific hour's panel. */
export interface HourFocusTarget {
  /** HourPoint time, ISO "YYYY-MM-DDTHH:mm". */
  time: string;
  /** Increases on every focus request so repeated taps re-open the panel. */
  seq: number;
}

interface HourlyForecastProps {
  theme: AppTheme;
  hours: HourPoint[];
  focus?: HourFocusTarget | null;
}

type HourView = 'temp' | 'rain' | 'wind';

const COL_WIDTH = 72;
const CURVE_HEIGHT = 72;
const CURVE_PADDING = 16;

export const HourlyForecast = React.memo(function HourlyForecast({
  theme,
  hours,
  focus,
}: HourlyForecastProps) {
  const [view, setView] = useState<HourView>('temp');
  const [selected, setSelected] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const viewportWidth = useRef(0);
  const lastFocusSeq = useRef(0);

  const slice = useMemo(() => hours.slice(0, 24), [hours]);

  // Must stay above the early return (rules of hooks).
  useEffect(() => {
    if (!focus || focus.seq === lastFocusSeq.current) return;
    lastFocusSeq.current = focus.seq;
    const index = slice.findIndex((hour) => hour.time === focus.time);
    if (index < 0) return;
    setSelected(index);
    const viewport = viewportWidth.current;
    if (viewport > 0) {
      const target = Math.min(
        Math.max(index * COL_WIDTH + COL_WIDTH / 2 - viewport / 2, 0),
        Math.max(slice.length * COL_WIDTH - viewport, 0),
      );
      scrollRef.current?.scrollTo({ x: target, animated: true });
    }
  }, [focus, slice]);

  const { points, lineColor, formatValue } = useMemo(() => {
    let pts: CurvePoint[];
    let color: string;
    let fmt: (hour: HourPoint) => string;

    if (view === 'rain') {
      color = '#6FA8DC';
      pts = slice.map((hour, index) => ({
        x: index * COL_WIDTH + COL_WIDTH / 2,
        y: scaleY(Math.min(hour.precipProbability, 100), 0, 100, CURVE_PADDING, CURVE_HEIGHT - CURVE_PADDING),
      }));
      fmt = (hour) => `${Math.round(hour.precipProbability)}%`;
    } else if (view === 'wind') {
      color = '#8FD0B8';
      let maxSpeedValue = 10;
      for (let i = 0; i < slice.length; i++) {
        const hour = slice[i];
        if (hour.windSpeed > maxSpeedValue) maxSpeedValue = hour.windSpeed;
        if (hour.windGusts > maxSpeedValue) maxSpeedValue = hour.windGusts;
      }
      const maxSpeed = maxSpeedValue * 1.15;
      pts = slice.map((hour, index) => ({
        x: index * COL_WIDTH + COL_WIDTH / 2,
        y: scaleY(hour.windSpeed, 0, maxSpeed, CURVE_PADDING, CURVE_HEIGHT - CURVE_PADDING),
      }));
      fmt = (hour) => `${Math.round(convertWind(hour.windSpeed))}`;
    } else {
      color = theme.isLight ? 'rgba(28,36,49,0.32)' : 'rgba(255,255,255,0.42)';
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < slice.length; i++) {
        const temp = slice[i].temperature;
        if (temp < min) min = temp;
        if (temp > max) max = temp;
      }
      pts = slice.map((hour, index) => ({
        x: index * COL_WIDTH + COL_WIDTH / 2,
        y: scaleY(hour.temperature, min, max, CURVE_PADDING, CURVE_HEIGHT - CURVE_PADDING),
      }));
      fmt = (hour) => formatTemp(hour.temperature);
    }

    return {
      points: pts,
      lineColor: color,
      formatValue: fmt,
    };
  }, [slice, view, theme.isLight]);

  const selectedHour = selected !== null ? slice[selected] ?? null : null;

  const stats = useMemo(() => {
    if (!selectedHour) return [];
    const list: Array<{ label: string; value: string }> = [
      {
        label: t('feels_like'),
        value: formatTemp(selectedHour.apparent ?? selectedHour.temperature),
      },
      { label: t('rain_chance'), value: `${Math.round(selectedHour.precipProbability)}%` },
      { label: t('card_precipitation'), value: formatPrecip(selectedHour.precipitation) },
      {
        label: t('card_wind'),
        value: `${Math.round(convertWind(selectedHour.windSpeed))} ${windUnitLabel()}`,
      },
      {
        label: t('gusts'),
        value: `${Math.round(convertWind(selectedHour.windGusts))} ${windUnitLabel()}`,
      },
      { label: t('f_direction'), value: compassLabel(selectedHour.windDirection) },
    ];
    if (selectedHour.humidity !== null && selectedHour.humidity !== undefined) {
      list.push({ label: t('card_humidity'), value: `${Math.round(selectedHour.humidity)}%` });
    }
    if (selectedHour.dewPoint !== null) {
      list.push({ label: t('dew_point'), value: formatTemp(selectedHour.dewPoint) });
    }
    if (selectedHour.pressure !== null) {
      list.push({ label: t('card_pressure'), value: formatPressure(selectedHour.pressure) });
    }
    if (selectedHour.uvIndex !== null) {
      list.push({ label: t('card_uv'), value: String(Math.round(selectedHour.uvIndex)) });
    }
    if (selectedHour.visibility !== null) {
      list.push({ label: t('card_visibility'), value: formatVisibility(selectedHour.visibility) });
    }
    return list;
  }, [selectedHour]);

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

  const dotFill = theme.isLight ? '#FFFFFF' : '#F6F9FD';

  const toggleIcons: { key: HourView; icon: typeof Wind }[] = [
    { key: 'temp', icon: Thermometer },
    { key: 'rain', icon: Umbrella },
    { key: 'wind', icon: Wind },
  ];

  return (
    <Card
      theme={theme}
      title={t('card_hourly')}
      icon={Clock}
      headerRight={
        <SlidingGroup
          theme={theme}
          activeIndex={toggleIcons.findIndex((entry) => entry.key === view)}
          color={theme.isLight ? '#FFFFFF' : '#F4F6FA'}
          style={[styles.toggleWrap, { backgroundColor: theme.chipBg }]}
        >
          {toggleIcons.map((entry, index) => {
            const ToggleIcon = entry.icon;
            const active = view === entry.key;
            return (
              <SlidingItem
                key={entry.key}
                index={index}
                onPress={() => {
                  if (!active) {
                    haptics.select();
                    setView(entry.key);
                  }
                }}
                style={styles.toggleButton}
                accessibilityRole="button"
                accessibilityLabel={
                  entry.key === 'temp'
                    ? t('s_temp')
                    : entry.key === 'rain'
                      ? t('tile_rainchart')
                      : t('s_wind')
                }
                accessibilityState={{ selected: active }}
              >
                <ToggleIcon
                  size={14}
                  color={active ? (theme.isLight ? '#1C2431' : '#1C2431') : theme.textTertiary}
                  strokeWidth={2.3}
                />
              </SlidingItem>
            );
          })}
        </SlidingGroup>
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

          <View
            style={[styles.row, styles.iconRow]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {slice.map((hour) => {
              return (
                <View key={`i-${hour.time}`} style={[styles.col, { width: COL_WIDTH }]}>
                  <WeatherIcon code={hour.weatherCode} isDay={hour.isDay} size={23} themeColor={theme.textPrimary} />
                </View>
              );
            })}
          </View>

          <View
            style={[styles.curveWrap, { height: CURVE_HEIGHT, width: contentWidth }]}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <SkiaSeriesChart
              theme={theme}
              width={contentWidth}
              height={CURVE_HEIGHT}
              series={[{ color: lineColor, points }]}
              columns={[]}
              dotFill={dotFill}
              dataKey={`hourly|${points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}|${lineColor}`}
              scrub={false}
            />
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
                accessibilityRole="button"
                accessibilityLabel={`${formatHourLabel(hour.time, hour.isNow)}, ${tWmo(
                  hour.weatherCode,
                )}, ${formatTemp(hour.temperature)}, ${t('rain_chance')} ${Math.round(
                  hour.precipProbability,
                )}%`}
                accessibilityState={{ selected: index === selected }}
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
            {selectedHour ? (
              <WeatherIcon
                code={selectedHour.weatherCode}
                isDay={selectedHour.isDay}
                size={19}
                themeColor={theme.textPrimary}
              />
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
              accessibilityRole="button"
              accessibilityLabel={t('a11y_close')}
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
          ? t('hourly_cap_temp')
          : view === 'rain'
            ? t('hourly_cap_rain')
            : t('hourly_cap_wind').replace('{unit}', windUnitLabel())}
      </Text>
    </Card>
  );
});

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
