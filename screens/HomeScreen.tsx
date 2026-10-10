import { t } from '../utils/i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { F } from '../theme/typography';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  findNodeHandle,
  type ScrollView as ScrollViewInstance,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { applyWeatherAccent } from '../utils/weatherAccent';
import { OfflineBanner } from '../components/OfflineBanner';
import { useSunriseAlarm } from '../hooks/useSunriseAlarm';
import { useRainOngoing } from '../hooks/useRainOngoing';
import { useYearReview } from '../hooks/useYearReview';
import { YearReviewCard } from '../components/YearReviewCard';
import { RecordCard } from '../components/RecordCard';
import { TOPIC_KEYS } from '../config/tiles';
import { useRecords } from '../hooks/useRecords';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
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
  Database,
  } from '../utils/uiIcons';
import { ShareCard } from '../components/ShareCard';
import { TrendChart } from '../components/TrendChart';
import { EnsembleCalibrationCard } from '../components/EnsembleCalibrationCard';
import { PastWeekCard } from '../components/PastWeekCard';
import { ActivityCard } from '../components/ActivityCard';
import { TripPlannerCard } from '../components/TripPlannerCard';
import { CalendarCard } from '../components/CalendarCard';
import { useCalendarWeather } from '../hooks/useCalendarWeather';
import { useMarine } from '../hooks/useMarine';
import { MarineCard } from '../components/MarineCard';
// ── bot2: aurora + alerts + wear ──
import { useAurora } from '../hooks/useAurora';
import { AuroraCard } from '../components/AuroraCard';
import { BestWindowCard } from '../components/BestWindowCard';
import { bestWindowLine } from '../utils/bestWindow';
import { planOutdoorWeather } from '../utils/outdoorPlanAdapter';
import {
  effectiveOutdoorPreferences,
  stepOutdoorPreference,
  type OutdoorPreferenceControlKey,
} from '../utils/outdoorPlanPolicy';
import { computeWearLine } from '../utils/whatToWear';
import { useComfortJournal } from '../hooks/useComfortJournal';
import { useOutdoorWindowFeedback } from '../hooks/useOutdoorWindowFeedback';
import { outdoorWindowFeedbackKey } from '../utils/outdoorWindowFeedbackPolicy';
import { ComfortJournalCard } from '../components/ComfortJournalCard';
import { TileDetailScreen, type TopicKey } from '../components/TileDetailScreen';
import { DayDetailScreen } from '../components/DayDetailScreen';
import { HistoricalExplorerScreen } from '../components/HistoricalExplorerScreen';
import { FEATURES } from '../config/features';
import { applyHomeBackground } from '../config/backgrounds';
import { applyColorTheme } from '../config/colorThemes';
import { resolveMaterialYouPalette, refreshMaterialYouPalette, type MaterialYouPalette } from '../utils/materialYou';
import { applyDensity } from '../theme/palettes';
import { getSnarkComment } from '../utils/snark';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { CurrentWeather } from '../components/CurrentWeather';
import { HourlyForecast, type HourFocusTarget } from '../components/HourlyForecast';
import { DailyForecast } from '../components/DailyForecast';
import { DetailCards } from '../components/DetailCards';
import { RainProbabilityChart } from '../components/RainProbabilityChart';
import { NowcastCard } from '../components/NowcastCard';
import { HighlightsCard } from '../components/HighlightsCard';
import { computeNowcast } from '../utils/nowcast';
import { computeHighlights } from '../utils/highlights';
import { Reveal, ScrollYProvider } from '../components/Reveal';
import { ChapterHeader } from '../components/ChapterHeader';
import { HeaderBackdrop } from '../components/HeaderBackdrop';
import { Surface } from '../components/Surface';
import { SkeletonDashboard } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { SearchOverlay } from '../components/SearchOverlay';
import { FavoritesSheet } from '../components/FavoritesSheet';
import { SectionTitle } from '../components/SectionTitle';
import { Card } from '../components/Card';
import { MapScreen } from './MapScreen';
import { RadarScreen } from './RadarScreen';
import { CompareScreen } from './CompareScreen';
import { useCityComparison } from '../hooks/useCityComparison';
import { ModelComparisonScreen } from './ModelComparisonScreen';
import { useModelComparison } from '../hooks/useModelComparison';
import { useModelAccuracyLog } from '../hooks/useModelAccuracyLog';
import { useEnsemble } from '../hooks/useEnsemble';
import { useForecastCalibration } from '../hooks/useForecastCalibration';
import { AlertsScreen } from './AlertsScreen';
import { useAlerts } from '../hooks/useAlerts';
import { useSettings } from '../hooks/useSettings';
import { useProviderStatus } from '../hooks/useProviderStatus';
import { useYearAgo } from '../hooks/useYearAgo';
import { useDigest } from '../hooks/useDigest';
import { registerDigestReadAction, setSpokenDigestSource } from '../utils/spokenDigest';
import { formatTemp } from '../utils/format';
import { useGoldenHour } from '../hooks/useGoldenHour';
import { useRainAlert } from '../hooks/useRainAlert';
import { usePastDays } from '../hooks/usePastDays';
import { useClimateNormals } from '../hooks/useClimateNormals';
import { useOnThisDay } from '../hooks/useOnThisDay';
import { useMeteoAlarm } from '../hooks/useMeteoAlarm';
import { ClimateCard } from '../components/ClimateCard';
import { OnThisDayCard } from '../components/OnThisDayCard';
import { WarningsCard } from '../components/WarningsCard';
import { ProviderStatusCard } from '../components/ProviderStatusCard';
import { SettingsSheet } from '../components/SettingsSheet';
import { useWeather } from '../hooks/useWeather';
import { useFavorites } from '../hooks/useFavorites';
import { useWeatherTheme } from '../hooks/useWeatherTheme';
import { getCurrentLocation, LocationPermissionError } from '../hooks/useLocation';
import { loadLastLocation, saveLastLocation } from '../utils/storage';
import { assessWeatherCacheFreshness, weatherLocationKey } from '../utils/freshnessPolicy';
import { buildCurrentImpactTimeline } from '../utils/currentImpactTimeline';
import type { DayPoint, GeoLocation } from '../api/types';

