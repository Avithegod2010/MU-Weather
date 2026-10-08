import { t } from '../utils/i18n';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { BlurMask, Canvas, Circle } from '@shopify/react-native-skia';
import { withAlpha } from '../utils/color';
import {
  ArrowUp,
  ArrowDown,
  MapPin,
  Volume2,
  Share,
  Square,
} from '../utils/uiIcons';
import type { AppTheme } from '../theme/palettes';
import { WeatherIcon } from './WeatherIcon';
import { formatTemp } from '../utils/format';
import { F } from '../theme/typography';
import { haptics } from '../utils/haptics';
import { buildSpokenForecast, speakForecast, stopForecastSpeech } from '../utils/speech';
import { isDigestSpeaking, stopDigestSpeech } from '../utils/spokenDigest';
import { useCountUp } from '../utils/motion';
import { useReducedMotion } from '../utils/reduceMotion';
import { useScrollY } from './Reveal';
import type { CurrentConditions, DayPoint, GeoLocation } from '../api/types';

interface CurrentWeatherProps {
  theme: AppTheme;
  location: GeoLocation;
  current: CurrentConditions;
  today: DayPoint | null;
  conditionLabel: string;
  commentary?: string | null;
  /** Opens the share sheet with the captured weather-card image. */
  onShare?: () => void;
  /** True while the capture/share is in flight - the share chip dims. */
  sharing?: boolean;
}

/**
 * Text drawn straight onto the sky (no card behind it). The sky can be light at one end and dark
 * at the other, so no single ink reaches 4.5:1 everywhere (see scripts/visual/contrast-audit.ts).
 * A soft halo in the opposite tone keeps the text readable across the whole gradient.
 */
function heroTextShadow(theme: AppTheme) {
  return {
    textShadowColor: theme.isLight ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  };
}

export function CurrentWeather({ theme, location, current, today, conditionLabel, commentary, onShare, sharing }: CurrentWeatherProps) {
  const compact = theme.density === 'compact';
  const [speaking, setSpeaking] = useState(false);
  const reducedMotion = useReducedMotion();
  const scrollY = useScrollY();

  // The temperature counts up from zero on first render (instant under reduce-motion).
  const shownTemperature = useCountUp(current.temperature, { from: 0, duration: 1000, delay: 150 });

  const iconSize = compact ? 72 : 84;
  const haloSize = iconSize + 124;

  const floatY = useSharedValue(0);
  const breathe = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    floatY.value = withDelay(
      400,
      withRepeat(
        withTiming(-8, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    breathe.value = withRepeat(
      withTiming(1, { duration: 3800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(floatY);
      cancelAnimation(breathe);
    };
  }, [floatY, breathe, reducedMotion]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + breathe.value * 0.28,
    transform: [{ scale: 0.94 + breathe.value * 0.1 }],
  }));

  // Scroll parallax: the hero drifts slower than the content and fades as it leaves the top.
  const parallaxStyle = useAnimatedStyle(() => {
    const offset = scrollY ? Math.max(0, scrollY.value) : 0;
    return {
      transform: [{ translateY: offset * 0.18 }],
      opacity: interpolate(offset, [0, 320], [1, 0.45], Extrapolation.CLAMP),
    };
  });

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
    <Animated.View
      style={[styles.container, compact && styles.containerCompact, parallaxStyle]}
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
        <Text style={[styles.locationText, { color: theme.textPrimary }, heroTextShadow(theme)]} numberOfLines={1}>
          {location.name}
        </Text>
      </View>

      <Animated.View style={[styles.iconWrap, compact && styles.iconWrapCompact, floatStyle]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              width: haloSize,
              height: haloSize,
              left: (iconSize - haloSize) / 2,
              top: (iconSize - haloSize) / 2,
            },
            haloStyle,
          ]}
        >
          {/* Skia blur mask instead of an SVG radial gradient: a soft accent glow. */}
          <Canvas style={{ width: haloSize, height: haloSize }}>
            <Circle cx={haloSize / 2} cy={haloSize / 2} r={haloSize * 0.3} color={withAlpha(theme.accent, 0.42)}>
              <BlurMask blur={haloSize * 0.16} style="normal" />
            </Circle>
            <Circle cx={haloSize / 2} cy={haloSize / 2} r={haloSize * 0.12} color={withAlpha(theme.accent, 0.3)}>
              <BlurMask blur={haloSize * 0.06} style="normal" />
            </Circle>
          </Canvas>
        </Animated.View>
        <WeatherIcon
          code={current.weatherCode}
          isDay={current.isDay}
          size={iconSize}
          themeColor={theme.textPrimary}
        />
      </Animated.View>

      <Text style={[styles.temperature, compact && styles.temperatureCompact, { color: theme.textPrimary }, heroTextShadow(theme)]}>
        {formatTemp(shownTemperature)}
      </Text>

      <Text style={[styles.conditionText, { color: theme.textPrimary }, heroTextShadow(theme)]}>{conditionLabel}</Text>
      <Text style={[styles.feelsLike, { color: theme.textSecondary }, heroTextShadow(theme)]}>
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
    </Animated.View>
    <View style={styles.heroActions}>
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
      {onShare ? (
        <Pressable
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel={t('share_dialog_title')}
          accessibilityState={{ busy: !!sharing }}
          style={[styles.shareChip, { backgroundColor: theme.chipBg }, sharing && { opacity: 0.5 }]}
        >
          <Share size={18} color={theme.textPrimary} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
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
  halo: {
    position: 'absolute',
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
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  shareChip: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 10,
  },
});
