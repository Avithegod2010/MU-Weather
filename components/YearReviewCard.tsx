import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t, getLanguage } from '../utils/i18n';
import { F } from '../theme/typography';
import { Card } from './Card';
import { CalendarDays } from '../utils/uiIcons';
import { formatTemp, formatPrecip } from '../utils/format';
import { computeYearStats, type YearRow } from '../utils/yearLog';
import type { AppTheme } from '../theme/palettes';

interface YearReviewCardProps {
  theme: AppTheme;
  /** Rows recorded on this device for the active city (see utils/yearLog). */
  rows: YearRow[];
  revealDelay?: number;
}

/** "12 Feb" in the app language; noon avoids any timezone edge. */
function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(getLanguage(), {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Year in review: what this device actually recorded for the active city this
 * calendar year - the extremes, the averages and the rain totals, all from
 * archive actuals the past-days card already downloads. No extra requests,
 * nothing uploaded. The coverage line is explicit about how many days back the
 * numbers, because it is the days the user opened the app, not every day of
 * the year.
 */
export function YearReviewCard({ theme, rows, revealDelay }: YearReviewCardProps) {
  const year = new Date().getFullYear();
  const stats = useMemo(() => computeYearStats(rows, year), [rows, year]);

  const fact = (label: string, value: string) => (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: theme.textTertiary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.factValue, { color: theme.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  if (!stats) {
    return (
      <Card theme={theme} title={t('yr_title')} icon={CalendarDays} revealDelay={revealDelay}>
        <Text style={[styles.empty, { color: theme.textSecondary }]}>{t('yr_empty')}</Text>
      </Card>
    );
  }

  return (
    <Card theme={theme} title={t('yr_title')} icon={CalendarDays} revealDelay={revealDelay}>
      <View style={styles.heroRow}>
        <View style={[styles.hero, { backgroundColor: theme.chipBg }]}>
          <Text style={[styles.heroLabel, { color: theme.textTertiary }]}>
            {t('yr_hottest')}
          </Text>
          <Text style={[styles.heroValue, { color: theme.textPrimary }]}>
            {formatTemp(stats.hottest?.tMax ?? null)}
          </Text>
          <Text style={[styles.heroDate, { color: theme.textTertiary }]}>
            {stats.hottest ? shortDate(stats.hottest.date) : ''}
          </Text>
        </View>
        <View style={[styles.hero, { backgroundColor: theme.chipBg }]}>
          <Text style={[styles.heroLabel, { color: theme.textTertiary }]}>
            {t('yr_coldest')}
          </Text>
          <Text style={[styles.heroValue, { color: theme.textPrimary }]}>
            {formatTemp(stats.coldest?.tMin ?? null)}
          </Text>
          <Text style={[styles.heroDate, { color: theme.textTertiary }]}>
            {stats.coldest ? shortDate(stats.coldest.date) : ''}
          </Text>
        </View>
      </View>

      <View style={styles.factGrid}>
        {fact(t('yr_avg_high'), formatTemp(stats.avgHigh))}
        {fact(t('yr_avg_low'), formatTemp(stats.avgLow))}
        {fact(t('yr_total_rain'), formatPrecip(stats.totalRain))}
        {fact(t('stat_wet_days'), String(stats.wetDays))}
        {fact(t('yr_fair_days'), String(stats.fairDays))}
        {stats.wettest && stats.wettest.precipSum > 0
          ? fact(t('yr_wettest_day'), `${formatPrecip(stats.wettest.precipSum)} · ${shortDate(stats.wettest.date)}`)
          : null}
      </View>

      <Text style={[styles.coverage, { color: theme.textTertiary }]}>
        {t('yr_coverage').replace('{n}', String(stats.days))}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 14,
    fontFamily: F.regular,
    lineHeight: 19,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 8,
  },
  hero: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  heroLabel: {
    fontSize: 11,
    fontFamily: F.medium,
  },
  heroValue: {
    fontSize: 22,
    fontFamily: F.bold,
    marginTop: 2,
  },
  heroDate: {
    fontSize: 11,
    fontFamily: F.regular,
  },
  factGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    rowGap: 10,
  },
  fact: {
    width: '50%',
    paddingRight: 8,
  },
  factLabel: {
    fontSize: 11,
    fontFamily: F.regular,
  },
  factValue: {
    fontSize: 15,
    fontFamily: F.semibold,
    marginTop: 1,
  },
  coverage: {
    fontSize: 11,
    fontFamily: F.regular,
    marginTop: 12,
  },
});