import React from 'react';
import { F } from '../theme/typography';
import { StyleSheet, Text, View } from 'react-native';
import { Sailboat } from '../utils/uiIcons';
import { Card } from './Card';
import { compassLabel, formatTemp } from '../utils/format';
import type { AppTheme } from '../theme/palettes';
import type { MarineState } from '../hooks/useMarine';

interface MarineCardProps {
  theme: AppTheme;
  state: MarineState;
}

export function MarineCard({ theme, state }: MarineCardProps) {
  const info = state.status === 'ok' ? state.info : null;
  if (!info || info.waveHeight === null) {
    return null;
  }

  return (
    <Card revealDelay={720} theme={theme} title="Marine" icon={Sailboat} style={styles.card}>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: theme.textPrimary }]}>
            {info.waveHeight.toFixed(1)}
          </Text>
          <Text style={[styles.statLabel, { color: theme.textTertiary }]}>m waves</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: theme.textPrimary }]}>
            {info.wavePeriod !== null ? Math.round(info.wavePeriod) : '--'}
          </Text>
          <Text style={[styles.statLabel, { color: theme.textTertiary }]}>s period</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: theme.textPrimary }]}>
            {info.waveDirection !== null ? compassLabel(info.waveDirection) : '--'}
          </Text>
          <Text style={[styles.statLabel, { color: theme.textTertiary }]}>swell from</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: theme.textPrimary }]}>
            {info.seaSurfaceTemperature !== null ? formatTemp(info.seaSurfaceTemperature) : '--'}
          </Text>
          <Text style={[styles.statLabel, { color: theme.textTertiary }]}>sea temp</Text>
        </View>
      </View>
      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        {info.waveHeight < 0.5
          ? 'Calm seas — good for a swim'
          : info.waveHeight < 1.5
            ? 'Moderate seas'
            : 'Rough seas — caution for small craft'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '100%',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stat: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  statValue: {
    fontSize: 21,
    fontFamily: F.semibold,
    includeFontPadding: false,
  },
  statLabel: {
    fontSize: 10.5,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  caption: {
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 10,
  },
});
