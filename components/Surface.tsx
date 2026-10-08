import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppTheme } from '../theme/palettes';
import { RADIUS } from '../theme/tokens';

interface SurfaceProps {
  theme: AppTheme;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function Surface({ theme, style, children }: SurfaceProps) {
  if (theme.styleMode === 'glass') {
    return (
      <BlurView
        intensity={theme.blurIntensity}
        tint={theme.blurTint}
        experimentalBlurMethod="dimezisBlurView"
        style={[
          styles.glass,
          { borderColor: theme.cardBorder },
          style,
        ]}
      >
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[styles.solid, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }, style]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sheenClip]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  solid: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  sheenClip: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  glass: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});
