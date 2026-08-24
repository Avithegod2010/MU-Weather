import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export type ParticleKind = 'rain' | 'snow';

interface WeatherParticlesProps {
  kind: ParticleKind;
  intensity: number;
}

interface ParticleSpec {
  left: number;
  topDelay: number;
  duration: number;
  size: number;
  opacity: number;
  swayDuration: number;
}

function makeSpecs(count: number, seed: number): ParticleSpec[] {
  const specs: ParticleSpec[] = [];
  let state = seed || 1;
  const rand = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  for (let index = 0; index < count; index++) {
    specs.push({
      left: rand() * 100,
      topDelay: rand() * 3000,
      duration: rand(),
      size: rand(),
      opacity: 0.25 + rand() * 0.3,
      swayDuration: 2200 + rand() * 1800,
    });
  }
  return specs;
}

function RainParticle({ spec, fallHeight, speedFactor }: { spec: ParticleSpec; fallHeight: number; speedFactor: number }) {
  const translateY = useSharedValue(-60);
  const duration = 750 + spec.duration * 550 * (1 / Math.max(speedFactor, 0.35));

  useEffect(() => {
    translateY.value = withDelay(
      spec.topDelay,
      withRepeat(
        withTiming(fallHeight + 80, { duration, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [fallHeight, duration, spec.topDelay, translateY]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.rainDrop,
        style,
        {
          left: `${spec.left}%`,
          height: 12 + spec.size * 12,
          opacity: spec.opacity + speedFactor * 0.2,
        },
      ]}
    />
  );
}

function SnowParticle({ spec, fallHeight }: { spec: ParticleSpec; fallHeight: number }) {
  const translateY = useSharedValue(-40);
  const sway = useSharedValue(0);
  const duration = 7000 + spec.duration * 6000;

  useEffect(() => {
    translateY.value = withDelay(
      spec.topDelay,
      withRepeat(
        withTiming(fallHeight + 60, { duration, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    sway.value = withDelay(
      spec.topDelay,
      withRepeat(
        withTiming(1, { duration: spec.swayDuration, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [fallHeight, duration, spec.topDelay, spec.swayDuration, sway, translateY]);

  const fallStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const swayStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sway.value, [0, 1], [-16, 16]) }],
  }));

  const size = 2.5 + spec.size * 3;

  return (
    <Animated.View style={[styles.snowAnchor, fallStyle, { left: `${spec.left}%` }]}>
      <Animated.View
        style={[
          styles.snowFlake,
          swayStyle,
          { width: size, height: size, borderRadius: size / 2, opacity: spec.opacity + 0.2 },
        ]}
      />
    </Animated.View>
  );
}

export function WeatherParticles({ kind, intensity }: WeatherParticlesProps) {
  const { height } = useWindowDimensions();
  const specs = useMemo(
    () => makeSpecs(Math.round(16 + intensity * 20), kind === 'rain' ? 1234 : 4321),
    [kind, intensity],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {specs.map((spec, index) =>
        kind === 'rain' ? (
          <RainParticle
            key={`r-${index}`}
            spec={spec}
            fallHeight={height}
            speedFactor={Math.max(intensity, 0.35)}
          />
        ) : (
          <SnowParticle key={`s-${index}`} spec={spec} fallHeight={height} />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rainDrop: {
    position: 'absolute',
    top: 0,
    width: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  snowAnchor: {
    position: 'absolute',
    top: 0,
  },
  snowFlake: {
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
});
