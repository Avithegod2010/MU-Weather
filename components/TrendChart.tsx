import { t } from '../utils/i18n';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SkiaSeriesChart } from './SkiaSeriesChart';
import { TrendingUp } from '../utils/uiIcons';
import { Card } from './Card';
import { smoothPath, scaleY, type CurvePoint } from '../utils/curve';
import { formatHourLabel, formatTemp, convertWind, windUnitLabel } from '../utils/format';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { EnsembleSpreadPoint, HourPoint } from '../api/types';

interface TrendChartProps {
  theme: AppTheme;
  hours: HourPoint[];
  /** Optional ensemble spread; aligned to hours by time string. Renders a confidence band. */
  ensemble?: EnsembleSpreadPoint[] | null;
}

const COL_WIDTH = 16;
const CHART_HEIGHT = 150;
const PADDING_TOP = 14;
const PADDING_BOTTOM = 26;

const TEMP_COLOR = '#F5A962';
const DEW_COLOR = '#6FA8DC';
const WIND_COLOR = '#8FD0B8';

export function TrendChart({ theme, hours, ensemble }: TrendChartProps) {
  const slice = hours.slice(0, 48);
  if (slice.length < 2) return null;

  const width = slice.length * COL_WIDTH;
  const top = PADDING_TOP;
  const bottom = CHART_HEIGHT - PADDING_BOTTOM;

  const temps = slice.map((hour) => hour.temperature);
  const dews = slice.map((hour) => hour.dewPoint ?? hour.temperature - 2);
  const winds = slice.map((hour) => hour.windSpeed);

  // Align the ensemble band to the displayed slice by time string.
  const bandByTime = ensemble ? new Map(ensemble.map((point) => [point.time, point])) : null;
  const band: ({ p10: number; p90: number } | null)[] | null = bandByTime
    ? slice.map((hour) => {
        const point = bandByTime.get(hour.time);
        return point ? { p10: point.tP10, p90: point.tP90 } : null;
      })
    : null;
  const windBand: ({ p10: number; p90: number } | null)[] | null = bandByTime
    ? slice.map((hour) => {
        const point = bandByTime.get(hour.time);
        return point && typeof point.windP10 === 'number' && typeof point.windP90 === 'number'
          ? { p10: point.windP10, p90: point.windP90 }
          : null;
      })
    : null;

  const tempMin = Math.min(...temps, ...dews, ...(band?.flatMap((b) => (b ? [b.p10] : [])) ?? []));
  const tempMax = Math.max(...temps, ...dews, ...(band?.flatMap((b) => (b ? [b.p90] : [])) ?? []));
  const windMax = Math.max(...winds, ...(windBand?.flatMap((entry) => (entry ? [entry.p90] : [])) ?? []), 5) * 1.15;

  const toPoints = (values: number[], min: number, max: number): CurvePoint[] =>
    values.map((value, index) => ({
      x: index * COL_WIDTH + COL_WIDTH / 2,
      y: scaleY(value, min, max, top, bottom),
    }));

  // Ensemble confidence band: smoothed P90 upper edge forward, P10 lower edge
  // reversed, closed into one filled polygon. Drawn behind the line paths.
  let bandPath = '';
  if (band) {
    const upperPoints: CurvePoint[] = [];
    const lowerPoints: CurvePoint[] = [];
    band.forEach((entry, index) => {
      if (!entry) return;
      const x = index * COL_WIDTH + COL_WIDTH / 2;
      upperPoints.push({ x, y: scaleY(entry.p90, tempMin, tempMax, top, bottom) });
      lowerPoints.push({ x, y: scaleY(entry.p10, tempMin, tempMax, top, bottom) });
    });
    if (upperPoints.length >= 2) {
      const upperD = smoothPath(upperPoints);
      const lowerReversed = [...lowerPoints].reverse();
      const lowerD = smoothPath(lowerReversed).replace(/^M/, 'L');
      bandPath = `${upperD} ${lowerD} Z`;
    }
  }

  let windBandPath = '';
  if (windBand) {
    const upperPoints: CurvePoint[] = [];
    const lowerPoints: CurvePoint[] = [];
    windBand.forEach((entry, index) => {
      if (!entry) return;
      const x = index * COL_WIDTH + COL_WIDTH / 2;
      upperPoints.push({ x, y: scaleY(entry.p90, 0, windMax, top, bottom) });
      lowerPoints.push({ x, y: scaleY(entry.p10, 0, windMax, top, bottom) });
    });
    if (upperPoints.length >= 2) {
      const upperD = smoothPath(upperPoints);
      const lowerD = smoothPath([...lowerPoints].reverse()).replace(/^M/, 'L');
      windBandPath = `${upperD} ${lowerD} Z`;
    }
  }

  const dotFill = theme.isLight ? '#FFFFFF' : '#F6F9FD';

  return (
    <Card theme={theme} title={t('card_trend')} icon={TrendingUp}>
      <View style={styles.legendRow}>
        {[
          { color: TEMP_COLOR, label: 'Temperature' },
          { color: DEW_COLOR, label: 'Dew point' },
          { color: WIND_COLOR, label: `Wind (${windUnitLabel()})` },
        ].map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={[styles.legendText, { color: theme.textTertiary }]}>{item.label}</Text>
          </View>
        ))}
        {bandPath ? (
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: TEMP_COLOR, opacity: theme.isLight ? 0.3 : 0.4, borderRadius: 2 },
              ]}
            />
            <Text style={[styles.legendText, { color: theme.textTertiary }]}>
              {t('trend_band_label')}
            </Text>
          </View>
        ) : null}
        {windBandPath ? (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: WIND_COLOR, opacity: theme.isLight ? 0.3 : 0.4, borderRadius: 2 }]} />
            <Text style={[styles.legendText, { color: theme.textTertiary }]}>{t('trend_wind_band_label')}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} directionalLockEnabled>
        <View style={{ width }}>
          <SkiaSeriesChart
            theme={theme}
            width={width}
            height={CHART_HEIGHT}
            series={[
              {
                color: TEMP_COLOR,
                points: toPoints(temps, tempMin, tempMax),
                markers: temps.map((_, index) => index).filter((index) => index % 6 === 0),
              },
              { color: DEW_COLOR, points: toPoints(dews, tempMin, tempMax), markers: [] },
              { color: WIND_COLOR, points: toPoints(winds, 0, windMax), dash: [5, 5], markers: [] },
            ]}
            bandPath={bandPath || undefined}
            bandColor={theme.isLight ? 'rgba(245,169,98,0.16)' : 'rgba(245,169,98,0.22)'}
            bands={windBandPath ? [{
              path: windBandPath,
              color: theme.isLight ? 'rgba(143,208,184,0.18)' : 'rgba(143,208,184,0.24)',
            }] : []}
            columns={[]}
            dotFill={dotFill}
            dataKey={`trend|${slice[0].time}|${temps.join(',')}|${dews.join(',')}|${winds.join(',')}|${bandPath}|${windBandPath}`}
            scrub={false}
          />
          <View style={[styles.timeRow, { width }]}>
            {slice.map((hour, index) =>
              index % 8 === 0 ? (
                <Text key={hour.time} style={[styles.timeLabel, { color: theme.textTertiary, left: index * COL_WIDTH }]}>
                  {formatHourLabel(hour.time, index === 0)}
                </Text>
              ) : null,
            )}
          </View>
        </View>
      </ScrollView>

      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        Next 48 hours · {formatTemp(tempMin)} to {formatTemp(tempMax)} · wind to {Math.round(convertWind(windMax / 1.15))} {windUnitLabel()}
        {bandPath || windBandPath ? ` · ${t('trend_band_caption')}` : ''}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11.5,
    fontFamily: F.medium,
  },
  timeRow: {
    height: 18,
    position: 'relative',
  },
  timeLabel: {
    position: 'absolute',
    fontSize: 10.5,
    fontFamily: F.medium,
  },
  caption: {
    fontSize: 11.5,
    marginTop: 8,    fontFamily: F.regular,

  },
});
