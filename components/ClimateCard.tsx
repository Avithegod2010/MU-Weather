import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t, getLanguage } from '../utils/i18n';
import { Droplet, Thermometer } from '../utils/uiIcons';
import { Card } from './Card';
import { formatPrecip, formatTemp, getUnits } from '../utils/format';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { MonthlyNormal } from '../api/types';

interface ClimateCardProps {
  theme: AppTheme;
  /** 12 monthly rows (month 1-12), or null while loading/failed. */
  months: MonthlyNormal[] | null;
  /** Feed status from useClimateNormals; unused today — the card is simply
   * absent while loading or after a failure (no skeleton). Kept so future
   * loading/error states don't need a call-site change. */
  status: 'idle' | 'loading' | 'ok' | 'error';
  /** Today's forecast high in °C, for the "vs usual" delta line. */
  todayTMax?: number | null;
}

const PRECIP_COLOR = '#A5DBF9';
/** |today's high - monthly mean high| below this reads as "typical". */
const TYPICAL_THRESHOLD_C = 2;

/** Localized month name for month 1-12, in the active app language. */
function monthName(month: number): string {
  return new Date(2020, month - 1, 1).toLocaleDateString(getLanguage(), { month: 'long' });
}

export function ClimateCard({ theme, months, todayTMax = null }: ClimateCardProps) {
  // No months cached yet (or the fetch failed): card absent, not crashed -
  // same contract as PastWeekCard. `climate_loading` stays as a spare key.
  if (!months || months.length !== 12) return null;

  const currentMonth = new Date().getMonth() + 1;
  const current = months.find((row) => row.month === currentMonth) ?? months[0];
  const name = monthName(current.month);

  let deltaLine: string | null = null;
  if (typeof todayTMax === 'number' && Number.isFinite(todayTMax)) {
    const diffC = todayTMax - current.tMaxMean;
    const scale = getUnits().temp === 'fahrenheit' ? 9 / 5 : 1;
    const rounded = Math.round(Math.abs(diffC) * scale);
    if (diffC >= TYPICAL_THRESHOLD_C) {
      deltaLine = t('climate_delta_warmer').replace('{n}', String(rounded)).replace('{month}', name);
    } else if (diffC <= -TYPICAL_THRESHOLD_C) {
      deltaLine = t('climate_delta_cooler').replace('{n}', String(rounded)).replace('{month}', name);
    } else {
      deltaLine = t('climate_delta_typical').replace('{month}', name);
    }
  }

  const hottest = months.reduce((a, b) => (b.tMaxMean > a.tMaxMean ? b : a));
  const coldest = months.reduce((a, b) => (b.tMinMean < a.tMinMean ? b : a));
  const wettest = months.reduce((a, b) => (b.precipMean > a.precipMean ? b : a));
  const yearNote = t('climate_year_note')
    .replace('{hottest}', monthName(hottest.month))
    .replace('{coldest}', monthName(coldest.month))
    .replace('{wettest}', monthName(wettest.month));

  return (
    <Card theme={theme} title={t('card_climate')} icon={Thermometer}>
      <Text style={[styles.monthLabel, { color: theme.textSecondary }]}>
        {t('climate_this_month').replace('{month}', name)}
      </Text>
      <Text style={[styles.focusTemps, { color: theme.textPrimary }]}>
        {formatTemp(current.tMaxMean)} / {formatTemp(current.tMinMean)}
      </Text>
      {deltaLine ? (
        <Text style={[styles.deltaLine, { color: theme.textSecondary }]}>{deltaLine}</Text>
      ) : null}
      <View style={styles.rainRow}>
        <Droplet size={11} color={PRECIP_COLOR} strokeWidth={2.4} />
        <Text style={[styles.rainText, { color: theme.textSecondary }]}>
          {t('climate_rain_normal').replace('{n}', formatPrecip(current.precipMean))}
        </Text>
      </View>
      <Text style={[styles.footnote, { color: theme.textTertiary }]}>{yearNote}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  monthLabel: {
    fontSize: 12,
    fontFamily: F.medium,
  },
  focusTemps: {
    fontSize: 26,
    fontFamily: F.bold,
    marginTop: 2,
  },
  deltaLine: {
    fontSize: 12.5,
    fontFamily: F.regular,
    marginTop: 4,
  },
  rainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  rainText: {
    fontSize: 12,
    fontFamily: F.medium,
  },
  footnote: {
    fontSize: 11,
    marginTop: 8,
    fontFamily: F.regular,
  },
});
