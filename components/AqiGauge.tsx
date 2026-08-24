import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usAqiBand, usAqiFraction } from '../utils/aqi';
import type { AppTheme } from '../theme/palettes';

interface AqiGaugeProps {
  theme: AppTheme;
  usAqi: number | null;
  pm2_5: number | null;
}

const SEGMENT_COLORS = ['#5BC98C', '#E8D05A', '#F0964E', '#E85F5F', '#B06FD8', '#9E4A68'];

export function AqiGauge({ theme, usAqi, pm2_5 }: AqiGaugeProps) {
  const band = usAqiBand(usAqi);
  const fraction = usAqiFraction(usAqi);

  return (
    <View style={styles.container}>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: theme.textPrimary }]}>
          {usAqi === null || usAqi === undefined ? '--' : Math.round(usAqi)}
        </Text>
        {band ? (
          <View style={styles.bandChip}>
            <View style={[styles.dot, { backgroundColor: band.color }]} />
            <Text style={[styles.bandText, { color: theme.textSecondary }]}>{band.label}</Text>
          </View>
        ) : (
          <Text style={[styles.bandText, { color: theme.textTertiary }]}>Unavailable</Text>
        )}
      </View>

      <View style={styles.segmentTrack}>
        {SEGMENT_COLORS.map((color) => (
          <View key={color} style={[styles.segment, { backgroundColor: color }]} />
        ))}
        {band ? (
          <View
            style={[
              styles.marker,
              {
                backgroundColor: band.color,
                borderColor: theme.isLight ? '#FFFFFF' : '#1A2030',
                left: `${Math.min(fraction * 100, 97)}%`,
              },
            ]}
          />
        ) : null}
      </View>

      <Text style={[styles.subtext, { color: theme.textTertiary }]}>
        {pm2_5 !== null && pm2_5 !== undefined
          ? `Fine particles (PM2.5) at ${pm2_5.toFixed(1)} µg/m³`
          : 'Live air quality data'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  value: {
    fontSize: 40,
    fontWeight: '600',
    includeFontPadding: false,
  },
  bandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  bandText: {
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'visible',
    position: 'relative',
    gap: 2,
  },
  segment: {
    flex: 1,
    borderRadius: 3,
    height: 6,
  },
  marker: {
    position: 'absolute',
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
  },
  subtext: {
    fontSize: 12,
  },
});
