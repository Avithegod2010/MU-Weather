import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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
  onPress?: () => void;
  children: React.ReactNode;
}

export function Card({ theme, title, icon: Icon, style, revealDelay, headerRight, onPress, children }: CardProps) {
  const isGlass = theme.styleMode === 'glass';
  const compact = theme.density === 'compact';

  const inner = (
    <View
      style={[
        styles.card,
        isGlass
          ? { borderWidth: 1, borderColor: theme.cardBorder, overflow: 'hidden' }
          : { backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.cardBorder },
        styles.fill,
        compact && styles.cardCompact,
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
        <View style={[styles.header, compact && styles.headerCompact]}>
          {Icon ? <Icon size={14} color={theme.textSecondary} strokeWidth={2.4} /> : null}
          <Text style={[styles.headerText, { color: theme.textSecondary }, compact && styles.headerTextCompact]}>{title}</Text>
          {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
          {onPress ? <ChevronGlyph color={theme.textTertiary} /> : null}
        </View>
      ) : null}
      {children}
    </View>
  );

  const interactive = onPress ? (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: false, radius: 400 }}
      style={({ pressed }) => [styles.pressWrap, pressed && { opacity: 0.85 }]}
    >
      {inner}
    </Pressable>
  ) : (
    inner
  );

  if (revealDelay === undefined) {
    return (
      <View style={style}>
        {interactive}
      </View>
    );
  }

  return (
    <Reveal delay={revealDelay} style={style}>
      {interactive}
    </Reveal>
  );
}

function ChevronGlyph({ color }: { color: string }) {
  return (
    <Text style={[styles.chevron, { color }]}>›</Text>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  cardCompact: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  fill: {
    flexGrow: 1,
  },
  pressWrap: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  headerCompact: {
    marginBottom: 8,
  },
  headerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  chevron: {
    fontSize: 16,
    lineHeight: 18,
    marginLeft: 2,
  },
  headerText: {
    fontSize: 12,
    fontFamily: F.semibold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  headerTextCompact: {
    fontSize: 11,
    letterSpacing: 1.2,
  },
});
