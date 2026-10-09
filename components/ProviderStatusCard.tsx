import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { Database } from '../utils/uiIcons';
import { t } from '../utils/i18n';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { WeatherBundle } from '../api/types';
import type { EnsembleState } from '../hooks/useEnsemble';
import type { MeteoAlarmState } from '../hooks/useMeteoAlarm';
import type { ProviderCheck } from '../api/providers';
import { ENSEMBLE_TTL_MS } from '../utils/ensembleCache';
import { METEOALARM_CACHE_TTL_MS } from '../utils/meteoalarm';
import { WEATHER_CACHE_FRESH_FOR_MS } from '../utils/freshnessPolicy';

interface ProviderStatusCardProps {
  theme: AppTheme;
  weather: WeatherBundle | null;
  ensemble: EnsembleState;
  officialWarnings: MeteoAlarmState;
  secondaryProvider: ProviderCheck;
  now: number;
}

type RowStatus = 'fresh' | 'stale' | 'loading' | 'unavailable';

interface ProviderRow {
  label: string;
  status: RowStatus;
  updatedAt: number | null;
}

function ageLabel(updatedAt: number | null, now: number): string {
  if (updatedAt === null || !Number.isFinite(updatedAt)) return '';
  const age = Math.max(0, now - updatedAt);
  if (age < 60_000) return '<1m';
  if (age < 60 * 60_000) return `${Math.floor(age / 60_000)}m`;
  if (age < 24 * 60 * 60_000) return `${Math.floor(age / (60 * 60_000))}h`;
  return `${Math.floor(age / (24 * 60 * 60_000))}d`;
}

function timeStatus(updatedAt: number | null, now: number, freshFor: number): RowStatus {
  if (updatedAt === null || !Number.isFinite(updatedAt)) return 'unavailable';
  const age = now - updatedAt;
  if (age < -5 * 60_000) return 'stale';
  return age >= freshFor ? 'stale' : 'fresh';
}

function statusLabel(row: ProviderRow, now: number): string {
  switch (row.status) {
    case 'loading':
      return t('detail_loading');
    case 'unavailable':
      return t('unavailable');
    case 'stale':
      return `${t('offline_banner_stale')} · ${ageLabel(row.updatedAt, now)}`;
    case 'fresh':
      return `${t('offline_banner_age')} · ${ageLabel(row.updatedAt, now)}`;
  }
}

export function ProviderStatusCard({
  theme,
  weather,
  ensemble,
  officialWarnings,
  secondaryProvider,
  now,
}: ProviderStatusCardProps) {
  const weatherAt = weather?.fetchedAt ?? null;
  const aqiAvailable = weather?.airQualityStatus === 'available' ||
    (weather?.airQualityStatus === undefined && weather?.aqi !== null && weather?.aqi !== undefined);
  const aqiAt = weather?.airQualityFetchedAt ?? (aqiAvailable ? weatherAt : null);
  const ensembleAt = ensemble.spread?.fetchedAt ?? null;
  const warningAt = officialWarnings.updatedAt;
  const secondaryAt = secondaryProvider.checkedAt ?? null;

  const rows: ProviderRow[] = [
    {
      label: t('card_hourly'),
      status: weather ? timeStatus(weatherAt, now, WEATHER_CACHE_FRESH_FOR_MS) : 'unavailable',
      updatedAt: weatherAt,
    },
    {
      label: t('card_aqi'),
      status: aqiAvailable ? timeStatus(aqiAt, now, WEATHER_CACHE_FRESH_FOR_MS) : 'unavailable',
      updatedAt: aqiAt,
    },
    {
      label: t('trend_band_label'),
      status: ensemble.spread
        ? timeStatus(ensembleAt, now, ENSEMBLE_TTL_MS)
        : ensemble.status === 'loading' ? 'loading' : 'unavailable',
      updatedAt: ensembleAt,
    },
    {
      label: t('card_warnings'),
      status: officialWarnings.status === 'loading'
        ? 'loading'
        : officialWarnings.status === 'ok'
          ? timeStatus(warningAt, now, METEOALARM_CACHE_TTL_MS)
          : 'unavailable',
      updatedAt: warningAt,
    },
    {
      label: t('card_accuracy'),
      status: secondaryProvider.status === 'checking'
        ? 'loading'
        : secondaryProvider.status === 'ok'
          ? timeStatus(secondaryAt, now, 60 * 60_000)
          : 'unavailable',
      updatedAt: secondaryAt,
    },
  ];

  return (
    <Card theme={theme} title={t('s_sources')} icon={Database}>
      <View style={styles.rows}>
        {rows.map((row) => {
          const color = row.status === 'fresh'
            ? '#5BC98C'
            : row.status === 'stale'
              ? '#EFC25C'
              : theme.textTertiary;
          return (
            <View key={row.label} style={styles.row} accessible accessibilityRole="text"
              accessibilityLabel={`${row.label}, ${statusLabel(row, now)}`}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
                {row.label}
              </Text>
              <Text style={[styles.status, { color }]} numberOfLines={1}>
                {statusLabel(row, now)}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { flex: 1, fontSize: 11.5, fontFamily: F.medium },
  status: { fontSize: 10.5, fontFamily: F.regular, textAlign: 'right' },
});
