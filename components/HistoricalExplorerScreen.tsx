import { t, getLanguage } from '../utils/i18n';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, ChevronLeft, ChevronRight, Droplet } from '../utils/uiIcons';
import type { LucideIcon } from 'lucide-react-native';
import { AnimatedBackground } from './AnimatedBackground';
import { WeatherIcon } from './WeatherIcon';
import { haptics } from '../utils/haptics';
import { formatDayFull, formatPrecip, formatTemp, getUnits } from '../utils/format';
import { describeWmo } from '../utils/wmo';
import { useHistoricalDay } from '../hooks/useHistoricalDay';
import { loadHistoricalRecent } from '../utils/historicalCache';
import {
  detailEntering,
  detailExiting,
  headerEntering,
  sectionEntering,
  type DetailAnimStyle,
} from '../utils/detailAnimations';
import type { AppTheme } from '../theme/palettes';
import { F } from '../theme/typography';
import type { MonthlyNormal } from '../api/types';

/**
 * The newest date the explorer may ask for. The archive lags the live era by a
 * few days (the 30-day card already lives with that), so 7 days back is the
 * newest row that is reliably published.
 */
const MAX_DAYS_BACK = 7;
/**
 * Oldest date the year stepper reaches. ERA5 starts 1940-01-01 (verified live:
 * 1935 returns "out of allowed range from 1940-01-01"), so 50 years back stays
 * comfortably inside the service and keeps the stepper usable.
 */
const MIN_YEARS_BACK = 50;
/** |value - reference| below this reads as "the same", same rule as ClimateCard. */
const TYPICAL_THRESHOLD_C = 2;
const PRECIP_COLOR = '#A5DBF9';

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function latestDate(): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - MAX_DAYS_BACK);
  return d;
}

function earliestDate(): Date {
  const d = latestDate();
  d.setFullYear(d.getFullYear() - MIN_YEARS_BACK);
  return d;
}

function clampDate(date: Date): Date {
  const lo = earliestDate().getTime();
  const hi = latestDate().getTime();
  const value = startOfDay(date).getTime();
  return new Date(value < lo ? lo : value > hi ? hi : value);
}

/** Local calendar date as `YYYY-MM-DD` - matches Archive API date strings. */
function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Inverse of `toIso`, built from parts so no UTC parsing can shift the day. */
function fromIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return defaultDate();
  return clampDate(new Date(year, month - 1, day));
}

