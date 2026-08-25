import React from 'react';
import { F } from '../theme/typography';
import { StyleSheet, Text, View } from 'react-native';
import { usAqiBand, usAqiFraction } from '../utils/aqi';
import type { AppTheme } from '../theme/palettes';

interface AqiGaugeProps {
  theme: AppTheme;
  usAqi: number | null;
  pm2_5: number | null;
  pm10: number | null;
  ozone: number | null;
  no2: number | null;
  so2: number | null;
}

const SEGMENT_COLORS = ['#5BC98C', '#E8D05A', '#F0964E', '#E85F5F', '#B06FD8', '#9E4A68'];

export function AqiGauge({ theme, usAqi, pm2_5, pm10, ozone, no2, so2 }: AqiGaugeProps) {
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

      <View style={styles.pollutantRow}>
        {[
          { label: 'PM2.5', value: pm2_5 },
          { label: 'PM10', value: pm10 },
          { label: 'O₃', value: ozone },
          { label: 'NO₂', value: no2 },
          { label: 'SO₂', value: so2 },
        ].map((pollutant) => (
          <View key={pollutant.label} style={styles.pollutant}>
            <Text style={[styles.pollutantValue, { color: theme.textPrimary }]}>
              {pollutant.value === null || pollutant.value === undefined
                ? '--'
                : Math.round(pollutant.value)}
            </Text>
            <Text style={[styles.pollutantLabel, { color: theme.textTertiary }]}>
              {pollutant.label}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[styles.subtext, { color: theme.textTertiary }]}>
        Concentrations in µg/m³ · live readings
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
    fontFamily: F.semibold,
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
    fontFamily: F.semibold,
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
  pollutantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  pollutant: {
    alignItems: 'center',
    gap: 2,
  },
  pollutantValue: {
    fontSize: 14,
    fontFamily: F.semibold,
  },
  pollutantLabel: {
    fontSize: 10,
  },
});
