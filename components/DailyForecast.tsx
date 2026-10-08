import React, { useState } from 'react';
import { t, tWmo } from '../utils/i18n';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Droplet, ChevronDown } from '../utils/uiIcons';
import { useRevealProgress } from './Reveal';
import { useReducedMotion } from '../utils/reduceMotion';
import { haptics } from '../utils/haptics';
import type { AppTheme } from '../theme/palettes';
import { WeatherIcon } from './WeatherIcon';
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
            <WeatherIcon code={day.weatherCode} isDay size={22} themeColor={theme.textPrimary} />
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
              <GrowBar
                colors={[tempColor(day.tMin), tempColor(day.tMax)]}
                leftPct={leftPct}
                widthPct={widthPct}
                order={index}
              />
            </View>
            <Text style={[styles.tempMax, { color: theme.textPrimary }]}>
              {formatTemp(day.tMax)}
            </Text>
          </>
        );
        const rowLabel = `${formatDayLabel(day.date, index)}, ${tWmo(day.weatherCode)}, ${formatTemp(
          day.tMin,
        )} / ${formatTemp(day.tMax)}, ${t('rain_chance')} ${Math.round(day.precipProbabilityMax)}%`;
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
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={rowLabel}
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
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={[styles.expandText, { color: theme.textPrimary }]}>
            {expanded
              ? t('df_show_less')
              : t('df_show_all').replace('{n}', String(days.length))}
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

/**
 * Temperature-range segment that grows out from its left edge once the
 * surrounding Reveal plays. Rows are staggered so the week fills in top-down.
 */
function GrowBar({
  colors,
  leftPct,
  widthPct,
  order,
}: {
  colors: [string, string];
  leftPct: number;
  widthPct: number;
  order: number;
}) {
  const progress = useRevealProgress();
  const reducedMotion = useReducedMotion();
  const stagger = Math.min(order * 0.07, 0.5);
  const growStyle = useAnimatedStyle(() => {
    if (!progress || reducedMotion) return { width: `${widthPct}%` };
    const local = Math.min(1, Math.max(0, (progress.value - stagger) / (1 - stagger)));
    const eased = 1 - Math.pow(1 - local, 3);
    return { width: `${widthPct * eased}%` };
  });

  return (
    <Animated.View style={[styles.barFill, { left: `${leftPct}%` }, growStyle]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
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
