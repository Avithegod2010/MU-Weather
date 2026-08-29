import { t } from '../utils/i18n';
import React from 'react';
import { F } from '../theme/typography';
import { StyleSheet, Text, View } from 'react-native';
import { Footprints, Bike, Shirt, Moon, Camera } from '../utils/uiIcons';
import type { LucideIcon } from 'lucide-react-native';
import { Card } from './Card';
import { haptics } from '../utils/haptics';
import { Pressable } from 'react-native';
import type { AppTheme } from '../theme/palettes';
import { computeActivities } from '../utils/activity';
import type { ActivityKey } from '../utils/activity';
import type { WeatherBundle } from '../api/types';

interface ActivityCardProps {
  theme: AppTheme;
  data: WeatherBundle;
}

const ICONS: Record<ActivityKey, LucideIcon> = {
  running: Footprints,
  cycling: Bike,
  laundry: Shirt,
  stargazing: Moon,
  photography: Camera,
};

export function ActivityCard({ theme, data }: ActivityCardProps) {
  const activities = computeActivities(data);

  return (
    <Card theme={theme} title={t('card_activity')}>
      <View style={styles.stack}>
        {activities.map((activity) => {
          const Icon = ICONS[activity.key];
          const scoreColor =
            activity.score >= 70 ? '#5BC98C' : activity.score >= 45 ? '#E8D05A' : '#E85F5F';
          return (
            <Pressable
              key={activity.key}
              onPress={() => haptics.select()}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.iconChip, { backgroundColor: theme.chipBg }]}>
                <Icon size={16} color={theme.textPrimary} strokeWidth={2} />
              </View>
              <View style={styles.rowTexts}>
                <View style={styles.titleRow}>
                  <Text style={[styles.label, { color: theme.textPrimary }]}>{activity.label}</Text>
                  <Text style={[styles.verdict, { color: scoreColor }]}>{activity.verdict}</Text>
                </View>
                <View style={[styles.track, { backgroundColor: theme.trackColor }]}>
                  <View style={[styles.fill, { width: `${activity.score}%`, backgroundColor: scoreColor }]} />
                </View>
                <Text style={[styles.reason, { color: theme.textTertiary }]} numberOfLines={1}>
                  {activity.reason}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTexts: {
    flex: 1,
    gap: 5,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14.5,
    fontFamily: F.semibold,
  },
  verdict: {
    fontSize: 12.5,
    fontFamily: F.bold,
  },
  track: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 5,
    borderRadius: 3,
  },
  reason: {
    fontSize: 11.5,
  },
});
