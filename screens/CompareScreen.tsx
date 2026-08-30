import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from '../utils/uiIcons';
import { F } from '../theme/typography';
import { WeatherIcon } from '../components/WeatherIcon';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { formatTemp, convertWind, windUnitLabel } from '../utils/format';
import { describeWmo } from '../utils/wmo';
import type { AppTheme } from '../theme/palettes';
import type { ComparisonEntry } from '../hooks/useCityComparison';

interface CompareScreenProps {
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  entries: ComparisonEntry[];
  status: 'idle' | 'loading' | 'ready';
}

const LABEL_WIDTH = 92;
const COL_WIDTH = 104;

interface Metric {
  label: string;
  value: (entry: ComparisonEntry) => string;
  rank: (entry: ComparisonEntry) => number | null;
  better: 'low' | 'high';
}

export function CompareScreen({ theme, visible, onClose, entries, status }: CompareScreenProps) {
  const insets = useSafeAreaInsets();
  const valid = entries.filter((entry) => entry.data !== null);

  const metrics: Metric[] = [
    {
      label: 'Temp',
      value: (entry) => (entry.data ? formatTemp(entry.data.current.temperature) : '--'),
      rank: (entry) => (entry.data ? entry.data.current.temperature : null),
      better: 'low',
    },
    {
      label: 'Feels',
      value: (entry) => (entry.data ? formatTemp(entry.data.current.apparentTemperature) : '--'),
      rank: (entry) => (entry.data ? entry.data.current.apparentTemperature : null),
      better: 'low',
    },
    {
      label: 'Rain',
      value: (entry) => {
        if (!entry.data) return '--';
        const max = Math.max(...entry.data.hourly.slice(0, 12).map((h) => h.precipProbability), 0);
        return `${Math.round(max)}%`;
      },
      rank: (entry) => {
        if (!entry.data) return null;
        return Math.max(...entry.data.hourly.slice(0, 12).map((h) => h.precipProbability), 0);
      },
      better: 'low',
    },
    {
      label: 'Wind',
      value: (entry) =>
        entry.data ? `${Math.round(convertWind(entry.data.current.windSpeed))}` : '--',
      rank: (entry) => (entry.data ? entry.data.current.windSpeed : null),
      better: 'low',
    },
    {
      label: 'AQI',
      value: (entry) => {
        const aqi = entry.data?.aqi?.usAqi;
        return aqi === null || aqi === undefined ? '--' : String(Math.round(aqi));
      },
      rank: (entry) => {
        const aqi = entry.data?.aqi?.usAqi;
        return aqi === null || aqi === undefined ? null : aqi;
      },
      better: 'low',
    },
  ];

  const bestIndexes = metrics.map((metric) => {
    const ranked = valid
      .map((entry, index) => ({ index, value: metric.rank(entry) }))
      .filter((item): item is { index: number; value: number } => item.value !== null);
    if (ranked.length < 2) return -1;
    ranked.sort((a, b) => (metric.better === 'low' ? a.value - b.value : b.value - a.value));
    return ranked[0].index;
  });

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 12 }]}
    >
      <AnimatedBackground gradient={theme.gradient} />

      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>SIDE BY SIDE</Text>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Compare cities</Text>
        </View>
        <Text style={[styles.count, { color: theme.textTertiary }]}>{valid.length} live</Text>
      </View>

      {status === 'loading' ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.textPrimary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Fetching weather for {entries.length} cities...
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tableContent}
        >
          <View>
            <View style={styles.headerRow}>
              <View style={[styles.labelCell, { width: LABEL_WIDTH }]} />
              {entries.map((entry) => {
                return (
                  <View key={entry.city.id} style={[styles.cityCell, { width: COL_WIDTH }]}>
                    {entry.data ? (
                      <WeatherIcon
                        code={entry.data.current.weatherCode}
                        isDay={entry.data.current.isDay}
                        size={26}
                        themeColor={theme.textPrimary}
                      />
                    ) : null}
                    <Text style={[styles.cityName, { color: theme.textPrimary }]} numberOfLines={2}>
                      {entry.city.name}
                    </Text>
                  </View>
                );
              })}
            </View>

            {metrics.map((metric, metricIndex) => {
              const best = bestIndexes[metricIndex];
              return (
                <View
                  key={metric.label}
                  style={[styles.metricRow, { borderTopColor: theme.trackColor }]}
                >
                  <View style={[styles.labelCell, { width: LABEL_WIDTH }]}>
                    <Text style={[styles.metricLabel, { color: theme.textTertiary }]}>
                      {metric.label}
                    </Text>
                  </View>
                  {entries.map((entry, cityIndex) => {
                    const isBest = cityIndex === best;
                    const value = metric.value(entry);
                    const isWind = metric.label === 'Wind';
                    return (
                      <View key={entry.city.id} style={[styles.valueCell, { width: COL_WIDTH }]}>
                        <Text
                          style={[
                            styles.valueText,
                            { color: theme.textPrimary },
                            isBest && { color: '#5BC98C' },
                          ]}
                        >
                          {value}
                          {isWind && value !== '--' ? ` ${windUnitLabel()}` : ''}
                        </Text>
                        {isBest ? (
                          <Text style={[styles.bestTag, { color: '#5BC98C' }]}>best</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              );
            })}

            <View style={[styles.metricRow, { borderTopColor: theme.trackColor }]}>
              <View style={[styles.labelCell, { width: LABEL_WIDTH }]}>
                <Text style={[styles.metricLabel, { color: theme.textTertiary }]}>Sky</Text>
              </View>
              {entries.map((entry) => {
                const code = entry.data?.current.weatherCode;
                const label = code !== undefined ? describeWmo(code).label : '--';
                return (
                  <View key={entry.city.id} style={[styles.valueCell, { width: COL_WIDTH }]}>
                    <Text style={[styles.skyText, { color: theme.textSecondary }]} numberOfLines={2}>
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}

      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        Best value per row highlighted · live data
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    gap: 16,
    zIndex: 45,
    elevation: 45,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerTexts: {
    gap: 2,
  },
  eyebrow: {
    fontSize: 12,
    fontFamily: F.bold,
    letterSpacing: 2.2,
  },
  title: {
    fontSize: 32,
    fontFamily: F.bold,
    letterSpacing: -0.5,
  },
  count: {
    fontSize: 13,
    fontFamily: F.semibold,
    marginBottom: 6,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    fontSize: 14,
  },
  tableContent: {
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  cityCell: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  cityName: {
    fontSize: 13,
    fontFamily: F.semibold,
    textAlign: 'center',
  },
  metricRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  labelCell: {
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 12.5,
    fontFamily: F.semibold,
  },
  valueCell: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
  },
  valueText: {
    fontSize: 17,
    fontFamily: F.semibold,
  },
  bestTag: {
    fontSize: 10,
    fontFamily: F.bold,
    letterSpacing: 0.6,
  },
  skyText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  caption: {
    textAlign: 'center',
    fontSize: 12,
  },
});
