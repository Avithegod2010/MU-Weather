import { t } from '../utils/i18n';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { HeartPulse } from '../utils/uiIcons';
import { Card } from './Card';
import type { AppTheme } from '../theme/palettes';
import { F } from '../theme/typography';
import {
  fluRisk,
  migraineRisk,
  respiratoryRisk,
  type HealthLevel,
  type HealthRisk,
} from '../utils/health';
import type { CurrentConditions } from '../api/types';

interface HealthCardProps {
  theme: AppTheme;
  current: CurrentConditions;
  usAqi: number | null;
  style?: StyleProp<ViewStyle>;
  revealDelay?: number;
}

/** Matches the band colours used across the app (utils/aqi.ts). */
const LEVEL_COLORS: Record<HealthLevel, string> = {
  low: '#5BC98C',
  moderate: '#E8D05A',
  high: '#E85F5F',
};

/**
 * Half-width detail card with three heuristic well-being indices.
 * Not pressable on purpose - there is no deep-dive topic behind it.
 */
export function HealthCard({ theme, current, usAqi, style, revealDelay }: HealthCardProps) {
  const migraine = migraineRisk(current.pressureTrend ?? 0);
  const respiratory = respiratoryRisk(usAqi, current.humidity);
  const flu = fluRisk(current.temperature, current.humidity);

  const levelLabels: Record<HealthLevel, string> = {
    low: t('band_low'),
    moderate: t('band_moderate'),
    high: t('band_high'),
  };

  const rows: Array<{ label: string; risk: HealthRisk }> = [
    { label: t('health_migraine'), risk: migraine },
    { label: t('health_respiratory'), risk: respiratory },
    { label: t('health_flu'), risk: flu },
  ];

  return (
    <Card
      theme={theme}
      title={t('card_health')}
      icon={HeartPulse}
      style={style}
      revealDelay={revealDelay}
    >
      <View style={styles.stack}>
        {rows.map((row) => {
          const color = LEVEL_COLORS[row.risk.level];
          return (
            <View
              key={row.label}
              style={styles.row}
              accessible={true}
              accessibilityRole="text"
              accessibilityLabel={`${row.label}, ${levelLabels[row.risk.level]}, ${t(row.risk.adviceKey)}`}
            >
              <View style={styles.rowHead}>
                <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
                  {row.label}
                </Text>
                <View style={[styles.chip, { backgroundColor: theme.chipBg }]}>
                  <View style={[styles.chipDot, { backgroundColor: color }]} />
                  <Text style={[styles.chipText, { color }]} numberOfLines={1} adjustsFontSizeToFit>
                    {levelLabels[row.risk.level]}
                  </Text>
                </View>
              </View>
              <Text style={[styles.advice, { color: theme.textTertiary }]}>
                {t(row.risk.adviceKey)}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 11,
  },
  row: {
    gap: 3,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: 13.5,
    fontFamily: F.semibold,
    flexShrink: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 7,
    // half-width card: the pill must never push past the card edge
    flexShrink: 0,
    maxWidth: '62%',
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    fontSize: 11.5,
    fontFamily: F.semibold,
    flexShrink: 1,
  },
  advice: {
    fontSize: 12,
    lineHeight: 16,
  },
});
