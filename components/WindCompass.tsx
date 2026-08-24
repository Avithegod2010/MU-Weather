import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { compassLabel } from '../utils/format';
import type { AppTheme } from '../theme/palettes';

interface WindCompassProps {
  theme: AppTheme;
  speed: number;
  gusts: number;
  direction: number;
}

const SIZE = 116;
const CENTER = SIZE / 2;
const RADIUS = 44;

export function WindCompass({ theme, speed, gusts, direction }: WindCompassProps) {
  const rotation = useSharedValue(direction + 180);

  useEffect(() => {
    rotation.value = withSpring(direction + 180, { damping: 15, stiffness: 90 });
  }, [direction, rotation]);

  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.compassWrap}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            stroke={theme.trackColor}
            strokeWidth={2}
            fill="none"
          />
          <Circle cx={CENTER} cy={CENTER} r={3.5} fill={theme.textSecondary} />
        </Svg>
        <Text style={[styles.cardinal, styles.north, { color: theme.textTertiary }]}>N</Text>
        <Text style={[styles.cardinal, styles.south, { color: theme.textTertiary }]}>S</Text>
        <Text style={[styles.cardinal, styles.east, { color: theme.textTertiary }]}>E</Text>
        <Text style={[styles.cardinal, styles.west, { color: theme.textTertiary }]}>W</Text>
        <Animated.View style={[styles.needleWrap, needleStyle]}>
          <Svg width={SIZE} height={SIZE}>
            <Path d={`M ${CENTER} ${CENTER - RADIUS + 8} L ${CENTER + 9} ${CENTER + 12} L ${CENTER} ${CENTER + 5} L ${CENTER - 9} ${CENTER + 12} Z`} fill={theme.textPrimary} />
          </Svg>
        </Animated.View>
      </View>
      <Text style={[styles.speed, { color: theme.textPrimary }]}>{Math.round(speed)}</Text>
      <Text style={[styles.unit, { color: theme.textSecondary }]}>
        km/h · {compassLabel(direction)}
      </Text>
      <Text style={[styles.gusts, { color: theme.textTertiary }]}>
        Gusts up to {Math.round(gusts)} km/h
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 2,
  },
  compassWrap: {
    width: SIZE,
    height: SIZE,
    marginBottom: 10,
  },
  cardinal: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '700',
  },
  north: { top: -2, left: 0, right: 0, textAlign: 'center' },
  south: { bottom: -2, left: 0, right: 0, textAlign: 'center' },
  east: { right: -4, top: 0, bottom: 0, textAlignVertical: 'center' },
  west: { left: -6, top: 0, bottom: 0, textAlignVertical: 'center' },
  needleWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
  },
  speed: {
    fontSize: 34,
    fontWeight: '600',
    includeFontPadding: false,
  },
  unit: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  gusts: {
    fontSize: 12,
    marginTop: 4,
  },
});
