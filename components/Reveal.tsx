import React, { createContext, useContext } from 'react';
import { StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const ScrollYContext = createContext<SharedValue<number> | null>(null);

export function ScrollYProvider({
  value,
  children,
}: {
  value: SharedValue<number>;
  children: React.ReactNode;
}) {
  return <ScrollYContext.Provider value={value}>{children}</ScrollYContext.Provider>;
}

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}

export function Reveal({ children, delay = 0, distance = 30, style }: RevealProps) {
  const scrollY = useContext(ScrollYContext);
  const tileY = useSharedValue(Number.MAX_SAFE_INTEGER);
  const progress = useSharedValue(0);
  const viewport = useWindowDimensions().height;

  useAnimatedReaction(
    () => {
      if (!scrollY) return true;
      return scrollY.value + viewport * 0.88 >= tileY.value;
    },
    (visible, wasVisible) => {
      if (visible && !wasVisible && progress.value === 0) {
        progress.value = withDelay(
          delay,
          withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) }),
        );
      }
    },
    [viewport, delay, scrollY],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return (
    <Animated.View
      style={[animatedStyle, style]}
      onLayout={(event) => {
        tileY.value = event.nativeEvent.layout.y;
      }}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({});
