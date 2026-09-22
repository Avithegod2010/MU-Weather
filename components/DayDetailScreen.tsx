import { t } from '../utils/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from '../utils/uiIcons';
import { AnimatedBackground } from './AnimatedBackground';
import { haptics } from '../utils/haptics';
import { DetailChart } from './TileDetailScreen';
import {
  convertWind,
  formatDayFull,
  formatPrecip,
  formatTemp,
  formatTime12,
  windUnitLabel,
} from '../utils/format';
import { describeWmo } from '../utils/wmo';
import { WeatherIcon } from './WeatherIcon';
import { uvBand } from '../utils/aqi';
import type { AppTheme } from '../theme/palettes';
import { F } from '../theme/typography';
import {
  detailEntering,
  detailExiting,
  headerEntering,
  sectionEntering,
  type DetailAnimStyle,
} from '../utils/detailAnimations';
import type { DayPoint, EnsembleSpreadPoint, HourPoint } from '../api/types';

interface DayDetailScreenProps {
  theme: AppTheme;
  day: DayPoint | null;
  index: number;
  hours: HourPoint[];
  /** Ensemble spread points for this day (P10-P90 band on the temp chart). */
  ensemble?: EnsembleSpreadPoint[] | null;
  visible: boolean;
  animStyle?: DetailAnimStyle;
  onClose: () => void;
}

function FactRow({ theme, label, value }: { theme: AppTheme; label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={[styles.factLabel, { color: theme.textTertiary }]}>{label}</Text>
      <Text style={[styles.factValue, { color: theme.textPrimary }]}>{value}</Text>
    </View>
  );
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

export function DayDetailScreen({
  theme,
  day,
  index,
  hours,
  ensemble,
  visible,
  animStyle = 'fade',
  onClose,
}: DayDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const cacheRef = useRef<{ day: DayPoint; hours: HourPoint[]; index: number } | null>(null);
  if (visible && day) cacheRef.current = { day, hours, index };

  const [mounted, setMounted] = useState(Boolean(visible));
  const [show, setShow] = useState(Boolean(visible));

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

  if (!mounted || !show || !cacheRef.current) return null;
  const view = cacheRef.current;

  const dayData = view.day;
  const dayHours = view.hours;
  const condition = describeWmo(dayData.weatherCode);
  const uvInfo = uvBand(dayData.uvIndexMax);
  const rainHours = dayHours.filter((hour) => hour.precipitation > 0).length;

  const dayLabel =
    view.index === 0 ? t('today') : view.index === 1 ? t('tomorrow') : formatDayFull(dayData.date);

  const factRows: Array<{ label: string; value: string }> = [
    { label: t('sunrise'), value: formatTime12(dayData.sunrise) },
    { label: t('sunset'), value: formatTime12(dayData.sunset) },
    {
      label: t('uv_max'),
      value: `${Math.round(dayData.uvIndexMax)}${uvInfo ? ` · ${uvInfo.label}` : ''}`,
    },
    { label: t('precip_total'), value: formatPrecip(dayData.precipSum) },
    { label: t('precip_prob_max'), value: `${Math.round(dayData.precipProbabilityMax)}%` },
    { label: t('rain_hours'), value: `${rainHours} h` },
    {
      label: t('max_wind'),
      value: `${Math.round(convertWind(dayData.windMax))} ${windUnitLabel()}`,
    },
  ];

  return (
    <Animated.View
      entering={detailEntering(animStyle)}
      exiting={detailExiting(animStyle)}
      style={[styles.container, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 12 }]}
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
          <WeatherIcon code={dayData.weatherCode} isDay size={20} themeColor={theme.textPrimary} />
        </View>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{dayLabel}</Text>
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Animated.View
          entering={sectionEntering(animStyle, 0)}
          style={[styles.heroCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
        >
          <Text style={[styles.heroValue, { color: theme.textPrimary }]}>{formatTemp(dayData.tMax)}</Text>
          <Text style={[styles.heroUnit, { color: theme.textSecondary }]}>
            {' / '}
            {formatTemp(dayData.tMin)}
          </Text>
          <View style={styles.heroLabelRow}>
            <WeatherIcon code={dayData.weatherCode} isDay size={16} themeColor={theme.textSecondary} />
            <Text style={[styles.heroLabel, { color: theme.textSecondary }]}>{condition.label}</Text>
          </View>
        </Animated.View>

        <SectionCard theme={theme} animStyle={animStyle} title={t('d_temp24')} order={1}>
          <DetailChart
            theme={theme}
            hours={dayHours}
            seriesList={[{ pick: (hour) => hour.temperature, color: '#F5A962' }]}
            band={ensemble ?? null}
          />
          {ensemble && ensemble.length > 0 ? (
            <Text style={[styles.bandCaption, { color: theme.textTertiary }]}>
              {t('trend_band_caption')}
            </Text>
          ) : null}
        </SectionCard>

        <SectionCard theme={theme} animStyle={animStyle} title={t('card_rain')} order={2}>
          <DetailChart
            theme={theme}
            hours={dayHours}
            seriesList={[{ pick: (hour) => hour.precipProbability, color: '#5B8FD9' }]}
            fixedMin={0}
            fixedMax={100}
          />
        </SectionCard>

        <SectionCard theme={theme} animStyle={animStyle} title={t('d_facts')} order={3}>
          {factRows.map((fact) => (
            <FactRow key={fact.label} theme={theme} label={fact.label} value={fact.value} />
          ))}
        </SectionCard>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bandCaption: {
    fontSize: 11.5,
    fontFamily: F.regular,
    marginTop: 8,
  },
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    gap: 14,
    zIndex: 46,
    elevation: 46,
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
    paddingVertical: 26,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  heroValue: {
    fontSize: 64,
    fontFamily: F.light,
    letterSpacing: -2,
    includeFontPadding: false,
  },
  heroUnit: {
    fontSize: 22,
    fontFamily: F.medium,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    width: '100%',
  },
  heroLabel: {
    fontSize: 15,
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
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  factLabel: {
    fontSize: 13,
    fontFamily: F.regular,
  },
  factValue: {
    fontSize: 13.5,
    fontFamily: F.medium,
    textAlign: 'right',
    flexShrink: 1,
  },
});
