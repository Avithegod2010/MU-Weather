import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getLanguage, t } from '../utils/i18n';
import { formatTemp } from '../utils/format';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { PastDayActual } from '../api/types';

/** Fixed temperature bands for the cell colours (°C, unit-independent). */
const BANDS: { max: number; color: string }[] = [
  { max: -10, color: '#6B7CE0' },
  { max: 0, color: '#6FA8DC' },
  { max: 10, color: '#5BC98C' },
  { max: 20, color: '#E8D05A' },
  { max: 30, color: '#F5A962' },
  { max: Number.POSITIVE_INFINITY, color: '#E85F5F' },
];

const CELL = 5;
const GAP = 1.5;
const ROWS = 7; // Mon..Sun, top to bottom

function bandColor(tMax: number): string {
  for (const band of BANDS) {
    if (tMax < band.max) return band.color;
  }
  return BANDS[BANDS.length - 1].color;
}

function weekdayIndex(dateIso: string): number {
  // Archive dates are location-local; a UTC parse keeps the weekday stable.
  const day = new Date(`${dateIso}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return (day + 6) % 7; // 0 = Monday
}

/**
 * GitHub-style year heatmap of archive daily highs: one column per week,
 * Monday-first, coloured by fixed temperature bands. Renders nothing below
 * ~180 usable days so a fresh city never shows a mostly-empty grid, and the
 * strip scrolls horizontally on narrow phones.
 */
export function YearHeatmapStrip({ theme, days }: { theme: AppTheme; days: PastDayActual[] }) {
  const usable = useMemo(
    () => days.filter((day) => Number.isFinite(day.tMax) && /^\d{4}-\d{2}-\d{2}$/.test(day.date)),
    [days],
  );

  const model = useMemo(() => {
    if (usable.length < 180) return null;
    // Trim the leading partial week so column 0 starts on a Monday.
    const lead = weekdayIndex(usable[0].date);
    const trimmed = usable.slice(lead === 0 ? 0 : 7 - lead);
    const weeks: (PastDayActual | null)[][] = [];
    for (let i = 0; i < trimmed.length; i += ROWS) {
      const week = trimmed.slice(i, i + ROWS);
      const col: (PastDayActual | null)[] = [];
      // Pad the first and last week so every column is exactly 7 cells tall.
      const padTop = weeks.length === 0 ? weekdayIndex(week[0].date) : 0;
      for (let p = 0; p < padTop; p++) col.push(null);
      col.push(...week);
      while (col.length < ROWS) col.push(null);
      weeks.push(col);
    }
    // Month ticks: first week-column in which each month appears.
    const months: { weekIndex: number; label: string }[] = [];
    let seen = '';
    weeks.forEach((week, weekIndex) => {
      const first = week.find((day) => day !== null);
      if (!first) return;
      const month = first.date.slice(5, 7);
      if (month !== seen) {
        seen = month;
        if (months.length === 0 || weekIndex - months[months.length - 1].weekIndex >= 3) {
          months.push({
            weekIndex,
            label: new Date(`${first.date}T12:00:00Z`).toLocaleDateString(getLanguage(), { month: 'short' }),
          });
        }
      }
    });
    let hottest: PastDayActual | null = null;
    let coldest: PastDayActual | null = null;
    let rain = 0;
    for (const day of usable) {
      if (!hottest || day.tMax > hottest.tMax) hottest = day;
      if (!coldest || day.tMin < coldest.tMin) coldest = day;
      rain += day.precipSum;
    }
    return { weeks, months, hottest, coldest, rain: Math.round(rain) };
  }, [usable]);

  if (!model) return null;

  const dayStamp = (dateIso: string): string =>
    new Date(`${dateIso}T12:00:00Z`).toLocaleDateString(getLanguage(), {
      day: 'numeric',
      month: 'short',
    });

  const captions = [
    model.hottest
      ? t('f_heatmap_hot')
          .replace('{n}', formatTemp(model.hottest.tMax))
          .replace('{day}', dayStamp(model.hottest.date))
      : null,
    model.coldest
      ? t('f_heatmap_cold')
          .replace('{n}', formatTemp(model.coldest.tMin))
          .replace('{day}', dayStamp(model.coldest.date))
      : null,
    t('f_heatmap_rain').replace('{n}', String(model.rain)),
  ].filter(Boolean) as string[];

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={t('a11y_heatmap').replace('{n}', String(usable.length))}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.monthRow}>
            {model.months.map((month) => (
              <Text
                key={`${month.weekIndex}-${month.label}`}
                style={[styles.monthLabel, { color: theme.textTertiary, left: month.weekIndex * (CELL + GAP) }]}
              >
                {month.label}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {Array.from({ length: ROWS }, (_, row) => (
              <View key={row} style={styles.row}>
                {model.weeks.map((week, weekIndex) => {
                  const day = week[row];
                  return (
                    <View
                      key={weekIndex}
                      style={[
                        styles.cell,
                        {
                          backgroundColor: day ? bandColor(day.tMax) : 'transparent',
                          marginRight: GAP,
                          marginBottom: GAP,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <Text style={[styles.caption, { color: theme.textTertiary }]} numberOfLines={2}>
        {captions.join(' · ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: {
    height: 14,
    marginBottom: 2,
  },
  monthLabel: {
    position: 'absolute',
    fontSize: 9,
    fontFamily: F.medium,
  },
  grid: {
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 1.5,
  },
  caption: {
    fontSize: 11.5,
    fontFamily: F.medium,
    marginTop: 10,
  },
});
