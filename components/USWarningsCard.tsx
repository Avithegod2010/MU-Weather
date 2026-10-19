import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { t, getLanguage } from '../utils/i18n';
import { Card } from './Card';
import { formatHourLabel } from '../utils/format';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { NwsAlert } from '../api/nws';

interface USWarningsCardProps {
  theme: AppTheme;
  /** Current warnings, last-known stale warnings, or null while unavailable. */
  alerts: NwsAlert[] | null;
  /** 'idle' (outside coverage) hides the card entirely - like MeteoAlarm. */
  status: 'idle' | 'loading' | 'ok' | 'stale' | 'error';
  /** Original source-fetch time, not the UI's last render/check time. */
  updatedAt: number | null;
  now: number;
  style?: StyleProp<ViewStyle>;
  revealDelay?: number;
}

/** NWS severity → row-dot colour, matched to the alert-history palette. */
const SEVERITY_COLORS: Record<NwsAlert['severity'], string> = {
  Extreme: '#E85F5F',
  Severe: '#F5A962',
  Moderate: '#E8D05A',
  Minor: '#6FA8DC',
};

/** A11y severity wording reuses the alert-history labels. */
const SEVERITY_LABEL_KEY: Record<
  NwsAlert['severity'],
  'alert_severity_severe' | 'alert_severity_warning' | 'alert_severity_info'
> = {
  Extreme: 'alert_severity_severe',
  Severe: 'alert_severity_severe',
  Moderate: 'alert_severity_warning',
  Minor: 'alert_severity_info',
};

/** A refresh older than 15 minutes (3 intervals) counts as stale for display. */
const STALE_AFTER_MS = 15 * 60 * 1000;
const MAX_ROWS = 4;

/** Device-local naive ISO (no zone) so formatHourLabel renders local wall time. */
function localNaiveIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Government-issued US severe-weather warnings & advisories (NOAA/NWS) for the
 * active location. Complements the MeteoAlarm card: the two feeds never both
 * claim the same country, so a US user sees this one and an EU user sees
 * WarningsCard. Not pressable - there is no deep-dive behind it. State text
 * distinguishes no warnings, outages and stale data exactly like WarningsCard.
 */
export function USWarningsCard({
  theme,
  alerts,
  status,
  updatedAt,
  now,
  style,
  revealDelay,
}: USWarningsCardProps) {
  if (status === 'idle') return null;
  const sourceAge = updatedAt === null ? Number.POSITIVE_INFINITY : now - updatedAt;
  const validTimestamp = updatedAt !== null && Number.isFinite(updatedAt);
  const stale = status === 'stale' || sourceAge >= STALE_AFTER_MS;
  const count = alerts?.length ?? 0;
  const showRows = (status === 'ok' || status === 'stale') && validTimestamp && count > 0;
  const updatedDate = validTimestamp ? new Date(Math.min(updatedAt, now)) : null;
  const updatedTime = updatedDate
    ? `${updatedDate.toLocaleDateString(getLanguage(), { month: 'short', day: 'numeric' })} · ${formatHourLabel(localNaiveIso(updatedDate), false)}`
    : '';
  const updatedText = updatedTime ? t('aurora_updated').replace('{time}', updatedTime) : '';
  let stateMessage: string;
  if (status === 'loading') stateMessage = t('warning_state_loading');
  else if (status === 'error') stateMessage = t('warning_state_unavailable');
  else if (stale && updatedTime) stateMessage = t('warning_state_stale').replace('{time}', updatedTime);
  else stateMessage = t('warning_state_none');

  return (
    <Card theme={theme} style={style} {...(revealDelay !== undefined ? { revealDelay } : {})}>
      {showRows ? (
        <View style={styles.stack}>
          {alerts!.slice(0, MAX_ROWS).map((alert) => {
            const title = alert.headline || alert.event;
            const until = untilLabel(alert.expires);
            const untilText = until ? t('warnings_until').replace('{t}', until) : null;
            const levelLabel = t(SEVERITY_LABEL_KEY[alert.severity]);
            const composedLabel = [levelLabel, title, alert.areaDesc || null, untilText]
              .filter(Boolean)
              .join(', ');
            return (
              <View
                key={alert.id}
                style={styles.row}
                accessible={true}
                accessibilityRole="text"
                accessibilityLabel={composedLabel}
              >
                <View style={[styles.dot, { backgroundColor: SEVERITY_COLORS[alert.severity] }]} />
                <View style={styles.rowBody}>
                  <Text style={[styles.event, { color: theme.textPrimary }]} numberOfLines={2}>
                    {title}
                  </Text>
                  {alert.areaDesc ? (
                    <Text style={[styles.area, { color: theme.textTertiary }]} numberOfLines={2}>
                      {alert.areaDesc}
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
      ) : (
        <Text style={[styles.stateMessage, { color: theme.textTertiary }]}>{stateMessage}</Text>
      )}
      <View
        style={styles.footer}
        accessible
        accessibilityRole="text"
        accessibilityLabel={[t('nws_alerts'), updatedText].filter(Boolean).join(', ')}
      >
        <Text style={[styles.source, { color: theme.textTertiary }]}>{t('nws_alerts')}</Text>
        {updatedText ? (
          <Text style={[styles.updated, { color: theme.textTertiary }]}>{updatedText}</Text>
        ) : null}
      </View>
    </Card>
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

const styles = StyleSheet.create({
  stateMessage: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 9,
  },
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
  area: {
    fontSize: 11.5,
    lineHeight: 15,
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
