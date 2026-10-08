import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SPRING } from '../theme/tokens';
import { useReducedMotion } from '../utils/reduceMotion';

interface PressScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale applied while the finger is down. */
  pressedScale?: number;
}

/**
 * Pressable that squeezes its content with a spring while pressed and
 * springs back on release. Under reduce-motion the content never scales.
 */
export function PressScale({
  children,
  style,
  pressedScale = 0.975,
  onPressIn,
  onPressOut,
  ...rest
}: PressScaleProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      {...rest}
      onPressIn={(event) => {
        if (!reducedMotion) scale.value = withSpring(pressedScale, SPRING.press);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, SPRING.release);
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
