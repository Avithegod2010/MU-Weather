import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../utils/i18n';
import { F } from '../theme/typography';
import { Card } from './Card';
import { Clock } from '../utils/uiIcons';
import type { AppTheme } from '../theme/palettes';

interface BestWindowCardProps {
  theme: AppTheme;
  /** Localized "2 PM – 4 PM looks best today" line from bestWindowLine(). */
  line: string;
  /** 0-100 comfort score for the window. */
  score: number;
}

/** Comfort tint: green when the window is genuinely pleasant, amber/red as it degrades. */
function scoreColor(score: number): string {
  if (score >= 70) return '#5BC98C';
  if (score >= 45) return '#EFC25C';
  return '#F0964E';
}

/**
 * "Best time outdoors" — the best 2-hour daylight window scored from
 * precipitation, UV, wind and apparent temperature (see utils/bestWindow.ts).
 * The card only renders when a window exists, so it disappears in the evening
 * rather than advertise a slot that has already passed.
 */
export function BestWindowCard({ theme, line, score }: BestWindowCardProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <Card theme={theme} title={t('card_best_window')} icon={Clock}>
      <Text style={[styles.line, { color: theme.textPrimary }]}>{line}</Text>
      {/* Two flex weights instead of a percentage width, so no CSS-string typing. */}
      <View style={[styles.track, { backgroundColor: theme.chipBg }]}>
        <View style={[styles.fill, { flex: Math.max(clamped, 1), backgroundColor: scoreColor(clamped) }]} />
        <View style={{ flex: Math.max(100 - clamped, 0) }} />
      </View>
      <Text style={[styles.score, { color: theme.textTertiary }]}>
        {t('best_window_score').replace('{n}', String(clamped))}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  line: {
    fontSize: 16,
    fontFamily: F.semibold,
    marginBottom: 12,
  },
  track: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  score: {
    fontSize: 11,
    fontFamily: F.medium,
    marginTop: 7,
  },
});
