import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRainWind,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudHail,
  Clock,
  MapPin,
  ArrowUp,
  ArrowDown,
  Droplet,
  Droplets,
  Wind,
  Gauge,
  Eye,
  Umbrella,
  WifiOff,
  RefreshCw,
  SearchX,
  Search,
  Star,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Vibrate,
  Thermometer,
  Database,
  Info,
  Map,
  Bell,
  Settings,
  TriangleAlert,
  Navigation2,
  Radar,
  Flower2,
  TrendingDown,
  Navigation,
  Sunrise,
  Sunset,
} from '../utils/uiIcons';
import type { AppTheme } from '../theme/palettes';

interface ErrorStateProps {
  theme: AppTheme;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: 'network' | 'empty';
}

export function ErrorState({
  theme,
  title,
  message,
  actionLabel,
  onAction,
  variant = 'network',
}: ErrorStateProps) {
  const Icon = variant === 'network' ? WifiOff : SearchX;
  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
        ]}
      >
        <Icon size={34} color={theme.textSecondary} strokeWidth={1.8} />
      </View>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.chipBg, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <RefreshCw size={16} color={theme.textPrimary} strokeWidth={2.4} />
          <Text style={[styles.buttonText, { color: theme.textPrimary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 14,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  message: {
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 13,
    paddingHorizontal: 26,
    borderRadius: 999,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
