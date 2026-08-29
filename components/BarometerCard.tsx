import { t } from '../utils/i18n';
import React from 'react';
import { F } from '../theme/typography';
import { StyleSheet, Text, View } from 'react-native';
import { Gauge } from '../utils/uiIcons';
import { Card } from './Card';
import { useBarometer } from '../hooks/useBarometer';
import type { AppTheme } from '../theme/palettes';

interface BarometerCardProps {
  theme: AppTheme;
  forecastPressure: number;
  revealDelay?: number;
}

export function BarometerCard({ theme, forecastPressure, revealDelay = 660 }: BarometerCardProps) {
  const { available, pressure, trendPer10Min } = useBarometer(true);

  const trendLabel =
    trendPer10Min === null
      ? 'Measuring...'
      : trendPer10Min > 0.2
        ? `Rising fast (${trendPer10Min.toFixed(1)} hPa/10min)`
        : trendPer10Min > 0.05
          ? 'Rising'
          : trendPer10Min < -0.2
            ? `Falling fast (${trendPer10Min.toFixed(1)} hPa/10min)`
            : trendPer10Min < -0.05
              ? 'Falling'
              : 'Steady';

  const delta = pressure !== null ? pressure - forecastPressure : null;

  return (
    <Card revealDelay={revealDelay} theme={theme} title={t('card_barometer')} icon={Gauge} style={styles.card}>
      <View style={styles.stack}>
        {available && pressure !== null ? (
          <>
            <Text style={[styles.bigValue, { color: theme.textPrimary }]}>
              {pressure.toFixed(1)}
              <Text style={[styles.unitText, { color: theme.textSecondary }]}> hPa</Text>
            </Text>
            <Text style={[styles.bandLabel, { color: theme.textSecondary }]}>{trendLabel}</Text>
            <Text style={[styles.caption, { color: theme.textTertiary }]}>
              Measured by your phone · live
            </Text>
            <Text style={[styles.caption, { color: theme.textTertiary }]}>
              Forecast (sea-level): {Math.round(forecastPressure)} hPa
              {delta !== null
                ? ` · ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} at your altitude`
                : ''}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.bigValue, { color: theme.textTertiary }]}>--</Text>
            <Text style={[styles.caption, { color: theme.textTertiary }]}>
              No barometer sensor on this device
            </Text>
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '47.2%',
  },
  stack: {
    gap: 9,
  },
  bigValue: {
    fontSize: 40,
    fontFamily: F.semibold,
    includeFontPadding: false,
  },
  unitText: {
    fontSize: 17,
    fontFamily: F.medium,
  },
  bandLabel: {
    fontSize: 13.5,
    fontFamily: F.semibold,
    marginTop: -4,
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
  },
});
