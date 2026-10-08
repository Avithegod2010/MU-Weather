import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { AppTheme } from '../theme/palettes';
import { F } from '../theme/typography';
import { SPACE, TYPE } from '../theme/tokens';
import { useRevealProgress } from './Reveal';

interface ChapterHeaderProps {
  theme: AppTheme;
  title: string;
}

/**
 * Large title that opens a chapter of the home screen. Inside a Reveal, a
 * hairline rule draws out from the centre as the chapter scrolls into view.
 */
export function ChapterHeader({ theme, title }: ChapterHeaderProps) {
  const progress = useRevealProgress();
  const ruleStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress ? progress.value : 1 }],
  }));

  return (
    <View style={styles.row} accessibilityRole="header">
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      <View style={[styles.track, { backgroundColor: theme.trackColor }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.textSecondary }, ruleStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginTop: SPACE.xl,
    marginBottom: -SPACE.xxs,
    paddingHorizontal: SPACE.xxs,
  },
  title: {
    fontSize: TYPE.chapter,
    fontFamily: F.semibold,
    letterSpacing: -0.3,
  },
  track: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
});