/** One year back on the same calendar day, clamped - a useful starting point. */
function defaultDate(): Date {
  const d = startOfDay(new Date());
  d.setFullYear(d.getFullYear() - 1);
  if (d.getMonth() === 1 && d.getDate() === 29) d.setDate(28);
  return clampDate(d);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Day stepper wraps inside the month, so it is never disabled. */
function stepDay(date: Date, delta: number): Date {
  const days = daysInMonth(date.getFullYear(), date.getMonth());
  let day = date.getDate() + delta;
  if (day < 1) day = days;
  if (day > days) day = 1;
  return clampDate(new Date(date.getFullYear(), date.getMonth(), day));
}

/** Month/year steps keep the day valid instead of rolling over (31 Jan + 1 mo). */
function stepMonth(date: Date, delta: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  next.setDate(Math.min(date.getDate(), daysInMonth(next.getFullYear(), next.getMonth())));
  return clampDate(next);
}

function stepYear(date: Date, delta: number): Date {
  const next = new Date(date.getFullYear() + delta, date.getMonth(), 1);
  next.setDate(Math.min(date.getDate(), daysInMonth(next.getFullYear(), next.getMonth())));
  return clampDate(next);
}

/** Localized month name for month 1-12, same helper logic as ClimateCard. */
function monthName(month: number): string {
  return new Date(2020, month - 1, 1).toLocaleDateString(getLanguage(), { month: 'long' });
}

/** Compact chip label, e.g. "14 Jul" - same Intl pattern as the trip planner. */
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

/** Month names in the app language, for the month stepper. */
const MONTH_NAMES = Array.from({ length: 12 }, (_, index) => monthName(index + 1));

interface HistoricalExplorerScreenProps {
  theme: AppTheme;
  visible: boolean;
  animStyle?: DetailAnimStyle;
  latitude: number | null;
  longitude: number | null;
  /** Today's forecast high in °C, for the "vs today" comparison. */
  todayTMax?: number | null;
  /** 1991-2020 monthly normals, for the "vs that month" comparison. */
  normals?: MonthlyNormal[] | null;
  onClose: () => void;
}

function SectionCard({
  theme,
  title,
  children,
  order,
  animStyle,
}: {
  theme: AppTheme;
  title: string;
  children: React.ReactNode;
  order: number;
  animStyle: DetailAnimStyle;
}) {
  return (
    <Animated.View
      entering={sectionEntering(animStyle, order)}
      style={[styles.sectionCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
    >
      <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>{title}</Text>
      {children}
    </Animated.View>
  );
}

function StepperButton({
  theme,
  icon: Icon,
  direction,
  disabled,
  onPress,
}: {
  theme: AppTheme;
  icon: LucideIcon;
  direction: 'increase' | 'decrease';
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
      accessibilityRole="button"
      accessibilityLabel={t(direction === 'increase' ? 'a11y_increase' : 'a11y_decrease')}
      accessibilityState={{ disabled }}
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
}: {
  theme: AppTheme;
  label: string;
  value: string;
  canDecrement: boolean;
  canIncrement: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={[styles.stepperLabel, { color: theme.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <StepperButton
        theme={theme}
        icon={ChevronLeft}
        direction="decrease"
        disabled={!canDecrement}
        onPress={onDecrement}
      />
      <Text style={[styles.stepperValue, { color: theme.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
      <StepperButton
        theme={theme}
        icon={ChevronRight}
        direction="increase"
        disabled={!canIncrement}
        onPress={onIncrement}
      />
    </View>
  );
}

/**
 * "N degrees warmer/cooler than today" and "the same as today", using
 * ClimateCard's ±2 °C "reads as typical" rule and the active unit's scale.
 */
function compareToToday(valueC: number, todayTMax: number): string {
  const diffC = valueC - todayTMax;
  const scale = getUnits().temp === 'fahrenheit' ? 9 / 5 : 1;
  const roundedDiff = Math.round(Math.abs(diffC) * scale);
  if (diffC >= TYPICAL_THRESHOLD_C) {
    return t('hist_warmer_today').replace('{n}', String(roundedDiff));
  }
  if (diffC <= -TYPICAL_THRESHOLD_C) {
    return t('hist_cooler_today').replace('{n}', String(roundedDiff));
  }
  return t('hist_same_today');
}

/**
 * "N degrees warmer than a typical July" - reuses the climate-card wording
 * verbatim so the two features never disagree about the same month.
 */
function compareToNormal(valueC: number, normal: MonthlyNormal): string {
  const diffC = valueC - normal.tMaxMean;
  const scale = getUnits().temp === 'fahrenheit' ? 9 / 5 : 1;
  const roundedDiff = Math.round(Math.abs(diffC) * scale);
  const month = monthName(normal.month);
  if (diffC >= TYPICAL_THRESHOLD_C) {
    return t('climate_delta_warmer').replace('{n}', String(roundedDiff)).replace('{month}', month);
  }
  if (diffC <= -TYPICAL_THRESHOLD_C) {
    return t('climate_delta_cooler').replace('{n}', String(roundedDiff)).replace('{month}', month);
  }
  return t('climate_delta_typical').replace('{month}', month);
}

/**
 * Pick any past date and see what the weather actually was here. Three
 * steppers (no date-picker component), one Archive call per newly explored
 * date, everything else served from the persisted LRU. The date survives the
 * exit animation, so reopening the screen lands on the same day.
 */
export function HistoricalExplorerScreen({
  theme,
  visible,
  animStyle = 'fade',
  latitude,
  longitude,
  todayTMax = null,
  normals = null,
  onClose,
}: HistoricalExplorerScreenProps) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [show, setShow] = useState(visible);
  const [selected, setSelected] = useState<Date>(defaultDate);
  const [attempt, setAttempt] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setShow(true);
      return undefined;
    }
    setShow(false);
    const timer = setTimeout(() => setMounted(false), 340);
    return () => clearTimeout(timer);
  }, [visible]);

  const iso = toIso(selected);
  // Closed screen: pass nulls so the hook idles and never touches the network.
  const history = useHistoricalDay(
    visible ? latitude : null,
    visible ? longitude : null,
    visible ? iso : null,
    attempt,
  );
  const day = history.day;

  useEffect(() => {
    if (history.status !== 'ok' || latitude === null || longitude === null) return;
    let cancelled = false;
    void loadHistoricalRecent(latitude, longitude, 8).then((dates) => {
      if (!cancelled) setRecent(dates);
    });
    return () => {
      cancelled = true;
    };
  }, [history.status, day, latitude, longitude]);

  if (!mounted || !show) return null;

  const minYear = earliestDate().getFullYear();
  const maxYear = latestDate().getFullYear();
  const monthIndex = selected.getMonth();
  const normal = normals ? normals.find((row) => row.month === monthIndex + 1) ?? null : null;
  const hasToday = typeof todayTMax === 'number' && Number.isFinite(todayTMax);

  const body = () => {
    if (history.status === 'loading' || history.status === 'idle') {
      return (
        <View
          style={[
            styles.sectionCard,
            styles.stateCard,
            { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
          ]}
        >
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      );
    }
    if (history.status === 'error' || !day) {
      // Offline or an unpublished date: the existing retry idiom, never a crash.
      return (
        <View
          style={[
            styles.sectionCard,
            styles.stateCard,
            { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
          ]}
        >
          <Text style={[styles.stateText, { color: theme.textSecondary }]}>{t('err_generic')}</Text>
          <Pressable
            onPress={() => {
              haptics.select();
              setAttempt((value) => value + 1);
            }}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: theme.chipBg },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('err_retry')}
          >
            <Text style={[styles.retryText, { color: theme.textPrimary }]}>{t('err_retry')}</Text>
          </Pressable>
        </View>
      );
    }

    const condition = describeWmo(day.weatherCode);
    return (
      <Animated.View
        entering={sectionEntering(animStyle, 1)}
        style={[
          styles.heroCard,
          { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
        ]}
      >
        <Text style={[styles.heroDate, { color: theme.textTertiary }]}>{formatDayFull(iso)}</Text>
        <View style={styles.heroTemps}>
          <Text style={[styles.heroValue, { color: theme.textPrimary }]}>{formatTemp(day.tMax)}</Text>
          <Text style={[styles.heroUnit, { color: theme.textSecondary }]}>
            {' / '}
            {formatTemp(day.tMin)}
          </Text>
        </View>
        <View style={styles.heroLabelRow}>
          <WeatherIcon code={day.weatherCode} isDay size={16} themeColor={theme.textSecondary} />
          <Text style={[styles.heroLabel, { color: theme.textSecondary }]}>{condition.label}</Text>
        </View>
        <View style={styles.heroLabelRow}>
          <Droplet size={13} color={PRECIP_COLOR} strokeWidth={2.2} />
          <Text style={[styles.heroLabel, { color: theme.textSecondary }]}>
            {`${t('precip_total')} ${formatPrecip(day.precipSum)}`}
          </Text>
        </View>
      </Animated.View>
    );
  };

  return (
    <Animated.View
      entering={detailEntering(animStyle)}
      exiting={detailExiting(animStyle)}
      style={[
        styles.container,
        { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 12 },
      ]}
    >
      <AnimatedBackground gradient={theme.gradient} />

      <Animated.View entering={headerEntering(animStyle)} style={styles.header}>
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
        <View style={[styles.titleIcon, { backgroundColor: theme.chipBg }]}>
          <CalendarDays size={20} color={theme.textPrimary} strokeWidth={2.2} />
        </View>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
          {t('hist_title')}
        </Text>
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {body()}

        <SectionCard theme={theme} animStyle={animStyle} title={t('hist_explore')} order={2}>
          <StepperRow
            theme={theme}
            label={t('hist_year')}
            value={String(selected.getFullYear())}
            canDecrement={selected.getFullYear() > minYear}
            canIncrement={selected.getFullYear() < maxYear}
            onDecrement={() => setSelected((current) => stepYear(current, -1))}
            onIncrement={() => setSelected((current) => stepYear(current, 1))}
          />
          <StepperRow
            theme={theme}
            label={t('hist_month')}
            value={MONTH_NAMES[monthIndex]}
            canDecrement={!(monthIndex === 0 && selected.getFullYear() === minYear)}
            canIncrement={!(monthIndex === 11 && selected.getFullYear() === maxYear)}
            onDecrement={() => setSelected((current) => stepMonth(current, -1))}
            onIncrement={() => setSelected((current) => stepMonth(current, 1))}
          />
          <StepperRow
            theme={theme}
            label={t('hist_day')}
            value={String(selected.getDate())}
            canDecrement
            canIncrement
            onDecrement={() => setSelected((current) => stepDay(current, -1))}
            onIncrement={() => setSelected((current) => stepDay(current, 1))}
          />
        </SectionCard>

        {day && (hasToday || normal) ? (
          <SectionCard theme={theme} animStyle={animStyle} title={t('hist_vs_today')} order={3}>
            {hasToday && todayTMax !== null ? (
              <Text style={[styles.compareText, { color: theme.textSecondary }]}>
                {compareToToday(day.tMax, todayTMax as number)}
              </Text>
            ) : null}
            {normal ? (
              <Text style={[styles.compareText, { color: theme.textTertiary }]}>
                {compareToNormal(day.tMax, normal)}
              </Text>
            ) : null}
          </SectionCard>
        ) : null}

        {recent.length > 0 ? (
          <SectionCard theme={theme} animStyle={animStyle} title={t('hist_recent')} order={4}>
            <View style={styles.chipRow}>
              {recent.map((chip) => (
                <Pressable
                  key={chip}
                  onPress={() => {
                    haptics.select();
                    setSelected(fromIso(chip));
                  }}
                  style={({ pressed }) => [
                    styles.recentChip,
                    { backgroundColor: theme.chipBg },
                    chip === iso && { borderColor: theme.accent, borderWidth: 1 },
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={shortDateLabel(chip)}
                >
                  <Text
                    style={[
                      styles.recentChipText,
                      { color: chip === iso ? theme.accent : theme.textPrimary },
                    ]}
                  >
                    {shortDateLabel(chip)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SectionCard>
        ) : null}
      </ScrollView>
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
    gap: 14,
    zIndex: 48,
    elevation: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontFamily: F.bold,
    letterSpacing: -0.5,
    flex: 1,
  },
  content: {
    paddingBottom: 24,
    gap: 12,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    gap: 4,
  },
  heroDate: {
    fontSize: 12.5,
    fontFamily: F.medium,
  },
  heroTemps: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  heroValue: {
    fontSize: 56,
    fontFamily: F.light,
    letterSpacing: -2,
    includeFontPadding: false,
  },
  heroUnit: {
    fontSize: 20,
    fontFamily: F.medium,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  heroLabel: {
    fontSize: 14,
    fontFamily: F.medium,
  },
  sectionCard: {
    borderRadius: 28,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: F.semibold,
    letterSpacing: 1.6,
  },
  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 30,
  },
  stateText: {
    fontSize: 13.5,
    fontFamily: F.regular,
    textAlign: 'center',
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
  compareText: {
    fontSize: 13,
    fontFamily: F.regular,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentChip: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  recentChipText: {
    fontSize: 12.5,
    fontFamily: F.semibold,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 4,
  },
  stepperLabel: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: F.medium,
  },
  stepperValue: {
    minWidth: 84,
    fontSize: 14,
    fontFamily: F.semibold,
    textAlign: 'center',
  },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
