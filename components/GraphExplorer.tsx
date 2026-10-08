import { SlidingGroup, SlidingItem } from './Sliding';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Canvas, Circle, DashPathEffect, Group, LinearGradient, Path, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../utils/reduceMotion';
import { getLanguage, t, type StringKey } from '../utils/i18n';
import { haptics } from '../utils/haptics';
import { F } from '../theme/typography';
import { smoothPath, scaleY, type CurvePoint } from '../utils/curve';
import {
  compassLabel,
  convertWind,
  formatDayLabel,
  formatHourLabel,
  formatPrecipValue,
  formatPressureValue,
  formatTemp,
  formatVisibility,
  precipUnitLabel,
  pressureUnitLabel,
  windUnitLabel,
} from '../utils/format';
import type { AppTheme } from '../theme/palettes';
import type { HourPoint, PastDayActual } from '../api/types';

export interface GraphExplorerProps {
  theme: AppTheme;
  hourlyAll: HourPoint[];
  pastDays: PastDayActual[];
}

type RangeKey = '24h' | '7d' | '30d';

interface HourlyMetric {
  key: string;
  labelKey: StringKey;
  color: string;
  extract: (point: HourPoint) => number | null;
  format: (value: number) => string;
}

interface DailySeries {
  color: string;
  prefixKey?: StringKey;
  extract: (row: PastDayActual) => number | null;
}

interface DailyMetric {
  key: string;
  labelKey: StringKey;
  format: (value: number) => string;
  series: DailySeries[];
}

/** Metric resolved against the current slice, ready to draw. */
interface ActiveView {
  labelKey: StringKey;
  format: (value: number) => string;
  series: Array<{ color: string; prefixKey?: StringKey; values: Array<number | null> }>;
  /** Scrub/readout time for a point index. */
  timeLabel: (index: number) => string;
  /** Axis tick label for a point index. */
  axisLabel: (index: number) => string;
}

const PAD = 14;
const CHART_HEIGHT = 130;
const PLOT_TOP = 14;
const DRAW_MS = 900;

