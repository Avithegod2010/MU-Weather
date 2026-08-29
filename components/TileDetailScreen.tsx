import { t } from '../utils/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Wind,
  Gauge,
  Sun,
  Droplets,
  Eye,
  Umbrella,
  Moon as MoonIcon,
} from '../utils/uiIcons';
import type { LucideIcon } from 'lucide-react-native';
import { AnimatedBackground } from './AnimatedBackground';
import { haptics } from '../utils/haptics';
import { smoothPath, scaleY, type CurvePoint } from '../utils/curve';
import {
  compassLabel,
  convertWind,
  formatHourLabel,
  formatPrecip,
  formatPrecipValue,
  formatVisibility,
  windUnitLabel,
  dewPointComfort,
  formatPressureTrend,
  precipUnitLabel,
} from '../utils/format';
import { moonPhase } from '../utils/moon';
import { moonTimes } from '../utils/sunCalc';
import { usAqiBand, humidityComfort } from '../utils/aqi';
import type { AppTheme } from '../theme/palettes';
import { F } from '../theme/typography';
import {
  detailEntering,
  detailExiting,
  headerEntering,
  sectionEntering,
  type DetailAnimStyle,
} from '../utils/detailAnimations';
import type { TopicKey } from '../config/tiles';
import type { WeatherBundle, HourPoint } from '../api/types';

export type { TopicKey } from '../config/tiles';

interface TileDetailScreenProps {
  theme: AppTheme;
  topic: TopicKey | null;
  data: WeatherBundle | null;
  visible: boolean;
  animStyle?: DetailAnimStyle;
  onClose: () => void;
}

const TOPIC_META: Record<TopicKey, { title: string; icon: LucideIcon }> = {
  wind: { title: t('card_wind'), icon: Wind },
  aqi: { title: t('card_aqi'), icon: Gauge },
  uv: { title: t('card_uv'), icon: Sun },
  humidity: { title: t('card_humidity'), icon: Droplets },
  visibility: { title: t('card_visibility'), icon: Eye },
  pressure: { title: t('card_pressure'), icon: Gauge },
  precipitation: { title: t('card_precipitation'), icon: Umbrella },
  moon: { title: t('card_moon'), icon: MoonIcon },
};

const COL_WIDTH = 14;
const CHART_HEIGHT = 130;
const PADDING = 14;

interface SeriesConfig {
  pick: (hour: HourPoint) => number | null;
  color: string;
}

