import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { t, getLanguage } from '../utils/i18n';
import { TriangleAlert } from '../utils/uiIcons';
import { Card } from './Card';
import { formatHourLabel } from '../utils/format';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import {
  METEOALARM_CACHE_TTL_MS,
  type MeteoAlarmLevelColor,
  type MeteoAlarmWarning,
} from '../utils/meteoalarm';

interface WarningsCardProps {
  theme: AppTheme;
  /** Active warnings for the location, or null while loading/failed. */
  warnings: MeteoAlarmWarning[] | null;
  /** Feed status from useMeteoAlarm; unused today - the card is simply
   * absent while loading or after a failure (no skeleton). */
  status: 'idle' | 'loading' | 'ok' | 'error';
  /** Original source-fetch time, not the UI's last render/check time. */
  updatedAt: number | null;
  now: number;
  style?: StyleProp<ViewStyle>;
  revealDelay?: number;
}

/** MeteoAlarm awareness colours, matched to the app palette. */
const LEVEL_COLORS: Record<MeteoAlarmLevelColor, string> = {
  green: '#5BC98C',
  yellow: '#E8D05A',
  orange: '#F5A962',
  red: '#E85F5F',
};

const MAX_ROWS = 4;

/** Device-local naive ISO (no zone) so formatHourLabel renders local wall time. */
function localNaiveIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** "Until" label for an ISO instant: time today, weekday+date otherwise. */
function untilLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = formatHourLabel(localNaiveIso(date), false);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return time;
  const day = date.toLocaleDateString(getLanguage(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${day} ${time}`;
}

/**
 * Government-issued severe-weather warnings (MetoAlarm) for the active
 * location. Not pressable - there is no deep-dive behind it. Absent while
 * loading, after a failure, or when no warnings are active.
 */
export function WarningsCard({
  theme,
  warnings,
  updatedAt,
  now,
  style,
  revealDelay,
}: WarningsCardProps) {
  const sourceAge = updatedAt === null ? Number.POSITIVE_INFINITY : now - updatedAt;
  if (
    !warnings ||
    warnings.length === 0 ||
    updatedAt === null ||
    !Number.isFinite(updatedAt) ||
    sourceAge < -5 * 60 * 1000 ||
    sourceAge >= METEOALARM_CACHE_TTL_MS
  ) return null;
  const updatedDate = new Date(Math.min(updatedAt, now));
  const updatedTime = `${updatedDate.toLocaleDateString(getLanguage(), { month: 'short', day: 'numeric' })} · ${formatHourLabel(localNaiveIso(updatedDate), false)}`;
  const updatedText = t('aurora_updated').replace('{time}', updatedTime);

  return (
    <Card
      theme={theme}
      title={t('card_warnings')}
      icon={TriangleAlert}
      style={style}
      revealDelay={revealDelay}
    >
      <View style={styles.stack}>
        {warnings.slice(0, MAX_ROWS).map((warning) => {
          const title = warning.event || warning.headline || t('no_data');
          const until = untilLabel(warning.expires);
          const untilText = until
            ? t('warnings_until').replace('{t}', until)
            : null;
          const composedLabel = [
            title,
            warning.description || null,
            warning.instruction || null,
            untilText,
            warning.areaDesc,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <View
              key={warning.id}
              style={styles.row}
              accessible={true}
              accessibilityRole="text"
              accessibilityLabel={composedLabel}
            >
              <View
                style={[styles.dot, { backgroundColor: LEVEL_COLORS[warning.levelColor] }]}
              />
              <View style={styles.rowBody}>
                <Text style={[styles.event, { color: theme.textPrimary }]} numberOfLines={1}>
                  {title}
                </Text>
                {warning.description ? (
                  <Text style={[styles.desc, { color: theme.textTertiary }]} numberOfLines={2}>
                    {warning.description}
                  </Text>
                ) : null}
                {warning.instruction ? (
                  <Text style={[styles.instruction, { color: theme.textSecondary }]}>
                    {warning.instruction}
                  </Text>
                ) : null}
                {untilText ? (
                  <Text style={[styles.until, { color: theme.textSecondary }]}>{untilText}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.footer}>
        <Text style={[styles.source, { color: theme.textTertiary }]}>{t('warnings_source')}</Text>
        <Text style={[styles.updated, { color: theme.textTertiary }]}>{updatedText}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 11,
  },
  row: {
    flexDirection: 'row',
    gap: 9,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  event: {
    fontSize: 13.5,
    fontFamily: F.semibold,
  },
  desc: {
    fontSize: 12,
    lineHeight: 16,
  },
  instruction: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: F.medium,
  },
  until: {
    fontSize: 11.5,
    fontFamily: F.medium,
  },
  footer: {
    gap: 2,
    marginTop: 8,
  },
  source: {
    fontSize: 11,
  },
  updated: {
    fontSize: 11,
  },
});