/** A colour at a given alpha, for the hex series colours used here. */
function fadeGradient(color: string, alpha: number): string {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (!hex) return color;
  const value = parseInt(hex[1], 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function pathFrom(d: string): SkPath {
  return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();
}
/** Same bottom inset DetailChart uses: 130 - 14 - 16. */
const PLOT_BOTTOM = CHART_HEIGHT - 14 - 16;
const AXIS_LABEL_WIDTH = 46;
/**
 * How many daily rows the 30-day range is allowed to draw. The persisted
 * archive snapshot keeps up to 40 rows (slack for lagging archive rows), so
 * plotting everything would quietly draw more days than the label promises.
 */
const DAILY_RANGE_DAYS = 30;

const RANGE_OPTIONS: ReadonlyArray<{ key: RangeKey; labelKey: StringKey }> = [
  { key: '24h', labelKey: 'gx_range_24h' },
  { key: '7d', labelKey: 'gx_range_7d' },
  { key: '30d', labelKey: 'gx_range_30d' },
];

const RANGE_LABEL_KEYS: Record<RangeKey, StringKey> = {
  '24h': 'gx_range_24h',
  '7d': 'gx_range_7d',
  '30d': 'gx_range_30d',
};

/** Metrics offered on the hourly ranges (24 h / 7 d), drawn from HourPoint. */
const HOURLY_METRICS: HourlyMetric[] = [
  { key: 'temperature', labelKey: 'gx_temp', color: '#F5A962', extract: (point) => point.temperature, format: formatTemp },
  { key: 'apparent', labelKey: 'gx_apparent', color: '#E8927C', extract: (point) => point.apparent, format: formatTemp },
  { key: 'precipProb', labelKey: 'gx_precip_prob', color: '#6FA8DC', extract: (point) => point.precipProbability, format: (value) => `${Math.round(value)}%` },
  { key: 'precipAmt', labelKey: 'gx_precip_amt', color: '#5BC98C', extract: (point) => point.precipitation, format: (value) => `${formatPrecipValue(value)} ${precipUnitLabel()}` },
  { key: 'wind', labelKey: 'gx_wind', color: '#8FD0B8', extract: (point) => point.windSpeed, format: (value) => `${Math.round(convertWind(value))} ${windUnitLabel()}` },
  { key: 'gusts', labelKey: 'gx_gusts', color: '#B8E0C8', extract: (point) => point.windGusts, format: (value) => `${Math.round(convertWind(value))} ${windUnitLabel()}` },
  { key: 'windDir', labelKey: 'gx_wind_dir', color: '#C9C4E8', extract: (point) => point.windDirection, format: (value) => `${compassLabel(value)} ${Math.round(value)}°` },
  { key: 'pressure', labelKey: 'gx_pressure', color: '#B9A7F5', extract: (point) => point.pressure, format: (value) => `${formatPressureValue(value)} ${pressureUnitLabel()}` },
  { key: 'humidity', labelKey: 'gx_humidity', color: '#8ED0F5', extract: (point) => point.humidity, format: (value) => `${Math.round(value)}%` },
  { key: 'uv', labelKey: 'gx_uv', color: '#E8D05A', extract: (point) => point.uvIndex, format: (value) => value.toFixed(1) },
  { key: 'visibility', labelKey: 'gx_visibility', color: '#B8C6D4', extract: (point) => point.visibility, format: formatVisibility },
  { key: 'cape', labelKey: 'gx_cape', color: '#E85F5F', extract: (point) => point.cape, format: (value) => `${Math.round(value)} J/kg` },
];

/** The 30-day range offers only daily actuals: high/low pair + precipitation. */
const DAILY_METRICS: DailyMetric[] = [
  {
    key: 'temperature',
    labelKey: 'gx_temp',
    format: formatTemp,
    series: [
      { color: '#F5A962', prefixKey: 'gx_high', extract: (row) => row.tMax },
      { color: '#6FA8DC', prefixKey: 'gx_low', extract: (row) => row.tMin },
    ],
  },
  {
    key: 'precipitation',
    labelKey: 'gx_precip_amt',
    format: (value) => `${formatPrecipValue(value)} ${precipUnitLabel()}`,
    series: [{ color: '#5BC98C', extract: (row) => row.precipSum }],
  },
];

/**
 * Localized short weekday for a past-day row. Archive rows are always in the
 * past, so we pass an index >= 2 to skip formatDayLabel's Today/Tomorrow
 * special cases (they would mislabel the oldest rows) and take its weekday
 * branch for the row's actual date.
 */
function pastDayLabel(date: string): string {
  const WEEKDAY_INDEX = 2;
  return formatDayLabel(date, WEEKDAY_INDEX);
}

/**
 * Short localized date for the scrub readout, e.g. "Sep 3" - follows the in-app
 * language, not the device (same idiom as the past-week card). A bare weekday
 * would repeat four times across a 30-day range, and the naive local-noon parse
 * keeps the day from drifting when the device sits behind UTC.
 */
function pastDayDate(date: string): string {
  const time = Date.parse(`${date}T12:00:00`);
  return Number.isNaN(time)
    ? '--'
    : new Date(time).toLocaleDateString(getLanguage(), { month: 'short', day: 'numeric' });
}


export function GraphExplorer({ theme, hourlyAll, pastDays }: GraphExplorerProps) {
  const [range, setRange] = useState<RangeKey>('24h');
  const [metric, setMetric] = useState('temperature');
  const [selIdx, setSelIdx] = useState(0);
  const [plotWidth, setPlotWidth] = useState(0);
  const drawKey = `${range}|${metric}`;
  const reduced = useReducedMotion();
  const draw = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      draw.value = 1;
      return;
    }
    draw.value = 0;
    draw.value = withTiming(1, { duration: DRAW_MS, easing: Easing.out(Easing.cubic) });
  }, [drawKey, reduced, draw]);

  const slice = useMemo(() => {
    if (range === '30d') return [];
    const nowIdx = Math.max(0, hourlyAll.findIndex((point) => point.isNow));
    const length = range === '24h' ? 24 : 168;
    return hourlyAll.slice(nowIdx, nowIdx + length);
  }, [hourlyAll, range]);

  // Archive rows arrive oldest-first from both the fetch and the cache merge;
  // keep only the newest window the range advertises.
  const dailyRows = useMemo(() => pastDays.slice(-DAILY_RANGE_DAYS), [pastDays]);

  // A metric is offered only when its extractor yields >= 2 non-null values
  // in the current slice; no metrics at all means the empty state.
  const availableKeys = useMemo(() => {
    if (range === '30d') {
      if (dailyRows.length < 2) return [];
      return DAILY_METRICS.filter((entry) =>
        entry.series.every(
          (series) => dailyRows.filter((row) => series.extract(row) !== null).length >= 2,
        ),
      ).map((entry) => entry.key);
    }
    if (slice.length < 2) return [];
    return HOURLY_METRICS.filter(
      (entry) => slice.filter((point) => entry.extract(point) !== null).length >= 2,
    ).map((entry) => entry.key);
  }, [range, slice, dailyRows]);

  // The active metric can lose its data when the range changes - fall back to
  // the first available one. The render already guards via `activeKey` below.
  useEffect(() => {
    if (availableKeys.length > 0 && !availableKeys.includes(metric)) {
      setMetric(availableKeys[0]);
      setSelIdx(0);
    }
  }, [availableKeys, metric]);

  const activeKey = availableKeys.includes(metric) ? metric : availableKeys[0] ?? null;

  const view = useMemo<ActiveView | null>(() => {
    if (activeKey === null) return null;
    if (range === '30d') {
      const entry = DAILY_METRICS.find((candidate) => candidate.key === activeKey);
      if (!entry || dailyRows.length < 2) return null;
      return {
        labelKey: entry.labelKey,
        format: entry.format,
        series: entry.series.map((series) => ({
          color: series.color,
          prefixKey: series.prefixKey,
          values: dailyRows.map((row) => series.extract(row)),
        })),
        timeLabel: (index) => pastDayDate(dailyRows[index]?.date ?? ''),
        axisLabel: (index) => pastDayLabel(dailyRows[index]?.date ?? ''),
      };
    }
    const entry = HOURLY_METRICS.find((candidate) => candidate.key === activeKey);
    if (!entry || slice.length < 2) return null;
    const tick = (index: number) => {
      const point = slice[index];
      return point ? formatHourLabel(point.time, point.isNow) : '--';
    };
    return {
      labelKey: entry.labelKey,
      format: entry.format,
      series: [{ color: entry.color, values: slice.map((point) => entry.extract(point)) }],
      timeLabel: tick,
      axisLabel: tick,
    };
  }, [range, activeKey, slice, dailyRows]);

  const rangeLabel = t(RANGE_LABEL_KEYS[range]);
  const granularityLabel = t(range === '30d' ? 'gx_daily' : 'gx_hourly');
  const rangeBlock = (
    <SlidingGroup
      theme={theme}
      activeIndex={RANGE_OPTIONS.findIndex((option) => option.key === range)}
      color={theme.isLight ? '#FFFFFF' : '#F4F6FA'}
      style={[styles.rangeRow, { backgroundColor: theme.chipBg }]}
    >
      {RANGE_OPTIONS.map((option, index) => {
        const label = t(option.labelKey);
        const active = range === option.key;
        return (
          <SlidingItem
            key={option.key}
            index={index}
            onPress={() => {
              if (!active) {
                haptics.select();
                setRange(option.key);
                setSelIdx(0);
              }
            }}
            style={styles.rangeOption}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t('gx_a11y_range').replace('{n}', label)}
          >
            <Text
              style={[styles.rangeOptionText, { color: active ? theme.textPrimary : theme.textTertiary }]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </SlidingItem>
        );
      })}
    </SlidingGroup>
  );

  // No metric works for this range (or the slice is too short): the range
  // picker stays so the user can switch ranges, but chart, chips and hint go.
  if (view === null) {
    return (
      <View style={styles.root}>
        {rangeBlock}
        <Text style={[styles.granularity, { color: theme.textTertiary }]}>{granularityLabel}</Text>
        <Text style={[styles.empty, { color: theme.textTertiary }]}>{t('gx_empty')}</Text>
      </View>
    );
  }

  const n = view.series[0].values.length;
  const sel = Math.min(Math.max(selIdx, 0), Math.max(n - 1, 0));

  const flatValues = view.series
    .flatMap((series) => series.values)
    .filter((value): value is number => value !== null);
  let min = Math.min(...flatValues);
  let max = Math.max(...flatValues);
  const padY = Math.max((max - min) * 0.12, 0.001);
  min -= padY;
  max += padY;

  const innerWidth = Math.max(plotWidth - PAD * 2, 1);
  const xAt = (index: number) => PAD + (n > 1 ? (index / (n - 1)) * innerWidth : innerWidth / 2);
  const yAt = (value: number) => scaleY(value, min, max, PLOT_TOP, PLOT_BOTTOM);
  const xSel = xAt(sel);

  const paths = view.series.map((series) => {
    const points: CurvePoint[] = [];
    series.values.forEach((value, index) => {
      if (value !== null) points.push({ x: xAt(index), y: yAt(value) });
    });
    return points.length >= 2 ? smoothPath(points) : '';
  });
  // The first series gets a gradient fill down to the axis, from its first point to its last.
  const firstSeriesPoints: CurvePoint[] = [];
  view.series[0]?.values.forEach((value, index) => {
    if (value !== null) firstSeriesPoints.push({ x: xAt(index), y: yAt(value) });
  });
  const fillPath =
    firstSeriesPoints.length >= 2 && paths[0]
      ? `${paths[0]} L ${firstSeriesPoints[firstSeriesPoints.length - 1].x.toFixed(1)} ${CHART_HEIGHT - 6} L ${firstSeriesPoints[0].x.toFixed(1)} ${CHART_HEIGHT - 6} Z`
      : '';

  const scrubTo = (x: number) => {
    if (n < 2) return;
    const raw = Math.round(((x - PAD) / innerWidth) * (n - 1));
    const next = Math.min(n - 1, Math.max(0, raw));
    if (next !== sel) {
      setSelIdx(next);
      haptics.light();
    }
  };
  const onScrub = (event: GestureResponderEvent) => scrubTo(event.nativeEvent.locationX);

  const readoutValue = view.series
    .map((series) => {
      const value = series.values[sel];
      const formatted = value === null ? '--' : view.format(value);
      return series.prefixKey ? `${t(series.prefixKey)} ${formatted}` : formatted;
    })
    .join(' · ');
  const readoutTime = view.timeLabel(sel);
  const chartA11y = t('gx_chart_a11y')
    .replace('{metric}', t(view.labelKey))
    .replace('{range}', rangeLabel)
    .replace('{value}', readoutValue)
    .replace('{time}', readoutTime);

  // One tick every Nth point keeps labels readable across the whole width.
  const tickStep = range === '24h' ? 6 : range === '7d' ? 24 : 5;
  const axisIndices: number[] = [];
  for (let index = 0; index < n; index += tickStep) axisIndices.push(index);

  const chips = (range === '30d'
    ? DAILY_METRICS.map((entry) => ({
        key: entry.key,
        label: t(entry.labelKey),
        color: entry.series[0].color,
      }))
    : HOURLY_METRICS.map((entry) => ({
        key: entry.key,
        label: t(entry.labelKey),
        color: entry.color,
      }))
  ).filter((chip) => availableKeys.includes(chip.key));

  return (
    <View style={styles.root}>
      {rangeBlock}
      <Text style={[styles.granularity, { color: theme.textTertiary }]}>{granularityLabel}</Text>

      <Text
        style={[styles.readout, { color: theme.textPrimary }]}
        numberOfLines={2}
        accessibilityLiveRegion="polite"
        accessibilityLabel={chartA11y}
      >
        {readoutValue} · {readoutTime}
      </Text>

      <View
        style={styles.plot}
        onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={(event) => {
          scrubTo(event.nativeEvent.locationX);
          return true;
        }}
        onResponderMove={onScrub}
        onResponderTerminationRequest={() => true}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Canvas style={{ width: plotWidth, height: CHART_HEIGHT }}>
          {fillPath ? (
            <Group opacity={draw}>
              <Path path={pathFrom(fillPath)}>
                <LinearGradient
                  start={vec(0, PLOT_TOP)}
                  end={vec(0, CHART_HEIGHT - 6)}
                  colors={[fadeGradient(view.series[0].color, 0.3), fadeGradient(view.series[0].color, 0)]}
                />
              </Path>
            </Group>
          ) : null}
          {paths.map((path, index) =>
            path ? (
              <Path
                key={`line-${index}`}
                path={pathFrom(path)}
                style="stroke"
                strokeWidth={2.5}
                strokeCap="round"
                color={view.series[index].color}
                start={0}
                end={draw}
              />
            ) : null,
          )}
          <Path path={pathFrom(`M ${xSel} ${PLOT_TOP - 6} L ${xSel} ${CHART_HEIGHT - 6}`)} style="stroke" strokeWidth={1} color={theme.textTertiary} opacity={0.6}>
            <DashPathEffect intervals={[4, 4]} />
          </Path>
          {view.series.map((series, index) => {
            const value = series.values[sel];
            if (value === null) return null;
            return (
              <React.Fragment key={`dot-${index}`}>
                <Circle cx={xSel} cy={yAt(value)} r={5} color={theme.isLight ? '#FFFFFF' : '#F6F9FD'} />
                <Circle cx={xSel} cy={yAt(value)} r={5} color={series.color} style="stroke" strokeWidth={2.5} />
              </React.Fragment>
            );
          })}
        </Canvas>
      </View>

      <View style={styles.axis}>
        {axisIndices.map((index) => (
          <Text
            key={`tick-${index}`}
            numberOfLines={1}
            style={[
              styles.axisLabel,
              {
                color: theme.textTertiary,
                left: Math.max(
                  0,
                  Math.min(xAt(index) - AXIS_LABEL_WIDTH / 2, Math.max(plotWidth - AXIS_LABEL_WIDTH, 0)),
                ),
              },
            ]}
          >
            {view.axisLabel(index)}
          </Text>
        ))}
      </View>

      <SlidingGroup
        theme={theme}
        variant="ring"
        activeIndex={chips.findIndex((chip) => chip.key === activeKey)}
        color={chips.find((chip) => chip.key === activeKey)?.color}
        fill={tint(chips.find((chip) => chip.key === activeKey)?.color)}
        strokeWidth={1}
        radius={999}
        style={styles.chips}
      >
        {chips.map((chip, index) => {
          const active = chip.key === activeKey;
          return (
            <SlidingItem
              key={chip.key}
              index={index}
              onPress={() => {
                if (!active) {
                  haptics.select();
                  setMetric(chip.key);
                  setSelIdx(0);
                }
              }}
              style={[styles.chip, { backgroundColor: theme.chipBg }]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t('gx_a11y_metric').replace('{n}', chip.label)}
            >
              <Text
                style={[styles.chipText, { color: active ? theme.textPrimary : theme.textTertiary }]}
                numberOfLines={1}
              >
                {chip.label}
              </Text>
            </SlidingItem>
          );
        })}
      </SlidingGroup>

      <Text style={[styles.hint, { color: theme.textTertiary }]}>{t('gx_scrub_hint')}</Text>
    </View>
  );
}

/** Translucent tint of a metric's colour, used behind its selected chip. */
const tint = (color?: string) => (color ? `${color}26` : undefined);

const styles = StyleSheet.create({
  root: {
    gap: 10,
  },
  rangeRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  rangeOption: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeOptionText: {
    fontSize: 12.5,
    fontFamily: F.semibold,
  },
  granularity: {
    fontSize: 11,
    fontFamily: F.medium,
    textAlign: 'center',
    marginTop: -4,
  },
  readout: {
    fontSize: 15,
    fontFamily: F.semibold,
  },
  plot: {
    height: CHART_HEIGHT,
  },
  axis: {
    height: 16,
    position: 'relative',
  },
  axisLabel: {
    position: 'absolute',
    width: AXIS_LABEL_WIDTH,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: F.regular,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipText: {
    fontSize: 12,
    fontFamily: F.medium,
  },
  hint: {
    fontSize: 11,
    fontFamily: F.regular,
    textAlign: 'center',
  },
  empty: {
    fontSize: 13,
    fontFamily: F.medium,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
