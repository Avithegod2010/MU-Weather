import { t } from '../utils/i18n';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Umbrella } from '../utils/uiIcons';
import { Card } from './Card';
import type { AppTheme } from '../theme/palettes';
import type { Nowcast } from '../utils/nowcast';
import type { MinutelyPoint } from '../api/types';
import { formatHourLabel, precipUnitLabel } from '../utils/format';
import { F } from '../theme/typography';

interface NowcastCardProps {
  theme: AppTheme;
  minutely: MinutelyPoint[];
  nowcast: Nowcast;
}

const MAX_MM = 1.5;

export function NowcastCard({ theme, minutely, nowcast }: NowcastCardProps) {
  if (!minutely.length) return null;

  return (
    <Card theme={theme} title={t('card_nowcast')} icon={Umbrella}>
      <Text style={[styles.headline, { color: theme.textPrimary }]}>{nowcast.headline}</Text>
      <View
        style={styles.barsRow}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {minutely.map((point, index) => {
          const ratio = Math.min(point.precipitation / MAX_MM, 1);
          const height = point.precipitation >= 0.02 ? Math.max(ratio * 52, 10) : 5;
          const intensity = point.precipitation >= 0.6 ? '#3D6FD8' : point.precipitation >= 0.15 ? '#5B8FD9' : '#9DC4EE';
          return (
            <View key={point.time} style={styles.barColumn}>
              <View style={[styles.bar, { height, backgroundColor: intensity }]} />
              {index % 4 === 0 ? (
                <Text
                  style={[styles.timeLabel, { color: theme.textTertiary }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatHourLabel(point.time, index === 0 && nowcast.wet)}
                </Text>
              ) : (
                <Text style={[styles.timeLabel, { color: 'transparent' }]}>·</Text>
              )}
            </View>
          );
        })}
      </View>
      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        {t('card_nowcast_caption').replace('{unit}', precipUnitLabel())}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  headline: {
    fontSize: 16.5,
    fontFamily: F.semibold,
    marginBottom: 14,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 72,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  bar: {
    width: 10,
    borderRadius: 5,
  },
  timeLabel: {
    fontSize: 10.5,
    fontFamily: F.medium,
    maxWidth: '100%',
    height: 14,
  },
  caption: {
    fontSize: 11.5,
    marginTop: 10,    fontFamily: F.regular,

  },
});
