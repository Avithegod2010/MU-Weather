import { t } from '../utils/i18n';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
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
import { getWeatherIcon } from '../utils/icons';
import { formatTemp } from '../utils/format';
import { F } from '../theme/typography';
import type { CurrentConditions, DayPoint, GeoLocation } from '../api/types';

interface CurrentWeatherProps {
  theme: AppTheme;
  location: GeoLocation;
  current: CurrentConditions;
  today: DayPoint | null;
  conditionLabel: string;
  commentary?: string | null;
}

export function CurrentWeather({ theme, location, current, today, conditionLabel, commentary }: CurrentWeatherProps) {
  const Icon = getWeatherIcon(current.weatherCode, current.isDay);

  const floatY = useSharedValue(0);
  useEffect(() => {
    floatY.value = withDelay(
      400,
      withRepeat(
        withTiming(-8, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [floatY]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));

  return (
    <View style={styles.container}>
      <View style={styles.locationRow}>
        <MapPin size={15} color={theme.textSecondary} strokeWidth={2.4} />
        <Text style={[styles.locationText, { color: theme.textPrimary }]} numberOfLines={1}>
          {location.name}
        </Text>
      </View>

      <Animated.View style={[styles.iconWrap, floatStyle]}>
        <Icon size={84} color={theme.textPrimary} strokeWidth={1.3} />
      </Animated.View>

      <Text style={[styles.temperature, { color: theme.textPrimary }]}>
        {formatTemp(current.temperature)}
      </Text>

      <Text style={[styles.conditionText, { color: theme.textPrimary }]}>{conditionLabel}</Text>
      <Text style={[styles.feelsLike, { color: theme.textSecondary }]}>
        {t('feels_like')} {formatTemp(current.apparentTemperature)}
      </Text>

      {commentary ? (
        <Text style={[styles.commentary, { color: theme.textTertiary }]}>{commentary}</Text>
      ) : null}

      {today ? (
        <View style={[styles.highLowChip, { backgroundColor: theme.chipBg }]}>
          <ArrowUp size={13} color={theme.textPrimary} strokeWidth={2.6} />
          <Text style={[styles.highLowText, { color: theme.textPrimary }]}>
            {formatTemp(today.tMax)}
          </Text>
          <View style={[styles.divider, { backgroundColor: theme.trackColor }]} />
          <ArrowDown size={13} color={theme.textSecondary} strokeWidth={2.6} />
          <Text style={[styles.highLowText, { color: theme.textSecondary }]}>
            {formatTemp(today.tMin)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  locationText: {
    fontSize: 17,
    fontFamily: F.semibold,
    letterSpacing: 0.2,
  },
  iconWrap: {
    marginBottom: 2,
  },
  temperature: {
    fontSize: 96,
    fontFamily: F.light,
    letterSpacing: -3,
    includeFontPadding: false,
  },
  conditionText: {
    fontSize: 19,
    fontFamily: F.medium,
  },
  feelsLike: {
    fontSize: 14.5,
    fontFamily: F.regular,
  },
  commentary: {
    fontSize: 13.5,
    fontFamily: F.regular,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
    marginHorizontal: 24,
    lineHeight: 19,
  },
  highLowChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 12,
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  highLowText: {
    fontSize: 14.5,
    fontFamily: F.semibold,
  },
  divider: {
    width: 1,
    height: 14,
    marginHorizontal: 5,
  },
});
