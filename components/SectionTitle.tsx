import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { AppTheme } from '../theme/palettes';

interface SectionTitleProps {
  theme: AppTheme;
  children: React.ReactNode;
}

export function SectionTitle({ theme, children }: SectionTitleProps) {
  return (
    <Text style={[styles.title, { color: theme.textTertiary }]}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginHorizontal: 4,
  },
});
