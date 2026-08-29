import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Droplet, ChevronDown } from '../utils/uiIcons';
import { haptics } from '../utils/haptics';
import type { AppTheme } from '../theme/palettes';
import { getWeatherIcon } from '../utils/icons';
import { formatDayLabel, formatTemp, tempColor } from '../utils/format';
import { F } from '../theme/typography';
import type { DayPoint } from '../api/types';

interface DailyForecastProps {
  theme: AppTheme;
  days: DayPoint[];
  /** Optional tap handler - rows become pressable and open the day deep-dive. */
  onPressDay?: (day: DayPoint, index: number) => void;
}

const PREVIEW_COUNT = 7;
const PRECIP_COLOR = '#A5DBF9';

export function DailyForecast({ theme, days, onPressDay }: DailyForecastProps) {
  const [expanded, setExpanded] = useState(false);
  if (!days.length) return null;

  const hasMore = days.length > PREVIEW_COUNT;
  const visible = expanded ? days : days.slice(0, PREVIEW_COUNT);
  const weekMin = Math.min(...days.map((d) => d.tMin));
  const weekMax = Math.max(...days.map((d) => d.tMax));
  const range = Math.max(weekMax - weekMin, 1);

  return (
    <View style={styles.container}>
      {visible.map((day, index) => {
        const Icon = getWeatherIcon(day.weatherCode, true);
        const leftPct = ((day.tMin - weekMin) / range) * 100;
        const widthPct = Math.max(((day.tMax - day.tMin) / range) * 100, 8);
        const rowStyle = [
          styles.row,
          index > 0 && {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.trackColor,
          },
        ];
        const content = (
          <>
            <Text style={[styles.dayLabel, { color: theme.textPrimary }, index === 0 && { fontFamily: F.bold }]}>
              {formatDayLabel(day.date, index)}
            </Text>
            <Icon size={22} color={theme.textPrimary} strokeWidth={1.7} />
            {day.precipProbabilityMax >= 15 ? (
              <View style={styles.precipRow}>
                <Droplet size={10} color={PRECIP_COLOR} strokeWidth={2.6} />
                <Text style={[styles.precipText, { color: PRECIP_COLOR }]}>
                  {Math.round(day.precipProbabilityMax)}%
                </Text>
              </View>
            ) : (
              <View style={styles.precipPlaceholder} />
            )}
            <Text style={[styles.tempMin, { color: theme.textSecondary }]}>
              {formatTemp(day.tMin)}
            </Text>
            <View style={[styles.barTrack, { backgroundColor: theme.trackColor }]}>
              <LinearGradient
                colors={[tempColor(day.tMin), tempColor(day.tMax)] as [string, string]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[
                  styles.barFill,
                  { left: `${leftPct}%`, width: `${widthPct}%` },
                ]}
              />
            </View>
            <Text style={[styles.tempMax, { color: theme.textPrimary }]}>
              {formatTemp(day.tMax)}
            </Text>
          </>
        );
        if (!onPressDay) {
          return (
            <View key={day.date} style={rowStyle}>
              {content}
            </View>
          );
        }
        return (
          <Pressable
            key={day.date}
            onPress={() => {
              haptics.select();
              onPressDay(day, index);
            }}
            style={({ pressed }) => [...rowStyle, pressed && { opacity: 0.6 }]}
          >
            {content}
          </Pressable>
        );
      })}

      {hasMore ? (
        <Pressable
          onPress={() => {
            haptics.select();
            setExpanded((previous) => !previous);
          }}
          style={({ pressed }) => [
            styles.expandButton,
            { backgroundColor: theme.chipBg },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.expandText, { color: theme.textPrimary }]}>
            {expanded ? 'Show less' : `Show all ${days.length} days`}
          </Text>
          <ChevronDown
            size={15}
            color={theme.textPrimary}
            strokeWidth={2.4}
            style={expanded ? styles.chevronUp : undefined}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  dayLabel: {
    fontSize: 15,
    fontFamily: F.medium,
    width: 82,
  },
  precipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    width: 44,
  },
  precipText: {
    fontSize: 11.5,
    fontFamily: F.semibold,
  },
  precipPlaceholder: {
    width: 44,
  },
  tempMin: {
    fontSize: 15,
    width: 38,    fontFamily: F.regular,

    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    marginHorizontal: 10,
    overflow: 'hidden',
  },
  barFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  tempMax: {
    fontSize: 15,
    fontFamily: F.semibold,
    width: 38,
    textAlign: 'right',
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    alignSelf: 'center',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginVertical: 10,
  },
  expandText: {
    fontSize: 13,
    fontFamily: F.semibold,
  },
  chevronUp: {
    transform: [{ rotate: '180deg' }],
  },
});
