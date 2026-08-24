import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { haptics } from '../utils/haptics';
import {
  ChevronDown,
  Search as SearchIcon,
  Map as MapIcon,
  MapPin,
  Bell,
  Settings as SettingsIcon,
  TriangleAlert,
  Navigation2,
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
  Star,
  ChevronLeft,
  ChevronRight,
  Vibrate,
  Thermometer,
  Database,
  Info,
  Radar,
  Flower2,
  TrendingDown,
  Navigation,
  Sunrise,
  Sunset,
} from '../utils/uiIcons';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { CurrentWeather } from '../components/CurrentWeather';
import { HourlyForecast } from '../components/HourlyForecast';
import { DailyForecast } from '../components/DailyForecast';
import { DetailCards } from '../components/DetailCards';
import { RainProbabilityChart } from '../components/RainProbabilityChart';
import { NowcastCard } from '../components/NowcastCard';
import { HighlightsCard } from '../components/HighlightsCard';
import { computeNowcast } from '../utils/nowcast';
import { computeHighlights } from '../utils/highlights';
import { Reveal, ScrollYProvider } from '../components/Reveal';
import { Surface } from '../components/Surface';
import { SkeletonDashboard } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { SearchOverlay } from '../components/SearchOverlay';
import { FavoritesSheet } from '../components/FavoritesSheet';
import { SectionTitle } from '../components/SectionTitle';
import { Card } from '../components/Card';
import { MapScreen } from './MapScreen';
import { AlertsScreen } from './AlertsScreen';
import { useAlerts } from '../hooks/useAlerts';
import { useSettings } from '../hooks/useSettings';
import { useProviderStatus } from '../hooks/useProviderStatus';
import { SettingsSheet } from '../components/SettingsSheet';
import { useWeather } from '../hooks/useWeather';
import { useFavorites } from '../hooks/useFavorites';
import { useWeatherTheme } from '../hooks/useWeatherTheme';
import { getCurrentLocation, LocationPermissionError } from '../hooks/useLocation';
import { loadLastLocation, saveLastLocation } from '../utils/storage';
import type { GeoLocation } from '../api/types';

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<GeoLocation | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const favoritesState = useFavorites();
  const weather = useWeather(active);
  const { settings, updateSettings } = useSettings();
  const { theme, conditionLabel } = useWeatherTheme(weather.data, settings.themeMode, settings.styleMode);
  const alertState = useAlerts(weather.data);
  const providerCheck = useProviderStatus(active);
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const nowcast = useMemo(
    () => computeNowcast(weather.data?.minutely ?? []),
    [weather.data],
  );
  const highlights = useMemo(
    () => (weather.data ? computeHighlights(weather.data, nowcast) : []),
    [weather.data, nowcast],
  );

  useEffect(() => {
    (async () => {
      const stored = await loadLastLocation();
      if (stored) {
        setActive(stored);
        setLocating(false);
        setBootstrapped(true);
        return;
      }
      try {
        const current = await getCurrentLocation();
        setActive(current);
        void saveLastLocation(current);
        setLocationError(null);
      } catch (error) {
        if (error instanceof LocationPermissionError) {
          setLocationError('Location permission is off. Pick a city instead.');
        } else {
          setLocationError('Could not determine your location.');
        }
        setSearchOpen(true);
      } finally {
        setLocating(false);
        setBootstrapped(true);
      }
    })();
  }, []);

  const selectLocation = useCallback((location: GeoLocation) => {
    haptics.medium();
    setActive(location);
    void saveLastLocation(location);
    setSearchOpen(false);
    setFavoritesOpen(false);
  }, []);

  const refreshing = weather.status === 'refreshing';

  if (!bootstrapped || locating || (weather.status === 'loading' && !weather.data && !weather.errorMessage)) {
    return (
      <View style={[styles.root, styles.center]}>
        <AnimatedBackground gradient={theme.gradient} />
        <ActivityIndicator size="large" color={theme.textPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AnimatedBackground gradient={theme.gradient} />
      <StatusBar style={theme.isLight ? 'dark' : 'light'} />

      {active ? (
        <ScrollYProvider value={scrollY}>
        <Animated.ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                haptics.light();
                weather.refresh();
              }}
              tintColor="#FFFFFF"
              progressBackgroundColor="rgba(0,0,0,0.25)"
            />
          }
        >
          <View style={styles.header}>
            <Surface theme={theme} style={styles.iconButton}>
              <Pressable
                onPress={() => {
                  haptics.select();
                  setMapOpen(true);
                }}
                style={({ pressed }) => [styles.iconButtonInner, pressed && { opacity: 0.6 }]}
              >
                <MapIcon size={20} color={theme.textPrimary} strokeWidth={2.2} />
              </Pressable>
            </Surface>

            <Surface theme={theme} style={styles.locationButton}>
              <Pressable
                style={({ pressed }) => [styles.pillInner, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  haptics.select();
                  setFavoritesOpen(true);
                }}
              >
                <MapPin size={15} color={theme.textSecondary} strokeWidth={2.4} />
                <Text style={[styles.locationButtonText, { color: theme.textPrimary }]} numberOfLines={1}>
                  {active.name}
                </Text>
                <ChevronDown size={16} color={theme.textSecondary} strokeWidth={2.6} />
              </Pressable>
            </Surface>

            <View style={styles.headerActions}>
              <Surface theme={theme} style={styles.iconButton}>
                <Pressable
                  onPress={() => {
                    haptics.select();
                    setAlertsOpen(true);
                  }}
                  style={({ pressed }) => [styles.iconButtonInner, pressed && { opacity: 0.6 }]}
                >
                  <Bell size={20} color={theme.textPrimary} strokeWidth={2.2} />
                </Pressable>
              </Surface>
              <Surface theme={theme} style={styles.iconButton}>
                <Pressable
                  onPress={() => {
                    haptics.select();
                    setSearchOpen(true);
                  }}
                  style={({ pressed }) => [styles.iconButtonInner, pressed && { opacity: 0.6 }]}
                >
                  <SearchIcon size={20} color={theme.textPrimary} strokeWidth={2.2} />
                </Pressable>
              </Surface>
              <Surface theme={theme} style={styles.iconButton}>
                <Pressable
                  onPress={() => {
                    haptics.select();
                    setSettingsOpen(true);
                  }}
                  style={({ pressed }) => [styles.iconButtonInner, pressed && { opacity: 0.6 }]}
                >
                  <SettingsIcon size={20} color={theme.textPrimary} strokeWidth={2.2} />
                </Pressable>
              </Surface>
            </View>
          </View>

          {locationError ? (
            <Animated.View entering={FadeIn.duration(500)} style={styles.noticeWrap}>
              <View style={[styles.notice, { backgroundColor: theme.chipBg }]}>
                <Navigation2 size={14} color={theme.textSecondary} strokeWidth={2.4} />
                <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
                  {locationError}
                </Text>
              </View>
            </Animated.View>
          ) : null}

          {weather.status === 'error' && !weather.data ? (
            <ErrorState
              theme={theme}
              title="Weather unavailable"
              message={weather.errorMessage ?? 'Something went wrong.'}
              actionLabel="Try again"
              onAction={weather.refresh}
            />
          ) : weather.data ? (
            <>
              {alertState.activeAlerts.length > 0 ? (
                <Reveal delay={30}>
                  <View style={styles.alertsStack}>
                    {alertState.activeAlerts.slice(0, 3).map((alert) => (
                      <Pressable
                        key={alert.key}
                        onPress={() => {
                          haptics.warning();
                          setAlertsOpen(true);
                        }}
                        style={({ pressed }) => [
                          styles.alertBanner,
                          {
                            backgroundColor:
                              alert.severity === 'severe'
                                ? 'rgba(224,92,92,0.28)'
                                : 'rgba(232,208,90,0.24)',
                            borderColor:
                              alert.severity === 'severe'
                                ? 'rgba(224,92,92,0.45)'
                                : 'rgba(232,208,90,0.4)',
                          },
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <TriangleAlert
                          size={17}
                          color={alert.severity === 'severe' ? '#FFB4B0' : '#F5DE7A'}
                          strokeWidth={2.2}
                        />
                        <View style={styles.alertTexts}>
                          <Text style={styles.alertTitle}>{alert.title}</Text>
                          <Text style={styles.alertMessage}>{alert.message}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </Reveal>
              ) : null}

              <Reveal delay={0}>
                <CurrentWeather
                  theme={theme}
                  location={active}
                  current={weather.data.current}
                  today={weather.data.daily[0] ?? null}
                  conditionLabel={conditionLabel}
                />
              </Reveal>

              <Reveal delay={60}>
                <HighlightsCard theme={theme} highlights={highlights} />
              </Reveal>

              <Reveal delay={80}>
                <NowcastCard
                  theme={theme}
                  minutely={weather.data.minutely}
                  nowcast={nowcast}
                />
              </Reveal>

              <Reveal delay={100}>
                <Card theme={theme} title="Rain Probability">
                  <RainProbabilityChart theme={theme} hours={weather.data.hourly} />
                </Card>
              </Reveal>

              <Reveal delay={170}>
                <HourlyForecast theme={theme} hours={weather.data.hourly} />
              </Reveal>

              <Reveal delay={120}>
                <SectionTitle theme={theme}>Daily forecast</SectionTitle>
                <DailyForecast theme={theme} days={weather.data.daily} />
              </Reveal>

              <Reveal delay={160}>
                <SectionTitle theme={theme}>Details</SectionTitle>
                <DetailCards
                  theme={theme}
                  current={weather.data.current}
                  today={weather.data.daily[0] ?? null}
                  aqi={weather.data.aqi}
                  utcOffsetSeconds={weather.data.utcOffsetSeconds}
                />
              </Reveal>

              <Reveal delay={100}>
                <Text style={[styles.credit, { color: theme.textTertiary }]}>
                  Data by Open-Meteo · Updated{' '}
                  {new Date(weather.data.fetchedAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              </Reveal>
            </>
          ) : (
            <SkeletonDashboard theme={theme} />
          )}
        </Animated.ScrollView>
        </ScrollYProvider>
      ) : (
        <View style={[styles.noLocation, { paddingTop: insets.top + 24 }]}>
          <ErrorState
            theme={theme}
            title="Welcome to MU Weather"
            message={
              locationError ??
              'Search for a city to see its live gradient forecast.'
            }
            variant="empty"
          />
          <Pressable
            onPress={() => setSearchOpen(true)}
            style={({ pressed }) => [
              styles.pickButton,
              { backgroundColor: theme.chipBg, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <SearchIcon size={17} color={theme.textPrimary} strokeWidth={2.4} />
            <Text style={[styles.pickButtonText, { color: theme.textPrimary }]}>
              Choose a city
            </Text>
          </Pressable>
        </View>
      )}

      <SettingsSheet
        theme={theme}
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={updateSettings}
        ready
        providerCheck={providerCheck}
        primaryTemp={weather.data?.current.temperature ?? null}
        lastUpdated={weather.data?.fetchedAt ?? null}
      />

      <AlertsScreen
        theme={theme}
        visible={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        settings={alertState.settings}
        onToggle={alertState.toggleAlert}
        ready={alertState.ready}
      />

      <MapScreen
        theme={theme}
        location={active ?? { id: 'current', name: 'World', latitude: 20, longitude: 0 }}
        visible={mapOpen}
        onClose={() => setMapOpen(false)}
      />

      <SearchOverlay
        theme={theme}
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={selectLocation}
        favorites={favoritesState.favorites}
        onToggleFavorite={(location) => {
          favoritesState.toggleFavorite(location);
        }}
        isFavorite={favoritesState.isFavorite}
      />

      <FavoritesSheet
        theme={theme}
        visible={favoritesOpen}
        onClose={() => setFavoritesOpen(false)}
        onSelect={selectLocation}
        favorites={favoritesState.favorites}
        onRemove={favoritesState.removeFavorite}
        ready={favoritesState.ready}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 16,
    gap: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  locationButton: {
    flex: 1,
    borderRadius: 999,
  },
  pillInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  locationButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  iconButtonInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeWrap: {
    marginTop: -6,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  alertsStack: {
    gap: 8,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  alertTexts: {
    flex: 1,
    gap: 1,
  },
  alertTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  alertMessage: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12.5,
    lineHeight: 17,
  },
  credit: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 4,
  },
  noLocation: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  pickButtonText: {
    fontSize: 15.5,
    fontWeight: '600',
  },
});
