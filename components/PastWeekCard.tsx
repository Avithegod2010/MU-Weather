import { t, tDay } from '../utils/i18n';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Droplet, Clock3 as History } from '../utils/uiIcons';
import { Card } from './Card';
import { smoothPath, scaleY, type CurvePoint } from '../utils/curve';
import { formatPrecip, formatPrecipValue, tempColor } from '../utils/format';
import { loadForecastLog, type ForecastLogEntry } from '../utils/forecastLog';
import { haptics } from '../utils/haptics';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { PastDayActual } from '../api/types';

interface PastWeekCardProps {
  theme: AppTheme;
  /** Archive actuals, oldest first. May hold up to 30 days. */
  days: PastDayActual[];
  /** History window shown - the archive feed covers both options */
  pastDaysRange?: 7 | 30;
  onRangeChange?: (range: 7 | 30) => void;
}

const PRECIP_COLOR = '#A5DBF9';
const BAR_HEIGHT = 62;
const GOOD_DELTA = '#5BC98C';
const OK_DELTA = '#E8D05A';
const BAD_DELTA = '#E85F5F';
const MAX_LINE_COLOR = '#F5A962';
const MIN_LINE_COLOR = '#6FA8DC';
const SPARK_HEIGHT = 88;
const SPARK_PADDING = 8;

/** Archive dates are plain `YYYY-MM-DD`; noon-UTC parsing keeps the weekday stable. */
function weekdayOf(date: string): number {
  const time = Date.parse(`${date}T12:00:00Z`);
  return Number.isNaN(time) ? -1 : new Date(time).getUTCDay();
}

/** Signed delta chip text, e.g. `+2°`, `-1°`, `±0°`. */
function deltaChipText(actual: number, forecast: number): string {
  const diff = Math.round(actual - forecast);
  if (diff === 0) return '±0°';
  return `${diff > 0 ? '+' : '-'}${Math.abs(diff)}°`;
}

function deltaColor(diff: number): string {
  const abs = Math.abs(diff);
  if (abs <= 1) return GOOD_DELTA;
  if (abs <= 3) return OK_DELTA;
  return BAD_DELTA;
}

