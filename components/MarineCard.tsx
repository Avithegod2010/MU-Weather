import { t } from '../utils/i18n';
import React from 'react';
import { F } from '../theme/typography';
import { StyleSheet, Text, View } from 'react-native';
import { Sailboat } from '../utils/uiIcons';
import { Card } from './Card';
import { compassLabel, formatTemp } from '../utils/format';
import { isChoppyPeriod, seaBandColor, seaBandForHeight, seaBandLabel } from '../utils/seaState';
import type { AppTheme } from '../theme/palettes';
import type { MarineState } from '../hooks/useMarine';

interface MarineCardProps {
  theme: AppTheme;
  state: MarineState;
}

export function MarineCard({ theme, state }: MarineCardProps) {
  const info = state.status === 'ok' ? state.info : null;
  // Inland / fetch failure / still loading: hidden exactly as before.
  if (!info || info.waveHeight === null) {
    return null;
  }

  const band = seaBandForHeight(info.waveHeight);
  const bandColor = seaBandColor(band);
  const swellText =
    info.swellHeight !== null
      ? formatWaveHeight(info.swellHeight) + ' · ' + formatPeriod(info.swellPeriod) +
        (info.swellDirection !== null ? ' ' + compassLabel(info.swellDirection) : '')
      : '--';

  return (
    <Card revealDelay={720} theme={theme} title={t('card_marine')} icon={Sailboat} style={styles.card}>
      <View style={styles.heroRow}>
        <View>
          <Text style={[styles.waveValue, { color: theme.textPrimary }]}>
            {formatWaveHeight(info.waveHeight)}
          </Text>
          <Text style={[styles.waveLabel, { color: theme.textSecondary }]}>{t('marine_waves')}</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: bandColor + '26', borderColor: bandColor }]}>
          <View style={[styles.dot, { backgroundColor: bandColor }]} />
          <Text style={[styles.chipText, { color: theme.textPrimary }]}>{seaBandLabel(band)}</Text>
        </View>
      </View>
      <View style={styles.rows}>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.textTertiary }]}>{t('marine_period')}</Text>
          <Text style={[styles.rowValue, { color: theme.textPrimary }]}>
            {formatPeriod(info.wavePeriod)}
            {isChoppyPeriod(info.wavePeriod) ? ' · ' + t('marine_choppy') : ''}
            {info.waveDirection !== null
              ? ' · ' + compassLabel(info.waveDirection) + ' ' + t('marine_from')
              : ''}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.textTertiary }]}>{t('marine_swell')}</Text>
          <Text style={[styles.rowValue, { color: theme.textPrimary }]}>{swellText}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.textTertiary }]}>{t('marine_sea_temp')}</Text>
          <Text style={[styles.rowValue, { color: theme.textPrimary }]}>
            {info.seaSurfaceTemperature !== null ? formatTemp(info.seaSurfaceTemperature) : '--'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.textTertiary }]}>{t('marine_max24')}</Text>
          <Text style={[styles.rowValue, { color: theme.textPrimary }]}>
            {info.max24h !== null ? formatWaveHeight(info.max24h) : '--'}
          </Text>
        </View>
      </View>
      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        {t('marine_source')}
        {info.max24h !== null && info.max24h > info.waveHeight
          ? ' · ' + t('marine_rising').replace('{n}', formatWaveHeight(info.max24h))
          : ''}
      </Text>
    </Card>
  );
}

/**
 * Wave heights stay in metres for every unit setting: Open-Meteo reports
 * metres, sailing convention is metres worldwide, and the app's only length
 * precedent (visibility) is likewise fixed-unit (km, no conversion).
 * Temperature follows the C/F setting via formatTemp.
 */
function formatWaveHeight(heightM: number | null): string {
  if (heightM === null || Number.isNaN(heightM)) return '--';
  return heightM.toFixed(1) + ' m';
}

function formatPeriod(periodS: number | null): string {
  if (periodS === null || Number.isNaN(periodS)) return '--';
  return Math.round(periodS) + ' s';
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '100%',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  waveValue: {
    fontSize: 34,
    fontFamily: F.bold,
    includeFontPadding: false,
  },
  waveLabel: {
    fontSize: 11,
    fontFamily: F.medium,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
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
  rows: {
    gap: 6,
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: {
    fontSize: 12,
    fontFamily: F.regular,
    flexShrink: 0,
  },
  rowValue: {
    fontSize: 13,
    fontFamily: F.semibold,
    textAlign: 'right',
    flexShrink: 1,
  },
  caption: {
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 10,
  },
});
