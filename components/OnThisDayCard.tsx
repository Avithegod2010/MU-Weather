import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../utils/i18n';
import { CalendarDays, ChevronRight } from '../utils/uiIcons';
import { haptics } from '../utils/haptics';
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
  /** Opens the historical explorer. Omitted by callers that don't want the
   * entry point, in which case the card renders exactly as it did before. */
  onExplore?: () => void;
}

export function OnThisDayCard({ theme, years, onExplore }: OnThisDayCardProps) {
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
      {onExplore ? (
        <Pressable
          onPress={() => {
            haptics.select();
            onExplore();
          }}
          style={({ pressed }) => [
            styles.exploreRow,
            { backgroundColor: theme.chipBg },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('hist_explore')}
        >
          <CalendarDays size={15} color={theme.textPrimary} strokeWidth={2.2} />
          <Text style={[styles.exploreText, { color: theme.textPrimary }]} numberOfLines={1}>
            {t('hist_explore')}
          </Text>
          <ChevronRight size={16} color={theme.textTertiary} strokeWidth={2.2} />
        </Pressable>
      ) : null}
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
  exploreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  exploreText: {
    fontSize: 12.5,
    fontFamily: F.semibold,
  },
});