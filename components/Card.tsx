import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import type { LucideIcon } from 'lucide-react-native';
import type { AppTheme } from '../theme/palettes';
import { F } from '../theme/typography';
import { Reveal } from './Reveal';

interface CardProps {
  theme: AppTheme;
  title?: string;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  revealDelay?: number;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export function Card({ theme, title, icon: Icon, style, revealDelay, headerRight, children }: CardProps) {
  const isGlass = theme.styleMode === 'glass';

  const inner = (
    <View
      style={[
        styles.card,
        isGlass
          ? { borderWidth: 1, borderColor: theme.cardBorder, overflow: 'hidden' }
          : { backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.cardBorder },
        styles.fill,
      ]}
    >
      {isGlass ? (
        <BlurView
          intensity={theme.blurIntensity}
          tint={theme.blurTint}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {title ? (
        <View style={styles.header}>
          {Icon ? <Icon size={14} color={theme.textSecondary} strokeWidth={2.4} /> : null}
          <Text style={[styles.headerText, { color: theme.textSecondary }]}>{title}</Text>
          {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );

  if (revealDelay === undefined) {
    return (
      <View style={style}>
        {inner}
      </View>
    );
  }

  return (
    <Reveal delay={revealDelay} style={style}>
      {inner}
    </Reveal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  fill: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  headerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  headerText: {
    fontSize: 12,
    fontFamily: F.semibold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
