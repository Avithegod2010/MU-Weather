/**
 * Switch whose thumb slides between its two positions.
 *
 * Material mode: the thumb glides on a quick spring and the track blends between its
 * two colours. Liquid glass mode: the thumb is frosted glass and stretches while it
 * travels, the same way as the selection highlight.
 *
 * Takes the props of the native Switch it replaces (value, onValueChange, trackColor,
 * thumbColor), so a call site changes only its tag. Haptics stay in onValueChange.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppTheme } from '../theme/palettes';
import { LIQUID, MOTION, SLIDE } from '../theme/tokens';
import { useReducedMotion } from '../utils/reduceMotion';

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;
const PAD = 4;
const THUMB = TRACK_HEIGHT - PAD * 2;
const OFF_X = PAD;
const ON_X = TRACK_WIDTH - PAD - THUMB;

export interface SlidingSwitchProps {
  theme: AppTheme;
  value: boolean;
  onValueChange: (value: boolean) => void;
  trackColor?: { true?: string; false?: string };
  thumbColor?: string;
  accessibilityLabel?: string;
  /** Accepted so the native Switch's props still fit at each call site. Not used. */
  ios_backgroundColor?: string;
}

export function SlidingSwitch({
  theme,
  value,
  onValueChange,
  trackColor,
  thumbColor,
  accessibilityLabel,
}: SlidingSwitchProps) {
  const reduced = useReducedMotion();
  const liquid = theme.styleMode === 'glass';
  const onTrack = trackColor?.true ?? theme.accent;
  const offTrack = trackColor?.false ?? theme.trackColor;
  const knob = thumbColor ?? '#FFFFFF';

  const progress = useSharedValue(value ? 1 : 0);
  const left = useSharedValue(value ? ON_X : OFF_X);
  const right = useSharedValue((value ? ON_X : OFF_X) + THUMB);

  useEffect(() => {
    const target = value ? ON_X : OFF_X;
    if (reduced) {
      progress.value = value ? 1 : 0;
      left.value = target;
      right.value = target + THUMB;
      return;
    }
    progress.value = withTiming(value ? 1 : 0, { duration: MOTION.fast });
    if (liquid) {
      if (value) {
        right.value = withSpring(target + THUMB, LIQUID.lead);
        left.value = withDelay(LIQUID.lagMs, withSpring(target, LIQUID.trail));
      } else {
        left.value = withSpring(target, LIQUID.lead);
        right.value = withDelay(LIQUID.lagMs, withSpring(target + THUMB, LIQUID.trail));
      }
    } else {
      left.value = withSpring(target, SLIDE);
      right.value = withSpring(target + THUMB, SLIDE);
    }
  // left, right and progress are shared values, which are stable; only the value and mode drive the animation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, liquid, reduced]);

  const trackStyle = useAnimatedStyle(
    () => ({ backgroundColor: interpolateColor(progress.value, [0, 1], [offTrack, onTrack]) }),
    [offTrack, onTrack],
  );
  const thumbStyle = useAnimatedStyle(() => ({
    left: Math.min(left.value, right.value),
    width: Math.abs(right.value - left.value),
  }));

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={styles.track}
      testID="slide-switch"
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.trackFill, trackStyle, liquid ? styles.glassTrack : null]}
      />
      <Animated.View
        pointerEvents="none"
        testID="slide-switch-thumb"
        style={[styles.thumb, thumbStyle, liquid ? styles.glassThumbShadow : null]}
      >
        {liquid ? (
          <View style={[StyleSheet.absoluteFill, styles.thumbFill, styles.glassThumbEdge, { backgroundColor: knob, opacity: 0.82 }]}>
            <LinearGradient
              colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.thumbSheen}
            />
          </View>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.thumbFill, { backgroundColor: knob }]} />
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: TRACK_WIDTH, height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2 },
  trackFill: { borderRadius: TRACK_HEIGHT / 2 },
  glassTrack: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  thumb: { position: 'absolute', top: PAD, height: THUMB, borderRadius: THUMB / 2 },
  thumbFill: { borderRadius: THUMB / 2, overflow: 'hidden' },
  glassThumbEdge: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  thumbSheen: { position: 'absolute', left: 0, right: 0, top: 0, height: '55%' },
  glassThumbShadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
