import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Group, Path, Rect, Skia } from '@shopify/react-native-skia';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface StormRingProps {
  /** Fill from 0 (flash tap) to 1 (full). The card decides the mapping from seconds. */
  progress: number;
  color: string;
  trackColor: string;
  size?: number;
  reducedMotion: boolean;
}

/**
 * Ring that fills while the storm is being timed. Drawn with Skia: a full track circle,
 * then the same circle trimmed to `progress`, starting at 12 o'clock.
 * Reduced motion: the ring jumps to its value with no tween.
 */
export function StormRing({ progress, color, trackColor, size = 96, reducedMotion }: StormRingProps) {
  const stroke = Math.max(5, size * 0.07);
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circle = Skia.Path.Make();
  circle.addCircle(center, center, radius);

  const shown = useSharedValue(progress);
  useEffect(() => {
    if (reducedMotion) {
      shown.value = progress;
    } else {
      shown.value = withTiming(progress, { duration: 180 });
    }
  }, [progress, reducedMotion, shown]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Canvas style={{ width: size, height: size }}>
        <Group origin={{ x: center, y: center }} transform={[{ rotate: -Math.PI / 2 }]}>
          <Path path={circle} style="stroke" strokeWidth={stroke} color={trackColor} />
          <Path
            path={circle}
            style="stroke"
            strokeWidth={stroke}
            strokeCap="round"
            color={color}
            start={0}
            end={shown}
          />
        </Group>
      </Canvas>
    </View>
  );
}

interface StormFlashProps {
  /** Increment to fire one flash. 0 means no flash has been requested yet. */
  flashKey: number;
  reducedMotion: boolean;
}

/**
 * Short white flash across the card when the user taps "I saw a flash".
 * Reduced motion: no flash at all. The ring and the text still show the state.
 */
export function StormFlash({ flashKey, reducedMotion }: StormFlashProps) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (flashKey === 0 || reducedMotion) return;
    opacity.value = withSequence(
      withTiming(0.28, { duration: 70 }),
      withTiming(0.04, { duration: 90 }),
      withTiming(0.18, { duration: 70 }),
      withTiming(0, { duration: 320 }),
    );
  }, [flashKey, reducedMotion, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden style={[StyleSheet.absoluteFill, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={10000} height={10000} color="#FFFFFF" />
      </Canvas>
    </Animated.View>
  );
}
