import { t, tDay, getLanguage } from '../utils/i18n';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {
  ChevronLeft,
  ChevronRight,
  Droplet,
  Luggage,
  MapPin,
  Star,
  Sun,
} from '../utils/uiIcons';
import type { LucideIcon } from 'lucide-react-native';
import { Card } from './Card';
import { haptics } from '../utils/haptics';
import { WeatherIcon } from './WeatherIcon';
import { formatPrecip, formatTemp } from '../utils/format';
import { inlineEntering, inlineExiting } from '../utils/detailAnimations';
import { ApiError, fetchWeather } from '../api/openMeteo';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { DayPoint, GeoLocation, WeatherBundle } from '../api/types';

interface TripPlannerCardProps {
  theme: AppTheme;
  favorites: GeoLocation[];
  onOpenFavorites: () => void;
}

type TripStatus = 'idle' | 'loading' | 'error' | 'done';

/** Forecast window is 16 days; trips start tomorrow at the earliest. */
const MIN_START_OFFSET = 1;
const MAX_START_OFFSET = 16;
const MIN_TRIP_LENGTH = 1;
const MAX_TRIP_LENGTH = 7;
/** A day counts as "wet" for the verdict at this rain probability. */
const RAINY_PROB_THRESHOLD = 50;
const PRECIP_COLOR = '#A5DBF9';

