import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../utils/i18n';
import { CalendarDays } from '../utils/uiIcons';
import { Card } from './Card';
import { formatTemp } from '../utils/format';
import { describeWmo } from '../utils/wmo';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { OnThisDayYear } from '../api/types';

interface OnThisDayCardProps {
  theme: AppTheme;
  /** Observed rows, newest year first, or null while loading/failed. */
  years: OnThisDayYear[] | null;
  /** Feed status from useOnThisDay; unused today — the card is simply
   * absent while loading or after a failure (no skeleton). Kept so future
   * loading/error states don't need a call-site change. */
  status: 'idle' | 'loading' | 'ok' | 'error';
}

export function OnThisDayCard({ theme, years }: OnThisDayCardProps) {
  // No rows yet (or the fetch failed): card absent, not crashed - same
  // contract as ClimateCard.
  if (!years || years.length === 0) return null;

  const currentYear = new Date().getFullYear();

  return (
    <Card theme={theme} title={t('card_onthisday')} icon={CalendarDays}>
      {years.map((row) => {
        const yearsAgo = currentYear - row.year;
        const ageLabel =
          yearsAgo === 1
            ? t('otd_one_year_ago')
            : t('otd_years_ago').replace('{n}', String(yearsAgo));
        return (
          <View key={row.year} style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={[styles.ageLabel, { color: theme.textSecondary }]}>{ageLabel}</Text>
              <Text style={[styles.rowCondition, { color: theme.textTertiary }]}>
                {describeWmo(row.weatherCode).label}
              </Text>
            </View>
            <Text style={[styles.rowTemps, { color: theme.textPrimary }]}>
              {formatTemp(row.tMax)} / {formatTemp(row.tMin)}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  rowInfo: {
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  ageLabel: {
    fontSize: 12,
    fontFamily: F.medium,
  },
  rowCondition: {
    fontSize: 11,
    fontFamily: F.regular,
    marginTop: 1,
  },
  rowTemps: {
    fontSize: 20,
    fontFamily: F.bold,
  },
});