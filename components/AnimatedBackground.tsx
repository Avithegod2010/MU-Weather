import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { WeatherParticles, type ParticleKind } from './WeatherParticles';
import { useReducedMotion } from '../utils/reduceMotion';

interface AnimatedBackgroundProps {
  gradient: readonly [string, string, string];
  particles?: { kind: ParticleKind; intensity: number } | null;
}

type GradientTuple = [string, string, string];

function sameColors(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((color, index) => color === b[index]);
}

export function AnimatedBackground({ gradient, particles = null }: AnimatedBackgroundProps) {
  // Decorative rain/snow is skipped entirely when the OS asks for less motion.
  const reducedMotion = useReducedMotion();
  const [layerA, setLayerA] = useState<GradientTuple>([...gradient] as GradientTuple);
  const [layerB, setLayerB] = useState<GradientTuple | null>(null);
  const frontIsA = useRef(true);

  const opacityA = useSharedValue(1);
  const opacityB = useSharedValue(0);

  useEffect(() => {
    const current = frontIsA.current ? layerA : layerB;
    if (current && sameColors(current, gradient)) return;

    if (frontIsA.current) {
      setLayerB([...gradient] as GradientTuple);
      frontIsA.current = false;
      opacityB.value = 0;
      opacityB.value = withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) });
    } else {
      setLayerA([...gradient] as GradientTuple);
      frontIsA.current = true;
      opacityA.value = 0;
      opacityA.value = withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradient]);

  const styleA = useAnimatedStyle(() => ({ opacity: opacityA.value }));
  const styleB = useAnimatedStyle(() => ({ opacity: opacityB.value }));

  const orbDriftX = useSharedValue(0);
  const orbDriftY = useSharedValue(0);

  useEffect(() => {
    orbDriftX.value = withRepeat(
      withTiming(-26, { duration: 9000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    orbDriftY.value = withRepeat(
      withTiming(18, { duration: 7000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [orbDriftX, orbDriftY]);

  const orbOneStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: orbDriftX.value }, { translateY: orbDriftY.value }],
  }));
  const orbTwoStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: orbDriftY.value }, { translateY: orbDriftX.value }],
  }));

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, styleA]}>
        <LinearGradient
          colors={layerA}
          locations={[0, 0.52, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {layerB ? (
        <Animated.View style={[StyleSheet.absoluteFill, styleB]}>
          <LinearGradient
            colors={layerB}
            locations={[0, 0.52, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      {particles && !reducedMotion ? (
        <WeatherParticles kind={particles.kind} intensity={particles.intensity} />
      ) : null}
      <Animated.View style={[styles.orb, styles.orbOne, orbOneStyle]} />
      <Animated.View style={[styles.orb, styles.orbTwo, orbTwoStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  orbOne: {
    width: 320,
    height: 320,
    top: '12%',
    right: -110,
  },
  orbTwo: {
    width: 260,
    height: 260,
    bottom: '8%',
    left: -100,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});
