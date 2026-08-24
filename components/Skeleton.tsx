import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { AppTheme } from '../theme/palettes';

interface BoneProps {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  delay?: number;
  theme: AppTheme;
}

function Bone({ width, height, radius = 16, delay = 0, theme }: BoneProps) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [delay, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        style,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.cardBg,
        },
      ]}
    />
  );
}

export function SkeletonDashboard({ theme }: { theme: AppTheme }) {
  return (
    <>
      <Bone theme={theme} width={180} height={22} radius={11} delay={0} />
      <Bone theme={theme} width={64} height={64} radius={32} />
      <Bone theme={theme} width="70%" height={88} radius={28} />
      <Bone theme={theme} width="45%" height={26} radius={13} />
      <Bone theme={theme} width="100%" height={128} radius={28} />
      <Bone theme={theme} width="55%" height={26} radius={13} />
      <Bone theme={theme} width="100%" height={220} radius={28} />
    </>
  );
}
