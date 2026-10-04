import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t, getLanguage } from '../utils/i18n';
import { F } from '../theme/typography';
import { Card } from './Card';
import { Star } from '../utils/uiIcons';
import { formatTemp, formatPrecip, convertWind, windUnitLabel } from '../utils/format';
import { computeRecords, type RecordStat } from '../utils/recordBreakers';
import type { LocationRecords } from '../api/providers';
import type { AppTheme } from '../theme/palettes';

interface RecordCardProps {
  theme: AppTheme;
  /** The archive window for this location, or null while unavailable. */
  records: LocationRecords | null;
  revealDelay?: number;
}

/** "12 Feb 2021" in the app language; noon avoids any timezone edge. */
function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(getLanguage(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Record breakers for the active city: the hottest day, the wettest day and
 * the strongest wind inside the archive window (2020 to yesterday). Each row
 * shows the value in the user's units plus the date it happened, and the card
 * states the window and how many days were searched, because a "record" is
 * only as honest as its range.
 */
export function RecordCard({ theme, records, revealDelay }: RecordCardProps) {
  const summary = useMemo(
    () => (records ? computeRecords(records.rows) : null),
    [records],
  );

  if (!records || !summary || !summary.hottest) {
    return (
      <Card theme={theme} title={t('rec_title')} icon={Star} revealDelay={revealDelay}>
        <Text style={[styles.empty, { color: theme.textSecondary }]}>{t('rec_empty')}</Text>
      </Card>
    );
  }

  const row = (label: string, stat: RecordStat | null, value: string) =>
    stat ? (
      <View style={styles.row} key={label}>
        <View style={styles.rowTexts}>
          <Text style={[styles.rowLabel, { color: theme.textSecondary }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.rowDate, { color: theme.textTertiary }]} numberOfLines={1}>
            {longDate(stat.day.date)}
          </Text>
        </View>
        <Text style={[styles.rowValue, { color: theme.textPrimary }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    ) : null;

  return (
    <Card theme={theme} title={t('rec_title')} icon={Star} revealDelay={revealDelay}>
      {row(t('rec_hottest'), summary.hottest, formatTemp(summary.hottest.value))}
      {row(t('rec_wettest'), summary.wettest, formatPrecip(summary.wettest?.value ?? 0))}
      {row(
        t('rec_windiest'),
        summary.windiest,
        summary.windiest
          ? `${Math.round(convertWind(summary.windiest.value))} ${windUnitLabel()}`
          : '',
      )}
      <Text style={[styles.footnote, { color: theme.textTertiary }]}>
        {t('rec_window')
          .replace('{from}', String(new Date(`${records.from}T12:00:00`).getFullYear()))
          .replace('{n}', String(summary.days))}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 7,
  },
  rowTexts: { flex: 1 },
  rowLabel: {
    fontSize: 14,
    fontFamily: F.semibold,
  },
  rowDate: {
    fontSize: 11.5,
    fontFamily: F.regular,
  },
  rowValue: {
    fontSize: 17,
    fontFamily: F.bold,
  },
  footnote: {
    fontSize: 11,
    fontFamily: F.regular,
    marginTop: 10,
  },
});