import { t } from '../utils/i18n';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { TrendingUp } from '../utils/uiIcons';
import { Card } from './Card';
import { smoothPath, scaleY, type CurvePoint } from '../utils/curve';
import { formatHourLabel, formatTemp, convertWind, windUnitLabel } from '../utils/format';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { HourPoint } from '../api/types';

interface TrendChartProps {
  theme: AppTheme;
  hours: HourPoint[];
}

const COL_WIDTH = 16;
const CHART_HEIGHT = 150;
const PADDING_TOP = 14;
const PADDING_BOTTOM = 26;

const TEMP_COLOR = '#F5A962';
const DEW_COLOR = '#6FA8DC';
const WIND_COLOR = '#8FD0B8';

export function TrendChart({ theme, hours }: TrendChartProps) {
  const slice = hours.slice(0, 48);
  if (slice.length < 2) return null;

  const width = slice.length * COL_WIDTH;
  const top = PADDING_TOP;
  const bottom = CHART_HEIGHT - PADDING_BOTTOM;

  const temps = slice.map((hour) => hour.temperature);
  const dews = slice.map((hour) => hour.dewPoint ?? hour.temperature - 2);
  const winds = slice.map((hour) => hour.windSpeed);
  const tempMin = Math.min(...temps, ...dews);
  const tempMax = Math.max(...temps, ...dews);
  const windMax = Math.max(...winds, 5) * 1.15;

  const toPoints = (values: number[], min: number, max: number): CurvePoint[] =>
    values.map((value, index) => ({
      x: index * COL_WIDTH + COL_WIDTH / 2,
      y: scaleY(value, min, max, top, bottom),
    }));

  const tempPath = smoothPath(toPoints(temps, tempMin, tempMax));
  const dewPath = smoothPath(toPoints(dews, tempMin, tempMax));
  const windPath = smoothPath(toPoints(winds, 0, windMax));

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
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} directionalLockEnabled>
        <View style={{ width }}>
          <Svg width={width} height={CHART_HEIGHT}>
            <Path d={windPath} stroke={WIND_COLOR} strokeWidth={2} fill="none" strokeLinecap="round" strokeDasharray="5 5" opacity={0.9} />
            <Path d={dewPath} stroke={DEW_COLOR} strokeWidth={2} fill="none" strokeLinecap="round" />
            <Path d={tempPath} stroke={TEMP_COLOR} strokeWidth={2.6} fill="none" strokeLinecap="round" />
            {toPoints(temps, tempMin, tempMax)
              .filter((_, index) => index % 6 === 0)
              .map((point) => (
                <Circle key={`dt-${point.x}`} cx={point.x} cy={point.y} r={3} fill={dotFill} stroke={TEMP_COLOR} strokeWidth={2} />
              ))}
          </Svg>
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
