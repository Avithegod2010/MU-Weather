import React, { useMemo, useState } from 'react';
import { t } from '../utils/i18n';
import { F } from '../theme/typography';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CloudRain,
  Thermometer,
  Cloud,
  Wind,
  CloudLightning,
  Gauge,
  ChevronLeft,
} from '../utils/uiIcons';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { haptics } from '../utils/haptics';
import type { AppTheme } from '../theme/palettes';
import type { GeoLocation } from '../api/types';

type MapLayer = 'precip' | 'temp' | 'clouds' | 'wind' | 'thunder' | 'pressure';

const LAYERS: Array<{ key: MapLayer; label: string; windy: string; icon: typeof Cloud }> = [
  { key: 'precip', label: 'Precip', windy: 'rain', icon: CloudRain },
  { key: 'temp', label: 'Temp', windy: 'temp', icon: Thermometer },
  { key: 'thunder', label: 'Storms', windy: 'thunder', icon: CloudLightning },
  { key: 'clouds', label: 'Clouds', windy: 'clouds', icon: Cloud },
  { key: 'wind', label: 'Wind', windy: 'wind', icon: Wind },
  { key: 'pressure', label: 'Press', windy: 'pressure', icon: Gauge },
];

function buildWindyUrl(lat: number, lon: number, layer: MapLayer): string {
  const overlay = LAYERS.find((entry) => entry.key === layer)?.windy ?? 'rain';
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
    detailLat: lat.toFixed(4),
    detailLon: lon.toFixed(4),
    zoom: '7',
    level: 'surface',
    overlay,
    message: 'true',
    marker: 'true',
    calendar: 'now',
    type: 'map',
    location: 'coordinates',
    metricWind: 'km/h',
    metricTemp: '°C',
    radarRange: '-1',
  });
  return `https://embed.windy.com/embed2.html?${params.toString()}`;
}

interface MapScreenProps {
  theme: AppTheme;
  location: GeoLocation;
  visible: boolean;
  onClose: () => void;
}

export function MapScreen({ theme, location, visible, onClose }: MapScreenProps) {
  const insets = useSafeAreaInsets();
  const [layer, setLayer] = useState<MapLayer>('precip');
  const [loading, setLoading] = useState(true);

  const url = useMemo(
    () => buildWindyUrl(location.latitude, location.longitude, layer),
    [location.latitude, location.longitude, layer],
  );

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 12 }]}
    >
      <AnimatedBackground gradient={theme.gradient} />

      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <View style={styles.eyebrowRow}>
            <View style={[styles.liveDot, { backgroundColor: theme.accent }]} />
            <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>{t('map_eyebrow')}</Text>
          </View>
          <Text style={[styles.cityName, { color: theme.textPrimary }]} numberOfLines={1}>
            {location.name}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            haptics.select();
            onClose();
          }}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
            pressed && { opacity: 0.7 },
          ]}
        >
          <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2.4} />
        </Pressable>
      </View>

      <View style={[styles.chipsWrap, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        {LAYERS.map((entry) => {
          const Icon = entry.icon;
          const isActive = layer === entry.key;
          return (
            <Pressable
              key={entry.key}
              onPress={() => {
                haptics.select();
                setLayer(entry.key);
              }}
              style={({ pressed }) => [
                styles.chip,
                isActive && { backgroundColor: theme.isLight ? '#FFFFFF' : '#F4F6FA' },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Icon
                size={19}
                color={isActive ? (theme.isLight ? '#1C2431' : '#1C2431') : theme.textSecondary}
                strokeWidth={2.1}
              />
              <Text
                style={[
                  styles.chipLabel,
                  { color: isActive ? (theme.isLight ? '#1C2431' : '#1C2431') : theme.textSecondary },
                ]}
              >
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.mapWrap}>
        <WebView
          source={{ uri: url }}
          style={[styles.webview, { backgroundColor: '#9FB2C8' }]}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          setSupportMultipleWindows={false}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
        />
        {loading ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        ) : null}
      </View>

      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        Interactive radar · pinch & drag to explore anywhere on Earth
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    gap: 16,
    zIndex: 40,
    elevation: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTexts: {
    flex: 1,
    gap: 2,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontFamily: F.bold,
    letterSpacing: 2.2,
  },
  cityName: {
    fontSize: 34,
    fontFamily: F.bold,
    letterSpacing: -0.5,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  chipsWrap: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    padding: 5,
    gap: 2,
  },
  chip: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 9,
    borderRadius: 999,
  },
  chipLabel: {
    fontSize: 12.5,
    fontFamily: F.semibold,
  },
  mapWrap: {
    flex: 1,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#9FB2C8',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    textAlign: 'center',
    fontSize: 12.5,
  },
});
