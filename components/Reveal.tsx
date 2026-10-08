import React, { createContext, useContext, useEffect } from 'react';
import {
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useReducedMotion } from '../utils/reduceMotion';
import { MOTION } from '../theme/tokens';

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

/** Shared scroll offset of the nearest ScrollYProvider, or null outside one. */
export function useScrollY(): SharedValue<number> | null {
  return useContext(ScrollYContext);
}

const RevealProgressContext = createContext<SharedValue<number> | null>(null);

/**
 * Progress (0 to 1) of the nearest Reveal, so children can time their own
 * animations, for example bars that grow after their card has appeared.
 * Null outside a Reveal.
 */
export function useRevealProgress(): SharedValue<number> | null {
  return useContext(RevealProgressContext);
}

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
  /** Wipe the content in from the left edge instead of rising. Suits charts. */
  wipe?: boolean;
}

export function Reveal({ children, delay = 0, distance = 30, style, wipe = false }: RevealProps) {
  const reducedMotion = useReducedMotion();
  const scrollY = useScrollY();
  const tileY = useSharedValue(Number.MAX_SAFE_INTEGER);
  const measuredWidth = useSharedValue(0);
  const progress = useSharedValue(0);
  const viewport = useWindowDimensions().height;

  // Reduced motion never plays the reveal, so the content is shown in its final state.
  useEffect(() => {
    if (reducedMotion) progress.value = 1;
  }, [progress, reducedMotion]);

  useAnimatedReaction(
    () => {
      if (!scrollY) return true;
      return scrollY.value + viewport * 0.88 >= tileY.value;
    },
    (visible, wasVisible) => {
      if (reducedMotion) return;
      if (visible && !wasVisible && progress.value === 0) {
        progress.value = withDelay(
          delay,
          withTiming(1, {
            duration: wipe ? MOTION.wipe : MOTION.reveal,
            easing: Easing.out(Easing.cubic),
          }),
        );
      }
    },
    [viewport, delay, scrollY, reducedMotion, wipe],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));
  // Wipe: the box keeps its layout width and is scaled from its left edge with a
  // transform, so nothing below it reflows while it plays. A width-driven clip
  // would force the content to wrap at zero width and push later sections away.
  const wipeStyle = useAnimatedStyle(() => {
    const amount = progress.value;
    return {
      opacity: amount,
      transform: [{ translateX: -((1 - amount) * measuredWidth.value) / 2 }, { scaleX: amount }],
    };
  });

  // Reduced motion: children appear instantly, no stagger.
  const content = (
    <RevealProgressContext.Provider value={progress}>{children}</RevealProgressContext.Provider>
  );

  if (reducedMotion) {
    return <View style={style}>{content}</View>;
  }

  if (wipe) {
    return (
      <Animated.View
        style={[wipeStyle, style]}
        onLayout={(event) => {
          tileY.value = event.nativeEvent.layout.y;
          measuredWidth.value = event.nativeEvent.layout.width;
        }}
      >
        {content}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[animatedStyle, style]}
      onLayout={(event) => {
        tileY.value = event.nativeEvent.layout.y;
      }}
    >
      {content}
    </Animated.View>
  );
}

/** Reveal that wipes content in from the left. Use for charts and bar groups. */
export function RevealWipe(props: Omit<RevealProps, 'wipe'>) {
  return <Reveal {...props} wipe />;
}
