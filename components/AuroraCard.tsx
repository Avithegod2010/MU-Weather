import { t } from '../utils/i18n';
import React, { useState } from 'react';
import { F } from '../theme/typography';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { SvgPath, SvgDot } from './SkiaShapes';
import { Star } from '../utils/uiIcons';
import { Card } from './Card';
import { formatHourLabel } from '../utils/format';
import { smoothPath, scaleY, type CurvePoint } from '../utils/curve';
import {
  AURORA_LATITUDE_MIN,
  auroraVisibilityChance,
  gScaleForKp,
  type AuroraExtras,
  type AuroraForecast,
  type KpHistory,
} from '../utils/aurora';
import type { AppTheme } from '../theme/palettes';

interface AuroraCardProps {
  theme: AppTheme;
  forecast: AuroraForecast | null;
  latitude: number | null;
  /** Best-effort solar wind + Kp history; absent until loaded or on failure. */
  extras?: AuroraExtras | null;
}

/** Kp → chip tint, green calm through red storm. */
function kpColor(kp: number): string {
  if (kp >= 7) return '#E85F5F';
  if (kp >= 5) return '#F0964E';
  if (kp >= 3.5) return '#EFC25C';
  return '#5BC98C';
}

/** Bz tint: southward (negative) helps aurora; strongly southward stands out. */
function bzColor(bz: number): string {
  if (bz < -5) return '#E85F5F';
  if (bz < 0) return '#F0964E';
  return '#5BC98C';
}

const SPARK_HEIGHT = 56;
const SPARK_PADDING = 6;

/**
 * "Kp last 24 h" sparkline: same idiom as the 30-day tMax/tMin sparkline in
 * PastWeekCard (onLayout-measured width, smoothPath polyline, max dot).
 * Fixed 0–9 domain — unlike temperature, Kp has an absolute scale.
 */
function KpSparkline({ theme, history }: { theme: AppTheme; history: KpHistory }) {
  const [width, setWidth] = useState(0);

  if (history.points.length < 2) return null;

  const onLayout = (event: { nativeEvent: { layout: { width: number } } }) => {
    const next = event.nativeEvent.layout.width;
    if (Math.abs(next - width) > 1) setWidth(next);
  };

  const values = history.points.map((point) => point.kp);
  const points: CurvePoint[] = values.map((value, index) => ({
    x: width > 0 ? (index / (values.length - 1)) * (width - 2 * SPARK_PADDING) + SPARK_PADDING : 0,
    y: scaleY(value, 0, 9, SPARK_PADDING, SPARK_HEIGHT - SPARK_PADDING),
  }));
  const peak = points[values.indexOf(Math.max(...values))];
  const dotFill = theme.isLight ? '#FFFFFF' : '#F6F9FD';

  if (width <= 0) {
    return <View style={styles.sparkSlot} onLayout={onLayout} />;
  }

  return (
    <View style={styles.sparkSlot} onLayout={onLayout}>
      <Canvas style={{ width: width, height: SPARK_HEIGHT }}>
        <SvgPath d={smoothPath(points)} color="#EFC25C" strokeWidth={2.2} />
        {peak ? <SvgDot cx={peak.x} cy={peak.y} r={3} fill={dotFill} stroke="#EFC25C" strokeWidth={2} /> : null}
      </Canvas>
    </View>
  );
}

