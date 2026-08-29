import { t } from '../utils/i18n';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Sparkles,
  Umbrella,
  CloudLightning,
  ArrowUp,
  ArrowDown,
  Thermometer,
  Wind,
  Sun,
  Snowflake,
  Gauge,
} from '../utils/uiIcons';
import type { LucideIcon } from 'lucide-react-native';
import { Card } from './Card';
import type { AppTheme } from '../theme/palettes';
import type { Highlight, HighlightIcon } from '../utils/highlights';
import { F } from '../theme/typography';

interface HighlightsCardProps {
  theme: AppTheme;
  highlights: Highlight[];
}

const ICONS: Record<HighlightIcon, LucideIcon> = {
  rain: Umbrella,
  thunder: CloudLightning,
  tempUp: ArrowUp,
  tempDown: ArrowDown,
  swing: Thermometer,
  wind: Wind,
  uv: Sun,
  frost: Snowflake,
  aqi: Gauge,
};

export function HighlightsCard({ theme, highlights }: HighlightsCardProps) {
  if (!highlights.length) return null;

  return (
    <Card theme={theme} title={t('card_highlights')} icon={Sparkles}>
      <View style={styles.stack}>
        {highlights.map((highlight, index) => {
          const Icon = ICONS[highlight.icon];
          return (
            <View key={index} style={styles.row}>
              <View style={[styles.iconChip, { backgroundColor: theme.chipBg }]}>
                <Icon size={14} color={theme.accent} strokeWidth={2.2} />
              </View>
              <Text style={[styles.text, { color: theme.textPrimary }]}>{highlight.text}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  iconChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: F.medium,
  },
});