export function DetailChart({
  theme,
  hours,
  seriesList,
  fixedMin,
  fixedMax,
  legendLabels,
}: {
  theme: AppTheme;
  hours: HourPoint[];
  seriesList: SeriesConfig[];
  fixedMin?: number;
  fixedMax?: number;
  legendLabels?: string[];
}) {
  const slice = hours.slice(0, 24);
  const usable = slice.filter((hour) =>
    seriesList.some((series) => series.pick(hour) !== null),
  );
  if (usable.length < 2) return null;

  const width = usable.length * COL_WIDTH;
  const allValues = seriesList
    .flatMap((series) => usable.map((hour) => series.pick(hour)))
    .filter((value): value is number => value !== null);
  let min = fixedMin ?? Math.min(...allValues);
  let max = fixedMax ?? Math.max(...allValues);
  if (fixedMin === undefined || fixedMax === undefined) {
    const pad = Math.max((max - min) * 0.12, 0.001);
    if (fixedMin === undefined) min -= pad;
    if (fixedMax === undefined) max += pad;
  }

  const dotFill = theme.isLight ? '#FFFFFF' : '#F6F9FD';

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} directionalLockEnabled>
      <View style={{ width }}>
        <Svg width={width} height={CHART_HEIGHT}>
          {seriesList.map((series, seriesIndex) => {
            const points: CurvePoint[] = [];
            usable.forEach((hour, index) => {
              const value = series.pick(hour);
              if (value !== null) {
                points.push({
                  x: index * COL_WIDTH + COL_WIDTH / 2,
                  y: scaleY(value, min, max, PADDING, CHART_HEIGHT - PADDING - 16),
                });
              }
            });
            if (points.length < 2) return null;
            return (
              <React.Fragment key={`s-${seriesIndex}`}>
                <Path d={smoothPath(points)} stroke={series.color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
                {points.map((point, pointIndex) => (
                  <Circle
                    key={`p-${seriesIndex}-${pointIndex}`}
                    cx={point.x}
                    cy={point.y}
                    r={pointIndex === 0 ? 5 : 3.5}
                    fill={dotFill}
                    stroke={series.color}
                    strokeWidth={2}
                  />
                ))}
              </React.Fragment>
            );
          })}
        </Svg>
        <View style={styles.chartTimes}>
          {usable.map((hour, index) =>
            index % 6 === 0 ? (
              <Text
                key={hour.time}
                style={[styles.chartTime, { color: theme.textTertiary, left: index * COL_WIDTH }]}
              >
                {formatHourLabel(hour.time, hour.isNow)}
              </Text>
            ) : null,
          )}
        </View>
        {seriesList.length > 1 && legendLabels?.length === seriesList.length ? (
          <View style={styles.legendRow}>
            {seriesList.map((series, index) => (
              <View key={`l-${index}`} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: series.color }]} />
                <Text style={[styles.legendText, { color: theme.textSecondary }]}>
                  {legendLabels[index]}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function FactRow({ theme, label, value }: { theme: AppTheme; label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={[styles.factLabel, { color: theme.textTertiary }]}>{label}</Text>
      <Text style={[styles.factValue, { color: theme.textPrimary }]}>{value}</Text>
    </View>
  );
}

function BarRow({
  theme,
  label,
  value,
  fraction,
  color,
}: {
  theme: AppTheme;
  label: string;
  value: string;
  fraction: number;
  color: string;
}) {
  const clamped = Math.min(1, Math.max(0.02, fraction));
  return (
    <View style={styles.barWrap}>
      <View style={styles.factRow}>
        <Text style={[styles.factLabel, { color: theme.textTertiary }]}>{label}</Text>
        <Text style={[styles.factValue, { color: theme.textPrimary }]}>{value}</Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: theme.chipBg }]}>
        <View style={[styles.barFill, { width: `${Math.round(clamped * 100)}%`, backgroundColor: color }]} />
      </View>
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
  title?: string;
  children: React.ReactNode;
  order: number;
  animStyle: DetailAnimStyle;
}) {
  return (
    <Animated.View
      entering={sectionEntering(animStyle, order)}
      style={[styles.sectionCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
    >
      {title ? <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>{title}</Text> : null}
      {children}
    </Animated.View>
  );
}

function peakHourLabel(hours: HourPoint[], pick: (hour: HourPoint) => number | null): string {
  let best: HourPoint | null = null;
  let bestValue = -Infinity;
  for (const hour of hours.slice(0, 24)) {
    const value = pick(hour);
    if (value !== null && value > bestValue) {
      bestValue = value;
      best = hour;
    }
  }
  return best ? formatHourLabel(best.time, best.isNow) : '--';
}

export function TileDetailScreen({
  theme,
  topic,
  data,
  visible,
  animStyle = 'fade',
  onClose,
}: TileDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const cacheRef = useRef<{ topic: TopicKey; data: WeatherBundle } | null>(null);
  if (topic && data) cacheRef.current = { topic, data };

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

  const meta = TOPIC_META[view.topic];
  const Icon = meta.icon;
  const current = view.data.current;
  const today = view.data.daily[0] ?? null;
  const hours = view.data.hourly;

  interface HeroState {
    value: string;
    unit?: string;
    label: string;
    accent?: string;
  }
  let hero: HeroState = { value: '--', label: '' };
  let chart: React.ReactNode = null;
  let dewChart: React.ReactNode = null;
  let factRows: Array<{ label: string; value: string }> = [];
  let bars: Array<{ label: string; value: string; fraction: number; color: string }> | null = null;
  let progress: { fraction: number; color: string } | null = null;
  let about = '';

  if (view.topic === 'wind') {
    const next24 = hours.slice(0, 24);
    const gusts = next24.map((hour) => hour.windGusts);
    const speeds = next24.map((hour) => hour.windSpeed);
    const avgSpeed = speeds.reduce((sum, value) => sum + value, 0) / Math.max(speeds.length, 1);
    hero = {
      value: `${Math.round(convertWind(current.windSpeed))}`,
      unit: windUnitLabel(),
      label: `${t('from_prefix')} ${compassLabel(current.windDirection)}`,
      accent: '#8FD0B8',
    };
    chart = (
      <DetailChart
        theme={theme}
        hours={hours}
        seriesList={[
          { pick: (hour) => hour.windSpeed, color: '#8FD0B8' },
          { pick: (hour) => hour.windGusts, color: '#F5A962' },
        ]}
        legendLabels={['Average speed', 'Gusts']}
      />
    );
    factRows = [
      { label: t('f_gusts_now'), value: `${Math.round(convertWind(current.windGusts))} ${windUnitLabel()}` },
      { label: t('f_max_gust_24'), value: `${Math.round(convertWind(Math.max(...gusts)))} ${windUnitLabel()}` },
      { label: t('f_avg_24'), value: `${Math.round(convertWind(avgSpeed))} ${windUnitLabel()}` },
      { label: t('f_direction'), value: `${compassLabel(current.windDirection)} (${Math.round(current.windDirection)}°)` },
      { label: t('f_beaufort'), value: beaufortLabel(current.windSpeed) },
    ];
    about =
      'The solid line shows hourly average wind speed; the amber line shows gusts - short bursts that can run 30-40% stronger. Direction tells you where the wind is coming FROM. Force 6+ makes umbrellas useless and cycling hard.';
  } else if (view.topic === 'uv') {
    const uvNow = hours[0]?.uvIndex ?? null;
    const band = uvBandFor(uvNow);
    hero = {
      value: uvNow === null ? '--' : String(Math.round(uvNow)),
      label: band ? band.label : t('no_data'),
      accent: band?.color,
    };
    chart = (
      <DetailChart
        theme={theme}
        hours={hours}
        seriesList={[{ pick: (hour) => hour.uvIndex, color: '#F5A962' }]}
        fixedMin={0}
        fixedMax={12}
      />
    );
    const strongHours = hours
      .slice(0, 24)
      .filter((hour) => (hour.uvIndex ?? 0) >= 3).length;
    factRows = [
      { label: t('f_today_max'), value: today ? String(Math.round(today.uvIndexMax)) : '--' },
      { label: t('f_peak_around'), value: peakHourLabel(hours, (hour) => hour.uvIndex) },
      { label: t('f_sunscreen_hours'), value: `${strongHours} h at UV 3+` },
      { label: t('f_burn_risk'), value: uvAdvice(uvNow) },
    ];
    about =
      'The UV index measures sun-damage risk to skin and eyes: 0-2 low, 3-5 moderate, 6-7 high, 8-10 very high, 11+ extreme. SPF 30+ blocks about 97% of UVB rays - reapply every two hours, and remember UV passes through clouds.';
  } else if (view.topic === 'humidity') {
    hero = {
      value: `${Math.round(current.humidity)}`,
      unit: '%',
      label: t('rel_humidity'),
      accent: '#6FA8DC',
    };
    chart = (
      <DetailChart
        theme={theme}
        hours={hours}
        seriesList={[{ pick: (hour) => hour.humidity, color: '#6FA8DC' }]}
        fixedMin={0}
        fixedMax={100}
      />
    );
    dewChart = (
      <DetailChart
        theme={theme}
        hours={hours}
        seriesList={[{ pick: (hour) => hour.dewPoint, color: '#5BC98C' }]}
      />
    );
    factRows = [
      {
        label: t('f_dew_point'),
        value:
          current.dewPoint !== null
            ? `${Math.round(current.dewPoint)}°C · ${dewPointComfort(current.temperature, current.dewPoint)}`
            : '--',
      },
      { label: t('f_comfort'), value: comfortLabel(current.humidity) },
    ];
    about =
      'Relative humidity is how saturated the air is with water vapour: above 65% feels muggy, below 30% feels dry. The green chart tracks the dew point - the temperature where condensation begins. The closer it sits to the air temperature, the heavier the air feels.';
  } else if (view.topic === 'visibility') {
    const range = next24Range(hours, (hour) => hour.visibility);
    const band =
      current.visibility === null
        ? 'No data'
        : current.visibility >= 20000
          ? t('vis_crystal')
          : current.visibility >= 10000
            ? t('vis_clear')
            : current.visibility >= 4000
              ? t('vis_haze')
              : t('vis_poor');
    hero = { value: formatVisibility(current.visibility), label: band, accent: '#B8C6D4' };
    chart = (
      <DetailChart
        theme={theme}
        hours={hours}
        seriesList={[{ pick: (hour) => (hour.visibility === null ? null : hour.visibility / 1000), color: '#B8C6D4' }]}
      />
    );
    factRows = [
      { label: t('f_best_24'), value: range.max !== null ? formatVisibility(range.max) : '--' },
      { label: t('f_worst_24'), value: range.min !== null ? formatVisibility(range.min) : '--' },
      { label: t('f_fog_threshold'), value: 'under 1 km' },
    ];
    about =
      'Visibility is how far you can clearly see. Haze, fog, rain and high humidity all reduce it. Under 1 km officially counts as fog; over 20 km is the crystal-clear air you get after rain or in the mountains.';
  } else if (view.topic === 'pressure') {
    const range = next24Range(hours, (hour) => hour.pressure);
    const trend = formatPressureTrend(current.pressureTrend);
    hero = { value: `${Math.round(current.pressure)}`, unit: 'hPa', label: trend, accent: '#B9A7F5' };
    chart = (
      <DetailChart
        theme={theme}
        hours={hours}
        seriesList={[{ pick: (hour) => hour.pressure, color: '#B9A7F5' }]}
      />
    );
    factRows = [
      {
        label: t('f_change_3h'),
        value:
          current.pressureTrend === null
            ? '--'
            : `${current.pressureTrend > 0 ? '+' : ''}${current.pressureTrend.toFixed(1)} hPa`,
      },
      { label: t('f_high_24'), value: range.max !== null ? `${Math.round(range.max)} hPa` : '--' },
      { label: t('f_low_24'), value: range.min !== null ? `${Math.round(range.min)} hPa` : '--' },
      {
        label: t('f_meaning'),
        value:
          trend === t('trend_falling')
            ? t('trend_falling')
            : trend === t('trend_rising')
              ? t('trend_rising')
              : t('trend_steady'),
      },
    ];
    about =
      'Air pressure adjusted to sea level. Falling pressure usually means a low-pressure system (clouds, rain, storms) is approaching; rising pressure signals clearing and calmer weather. Storms often follow sharp drops.';
  } else if (view.topic === 'precipitation') {
    const next24 = hours.slice(0, 24);
    const maxProb = Math.max(...next24.map((hour) => hour.precipProbability), 0);
    const totalMm = next24.reduce((sum, hour) => sum + hour.precipitation, 0);
    hero = {
      value: formatPrecipValue(current.precipitation),
      unit: precipUnitLabel(),
      label: current.precipitation > 0 ? t('falling_now') : t('not_raining'),
      accent: '#5B8FD9',
    };
    chart = (
      <DetailChart
        theme={theme}
        hours={hours}
        seriesList={[{ pick: (hour) => hour.precipProbability, color: '#5B8FD9' }]}
        fixedMin={0}
        fixedMax={100}
      />
    );
    factRows = [
      { label: t('f_peak_12h'), value: `${Math.round(maxProb)}% chance` },
      { label: t('f_expected_24'), value: `${formatPrecip(totalMm)} total` },
      { label: t('f_wettest_hour'), value: peakHourLabel(hours, (hour) => hour.precipProbability) },
      { label: t('f_today_chance'), value: today ? `${Math.round(today.precipProbabilityMax)}%` : '--' },
    ];
    about =
      'The percentage is the chance of measurable rain at that exact hour. Millimetres show how much would accumulate: light rain is under 2.5 mm per hour, heavy rain is over 7.6 mm per hour.';
  } else if (view.topic === 'aqi') {
    const band = usAqiBand(view.data.aqi?.usAqi);
    const aqi = view.data.aqi;
    hero = {
      value: aqi?.usAqi != null ? String(Math.round(aqi.usAqi)) : '--',
      label: band ? band.label : t('no_data'),
      accent: band?.color,
    };
    bars = aqi
      ? [
          { label: 'PM2.5', value: fmtVal(aqi.pm2_5), fraction: (aqi.pm2_5 ?? 0) / 75, color: '#E85F5F' },
          { label: 'PM10', value: fmtVal(aqi.pm10), fraction: (aqi.pm10 ?? 0) / 200, color: '#F0964E' },
          { label: 'Ozone', value: fmtVal(aqi.ozone), fraction: (aqi.ozone ?? 0) / 160, color: '#B9A7F5' },
          { label: 'NO₂', value: fmtVal(aqi.no2), fraction: (aqi.no2 ?? 0) / 100, color: '#6FA8DC' },
          { label: 'SO₂', value: fmtVal(aqi.so2), fraction: (aqi.so2 ?? 0) / 100, color: '#E8D05A' },
        ]
      : null;
    factRows = [{ label: t('f_advice'), value: band ? band.advice : '--' }];
    about =
      'The US Air Quality Index blends five pollutants into one score. Bars show each pollutant against its unhealthy threshold (µg/m³). Above 100 sensitive groups should reduce outdoor exertion; above 200 everyone should limit time outside.';
  } else if (view.topic === 'moon') {
    const moon = moonPhase();
    const times = moonTimes(new Date(), view.data.location.latitude, view.data.location.longitude);
    const cycleFraction = moon.ageDays / 29.53058867;
    hero = { value: `${moon.illumination}%`, label: moon.phaseName, accent: '#C9C4E8' };
    progress = { fraction: cycleFraction, color: '#C9C4E8' };
    factRows = [
      { label: t('f_moonrise'), value: times.rise ? clock(times.rise) : 'tomorrow' },
      { label: t('f_moonset'), value: times.set ? clock(times.set) : 'tomorrow' },
      { label: t('f_cycle_day'), value: `${moon.ageDays.toFixed(1)} of 29.5` },
      { label: t('f_illumination'), value: `${moon.illumination}% lit` },
    ];
    about =
      'The Moon cycles through its phases every 29.5 days - the progress bar shows where we are in the current cycle. Illumination is the lit fraction visible from Earth. Full moons rise around sunset; new moons rise with the sun.';
  }

  let order = 0;
  const chartOrder = chart ? order++ : -1;
  const dewOrder = dewChart ? order++ : -1;
  const barsOrder = bars ? order++ : -1;
  const progressOrder = progress ? order++ : -1;
  const factsOrder = factRows.length ? order++ : -1;
  const aboutOrder = order++;

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
        >
          <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2.4} />
        </Pressable>
        <View style={[styles.titleIcon, { backgroundColor: theme.chipBg }]}>
          <Icon size={20} color={theme.textPrimary} strokeWidth={2} />
        </View>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{meta.title}</Text>
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Animated.View
          entering={sectionEntering(animStyle, 0)}
          style={[styles.heroCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
        >
          <Text style={[styles.heroValue, { color: theme.textPrimary }]}>{hero.value}</Text>
          {hero.unit ? <Text style={[styles.heroUnit, { color: theme.textSecondary }]}> {hero.unit}</Text> : null}
          <View style={styles.heroLabelRow}>
            {hero.accent ? <View style={[styles.accentDot, { backgroundColor: hero.accent }]} /> : null}
            <Text style={[styles.heroLabel, { color: theme.textSecondary }]}>{hero.label}</Text>
          </View>
        </Animated.View>

        {chart ? (
          <SectionCard theme={theme} animStyle={animStyle} title={t('d_next24')} order={chartOrder}>
            {chart}
          </SectionCard>
        ) : null}

        {dewChart ? (
          <SectionCard theme={theme} animStyle={animStyle} title={t('d_dew24')} order={dewOrder}>
            {dewChart}
          </SectionCard>
        ) : null}

        {bars ? (
          <SectionCard theme={theme} animStyle={animStyle} title={t('d_pollutants')} order={barsOrder}>
            {bars.map((bar) => (
              <BarRow
                key={bar.label}
                theme={theme}
                label={bar.label}
                value={bar.value}
                fraction={bar.fraction}
                color={bar.color}
              />
            ))}
          </SectionCard>
        ) : null}

        {progress ? (
          <SectionCard theme={theme} animStyle={animStyle} title={t('d_lunar')} order={progressOrder}>
            <View style={[styles.barTrack, styles.cycleTrack, { backgroundColor: theme.chipBg }]}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.round(progress.fraction * 100)}%`, backgroundColor: progress.color },
                ]}
              />
            </View>
          </SectionCard>
        ) : null}

        {factRows.length ? (
          <SectionCard theme={theme} animStyle={animStyle} title={t('d_facts')} order={factsOrder}>
            {factRows.map((fact) => (
              <FactRow key={fact.label} theme={theme} label={fact.label} value={fact.value} />
            ))}
          </SectionCard>
        ) : null}

        <SectionCard theme={theme} animStyle={animStyle} title={t('d_about')} order={aboutOrder}>
          <Text style={[styles.aboutText, { color: theme.textSecondary }]}>{about}</Text>
        </SectionCard>
      </ScrollView>
    </Animated.View>
  );
}

function next24Range(
  hours: HourPoint[],
  pick: (hour: HourPoint) => number | null,
): { min: number | null; max: number | null } {
  const values = hours
    .slice(0, 24)
    .map(pick)
    .filter((value): value is number => value !== null);
  if (!values.length) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function fmtVal(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  return `${Math.round(value)} µg/m³`;
}

function clock(date: Date): string {
  let hours = date.getHours();
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${String(date.getMinutes()).padStart(2, '0')} ${period}`;
}

function uvBandFor(uv: number | null): { label: string; color: string } | null {
  if (uv === null) return null;
  if (uv >= 11) return { label: t('band_extreme'), color: '#B06FD8' };
  if (uv >= 8) return { label: t('band_veryhigh'), color: '#E85F5F' };
  if (uv >= 6) return { label: t('band_high'), color: '#F0964E' };
  if (uv >= 3) return { label: t('band_moderate'), color: '#E8D05A' };
  return { label: t('band_low'), color: '#5BC98C' };
}

function uvAdvice(uv: number | null): string {
  if (uv === null) return '--';
  if (uv >= 8) return t('advice_uv_vhigh');
  if (uv >= 6) return t('advice_uv_high');
  if (uv >= 3) return t('advice_uv_mod');
  return t('advice_uv_low');
}

function comfortLabel(humidity: number): string {
  return humidityComfort(humidity);
}

function beaufortLabel(speedKmh: number): string {
  if (speedKmh < 1) return '0 · Calm';
  if (speedKmh < 6) return '1 · Light air';
  if (speedKmh < 12) return '2 · Light breeze';
  if (speedKmh < 20) return '3 · Gentle breeze';
  if (speedKmh < 29) return '4 · Moderate breeze';
  if (speedKmh < 39) return '5 · Fresh breeze';
  if (speedKmh < 50) return '6 · Strong breeze';
  if (speedKmh < 62) return '7 · Near gale';
  return '8+ · Gale';
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
  accentDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
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
  chartTimes: {
    height: 16,
    position: 'relative',
  },
  chartTime: {
    position: 'absolute',
    fontSize: 10,
    fontFamily: F.regular,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11.5,
    fontFamily: F.regular,
  },
  barWrap: {
    gap: 6,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  cycleTrack: {
    height: 10,
    borderRadius: 5,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
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
  aboutText: {
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: F.regular,
  },
});