export function AuroraCard({ theme, forecast, latitude, extras }: AuroraCardProps) {
  if (
    !forecast ||
    forecast.points.length === 0 ||
    latitude === null ||
    Math.abs(latitude) < AURORA_LATITUDE_MIN
  ) {
    return null;
  }
  const now = Date.now();
  // The headline is the Kp of the window we are standing in ("Kp now"); the
  // chance chip uses the 3-day max, because that is what decides visibility.
  // points are sorted ascending, so the last row whose window has started wins.
  let nowKp: number | null = null;
  for (const point of forecast.points) {
    if (Date.parse(`${point.time}Z`) <= now) nowKp = point.kp;
    else break;
  }
  if (nowKp === null) nowKp = forecast.points[0].kp;
  const upcoming = forecast.points.filter((point) => Date.parse(`${point.time}Z`) >= now - 3 * 3600 * 1000);
  const shown = (upcoming.length ? upcoming : forecast.points).slice(0, 8);
  const kpMax = forecast.kpMax ?? 0;
  const chance = auroraVisibilityChance(kpMax, latitude);
  const chanceLabel =
    chance === 'high' ? t('aurora_chance_high') : chance === 'maybe' ? t('aurora_chance_maybe') : t('aurora_chance_low');

  return (
    <Card theme={theme} title={t('card_aurora')} icon={Star}>
      <View style={styles.heroRow}>
        <View>
          <Text style={[styles.kpValue, { color: kpColor(nowKp) }]}>{nowKp.toFixed(1)}</Text>
          <Text style={[styles.kpLabel, { color: theme.textSecondary }]}>{t('aurora_now')}</Text>
        </View>
        <View style={styles.chanceWrap}>
          <View style={[styles.chip, { backgroundColor: theme.chipBg }]}>
            <View style={[styles.dot, { backgroundColor: kpColor(kpMax) }]} />
            <Text style={[styles.chipText, { color: theme.textPrimary }]}>{chanceLabel}</Text>
          </View>
          <Text style={[styles.source, { color: theme.textTertiary }]}>{t('aurora_source')}</Text>
        </View>
      </View>
      {extras?.wind ? (
        <View style={styles.swRow}>
          <Text style={[styles.swText, { color: theme.textSecondary }]}>
            {t('aurora_wind').replace('{n}', String(Math.round(extras.wind.speed)))}
          </Text>
          {extras.wind.bz !== null ? (
            <Text style={[styles.swText, { color: bzColor(extras.wind.bz) }]}>
              {t('aurora_bz').replace('{n}', String(Math.round(extras.wind.bz)))}
              {extras.wind.bz < -5 ? ` · ${t('aurora_bz_south')}` : ''}
            </Text>
          ) : null}
        </View>
      ) : null}
      {extras?.history && extras.history.points.length >= 2 ? (
        <View style={styles.sparkBlock}>
          <Text style={[styles.forecastTitle, { color: theme.textSecondary, marginTop: 0 }]}>
            {t('aurora_kp24')}
          </Text>
          <KpSparkline theme={theme} history={extras.history} />
          <Text style={[styles.source, { color: theme.textTertiary }]}>
            {t('aurora_updated').replace('{time}', formatHourLabel(extras.history.updatedAt ?? '', false))}
          </Text>
        </View>
      ) : null}
      <Text style={[styles.forecastTitle, { color: theme.textSecondary }]}>{t('aurora_forecast')}</Text>
      <View style={styles.rows}>
        {shown.map((point) => {
          const scale = point.noaaScale ?? gScaleForKp(point.kp);
          return (
            <View key={point.time} style={styles.row}>
              <Text style={[styles.time, { color: theme.textSecondary }]}>{formatHourLabel(point.time, false)}</Text>
              <Text style={[styles.kp, { color: theme.textPrimary }]}>{point.kp.toFixed(1)}</Text>
              <View style={[styles.gChip, { backgroundColor: theme.chipBg }]}>
                <Text style={[styles.gText, { color: kpColor(point.kp) }]}>{scale ?? '—'}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  kpValue: {
    fontSize: 34,
    fontFamily: F.bold,
    includeFontPadding: false,
  },
  kpLabel: {
    fontSize: 11,
    fontFamily: F.medium,
  },
  chanceWrap: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 12,
    fontFamily: F.medium,
    flexShrink: 1,
  },
  source: {
    fontSize: 10.5,
  },
  forecastTitle: {
    fontSize: 11,
    fontFamily: F.medium,
    marginTop: 14,
    marginBottom: 6,
  },
  swRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 10,
  },
  swText: {
    fontSize: 12,
    fontFamily: F.medium,
  },
  sparkBlock: {
    marginTop: 12,
    gap: 4,
  },
  sparkSlot: {
    height: SPARK_HEIGHT,
  },
  rows: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  time: {
    fontSize: 12,
    fontFamily: F.medium,
    width: 64,
  },
  kp: {
    fontSize: 13,
    fontFamily: F.semibold,
    width: 32,
  },
  gChip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gText: {
    fontSize: 11.5,
    fontFamily: F.bold,
  },
});