function forecastLocalIso(epoch: number, utcOffsetSeconds: number): string {
  return new Date(epoch + utcOffsetSeconds * 1000).toISOString().slice(0, 16);
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [planningNow, setPlanningNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setPlanningNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  const [active, setActive] = useState<GeoLocation | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [radarOpen, setRadarOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [detailTopic, setDetailTopic] = useState<TopicKey | null>(null);
  const [dayDetail, setDayDetail] = useState<{ day: DayPoint; index: number } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const favoritesState = useFavorites();
  const weather = useWeather(active);
  const comfort = useComfortJournal();
  const pastDays = usePastDays(active);
  const climateNormals = useClimateNormals(active);
  const onThisDay = useOnThisDay(active);
  const meteoAlarm = useMeteoAlarm(active);
  const ensemble = useEnsemble(FEATURES.ensemble ? active : null);
  const forecastCalibration = useForecastCalibration(
    active,
    FEATURES.ensemble ? ensemble.spread : null,
    weather.data?.utcOffsetSeconds ?? null,
    weather.data?.fetchedAt ?? 0,
  );
  const { settings, updateSettings } = useSettings();
  const weatherThemeResult = useWeatherTheme(weather.data, settings.themeMode, settings.styleMode);
  // Resolve once per session; null (Expo Go etc.) makes the theme fall back to
  // the static Material You gradient. Module-level memoized singleton.
  const [materialYouPalette, setMaterialYouPalette] = useState<MaterialYouPalette | null>(
    () => resolveMaterialYouPalette(),
  );
  // A wallpaper change only surfaces when the app comes back to the foreground:
  // re-run the guarded resolve + validate, compare with the current palette
  // (65 short strings - stringify is cheap) and adopt the new one only when it
  // really differs, so nothing re-renders and the theme never re-applies for a
  // no-op foreground. When 'materialyou' is not the active theme the listener
  // is not even registered, so the refresh path can never reach the theme memo.
  useEffect(() => {
    if (settings.colorTheme !== 'materialyou') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const next = refreshMaterialYouPalette();
      if (next === null) return; // resolve failed - keep whatever is on screen
      if (JSON.stringify(next) === JSON.stringify(materialYouPalette)) return; // wallpaper unchanged
      setMaterialYouPalette(next);
    });
    return () => subscription.remove();
  }, [settings.colorTheme, materialYouPalette]);
  // Android static app shortcuts (long-press app icon) deep-link in via
  // muweather://radar | search | favorites | compare, the journal card via
  // muweather://journal, and the 4x2 widget's hour cells
  // via muweather://hour/<ISO>. Registered only in real builds - Expo Go
  // cannot receive launcher shortcut or widget-click intents.
  const [hourFocus, setHourFocus] = useState<HourFocusTarget | null>(null);
  const hourFocusSeq = useRef(0);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const journalWrapRef = useRef<View>(null);
  // Best-effort scroll-to-card for muweather://journal: measure the card
  // against the scroller and bring it into view (silent no-op when the
  // journal tile is hidden or the native measure fails).
  const scrollToJournal = () => {
    const view = journalWrapRef.current;
    const scroller = scrollRef.current;
    if (!view || !scroller) return;
    const node = findNodeHandle(scroller);
    if (node === null) return;
    view.measureLayout(
      node,
      (_x, y) => {
        scroller.scrollTo({ y: Math.max(0, y - 96), animated: true });
      },
      () => {},
    );
  };
  useEffect(() => {
    const openShortcut = (url: string | null) => {
      if (!url) return;
      const { path, hostname } = Linking.parse(url);
      if (hostname === 'hour' && typeof path === 'string' && path.length > 0) {
        const raw = path.replace(/^\//, '');
        // Parsers disagree on whether the ISO colon survives - accept both.
        const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)
          ? raw
          : (() => {
              try {
                const decoded = decodeURIComponent(raw);
                return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(decoded) ? decoded : null;
              } catch {
                return null;
              }
            })();
        if (time) {
          hourFocusSeq.current += 1;
          setHourFocus({ time, seq: hourFocusSeq.current });
        }
        return;
      }
      const target = path ?? hostname;
      if (target === 'radar') setRadarOpen(true);
      else if (target === 'search') setSearchOpen(true);
      else if (target === 'favorites') setFavoritesOpen(true);
      else if (target === 'compare') setCompareOpen(true);
      else if (target === 'journal') scrollToJournal();
      // Widget rows deep-link into a tile's screen: muweather://tile/<key>.
      else if (hostname === 'tile' && typeof path === 'string') {
        const key = path.replace(/^\//, '');
        // Only real deep-dive topics, so a stale widget build cannot open
        // something the home screen does not have.
        if ((TOPIC_KEYS as readonly string[]).includes(key)) {
          setDetailTopic(key as TopicKey);
        }
      }
    };
    Linking.getInitialURL().then(openShortcut).catch(() => {});
    const subscription = Linking.addEventListener('url', (event) => openShortcut(event.url));
    return () => subscription.remove();
  }, []);
  // The condition drives the optional weather-tinted accent below, so it has to
  // be read before the theme memo.
  const { condition, conditionLabel } = weatherThemeResult;
  const theme = useMemo(
    () =>
      applyWeatherAccent(
        applyDensity(
          applyColorTheme(
            applyHomeBackground(
              weatherThemeResult.theme,
              settings.homeBackground,
              settings.styleMode,
            ),
            settings.colorTheme,
            settings.styleMode,
            materialYouPalette,
          ),
          settings.layoutDensity,
        ),
        // Material You is deliberately left alone: the wallpaper palette is
        // already dynamic and stays authoritative there.
        settings.weatherAccentEnabled && settings.colorTheme !== 'materialyou',
        condition,
      ),
    [
      weatherThemeResult.theme,
      settings.homeBackground,
      settings.colorTheme,
      settings.styleMode,
      settings.layoutDensity,
      settings.weatherAccentEnabled,
      condition,
      materialYouPalette,
    ],
  );
  const alertState = useAlerts(weather.data, FEATURES.backgroundAlerts && settings.backgroundAlerts);
  const forecastSourceLabel = t('src_forecast');
  const officialSourceLabel = t('card_warnings');
  const observationSourceLabel = t('provider_current_observation');
  const currentImpacts = useMemo(() => {
    const freshness = weather.data
      ? assessWeatherCacheFreshness({
          snapshotLocationId: weatherLocationKey(
            weather.data.location.latitude,
            weather.data.location.longitude,
          ),
          currentLocationId: weatherLocationKey(active?.latitude, active?.longitude),
          fetchedAt: weather.data.fetchedAt,
          now: planningNow,
        })
      : null;
    const officialLocationMatches = meteoAlarm.locationKey === weatherLocationKey(
      active?.latitude,
      active?.longitude,
    );
    return buildCurrentImpactTimeline(
      freshness?.alertsMayBeTreatedAsCurrent ? alertState.activeAlerts : [],
      officialLocationMatches ? meteoAlarm.warnings ?? [] : [],
      weather.data?.fetchedAt ?? null,
      meteoAlarm.updatedAt,
      planningNow,
      {
        forecast: forecastSourceLabel,
        official: officialSourceLabel,
        observation: observationSourceLabel,
      },
    );
  }, [
    active?.latitude,
    active?.longitude,
    alertState.activeAlerts,
    meteoAlarm.locationKey,
    meteoAlarm.updatedAt,
    meteoAlarm.warnings,
    planningNow,
    forecastSourceLabel,
    officialSourceLabel,
    observationSourceLabel,
    weather.data,
  ]);
  const providerStatus = useProviderStatus(
    active,
    weather.data?.current.temperature ?? null,
  );
  const providerCheck = providerStatus.check;
  const yearAgo = useYearAgo(active);
  // Year in review: on-device stats fed by the past-days archive fetch.
  const yearReview = useYearReview(active);
  // Record breakers: one ranged archive fetch, cached for a day.
  const records = useRecords(active);
  useDigest(settings.digestEnabled, settings.digestHour, weather.data, ensemble.spread);
  useGoldenHour(settings.goldenHourEnabled, weather.data);
  useRainAlert(settings.rainAlertEnabled, weather.data);
  // Sunrise alarm: OS date triggers, re-queued whenever the city or lead time
  // changes (and once per app start, so a few days stay covered).
  useSunriseAlarm(settings.sunriseAlarmEnabled, settings.sunriseAlarmOffsetMin, active);
  // Rain status notification: one updating entry while rain is here or coming.
  useRainOngoing(settings.rainOngoingEnabled, weather.data);
  // Digest notification's "Read my forecast" action: register the category in
  // the app language, and keep the spoken-forecast source fresh so a tap on
  // the action can speak the current forecast.
  useEffect(() => {
    void registerDigestReadAction();
  }, [settings.language]);
  useEffect(() => {
    const data = weather.data;
    if (!data || !active) {
      setSpokenDigestSource(null);
      return;
    }
    const today = data.daily[0] ?? null;
    setSpokenDigestSource({
      city: active.name,
      condition: conditionLabel,
      temperature: formatTemp(data.current.temperature),
      feelsLike: formatTemp(data.current.apparentTemperature),
      high: today ? formatTemp(today.tMax) : undefined,
      low: today ? formatTemp(today.tMin) : undefined,
      rain: today ? `${Math.round(today.precipProbabilityMax)}%` : undefined,
    });
  }, [weather.data, active, conditionLabel, settings.tempUnit]);
  const calendarWeather = useCalendarWeather(
    FEATURES.calendarWeather && calendarEnabled,
    weather.data?.daily ?? [],
  );
  const marine = useMarine(FEATURES.marineForecast ? active : null);
  // ── bot2: aurora + alerts + wear ──
  const aurora = useAurora(FEATURES.aurora ? active : null);
  const comparison = useCityComparison(
    FEATURES.cityComparison ? favoritesState.favorites : [],
    compareOpen,
  );
  const modelComparison = useModelComparison(
    FEATURES.modelComparison ? active : null,
    modelsOpen,
  );
  // Per-model accuracy: one multi-model sweep every six hours (TTL-gated) that
  // feeds the model leaderboard in the past-days accuracy view. Renders nothing.
  useModelAccuracyLog(active, FEATURES.modelComparison);
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const nowcast = useMemo(
    () => computeNowcast(weather.data?.minutely ?? []),
    [weather.data],
  );
  const showSection = (key: string) => !(settings.hiddenTiles ?? []).includes(key);
  const highlights = useMemo(
    () => (weather.data ? computeHighlights(weather.data, nowcast) : []),
    [weather.data, nowcast],
  );
  // ── bot2: aurora + alerts + wear ──
  const outdoorPlan = useMemo(
    () =>
      FEATURES.bestWindow && weather.data
        ? planOutdoorWeather(
            weather.data,
            effectiveOutdoorPreferences(settings.outdoorPreferences),
            settings.aqiScale,
            { now: planningNow },
          )
        : null,
    [weather.data, settings.outdoorPreferences, settings.aqiScale, planningNow],
  );
  const bestWindow = outdoorPlan?.windows[0] ?? null;
  const recommendedWindowKey = bestWindow
    ? outdoorWindowFeedbackKey(bestWindow.startAt, bestWindow.endAt)
    : null;
  const outdoorFeedbackScope = weather.data
    ? weatherLocationKey(weather.data.location.latitude, weather.data.location.longitude)
    : null;
  const outdoorWindowFeedback = useOutdoorWindowFeedback(outdoorFeedbackScope, recommendedWindowKey);
  const bestWindowLabel = bestWindow && weather.data
    ? bestWindowLine({
        start: forecastLocalIso(bestWindow.startAt, weather.data.utcOffsetSeconds),
        end: forecastLocalIso(bestWindow.endAt, weather.data.utcOffsetSeconds),
        score: bestWindow.score,
      })
    : null;
  const adjustOutdoorPreference = useCallback((key: OutdoorPreferenceControlKey, delta: number) => {
    updateSettings({
      outdoorPreferences: stepOutdoorPreference(settings.outdoorPreferences, key, delta),
    });
  }, [settings.outdoorPreferences, updateSettings]);
  const applyJournalOutdoorSuggestion = useCallback((offsetC: number) => {
    updateSettings({
      outdoorPreferences: {
        ...settings.outdoorPreferences,
        journalTemperatureOffsetC: offsetC,
      },
    });
  }, [settings.outdoorPreferences, updateSettings]);
  const resetJournalOutdoorSuggestion = useCallback(() => {
    updateSettings({
      outdoorPreferences: {
        ...settings.outdoorPreferences,
        journalTemperatureOffsetC: 0,
      },
    });
  }, [settings.outdoorPreferences, updateSettings]);
  const wearLine = useMemo(
    () =>
      weather.data
        ? computeWearLine(weather.data.current, weather.data.daily[0] ?? null, comfort.calibration)
        : null,
    [weather.data, comfort.calibration],
  );
  const commentary = useMemo(
    () => (settings.snarkMode && weather.data ? getSnarkComment(weather.data) : null),
    [settings.snarkMode, weather.data],
  );
  const particles = useMemo(() => {
    if (!FEATURES.particleOverlay || !weather.data) return null;
    const raining = ['rain', 'showers', 'drizzle', 'thunder'].includes(condition);
    const snowing = ['snow', 'freezing'].includes(condition);
    if (!raining && !snowing) return null;
    const intensity = Math.min(
      1,
      Math.max(
        weather.data.current.precipitation / 2,
        (weather.data.hourly[0]?.precipProbability ?? 0) / 100,
        0.35,
      ),
    );
    return { kind: (snowing ? 'snow' : 'rain') as 'rain' | 'snow', intensity };
  }, [weather.data, condition]);
  const shareCardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const shareWeather = useCallback(async () => {
    if (!weather.data || sharing) return;
    haptics.light();
    setSharing(true);
    try {
      const uri = await captureRef(shareCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: t('share_dialog_title'),
        });
      }
    } catch {
      // Capture or share failed silently - non-critical action.
    } finally {
      setSharing(false);
    }
  }, [weather.data, sharing]);

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

  const handlePressDay = useCallback((day: DayPoint, index: number) => {
    setDayDetail({ day, index });
  }, []);

  const refreshing = weather.status === 'refreshing';

  // Chapter headers appear only when a section inside the chapter will render.
  // Each test repeats the flag and tile checks of the sections it groups.
  const chapterNow =
    showSection('highlights') ||
    showSection('journal') ||
    showSection('nowcast') ||
    (FEATURES.meteoalarm && showSection('warnings'));
  const chapterToday =
    showSection('rainChart') || showSection('hourly') || (FEATURES.trendChart && showSection('trend'));
  const chapterWeek =
    showSection('daily') || showSection('pastWeek') || (FEATURES.climate && showSection('climate'));
  const chapterPlan =
    (FEATURES.bestWindow && showSection('bestWindow') && !!bestWindow && !!bestWindowLabel) ||
    (FEATURES.activityPlanner && showSection('activity')) ||
    showSection('tripPlanner') ||
    (FEATURES.marineForecast && showSection('marine')) ||
    (FEATURES.calendarWeather && showSection('calendar'));
  const chapterInsights =
    showSection('yearReview') ||
    showSection('records') ||
    (FEATURES.onThisDay && showSection('onThisDay')) ||
    (FEATURES.aurora && showSection('aurora')) ||
    (FEATURES.modelComparison && showSection('models'));

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
      <AnimatedBackground
        gradient={theme.gradient}
        particles={particles}
        condition={condition}
        isDay={weatherThemeResult.isDay}
        animated={settings.skyMotion}
      />
      <StatusBar style={theme.isLight ? 'dark' : 'light'} />

      {active ? (
        <ScrollYProvider value={scrollY}>
        <Animated.ScrollView
          ref={scrollRef}
          stickyHeaderIndices={[0]}
          contentContainerStyle={[
            styles.content,
            theme.density === 'compact' && styles.contentCompact,
            { paddingBottom: insets.bottom + 32 },
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
          <View style={[styles.header, { paddingTop: insets.top + 8, marginHorizontal: -16, paddingHorizontal: 16 }]}>
            <HeaderBackdrop color={theme.gradient[0]} />
            <Surface theme={theme} style={styles.iconButton}>
              <Pressable
                onPress={() => {
                  haptics.select();
                  setMapOpen(true);
                }}
                style={({ pressed }) => [styles.iconButtonInner, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={t('a11y_open_map')}
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
                accessibilityRole="button"
                accessibilityLabel={active.name}
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
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y_open_alerts')}
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
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y_open_search')}
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
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y_open_settings')}
                >
                  <SettingsIcon size={20} color={theme.textPrimary} strokeWidth={2.2} />
                </Pressable>
              </Surface>
            </View>
          </View>

          <OfflineBanner
            theme={theme}
            fetchedAt={weather.data?.fetchedAt ?? null}
            snapshotLocationId={weatherLocationKey(
              weather.data?.location.latitude,
              weather.data?.location.longitude,
            )}
            currentLocationId={weatherLocationKey(active?.latitude, active?.longitude)}
            offline={weather.offline}
            onRetry={() => {
              haptics.light();
              weather.refresh();
            }}
          />

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
              title={t('err_weather')}
              message={weather.errorMessage ?? t('err_generic')}
              actionLabel={t('err_retry')}
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
                        accessibilityRole="button"
                        accessibilityLabel={`${alert.title}. ${alert.message}`}
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
                  commentary={commentary}
                  onShare={() => {
                    void shareWeather();
                  }}
                  sharing={sharing}
                />
              </Reveal>

              {/* ── bot2: aurora + alerts + wear ── */}
              {wearLine ? (
                <Reveal delay={20}>
                  <Text style={[styles.wearLine, { color: theme.textSecondary }]}>
                    {wearLine.text}
                  </Text>
                </Reveal>
              ) : null}

              {chapterNow ? (
                <Reveal delay={40}>
                  <ChapterHeader theme={theme} title={t('chapter_now')} />
                </Reveal>
              ) : null}

              {showSection('highlights') ? (
                <Reveal delay={60}>
                  <HighlightsCard theme={theme} highlights={highlights} />
                </Reveal>
              ) : null}

              {/* Weather journal: "How did today feel?" - only prompts for today,
                  and its answer calibrates the wear line above. */}
              {showSection('journal') ? (
                <View ref={journalWrapRef} collapsable={false}>
                  <ComfortJournalCard
                    theme={theme}
                    today={comfort.today}
                    total={comfort.total}
                    onRate={(rating) => {
                      const data = weather.data;
                      comfort.rate(rating, {
                        tApparent: data ? data.current.apparentTemperature : null,
                        humidity: data ? data.current.humidity : null,
                        wind: data ? data.current.windSpeed : null,
                        tMax: data && data.daily[0] ? data.daily[0].tMax : (data ? data.current.temperature : 0),
                        tMin: data && data.daily[0] ? data.daily[0].tMin : (data ? data.current.temperature : 0),
                      });
                    }}
                    revealDelay={100}
                  />
                </View>
              ) : null}

              {showSection('nowcast') ? (
                <Reveal delay={80}>
                  <NowcastCard
                    theme={theme}
                    minutely={weather.data.minutely}
                    nowcast={nowcast}
                  />
                </Reveal>
              ) : null}

              {FEATURES.meteoalarm && showSection('warnings') ? (
                <Reveal delay={156}>
                  <WarningsCard
                    theme={theme}
                    warnings={meteoAlarm.warnings}
                    status={meteoAlarm.status}
                    updatedAt={meteoAlarm.updatedAt}
                    now={planningNow}
                  />
                </Reveal>
              ) : null}
              {showSection('warnings') && weather.data ? (
                <Reveal delay={158}>
                  <ProviderStatusCard
                    theme={theme}
                    weather={weather.data}
                    ensemble={ensemble}
                    officialWarnings={meteoAlarm}
                    secondaryProvider={providerCheck}
                    now={planningNow}
                  />
                </Reveal>
              ) : null}

              {chapterToday ? (
                <Reveal delay={40}>
                  <ChapterHeader theme={theme} title={t('chapter_today')} />
                </Reveal>
              ) : null}

              {showSection('rainChart') ? (
                <Reveal delay={100} wipe>
                  <Card theme={theme} title={t('card_rain')}>
                    <RainProbabilityChart
                      theme={theme}
                      hours={weather.data.hourly}
                      calibration={forecastCalibration.rain}
                      rainEpisodes={ensemble.spread ? ensemble.spread.rainEpisodes ?? [] : null}
                      ensemblePoints={ensemble.spread?.points ?? null}
                      ensembleFetchedAt={ensemble.spread?.fetchedAt ?? null}
                      now={planningNow}
                    />
                  </Card>
                </Reveal>
              ) : null}

              {showSection('hourly') ? (
                <Reveal delay={170} wipe>
                  <HourlyForecast theme={theme} hours={weather.data.hourly} focus={hourFocus} />
                </Reveal>
              ) : null}

              {FEATURES.trendChart && showSection('trend') ? (
                <>
                  <Reveal delay={140} wipe>
                    <TrendChart theme={theme} hours={weather.data.hourly} ensemble={ensemble.spread?.points ?? null} />
                  </Reveal>
                  <Reveal delay={165}>
                    <EnsembleCalibrationCard theme={theme} summary={forecastCalibration.ensemble} />
                  </Reveal>
                </>
              ) : null}

              {chapterWeek ? (
                <Reveal delay={40}>
                  <ChapterHeader theme={theme} title={t('chapter_week')} />
                </Reveal>
              ) : null}

              {showSection('daily') ? (
                <Reveal delay={120}>
                  <SectionTitle theme={theme}>{t('sec_daily')}</SectionTitle>
                  <DailyForecast
                    theme={theme}
                    days={weather.data.daily}
                    onPressDay={handlePressDay}
                  />
                </Reveal>
              ) : null}

              {showSection('pastWeek') ? (
                <Reveal delay={150}>
                  <PastWeekCard
                    theme={theme}
                    days={pastDays.days}
                    location={active}
                    pastDaysRange={settings.pastDaysRange}
                    onRangeChange={(range) => updateSettings({ pastDaysRange: range })}
                  />
                </Reveal>
              ) : null}

              {FEATURES.climate && showSection('climate') ? (
                <Reveal delay={152}>
                  <ClimateCard
                    theme={theme}
                    months={climateNormals.months}
                    status={climateNormals.status}
                    todayTMax={weather.data.daily[0]?.tMax ?? null}
                  />
                </Reveal>
              ) : null}

              {chapterPlan ? (
                <Reveal delay={40}>
                  <ChapterHeader theme={theme} title={t('chapter_plan')} />
                </Reveal>
              ) : null}

              {/* ── bot2: aurora + alerts + wear ── */}
              {FEATURES.bestWindow && showSection('bestWindow') && bestWindow && bestWindowLabel ? (
                <Reveal delay={210}>
                  <BestWindowCard
                    theme={theme}
                    line={bestWindowLabel}
                    score={bestWindow.score}
                    reasons={bestWindow.reasons}
                    preferences={effectiveOutdoorPreferences(settings.outdoorPreferences)}
                    onPreferenceStep={adjustOutdoorPreference}
                    windowFeedback={outdoorWindowFeedback.vote}
                    windowFeedbackTrend={outdoorWindowFeedback.trend}
                    onWindowFeedback={(vote) => {
                      haptics.select();
                      outdoorWindowFeedback.submit(vote);
                    }}
                    journalSamples={comfort.total}
                    journalSuggestionSamples={comfort.calibration?.samples ?? comfort.total}
                    journalSuggestionOffsetC={comfort.calibration?.offsetC ?? null}
                    journalAppliedOffsetC={settings.outdoorPreferences.journalTemperatureOffsetC ?? 0}
                    onApplyJournalSuggestion={applyJournalOutdoorSuggestion}
                    onResetJournalSuggestion={resetJournalOutdoorSuggestion}
                  />
                </Reveal>
              ) : null}

              {FEATURES.activityPlanner && showSection('activity') ? (
                <Reveal delay={160}>
                  <ActivityCard theme={theme} data={weather.data} />
                </Reveal>
              ) : null}

              {showSection('tripPlanner') ? (
                <Reveal delay={165}>
                  <TripPlannerCard
                    theme={theme}
                    favorites={favoritesState.favorites}
                    outdoorPreferences={settings.outdoorPreferences}
                    onOpenFavorites={() => setFavoritesOpen(true)}
                  />
                </Reveal>
              ) : null}

              {FEATURES.marineForecast && showSection('marine') ? (
                <Reveal delay={200}>
                  <MarineCard theme={theme} state={marine} />
                </Reveal>
              ) : null}

              {FEATURES.calendarWeather && showSection('calendar') ? (
                <Reveal delay={180}>
                  <CalendarCard
                    theme={theme}
                    state={calendarWeather}
                    onEnable={() => setCalendarEnabled(true)}
                  />
                </Reveal>
              ) : null}

              {chapterInsights ? (
                <Reveal delay={40}>
                  <ChapterHeader theme={theme} title={t('chapter_insights')} />
                </Reveal>
              ) : null}

              {showSection('yearReview') ? (
                <YearReviewCard theme={theme} rows={yearReview.rows} revealDelay={140} />
              ) : null}

              {showSection('records') ? (
                <RecordCard theme={theme} records={records.records} revealDelay={180} />
              ) : null}

              {FEATURES.onThisDay && showSection('onThisDay') ? (
                <Reveal delay={154}>
                  <OnThisDayCard
                    theme={theme}
                    years={onThisDay.years}
                    status={onThisDay.status}
                    onExplore={() => setHistoryOpen(true)}
                  />
                </Reveal>
              ) : null}

              {FEATURES.aurora && showSection('aurora') ? (
                <Reveal delay={220}>
                  <AuroraCard
                    theme={theme}
                    forecast={aurora.forecast}
                    latitude={active?.latitude ?? null}
                    extras={aurora.extras}
                  />
                </Reveal>
              ) : null}

              {FEATURES.modelComparison && showSection('models') ? (
                <Reveal delay={205}>
                  <Card
                    theme={theme}
                    title={t('mc_title')}
                    icon={Database}
                    onPress={() => setModelsOpen(true)}
                  >
                    <Text style={[styles.credit, { color: theme.textTertiary }]}>
                      {t('mc_caption')}
                    </Text>
                  </Card>
                </Reveal>
              ) : null}

              <Reveal delay={160}>
                <ChapterHeader theme={theme} title={t('sec_details')} />
                <DetailCards
                  theme={theme}
                  current={weather.data.current}
                  today={weather.data.daily[0] ?? null}
                  aqi={weather.data.aqi}
                  aqiScale={settings.aqiScale}
                  utcOffsetSeconds={weather.data.utcOffsetSeconds}
                  location={active}
                  yearAgo={yearAgo}
                  hourly={weather.data.hourly}
                  hourlyAll={weather.data.hourlyAll}
                  elevation={weather.data.elevation}
                  hiddenTiles={settings.hiddenTiles}
                  onOpenTopic={
                    FEATURES.tileDetails
                      ? (topic) => {
                          haptics.select();
                          setDetailTopic(topic as TopicKey);
                        }
                      : undefined
                  }
                />
              </Reveal>

              <Reveal delay={100}>
                <View style={styles.footerRow}>
                  <Text style={[styles.credit, { color: theme.textTertiary }]}>
                    Updated{' '}
                    {new Date(weather.data.fetchedAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
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
            title={t('err_welcome')}
            message={
              locationError ??
              t('err_welcome_msg')
            }
            variant="empty"
          />
          <Pressable
            onPress={() => setSearchOpen(true)}
            accessibilityRole="button"
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

      {weather.data ? (
        <ShareCard
          theme={theme}
          data={weather.data}
          conditionLabel={conditionLabel}
          cardRef={shareCardRef}
        />
      ) : null}

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
        accuracyHistory={providerStatus.history}
      />

      <AlertsScreen
        theme={theme}
        visible={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        settings={alertState.settings}
        onToggle={alertState.toggleAlert}
        onUpdateQuiet={alertState.updateQuietHours}
        onUpdateFavoriteRefreshInterval={alertState.updateFavoriteRefreshInterval}
        ready={alertState.ready}
        currentImpacts={currentImpacts}
        feedbackScope={weatherLocationKey(active?.latitude, active?.longitude) ?? 'current-location'}
      />

      <MapScreen
        theme={theme}
        location={active ?? { id: 'current', name: 'World', latitude: 20, longitude: 0 }}
        visible={mapOpen}
        onClose={() => setMapOpen(false)}
        onOpenRadar={() => {
          setMapOpen(false);
          setRadarOpen(true);
        }}
      />

      <RadarScreen
        theme={theme}
        location={active ?? { id: 'current', name: 'World', latitude: 20, longitude: 0 }}
        visible={radarOpen}
        onClose={() => setRadarOpen(false)}
        onOpenLayers={() => {
          setRadarOpen(false);
          setMapOpen(true);
        }}
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
        onCompare={() => {
          setFavoritesOpen(false);
          setCompareOpen(true);
        }}
      />

      <CompareScreen
        theme={theme}
        visible={compareOpen}
        onClose={() => setCompareOpen(false)}
        entries={comparison.results}
        status={comparison.status}
        favorites={favoritesState.favorites}
        onRetry={comparison.reload}
      />

      <ModelComparisonScreen
        theme={theme}
        visible={modelsOpen}
        onClose={() => setModelsOpen(false)}
        results={modelComparison.results}
        status={modelComparison.status}
      />

      <TileDetailScreen
        theme={theme}
        topic={detailTopic}
        data={weather.data}
        visible={detailTopic !== null && weather.data !== null}
        animStyle={settings.detailAnimation}
        aqiScale={settings.aqiScale}
        onAqiScaleChange={(scale) => updateSettings({ aqiScale: scale })}
        pastDays={pastDays.days}
        onClose={() => setDetailTopic(null)}
      />

      <DayDetailScreen
        theme={theme}
        day={dayDetail?.day ?? null}
        index={dayDetail?.index ?? 0}
        hours={
          dayDetail && weather.data
            ? weather.data.hourlyAll.filter((hour) => hour.time.startsWith(dayDetail.day.date))
            : []
        }
        ensemble={
          dayDetail && ensemble.spread
            ? ensemble.spread.points.filter((point) => point.time.startsWith(dayDetail.day.date))
            : null
        }
        visible={dayDetail !== null && weather.data !== null}
        animStyle={settings.detailAnimation}
        onClose={() => setDayDetail(null)}
      />

      <HistoricalExplorerScreen
        theme={theme}
        visible={historyOpen && active !== null}
        animStyle={settings.detailAnimation}
        latitude={active?.latitude ?? null}
        longitude={active?.longitude ?? null}
        todayTMax={weather.data?.daily[0]?.tMax ?? null}
        normals={climateNormals.months}
        onClose={() => setHistoryOpen(false)}
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
  contentCompact: {
    gap: 16,
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
    fontFamily: F.semibold,
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
    fontFamily: F.medium,
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
    fontFamily: F.bold,
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
  // ── bot2: aurora + alerts + wear ──
  wearLine: {
    textAlign: 'center',
    fontSize: 12.5,
    fontFamily: F.medium,
    marginTop: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
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
    fontFamily: F.semibold,
  },
});
