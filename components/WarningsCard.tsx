import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { t, getLanguage } from '../utils/i18n';
import { TriangleAlert } from '../utils/uiIcons';
import { Card } from './Card';
import { formatHourLabel } from '../utils/format';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { MeteoAlarmLevelColor, MeteoAlarmWarning } from '../utils/meteoalarm';

interface WarningsCardProps {
  theme: AppTheme;
  /** Active warnings for the location, or null while loading/failed. */
  warnings: MeteoAlarmWarning[] | null;
  /** Feed status from useMeteoAlarm; unused today - the card is simply
   * absent while loading or after a failure (no skeleton). */
  status: 'idle' | 'loading' | 'ok' | 'error';
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
  style,
  revealDelay,
}: WarningsCardProps) {
  if (!warnings || warnings.length === 0) return null;

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
                {untilText ? (
                  <Text style={[styles.until, { color: theme.textSecondary }]}>{untilText}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <Text style={[styles.source, { color: theme.textTertiary }]}>{t('warnings_source')}</Text>
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
  until: {
    fontSize: 11.5,
    fontFamily: F.medium,
  },
  source: {
    fontSize: 11,
    marginTop: 8,
  },
});