/** Local calendar date (device timezone) shifted by N days, as YYYY-MM-DD. */
function isoDatePlusDays(offset: number): string {
  const now = new Date();
  const shifted = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${shifted.getFullYear()}-${month}-${day}`;
}

/** Weekday index (0 = Sunday) of a plain YYYY-MM-DD date, noon-UTC anchored. */
function weekdayOf(iso: string): number {
  const time = Date.parse(`${iso}T12:00:00Z`);
  return Number.isNaN(time) ? -1 : new Date(time).getUTCDay();
}

/** Short date like "24 Aug" in the active app language. */
function shortDateLabel(iso: string): string {
  const time = Date.parse(`${iso}T12:00:00Z`);
  if (Number.isNaN(time)) return iso;
  try {
    return new Intl.DateTimeFormat(getLanguage(), { day: 'numeric', month: 'short' }).format(
      new Date(time),
    );
  } catch {
    return iso;
  }
}

/** Matches the wording used by useWeather for fetch failures. */
function describeError(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'network') {
    return 'No internet connection. Check your network and try again.';
  }
  if (error instanceof ApiError && error.kind === 'server') {
    return 'The weather service is having trouble right now.';
  }
  return 'Could not load the forecast. Please try again.';
}

interface StepperRowProps {
  theme: AppTheme;
  label: string;
  value: string;
  canDecrement: boolean;
  canIncrement: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}

function StepperButton({
  theme,
  icon: Icon,
  disabled,
  onPress,
}: {
  theme: AppTheme;
  icon: LucideIcon;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.stepperButton,
        { backgroundColor: theme.chipBg },
        disabled && { opacity: 0.35 },
        pressed && !disabled && { opacity: 0.7 },
      ]}
    >
      <Icon size={15} color={theme.textPrimary} strokeWidth={2.4} />
    </Pressable>
  );
}

function StepperRow({
  theme,
  label,
  value,
  canDecrement,
  canIncrement,
  onDecrement,
  onIncrement,
}: StepperRowProps) {
  return (
    <View style={styles.stepperRow}>
      <Text style={[styles.stepperLabel, { color: theme.textSecondary }]}>{label}</Text>
      <StepperButton theme={theme} icon={ChevronLeft} disabled={!canDecrement} onPress={onDecrement} />
      <Text style={[styles.stepperValue, { color: theme.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
      <StepperButton theme={theme} icon={ChevronRight} disabled={!canIncrement} onPress={onIncrement} />
    </View>
  );
}

export function TripPlannerCard({ theme, favorites, onOpenFavorites }: TripPlannerCardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [startOffset, setStartOffset] = useState(MIN_START_OFFSET);
  const [tripLength, setTripLength] = useState(MIN_TRIP_LENGTH);
  const [status, setStatus] = useState<TripStatus>('idle');
  const [bundle, setBundle] = useState<WeatherBundle | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Race guard: stale responses from an older fetch never render.
  const requestId = useRef(0);

  const selected = useMemo(
    () => favorites.find((fav) => fav.id === selectedId) ?? null,
    [favorites, selectedId],
  );

  const loadTrip = useCallback(async () => {
    if (!selected) return;
    const id = ++requestId.current;
    setStatus('loading');
    setErrorMessage(null);
    try {
      const nextBundle = await fetchWeather(selected);
      if (requestId.current !== id) return;
      setBundle(nextBundle);
      setStatus('done');
    } catch (error) {
      if (requestId.current !== id) return;
      setErrorMessage(describeError(error));
      setStatus('error');
    }
  }, [selected]);

  const startIso = isoDatePlusDays(startOffset);
  const startLabel = `${tDay(weekdayOf(startIso))} ${shortDateLabel(startIso)}`;

  /** Trip slice of the destination forecast; re-sliced locally on stepper taps. */
  const tripDays = useMemo<DayPoint[]>(() => {
    if (status !== 'done' || !bundle || bundle.daily.length === 0) return [];
    const matched = bundle.daily.findIndex((day) => day.date === startIso);
    const index =
      matched >= 0
        ? matched
        : Math.min(Math.max(startOffset, 0), bundle.daily.length - 1);
    return bundle.daily.slice(index, index + tripLength);
  }, [bundle, status, startIso, startOffset, tripLength]);

  const summary = useMemo(() => {
    if (tripDays.length === 0) return null;
    const rainiest = tripDays.reduce((a, b) => (b.precipSum > a.precipSum ? b : a));
    const warmest = tripDays.reduce((a, b) => (b.tMax > a.tMax ? b : a));
    const rainyCount = tripDays.filter(
      (day) => day.precipProbabilityMax >= RAINY_PROB_THRESHOLD,
    ).length;
    return { rainiest, warmest, rainyCount };
  }, [tripDays]);

  const verdict =
    summary && summary.rainyCount > 0
      ? t('trip_verdict_rain')
          .replace('{n}', String(summary.rainyCount))
          .replace('{total}', String(tripDays.length))
      : t('trip_verdict_dry');

  return (
    <Card theme={theme} title={t('card_trip')} icon={Luggage}>
      {favorites.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>
            {t('trip_no_favorites')}
          </Text>
          <Pressable
            onPress={() => {
              haptics.select();
              onOpenFavorites();
            }}
            style={({ pressed }) => [
              styles.pillButton,
              { backgroundColor: theme.chipBg },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Star size={14} color={theme.textPrimary} strokeWidth={2.2} />
            <Text style={[styles.pillText, { color: theme.textPrimary }]}>
              {t('trip_open_favorites')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {favorites.map((fav) => {
              const isSelected = selected?.id === fav.id;
              return (
                <Pressable
                  key={fav.id}
                  onPress={() => {
                    haptics.select();
                    setSelectedId(fav.id);
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: theme.chipBg,
                      borderColor: isSelected ? theme.accent : theme.cardBorder,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {isSelected ? (
                    <MapPin size={12} color={theme.accent} strokeWidth={2.4} />
                  ) : null}
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? theme.accent : theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {fav.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.stepperGroup}>
            <StepperRow
              theme={theme}
              label={t('trip_start')}
              value={startLabel}
              canDecrement={startOffset > MIN_START_OFFSET}
              canIncrement={startOffset < MAX_START_OFFSET}
              onDecrement={() => setStartOffset((value) => Math.max(MIN_START_OFFSET, value - 1))}
              onIncrement={() => setStartOffset((value) => Math.min(MAX_START_OFFSET, value + 1))}
            />
            <StepperRow
              theme={theme}
              label={t('trip_length')}
              value={t('trip_days').replace('{n}', String(tripLength))}
              canDecrement={tripLength > MIN_TRIP_LENGTH}
              canIncrement={tripLength < MAX_TRIP_LENGTH}
              onDecrement={() => setTripLength((value) => Math.max(MIN_TRIP_LENGTH, value - 1))}
              onIncrement={() => setTripLength((value) => Math.min(MAX_TRIP_LENGTH, value + 1))}
            />
          </View>

          <Pressable
            onPress={() => {
              haptics.light();
              void loadTrip();
            }}
            disabled={!selected || status === 'loading'}
            style={({ pressed }) => [
              styles.showButton,
              { backgroundColor: theme.chipBg },
              (!selected || pressed) && { opacity: 0.55 },
            ]}
          >
            {status === 'loading' ? (
              <ActivityIndicator size="small" color={theme.textPrimary} />
            ) : (
              <MapPin size={15} color={theme.textPrimary} strokeWidth={2.2} />
            )}
            <Text style={[styles.showText, { color: theme.textPrimary }]}>{t('trip_show')}</Text>
          </Pressable>

          {status === 'error' && errorMessage ? (
            <View style={styles.errorRow}>
              <Text style={[styles.errorText, { color: theme.textSecondary }]}>{errorMessage}</Text>
              <Pressable
                onPress={() => {
                  haptics.light();
                  void loadTrip();
                }}
                style={({ pressed }) => [
                  styles.retryButton,
                  { backgroundColor: theme.chipBg },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.retryText, { color: theme.textPrimary }]}>
                  {t('trip_retry')}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {status === 'done' && selected && summary && tripDays.length > 0 ? (
            <Animated.View entering={inlineEntering()} exiting={inlineExiting()}>
              <Text style={[styles.resultsHeading, { color: theme.textSecondary }]}>
                {selected.name} · {shortDateLabel(tripDays[0].date)}
                {tripDays.length > 1 ? ` – ${shortDateLabel(tripDays[tripDays.length - 1].date)}` : ''}
              </Text>
              <View>
                {tripDays.map((day, index) => {
                  const weekday = weekdayOf(day.date);
                  return (
                    <View
                      key={day.date}
                      style={[
                        styles.tripRow,
                        index > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: theme.trackColor,
                        },
                      ]}
                    >
                      <View style={styles.dayCell}>
                        <Text style={[styles.dayName, { color: theme.textPrimary }]}>
                          {weekday >= 0 ? tDay(weekday) : '--'}
                        </Text>
                        <Text style={[styles.dayDate, { color: theme.textTertiary }]}>
                          {shortDateLabel(day.date)}
                        </Text>
                      </View>
                      <WeatherIcon code={day.weatherCode} isDay size={20} themeColor={theme.textPrimary} />
                      <Text style={[styles.tempMin, { color: theme.textSecondary }]}>
                        {formatTemp(day.tMin)}
                      </Text>
                      <Text style={[styles.tempMax, { color: theme.textPrimary }]}>
                        {formatTemp(day.tMax)}
                      </Text>
                      <View style={styles.rainCell}>
                        <Droplet size={10} color={PRECIP_COLOR} strokeWidth={2.6} />
                        <Text style={[styles.rainText, { color: theme.textSecondary }]}>
                          {Math.round(day.precipProbabilityMax)}%
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.precipText,
                          {
                            color:
                              day.precipSum >= 0.05 ? theme.textSecondary : theme.textTertiary,
                          },
                        ]}
                      >
                        {day.precipSum >= 0.05 ? formatPrecip(day.precipSum) : '–'}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.summaryChips}>
                <View style={[styles.summaryChip, { backgroundColor: theme.chipBg }]}>
                  <Droplet size={11} color={PRECIP_COLOR} strokeWidth={2.6} />
                  <Text style={[styles.summaryChipText, { color: theme.textSecondary }]}>
                    {t('trip_rainiest')}: {tDay(weekdayOf(summary.rainiest.date))} ·{' '}
                    {formatPrecip(summary.rainiest.precipSum)}
                  </Text>
                </View>
                <View style={[styles.summaryChip, { backgroundColor: theme.chipBg }]}>
                  <Sun size={11} color="#F5C04E" strokeWidth={2.6} />
                  <Text style={[styles.summaryChipText, { color: theme.textSecondary }]}>
                    {t('trip_warmest')}: {tDay(weekdayOf(summary.warmest.date))} ·{' '}
                    {formatTemp(summary.warmest.tMax)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.verdict, { color: theme.textSecondary }]}>{verdict}</Text>
            </Animated.View>
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  emptyWrap: {
    gap: 12,
  },
  emptyHint: {
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: F.regular,
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  pillText: {
    fontSize: 13.5,
    fontFamily: F.semibold,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  chipText: {
    fontSize: 13,
    fontFamily: F.semibold,
  },
  stepperGroup: {
    marginTop: 12,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  stepperLabel: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: F.medium,
  },
  stepperValue: {
    fontSize: 14,
    fontFamily: F.semibold,
    minWidth: 84,
    textAlign: 'center',
  },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 18,
    marginTop: 12,
  },
  showText: {
    fontSize: 14,
    fontFamily: F.semibold,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: F.regular,
  },
  retryButton: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  retryText: {
    fontSize: 12.5,
    fontFamily: F.semibold,
  },
  resultsHeading: {
    fontSize: 11.5,
    fontFamily: F.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  dayCell: {
    flex: 1,
    gap: 1,
  },
  dayName: {
    fontSize: 13.5,
    fontFamily: F.semibold,
  },
  dayDate: {
    fontSize: 10.5,
    fontFamily: F.regular,
  },
  tempMin: {
    fontSize: 13,
    fontFamily: F.regular,
    width: 34,
    textAlign: 'right',
  },
  tempMax: {
    fontSize: 13,
    fontFamily: F.semibold,
    width: 34,
    textAlign: 'right',
  },
  rainCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    width: 42,
    justifyContent: 'flex-end',
  },
  rainText: {
    fontSize: 11,
    fontFamily: F.medium,
  },
  precipText: {
    fontSize: 10.5,
    fontFamily: F.regular,
    width: 52,
    textAlign: 'right',
  },
  summaryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  summaryChipText: {
    fontSize: 11.5,
    fontFamily: F.medium,
  },
  verdict: {
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 8,
    fontFamily: F.medium,
  },
});
