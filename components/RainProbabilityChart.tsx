import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Group, LinearGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { t } from '../utils/i18n';
import type { AppTheme } from '../theme/palettes';
import type { HourPoint } from '../api/types';
import { formatHourLabel } from '../utils/format';
import { F } from '../theme/typography';
import { useReducedMotion } from '../utils/reduceMotion';

interface RainProbabilityChartProps {
  theme: AppTheme;
  hours: HourPoint[];
}

const BAR_COUNT = 12;
const CHART_HEIGHT = 132;
const BAR_WIDTH = 9;
const GUTTER_LEFT = 48;
const GUTTER_RIGHT = 4;
/** Each bar grows in turn, this many ms apart. */
const STAGGER_MS = 35;
const GROW_MS = 520;

export function RainProbabilityChart({ theme, hours }: RainProbabilityChartProps) {
  const slice = hours.slice(0, BAR_COUNT);
  const reduced = useReducedMotion();
  const [plotWidth, setPlotWidth] = useState(0);
  const grow = useSharedValue(reduced ? 1 : 0);
  const dataKey = slice.map((item) => `${item.time}:${item.precipProbability}`).join('|');

  useEffect(() => {
    if (reduced) {
      grow.value = 1;
      return;
    }
    grow.value = 0;
    grow.value = withDelay(120, withTiming(1, { duration: GROW_MS + STAGGER_MS * BAR_COUNT, easing: Easing.out(Easing.cubic) }));
  }, [dataKey, reduced, grow]);

  if (!slice.length) return null;

  const peak = slice.reduce(
    (best, item) => (item.precipProbability > best.precipProbability ? item : best),
    slice[0],
  );
  const peakIndex = slice.indexOf(peak);
  const plotLeft = GUTTER_LEFT;
  const plotRight = Math.max(plotWidth - GUTTER_RIGHT, plotLeft);
  const columnWidth = plotWidth > 0 ? (plotRight - plotLeft) / slice.length : 0;
  const barHeightFor = (value: number) => Math.max(6, (value / 100) * (CHART_HEIGHT - 34));

  return (
    <View
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={t('chart_rain_a11y')
        .replace('{time}', formatHourLabel(peak.time, false))
        .replace('{n}', String(Math.round(peak.precipProbability)))}
    >
      <View style={[styles.chartArea, { height: CHART_HEIGHT }]} onLayout={(event: LayoutChangeEvent) => setPlotWidth(event.nativeEvent.layout.width)}>
        {[
          { label: t('rain_band_heavy'), ratio: 0.06 },
          { label: t('rain_band_moderate'), ratio: 0.42 },
          { label: t('rain_band_light'), ratio: 0.78 },
        ].map(({ label, ratio }) => (
          <View key={label} style={[styles.bandLine, { top: `${ratio * 100}%` }]} pointerEvents="none">
            <View style={[styles.bandDash, { backgroundColor: theme.trackColor }]} />
            <Text
              style={[styles.bandLabel, { color: theme.textTertiary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {label}
            </Text>
          </View>
        ))}

        {plotWidth > 0 ? (
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            {slice.map((item, index) => (
              <RainBar
                key={item.time}
                x={plotLeft + index * columnWidth + (columnWidth - BAR_WIDTH) / 2}
                targetHeight={barHeightFor(item.precipProbability)}
                chartHeight={CHART_HEIGHT}
                index={index}
                grow={grow}
              />
            ))}
          </Canvas>
        ) : null}

        {plotWidth > 0 && peak.precipProbability >= 15 ? (
          <View
            pointerEvents="none"
            style={[
              styles.peakChip,
              {
                backgroundColor: '#3D6FD8',
                left: plotLeft + peakIndex * columnWidth + columnWidth / 2 - 22,
                top: CHART_HEIGHT - barHeightFor(peak.precipProbability) - 36,
              },
            ]}
          >
            <Text style={styles.peakText}>{Math.round(peak.precipProbability)}%</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.timesRow}>
        {slice.map((item, index) => (
          <Text
            key={item.time}
            style={[styles.timeLabel, { color: theme.textTertiary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {index % 2 === 0 ? formatHourLabel(item.time, item.isNow) : ''}
          </Text>
        ))}
      </View>
      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        {t('chart_rain_caption')}
      </Text>
    </View>
  );
}

/** One bar: a gradient rounded rect that grows from the baseline. */
function RainBar({
  x,
  targetHeight,
  chartHeight,
  index,
  grow,
}: {
  x: number;
  targetHeight: number;
  chartHeight: number;
  index: number;
  grow: SharedValue<number>;
}) {
  const height = useDerivedValue(() => {
    // Each bar starts a little after the one before it.
    const local = Math.min(1, Math.max(0, (grow.value * (GROW_MS + STAGGER_MS * 12) - index * STAGGER_MS) / GROW_MS));
    return targetHeight * local;
  });
  const y = useDerivedValue(() => chartHeight - height.value);
  return (
    <RoundedRect x={x} y={y} width={BAR_WIDTH} height={height} r={5}>
      <LinearGradient start={vec(0, 0)} end={vec(0, chartHeight)} colors={['#AECFF2', '#4A7DD8']} />
    </RoundedRect>
  );
}

const styles = StyleSheet.create({
  chartArea: {
    marginTop: 4,
  },
  bandLine: {
    position: 'absolute',
    left: 52,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 0,
  },
  bandDash: {
    flex: 1,
    height: 1,
    opacity: 0.6,
  },
  bandLabel: {
    position: 'absolute',
    left: -50,
    fontSize: 11.5,
    width: 44,
    fontFamily: F.regular,
    textAlign: 'right',
  },
  peakChip: {
    position: 'absolute',
    width: 44,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignItems: 'center',
  },
  peakText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: F.bold,
  },
  timesRow: {
    flexDirection: 'row',
    // mirror the chart gutters so label centers stay on bar centers
    paddingLeft: 48,
    paddingRight: 4,
    marginTop: 10,
  },
  timeLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11.5,
    fontFamily: F.medium,
  },
  caption: {
    fontSize: 11.5,
    marginTop: 8,
    fontFamily: F.regular,
  },
});
