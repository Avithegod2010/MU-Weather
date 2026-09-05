import { t } from '../utils/i18n';
import React from 'react';
import { F } from '../theme/typography';
import { StyleSheet, Text, View } from 'react-native';
import { Gauge } from '../utils/uiIcons';
import { Card } from './Card';
import { useBarometer } from '../hooks/useBarometer';
import { formatPressureTrendDelta, formatPressure, formatPressureValue, pressureUnitLabel } from '../utils/format';
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
      ? t('baro_measuring')
      : trendPer10Min > 0.2
        ? t('baro_rising_fast').replace(
            '{n}',
            `${formatPressureTrendDelta(trendPer10Min)} ${pressureUnitLabel()}`,
          )
        : trendPer10Min > 0.05
          ? t('trend_rising')
          : trendPer10Min < -0.2
            ? t('baro_falling_fast').replace(
                '{n}',
                `${formatPressureTrendDelta(trendPer10Min)} ${pressureUnitLabel()}`,
              )
            : trendPer10Min < -0.05
              ? t('trend_falling')
              : t('trend_steady');

  const delta = pressure !== null ? pressure - forecastPressure : null;

  return (
    <Card revealDelay={revealDelay} theme={theme} title={t('card_barometer')} icon={Gauge} style={styles.card}>
      <View style={styles.stack}>
        {available && pressure !== null ? (
          <>
            <Text style={[styles.bigValue, { color: theme.textPrimary }]}>
              {formatPressureValue(pressure)}
              <Text style={[styles.unitText, { color: theme.textSecondary }]}> {pressureUnitLabel()}</Text>
            </Text>
            <Text style={[styles.bandLabel, { color: theme.textSecondary }]}>{trendLabel}</Text>
            <Text style={[styles.caption, { color: theme.textTertiary }]}>
              {t('baro_measured_by')}
            </Text>
            <Text style={[styles.caption, { color: theme.textTertiary }]}>
              {t('baro_forecast_sea').replace('{n}', formatPressure(forecastPressure))}
              {delta !== null
                ? ` · ${t('baro_at_altitude').replace('{n}', `${delta >= 0 ? '+' : ''}${formatPressureTrendDelta(delta)}`)}`
                : ''}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.bigValue, { color: theme.textTertiary }]}>--</Text>
            <Text style={[styles.caption, { color: theme.textTertiary }]}>
              {t('baro_no_sensor')}
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
