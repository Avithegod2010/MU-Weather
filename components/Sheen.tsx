import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useReducedMotion } from '../utils/reduceMotion';
import { useRevealProgress } from './Reveal';

/**
 * 0 → 1 over `duration` ms, starting after `delay`. For surfaces that are already on
 * screen when they mount (such as the sticky header controls). Under reduce-motion it
 * is 1 from the start, so nothing moves.
 */
export function useMountSweep(delay = 260, duration = 900): SharedValue<number> {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
  }, [delay, duration, progress, reducedMotion]);

  return progress;
}

interface SheenProps {
  /** Corner radius of the surface being highlighted. */
  radius: number;
  /** Explicit progress. Defaults to the enclosing Reveal's progress. */
  sweep?: SharedValue<number> | null;
}

/**
 * Glassy highlight that sweeps once across its surface as the surface appears, then
 * rests off the right edge, where it is invisible. It is decorative and ignores touches.
 * Under reduce-motion the sweep is skipped and the highlight is never drawn.
 */
export function Sheen({ radius, sweep }: SheenProps) {
  const reveal = useRevealProgress();
  const progress = sweep ?? reveal;
  const width = useSharedValue(0);

  const animated = useAnimatedStyle(() => {
    const p = progress ? progress.value : 1;
    // The band only starts crossing once the surface is half-way through its reveal.
    const t = Math.min(1, Math.max(0, (p - 0.3) / 0.7));
    const w = width.value;
    return {
      opacity: w > 0 ? 1 : 0,
      transform: [{ translateX: -w + 2 * w * t }],
    };
  }, [progress]);

  return (
    <View
      pointerEvents="none"
      onLayout={(event) => {
        width.value = event.nativeEvent.layout.width;
      }}
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animated]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
          locations={[0.35, 0.5, 0.65]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}
