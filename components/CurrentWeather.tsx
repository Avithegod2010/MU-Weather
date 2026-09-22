import { t } from '../utils/i18n';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  Volume2,
  Square,
} from '../utils/uiIcons';
import type { AppTheme } from '../theme/palettes';
import { WeatherIcon } from './WeatherIcon';
import { formatTemp } from '../utils/format';
import { F } from '../theme/typography';
import { haptics } from '../utils/haptics';
import { buildSpokenForecast, speakForecast, stopForecastSpeech } from '../utils/speech';
import { isDigestSpeaking, stopDigestSpeech } from '../utils/spokenDigest';
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
  const compact = theme.density === 'compact';
  const [speaking, setSpeaking] = useState(false);

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

  const heroLabel = [
    location.name,
    conditionLabel,
    `${formatTemp(current.temperature)}`,
    `${t('feels_like')} ${formatTemp(current.apparentTemperature)}`,
    today ? `${formatTemp(today.tMax)} / ${formatTemp(today.tMin)}` : null,
    commentary ?? null,
  ]
    .filter(Boolean)
    .join(', ');

  const spokenText = buildSpokenForecast({
    city: location.name,
    condition: conditionLabel,
    temperature: formatTemp(current.temperature),
    feelsLike: formatTemp(current.apparentTemperature),
    high: today ? formatTemp(today.tMax) : undefined,
    low: today ? formatTemp(today.tMin) : undefined,
    rain: today ? `${Math.round(today.precipProbabilityMax)}%` : undefined,
  });

  const toggleSpeech = () => {
    // A digest readout ("Read my forecast" from the notification) counts as
    // speaking even though the button never started it — the first tap stops it
    // instead of silently restarting the hero readout.
    if (speaking || isDigestSpeaking()) {
      stopForecastSpeech();
      stopDigestSpeech();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speakForecast(spokenText, {
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  // Leaving the hero (city switch, screen change) should silence the voice.
  useEffect(() => () => stopForecastSpeech(), []);

  return (
    <>
    <View
      style={[styles.container, compact && styles.containerCompact]}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={heroLabel}
    >
      <View
        style={[styles.locationRow, compact && styles.locationRowCompact]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <MapPin size={15} color={theme.textSecondary} strokeWidth={2.4} />
        <Text style={[styles.locationText, { color: theme.textPrimary }]} numberOfLines={1}>
          {location.name}
        </Text>
      </View>

      <Animated.View style={[styles.iconWrap, compact && styles.iconWrapCompact, floatStyle]}>
        <WeatherIcon
          code={current.weatherCode}
          isDay={current.isDay}
          size={compact ? 72 : 84}
          themeColor={theme.textPrimary}
        />
      </Animated.View>

      <Text style={[styles.temperature, compact && styles.temperatureCompact, { color: theme.textPrimary }]}>
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
        <View style={[styles.highLowChip, compact && styles.highLowChipCompact, { backgroundColor: theme.chipBg }]}>
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
    <Pressable
      onPress={toggleSpeech}
      onPressIn={() => haptics.select()}
      accessibilityRole="button"
      accessibilityLabel={t(speaking ? 'stop_speech' : 'speak_weather')}
      style={[styles.speechButton, { backgroundColor: theme.chipBg }]}
    >
      {speaking ? (
        <Square size={18} color={theme.textPrimary} strokeWidth={2.4} />
      ) : (
        <Volume2 size={18} color={theme.textPrimary} strokeWidth={2.2} />
      )}
    </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 6,
  },
  containerCompact: {
    paddingVertical: 13,
    gap: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  locationRowCompact: {
    marginBottom: 7,
  },
  locationText: {
    fontSize: 17,
    fontFamily: F.semibold,
    letterSpacing: 0.2,
  },
  iconWrap: {
    marginBottom: 2,
  },
  iconWrapCompact: {
    marginBottom: 1,
  },
  temperature: {
    fontSize: 96,
    fontFamily: F.light,
    letterSpacing: -3,
    includeFontPadding: false,
  },
  temperatureCompact: {
    fontSize: 86,
    letterSpacing: -2.5,
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
  highLowChipCompact: {
    marginTop: 9,
    paddingVertical: 7,
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
  speechButton: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    marginTop: 10,
  },
});
