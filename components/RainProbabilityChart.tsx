import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppTheme } from '../theme/palettes';
import type { HourPoint } from '../api/types';
import { formatHourLabel } from '../utils/format';
import { F } from '../theme/typography';

interface RainProbabilityChartProps {
  theme: AppTheme;
  hours: HourPoint[];
}

const BAR_COUNT = 12;
const CHART_HEIGHT = 132;
const BAR_WIDTH = 9;

export function RainProbabilityChart({ theme, hours }: RainProbabilityChartProps) {
  const slice = hours.slice(0, BAR_COUNT);
  if (!slice.length) return null;

  const peak = slice.reduce(
    (best, item) => (item.precipProbability > best.precipProbability ? item : best),
    slice[0],
  );
  const peakIndex = slice.indexOf(peak);

  return (
    <View>
      <View style={[styles.chartArea, { height: CHART_HEIGHT }]}>
        {[
          { label: 'Heavy', ratio: 0.06 },
          { label: 'Moderate', ratio: 0.42 },
          { label: 'Light', ratio: 0.78 },
        ].map(({ label, ratio }) => (
          <View key={label} style={[styles.bandLine, { top: `${ratio * 100}%` }]} pointerEvents="none">
            <View style={[styles.bandDash, { backgroundColor: theme.trackColor }]} />
            <Text style={[styles.bandLabel, { color: theme.textTertiary }]}>{label}</Text>
          </View>
        ))}

        <View style={styles.barsRow}>
          {slice.map((item, index) => {
            const isPeak = index === peakIndex && peak.precipProbability >= 15;
            const barHeight = Math.max(
              6,
              (item.precipProbability / 100) * (CHART_HEIGHT - 34),
            );
            return (
              <View key={item.time} style={styles.barColumn}>
                {isPeak ? (
                  <View style={[styles.peakChip, { backgroundColor: '#3D6FD8' }]}>
                    <Text style={styles.peakText}>{Math.round(item.precipProbability)}%</Text>
                  </View>
                ) : (
                  <View style={styles.peakSpacer} />
                )}
                <View style={[styles.bar, { height: barHeight }]}>
                  <LinearGradient
                    colors={['#4A7DD8', '#AECFF2'] as [string, string]}
                    locations={[0, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.timesRow}>
        {slice.map((item, index) => (
          <Text key={item.time} style={[styles.timeLabel, { color: theme.textTertiary }]}>
            {index % 2 === 0 ? formatHourLabel(item.time, item.isNow) : ''}
          </Text>
        ))}
      </View>
      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        Chance of rain · next 12 hours
      </Text>
    </View>
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
    width: 44,    fontFamily: F.regular,

    textAlign: 'right',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingLeft: 8,
    paddingRight: 4,
    height: '100%',
    zIndex: 1,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  peakChip: {
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 6,
  },
  peakText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: F.bold,
  },
  peakSpacer: {
    height: 26,
    marginBottom: 6,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 5,
    overflow: 'hidden',
  },
  timesRow: {
    flexDirection: 'row',
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
    marginTop: 8,    fontFamily: F.regular,

  },
});
