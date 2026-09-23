import React from 'react';
import { t, getLanguage } from '../utils/i18n';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from '../utils/uiIcons';
import { F } from '../theme/typography';
import { WeatherIcon } from '../components/WeatherIcon';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { formatTemp } from '../utils/format';
import { haptics } from '../utils/haptics';
import { MODEL_LABELS } from '../api/providers';
import type { AppTheme } from '../theme/palettes';
import type { ModelForecast, ModelForecastDay } from '../api/providers';

interface ModelComparisonScreenProps {
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  results: ModelForecast[];
  status: 'idle' | 'loading' | 'ready';
}

const LABEL_WIDTH = 96;
const COL_WIDTH = 88;
/** How many forecast days to show (tomorrow is index 1 in daily arrays). */
const DAYS_SHOWN = 5;

/** Short localized weekday for an ISO date string. */
function formatDayShort(date: string): string {
  const parsed = new Date(date.length === 10 ? `${date}T12:00:00` : date);
  return parsed.toLocaleDateString(getLanguage(), { weekday: 'short' });
}

export function ModelComparisonScreen({
  theme,
  visible,
  onClose,
  results,
  status,
}: ModelComparisonScreenProps) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const valid = results.filter((entry) => entry.days.length > 0);
  // Day indexes 1..DAYS_SHOWN (skip today).
  const dayIndexes = Array.from({ length: DAYS_SHOWN }, (_, i) => i + 1);
  const firstDates = valid[0]?.days ?? [];

  const spreadForDay = (dayIndex: number): number | null => {
    const highs = valid
      .map((entry) => entry.days[dayIndex]?.tMax)
      .filter((value): value is number => typeof value === 'number');
    if (highs.length < 2) return null;
    return Math.max(...highs) - Math.min(...highs);
  };

  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 12 }]}
    >
      <AnimatedBackground gradient={theme.gradient} />

      <View style={styles.header}>
        <Pressable
          onPress={() => {
            haptics.select();
            onClose();
          }}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('a11y_back')}
        >
          <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.headerTexts}>
          <Text style={[styles.eyebrow, { color: theme.textTertiary }]}>{t('mc_eyebrow')}</Text>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{t('mc_title')}</Text>
        </View>
      </View>

      {status === 'loading' ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>{t('mc_loading')}</Text>
        </View>
      ) : valid.length === 0 ? (
        <View style={styles.loadingWrap}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>{t('mc_error')}</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tableContent}>
          <View style={[styles.tableCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={styles.headerRow}>
              <View style={{ width: LABEL_WIDTH }} />
              {valid.map((entry) => (
                <View key={entry.model} style={[styles.modelCell, { width: COL_WIDTH }]}>
                  <Text style={[styles.modelName, { color: theme.textPrimary }]} numberOfLines={2}>
                    {MODEL_LABELS[entry.model]}
                  </Text>
                </View>
              ))}
            </View>

            {dayIndexes.map((dayIndex) => {
              const date = firstDates[dayIndex]?.date ?? null;
              const spread = spreadForDay(dayIndex);
              return (
                <View key={dayIndex} style={[styles.dayRow, { borderTopColor: theme.trackColor }]}>
                  <View style={{ width: LABEL_WIDTH }}>
                    <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>
                      {dayIndex === 1 ? t('tomorrow') : date ? formatDayShort(date) : ''}
                    </Text>
                    {spread !== null ? (
                      <Text style={[styles.spreadText, { color: theme.textTertiary }]}>
                        {t('mc_spread').split('{n}').join(spread.toFixed(1))}
                      </Text>
                    ) : null}
                  </View>
                  {valid.map((entry) => {
                    const day: ModelForecastDay | undefined = entry.days[dayIndex];
                    if (!day) {
                      return (
                        <View key={entry.model} style={[styles.valueCell, { width: COL_WIDTH }]}>
                          <Text style={[styles.valueText, { color: theme.textTertiary }]}>--</Text>
                        </View>
                      );
                    }
                    return (
                      <View key={entry.model} style={[styles.valueCell, { width: COL_WIDTH }]}>
                        <WeatherIcon code={day.weatherCode} isDay size={18} themeColor={theme.textSecondary} />
                        <Text style={[styles.valueText, { color: theme.textPrimary }]}>
                          {formatTemp(day.tMax)}
                        </Text>
                        <Text style={[styles.lowText, { color: theme.textTertiary }]}>
                          {formatTemp(day.tMin)}
                          {day.precipProb !== null && day.precipProb >= 20
                            ? ` · ${Math.round(day.precipProb)}%`
                            : ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>

          <Text style={[styles.caption, { color: theme.textTertiary }]}>{t('mc_caption')}</Text>
        </ScrollView>
      )}
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
    zIndex: 47,
    elevation: 47,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: {
    gap: 2,
    flexShrink: 1,
  },
  eyebrow: {
    fontSize: 12,
    fontFamily: F.bold,
    letterSpacing: 2.2,
  },
  title: {
    fontSize: 28,
    fontFamily: F.bold,
    letterSpacing: -0.5,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: F.medium,
  },
  tableContent: {
    paddingBottom: 12,
  },
  tableCard: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  modelCell: {
    alignItems: 'center',
  },
  modelName: {
    fontSize: 12,
    fontFamily: F.semibold,
    textAlign: 'center',
  },
  dayRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 13,
    fontFamily: F.semibold,
  },
  spreadText: {
    fontSize: 10.5,
    fontFamily: F.regular,
    marginTop: 2,
  },
  valueCell: {
    alignItems: 'center',
    gap: 3,
  },
  valueText: {
    fontSize: 15,
    fontFamily: F.semibold,
  },
  lowText: {
    fontSize: 11,
    fontFamily: F.regular,
  },
  caption: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: F.regular,
    marginTop: 12,
  },
});
