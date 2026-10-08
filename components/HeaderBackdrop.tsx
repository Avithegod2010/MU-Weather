import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useScrollY } from './Reveal';

interface HeaderBackdropProps {
  /** Solid colour behind the pinned header, usually the top of the sky gradient. */
  color: string;
}

/**
 * Backdrop for a sticky header. It fades in as the content scrolls under the
 * header, so the controls stay readable without a hard edge at rest.
 */
export function HeaderBackdrop({ color }: HeaderBackdropProps) {
  const scrollY = useScrollY();
  const style = useAnimatedStyle(() => ({
    opacity: scrollY
      ? interpolate(scrollY.value, [0, 96], [0, 0.94], Extrapolation.CLAMP)
      : 0,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]}
    />
  );
}
