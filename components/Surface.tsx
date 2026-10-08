import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import type { AppTheme } from '../theme/palettes';
import { RADIUS } from '../theme/tokens';
import { Sheen, useMountSweep } from './Sheen';

interface SurfaceProps {
  theme: AppTheme;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function Surface({ theme, style, children }: SurfaceProps) {
  const sweep = useMountSweep();

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
      <Sheen radius={RADIUS.lg} sweep={sweep} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  solid: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  glass: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});
