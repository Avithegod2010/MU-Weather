import { SlidingGroup, SlidingItem } from '../components/Sliding';
import React, { useEffect, useState } from 'react';
import { t } from '../utils/i18n';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {  } from '../utils/uiIcons';
import { F } from '../theme/typography';
import { WeatherIcon } from '../components/WeatherIcon';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { TwoCityComparePanel } from '../components/TwoCityComparePanel';
import { formatTemp, convertWind, windUnitLabel } from '../utils/format';
import { describeWmo } from '../utils/wmo';
import type { AppTheme } from '../theme/palettes';
import type { GeoLocation } from '../api/types';
import type { ComparisonEntry } from '../hooks/useCityComparison';
import { useClimateNormals } from '../hooks/useClimateNormals';

interface CompareScreenProps {
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  entries: ComparisonEntry[];
  status: 'idle' | 'loading' | 'ready';
  /** Saved cities, for the two-city picker. */
  favorites: GeoLocation[];
  /** Re-run the comparison fetch (used by the two-city column retry). */
  onRetry?: () => void;
}

type CompareTab = 'metrics' | 'two';

const LABEL_WIDTH = 92;
const COL_WIDTH = 104;

interface Metric {
  label: string;
  value: (entry: ComparisonEntry) => string;
  rank: (entry: ComparisonEntry) => number | null;
  better: 'low' | 'high';
}

export function CompareScreen({ theme, visible, onClose, entries, status, favorites, onRetry }: CompareScreenProps) {
  const insets = useSafeAreaInsets();
  const valid = entries.filter((entry) => entry.data !== null);

  // Two-city pair, held locally: the picker is view state, not fetched data, so
  // it must not re-trigger the comparison hook. Default to the first two saved
  // cities, and keep the pair valid when a city is removed from favorites.
  const [tab, setTab] = useState<CompareTab>('metrics');
  const [selection, setSelection] = useState<[string | null, string | null]>([null, null]);
  useEffect(() => {
    if (!visible) return;
    setSelection((current) => {
      const ids = favorites.map((city) => city.id);
      const nextA = current[0] && ids.includes(current[0]) ? current[0] : ids[0] ?? null;
      // Never let both columns show the same city.
      const nextB =
        current[1] && ids.includes(current[1]) && current[1] !== nextA
          ? current[1]
          : ids.find((id) => id !== nextA) ?? null;
      if (nextA === current[0] && nextB === current[1]) return current;
      return [nextA, nextB];
    });
  }, [visible, favorites]);

  const handleSelect = (slot: 0 | 1, cityId: string) => {
    setSelection((current) => {
      const next: [string | null, string | null] = [current[0], current[1]];
      next[slot] = cityId;
      // Swapping to a city the other column already shows moves the other one
      // along, so the user can never end up comparing a city with itself.
      const other = slot === 0 ? 1 : 0;
      if (next[0] !== null && next[0] === next[1]) {
        next[other] = current[slot];
      }
      return next;
    });
  };

  // The hook already fetched every saved city, so the two-city tab just picks
  // two of those results rather than fetching again.
  const pairEntries: [ComparisonEntry | null, ComparisonEntry | null] = [
    entries.find((entry) => entry.city.id === selection[0]) ?? null,
    entries.find((entry) => entry.city.id === selection[1]) ?? null,
  ];
  const climateA = useClimateNormals(visible && tab === 'two' ? pairEntries[0]?.city ?? null : null);
  const climateB = useClimateNormals(visible && tab === 'two' ? pairEntries[1]?.city ?? null : null);

  const metrics: Metric[] = [
    {
      label: t('cmp_temp'),
      value: (entry) => (entry.data ? formatTemp(entry.data.current.temperature) : '--'),
      rank: (entry) => (entry.data ? entry.data.current.temperature : null),
      better: 'low',
    },
    {
      label: t('cmp_feels'),
      value: (entry) => (entry.data ? formatTemp(entry.data.current.apparentTemperature) : '--'),
      rank: (entry) => (entry.data ? entry.data.current.apparentTemperature : null),
      better: 'low',
    },
    {
      label: t('cmp_rain'),
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
      label: t('cmp_wind'),
      value: (entry) =>
        entry.data ? `${Math.round(convertWind(entry.data.current.windSpeed))}` : '--',
      rank: (entry) => (entry.data ? entry.data.current.windSpeed : null),
      better: 'low',
    },
    {
      label: t('cmp_aqi'),
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
          <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>{t('cmp_eyebrow')}</Text>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {tab === 'two' ? t('c2_title') : t('cmp_title')}
          </Text>
        </View>
        <Text style={[styles.count, { color: theme.textTertiary }]}>
          {t('cmp_live').split('{n}').join(String(valid.length))}
        </Text>
      </View>

      {/* Tabs: the original all-cities metrics table, plus the new two-city view. */}
      <SlidingGroup
        theme={theme}
        activeIndex={(['metrics', 'two'] as CompareTab[]).indexOf(tab)}
        color={theme.chipBg}
        style={[styles.tabBar, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
      >
        {(['metrics', 'two'] as CompareTab[]).map((key, index) => {
          const active = tab === key;
          return (
            <SlidingItem
              key={key}
              index={index}
              onPress={() => setTab(key)}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={key === 'metrics' ? t('cmp_tab_metrics') : t('c2_tab')}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: active ? theme.textPrimary : theme.textTertiary },
                ]}
              >
                {key === 'metrics' ? t('cmp_tab_metrics') : t('c2_tab')}
              </Text>
            </SlidingItem>
          );
        })}
      </SlidingGroup>

      {tab === 'two' ? (
        <ScrollView
          style={styles.twoCityScroll}
          contentContainerStyle={styles.twoCityContent}
          showsVerticalScrollIndicator={false}
        >
          <TwoCityComparePanel
            theme={theme}
            favorites={favorites}
            selection={selection}
            onSelect={handleSelect}
            entries={pairEntries}
            status={status}
            climateA={climateA.months}
            climateB={climateB.months}
            onRetry={() => onRetry?.()}
          />
        </ScrollView>
      ) : (
      <>
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
                <Text style={[styles.metricLabel, { color: theme.textTertiary }]}>{t('cmp_sky')}</Text>
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
      </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    borderRadius: 999,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'center',
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  tabText: {
    fontSize: 13,
    fontFamily: F.semibold,
  },
  twoCityScroll: { flexGrow: 0 },
  twoCityContent: { paddingBottom: 8 },
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