export function PastWeekCard({ theme, days, pastDaysRange = 7, onRangeChange }: PastWeekCardProps) {
  const [log, setLog] = useState<ForecastLogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await loadForecastLog();
      if (!cancelled) setLog(entries);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (days.length === 0) return null;

  const ordered = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const shown = pastDaysRange === 30 ? ordered : ordered.slice(-7);
  const isMonth = pastDaysRange === 30;

  return (
    <Card
      theme={theme}
      title={t(isMonth ? 'card_past_week_30' : 'card_past_week')}
      icon={History}
      headerRight={
        <View style={[styles.rangeRow, { backgroundColor: theme.chipBg }]}>
          {([7, 30] as const).map((option) => {
            const active = pastDaysRange === option;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  if (!active) {
                    haptics.select();
                    onRangeChange?.(option);
                  }
                }}
                style={[
                  styles.rangeOption,
                  active && { backgroundColor: theme.isLight ? '#FFFFFF' : '#F4F6FA' },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('trip_days').replace('{n}', String(option))}
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.rangeText,
                    { color: active ? theme.textPrimary : theme.textTertiary },
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      }
    >
      {isMonth ? (
        <ThirtyDayBody theme={theme} days={shown} />
      ) : (
        <SevenDayBody theme={theme} days={shown} log={log} />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 7-day view: weekday columns with range bars and delta chips         */
/* ------------------------------------------------------------------ */

function SevenDayBody({
  theme,
  days,
  log,
}: {
  theme: AppTheme;
  days: PastDayActual[];
  log: ForecastLogEntry[];
}) {
  const byDate = new Map(log.map((entry) => [entry.date, entry]));
  const weekMin = Math.min(...days.map((d) => d.tMin));
  const weekMax = Math.max(...days.map((d) => d.tMax));
  const range = Math.max(weekMax - weekMin, 1);
  const totalRain = days.reduce((sum, d) => sum + d.precipSum, 0);
  const deltas = days
    .filter((d) => byDate.has(d.date))
    .map((d) => Math.round(d.tMax - (byDate.get(d.date) as ForecastLogEntry).tMax));
  const anyDelta = deltas.length > 0;
  const hasUnloggedDays = days.some((d) => !byDate.has(d.date));

  return (
    <>
      <View style={styles.columns}>
        {days.map((day) => {
          const forecast = byDate.get(day.date);
          const bottomPct = ((day.tMin - weekMin) / range) * 100;
          const heightPct = Math.max(((day.tMax - day.tMin) / range) * 100, 12);
          const weekday = weekdayOf(day.date);
          return (
            <View key={day.date} style={styles.column}>
              <Text style={[styles.dayLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                {weekday >= 0 ? tDay(weekday) : '--'}
              </Text>
              <View style={styles.chipSlot}>
                {forecast ? (
                  <View style={[styles.chip, { backgroundColor: theme.chipBg }]}>
                    <Text
                      style={[
                        styles.chipText,
                        { color: deltaColor(day.tMax - forecast.tMax) },
                      ]}
                    >
                      {deltaChipText(day.tMax, forecast.tMax)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.barTrack, { backgroundColor: theme.trackColor }]}>
                <LinearGradient
                  colors={[tempColor(day.tMax), tempColor(day.tMin)] as [string, string]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={[styles.barFill, { bottom: `${bottomPct}%`, height: `${heightPct}%` }]}
                />
              </View>
              {day.precipSum >= 0.05 ? (
                <View style={styles.rainRow}>
                  <Droplet size={9} color={PRECIP_COLOR} strokeWidth={2.6} />
                  <Text style={[styles.rainText, { color: theme.textSecondary }]}>
                    {formatPrecipValue(day.precipSum)}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.rainText, styles.rainDry, { color: theme.textTertiary }]}>
                  –
                </Text>
              )}
            </View>
          );
        })}
      </View>

      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        {t('week_rain_total')}: {formatPrecip(totalRain)}
        {anyDelta ? ` · ${t('delta_vs_forecast')}` : ''}
      </Text>
      {hasUnloggedDays ? (
        <Text style={[styles.footnote, { color: theme.textTertiary }]}>
          {t('past_week_note')}
        </Text>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 30-day view: temp-trend sparkline plus rain and variability stats   */
/* ------------------------------------------------------------------ */

function ThirtyDayBody({ theme, days }: { theme: AppTheme; days: PastDayActual[] }) {
  const totalRain = days.reduce((sum, d) => sum + d.precipSum, 0);
  const wetDays = days.filter((d) => d.precipSum >= 1.0).length;

  // Biggest day-to-day swing of the max temperature across the window.
  let swing = 0;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round(days[i].tMax - days[i - 1].tMax);
    if (Math.abs(diff) > Math.abs(swing)) swing = diff;
  }
  const swingText =
    swing === 0 ? '±0°' : `${swing > 0 ? '+' : '-'}${Math.abs(swing)}°`;

  return (
    <>
      <TempTrendSparkline theme={theme} days={days} />
      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        {t('rain_total_30')}: {formatPrecip(totalRain)}
        {days.length > 0 ? ` · ${t('stat_wet_days')}: ${wetDays}` : ''}
      </Text>
      {days.length >= 2 ? (
        <Text style={[styles.footnote, { color: theme.textTertiary }]}>
          {t('stat_biggest_swing')}: {swingText}
        </Text>
      ) : null}
    </>
  );
}

/** Soft area between the tMax polyline and the reversed tMin polyline. */
function bandPath(top: CurvePoint[], bottom: CurvePoint[]): string {
  const points = [...top, ...[...bottom].reverse()];
  if (points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  }
  return `${d} Z`;
}

function TempTrendSparkline({ theme, days }: { theme: AppTheme; days: PastDayActual[] }) {
  const [width, setWidth] = useState(0);

  if (days.length < 2) return null;

  const onLayout = (event: { nativeEvent: { layout: { width: number } } }) => {
    const next = event.nativeEvent.layout.width;
    if (Math.abs(next - width) > 1) setWidth(next);
  };

  const tempsMax = days.map((d) => d.tMax);
  const tempsMin = days.map((d) => d.tMin);
  const lo = Math.min(...tempsMin);
  const hi = Math.max(...tempsMax);
  const top = SPARK_PADDING;
  const bottom = SPARK_HEIGHT - SPARK_PADDING;

  const toPoints = (values: number[]): CurvePoint[] =>
    values.map((value, index) => ({
      x: width > 0 ? (index / (values.length - 1)) * (width - 2 * SPARK_PADDING) + SPARK_PADDING : 0,
      y: scaleY(value, lo, hi, top, bottom),
    }));

  const maxPoints = toPoints(tempsMax);
  const minPoints = toPoints(tempsMin);
  const hottest = maxPoints[tempsMax.indexOf(Math.max(...tempsMax))];
  const coldest = minPoints[tempsMin.indexOf(Math.min(...tempsMin))];
  const dotFill = theme.isLight ? '#FFFFFF' : '#F6F9FD';

  if (width <= 0) {
    return <View style={styles.sparkSlot} onLayout={onLayout} />;
  }

  return (
    <View style={styles.sparkSlot} onLayout={onLayout}>
      <Svg width={width} height={SPARK_HEIGHT}>
        <Path d={bandPath(maxPoints, minPoints)} fill={MAX_LINE_COLOR} opacity={0.1} />
        <Path d={smoothPath(minPoints)} stroke={MIN_LINE_COLOR} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Path d={smoothPath(maxPoints)} stroke={MAX_LINE_COLOR} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        <Circle cx={hottest.x} cy={hottest.y} r={3} fill={dotFill} stroke={MAX_LINE_COLOR} strokeWidth={2} />
        <Circle cx={coldest.x} cy={coldest.y} r={3} fill={dotFill} stroke={MIN_LINE_COLOR} strokeWidth={2} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  columns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  dayLabel: {
    fontSize: 10.5,
    fontFamily: F.medium,
  },
  chipSlot: {
    height: 18,
    justifyContent: 'center',
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: 9.5,
    fontFamily: F.bold,
  },
  barTrack: {
    width: 14,
    height: BAR_HEIGHT,
    borderRadius: 7,
    overflow: 'hidden',
  },
  barFill: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderRadius: 5,
  },
  rainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  rainText: {
    fontSize: 10,
    fontFamily: F.medium,
  },
  rainDry: {
    opacity: 0.6,
  },
  rangeRow: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 2,
    gap: 2,
  },
  rangeOption: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeText: {
    fontSize: 11,
    fontFamily: F.semibold,
  },
  sparkSlot: {
    height: SPARK_HEIGHT,
  },
  caption: {
    fontSize: 11.5,
    marginTop: 10,
    fontFamily: F.regular,
  },
  footnote: {
    fontSize: 11,
    marginTop: 3,
    fontFamily: F.regular,
  },
});
