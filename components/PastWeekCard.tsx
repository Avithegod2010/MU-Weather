import { t, tDay } from '../utils/i18n';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Droplet, Clock3 as History } from '../utils/uiIcons';
import { Card } from './Card';
import { formatPrecip, formatPrecipValue, tempColor } from '../utils/format';
import { loadForecastLog, type ForecastLogEntry } from '../utils/forecastLog';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { PastDayActual } from '../api/types';

interface PastWeekCardProps {
  theme: AppTheme;
  /** Archive actuals, oldest first. May hold fewer than 7 days. */
  days: PastDayActual[];
}

const PRECIP_COLOR = '#A5DBF9';
const BAR_HEIGHT = 62;
const GOOD_DELTA = '#5BC98C';
const OK_DELTA = '#E8D05A';
const BAD_DELTA = '#E85F5F';

/** Archive dates are plain `YYYY-MM-DD`; noon-UTC parsing keeps the weekday stable. */
function weekdayOf(date: string): number {
  const time = Date.parse(`${date}T12:00:00Z`);
  return Number.isNaN(time) ? -1 : new Date(time).getUTCDay();
}

/** Signed delta chip text, e.g. `+2°`, `-1°`, `±0°`. */
function deltaChipText(actual: number, forecast: number): string {
  const diff = Math.round(actual - forecast);
  if (diff === 0) return '±0°';
  return `${diff > 0 ? '+' : '-'}${Math.abs(diff)}°`;
}

function deltaColor(diff: number): string {
  const abs = Math.abs(diff);
  if (abs <= 1) return GOOD_DELTA;
  if (abs <= 3) return OK_DELTA;
  return BAD_DELTA;
}

export function PastWeekCard({ theme, days }: PastWeekCardProps) {
  const [log, setLog] = useState<ForecastLogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await loadForecastLog();
      if (!cancelled) setLog(entries);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (days.length === 0) return null;

  const ordered = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const byDate = new Map(log.map((entry) => [entry.date, entry]));
  const weekMin = Math.min(...ordered.map((d) => d.tMin));
  const weekMax = Math.max(...ordered.map((d) => d.tMax));
  const range = Math.max(weekMax - weekMin, 1);
  const totalRain = ordered.reduce((sum, d) => sum + d.precipSum, 0);
  const deltas = ordered
    .filter((d) => byDate.has(d.date))
    .map((d) => Math.round(d.tMax - (byDate.get(d.date) as ForecastLogEntry).tMax));
  const anyDelta = deltas.length > 0;
  const hasUnloggedDays = ordered.some((d) => !byDate.has(d.date));

  return (
    <Card theme={theme} title={t('card_past_week')} icon={History}>
      <View style={styles.columns}>
        {ordered.map((day) => {
          const forecast = byDate.get(day.date);
          const bottomPct = ((day.tMin - weekMin) / range) * 100;
          const heightPct = Math.max(((day.tMax - day.tMin) / range) * 100, 12);
          const weekday = weekdayOf(day.date);
          return (
            <View key={day.date} style={styles.column}>
              <Text style={[styles.dayLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                {weekday >= 0 ? tDay(weekday) : '--'}
              </Text>
              <View style={styles.chipSlot}>
                {forecast ? (
                  <View style={[styles.chip, { backgroundColor: theme.chipBg }]}>
                    <Text
                      style={[
                        styles.chipText,
                        { color: deltaColor(day.tMax - forecast.tMax) },
                      ]}
                    >
                      {deltaChipText(day.tMax, forecast.tMax)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.barTrack, { backgroundColor: theme.trackColor }]}>
                <LinearGradient
                  colors={[tempColor(day.tMax), tempColor(day.tMin)] as [string, string]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={[styles.barFill, { bottom: `${bottomPct}%`, height: `${heightPct}%` }]}
                />
              </View>
              {day.precipSum >= 0.05 ? (
                <View style={styles.rainRow}>
                  <Droplet size={9} color={PRECIP_COLOR} strokeWidth={2.6} />
                  <Text style={[styles.rainText, { color: theme.textSecondary }]}>
                    {formatPrecipValue(day.precipSum)}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.rainText, styles.rainDry, { color: theme.textTertiary }]}>
                  –
                </Text>
              )}
            </View>
          );
        })}
      </View>

      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        {t('week_rain_total')}: {formatPrecip(totalRain)}
        {anyDelta ? ` · ${t('delta_vs_forecast')}` : ''}
      </Text>
      {hasUnloggedDays ? (
        <Text style={[styles.footnote, { color: theme.textTertiary }]}>
          {t('past_week_note')}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  columns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  dayLabel: {
    fontSize: 10.5,
    fontFamily: F.medium,
  },
  chipSlot: {
    height: 18,
    justifyContent: 'center',
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: 9.5,
    fontFamily: F.bold,
  },
  barTrack: {
    width: 14,
    height: BAR_HEIGHT,
    borderRadius: 7,
    overflow: 'hidden',
  },
  barFill: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderRadius: 5,
  },
  rainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  rainText: {
    fontSize: 10,
    fontFamily: F.medium,
  },
  rainDry: {
    opacity: 0.6,
  },
  caption: {
    fontSize: 11.5,
    marginTop: 10,
    fontFamily: F.regular,
  },
  footnote: {
    fontSize: 11,
    marginTop: 3,
    fontFamily: F.regular,
  },
});
