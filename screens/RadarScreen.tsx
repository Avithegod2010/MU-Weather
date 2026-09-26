import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Layers, Pause, Play, TriangleAlert } from '../utils/uiIcons';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { useRadarFrames } from '../hooks/useRadarFrames';
import {
  BASE_TILE_URL,
  RADAR_ATTRIBUTION,
  RADAR_MAX_ZOOM,
  RADAR_TILE_SIZE,
  radarTileUrl,
  type RadarFrame,
} from '../utils/radar';
import { RadarTileMap } from '../components/RadarTileMap';
import { haptics } from '../utils/haptics';
import { t } from '../utils/i18n';
import { F } from '../theme/typography';
import type { AppTheme } from '../theme/palettes';
import type { GeoLocation } from '../api/types';

/** Milliseconds per frame while the loop plays. */
const FRAME_INTERVAL_MS = 650;

interface RadarScreenProps {
  theme: AppTheme;
  location: GeoLocation;
  visible: boolean;
  onClose: () => void;
  /** Switch to the full multi-layer map (Windy) - also the fallback path. */
  onOpenLayers: () => void;
}

/** "-45 min ago" / "in 20 min" / "Now", relative to the newest observed frame. */
function frameLabel(frame: RadarFrame, nowTime: number): string {
  const minutes = Math.round((frame.time - nowTime) / 60);
  if (minutes >= -5 && minutes <= 5) return t('radar_now');
  if (minutes < 0) return t('radar_min_ago').split('{n}').join(String(Math.abs(minutes)));
  return t('radar_min_ahead').split('{n}').join(String(minutes));
}

/**
 * Animated rain radar for the active location: the last two hours of RainViewer
 * frames plus any nowcast tail, played back on a loop over a scrubbable
 * timeline. The map is drawn by the built-in keyless tile renderer
 * (components/RadarTileMap) - CARTO and RainViewer raster tiles over
 * Web-Mercator math - so no native map SDK, Google Maps API key, or billing
 * account is involved.
 */
export function RadarScreen({ theme, location, visible, onClose, onOpenLayers }: RadarScreenProps) {
  const insets = useSafeAreaInsets();
  const { status, frameSet, reload } = useRadarFrames(visible);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [trackWidth, setTrackWidth] = useState(0);

  const frames = frameSet?.frames ?? [];
  const frameCount = frames.length;
  const nowTime =
    frameSet && frameSet.frames[frameSet.nowIndex] ? frameSet.frames[frameSet.nowIndex].time : 0;
  const frame = frameCount > 0 ? frames[Math.min(frameIndex, frameCount - 1)] : null;

  // Open on the newest observed frame whenever a fresh set arrives.
  useEffect(() => {
    if (frameSet) setFrameIndex(frameSet.nowIndex);
  }, [frameSet]);

  useEffect(() => {
    if (!visible || !playing || frameCount <= 1) return;
    const timer = setInterval(() => {
      setFrameIndex((index) => (index + 1) % frameCount);
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [visible, playing, frameCount]);

  if (!visible) return null;

  const scrubTo = (x: number) => {
    if (trackWidth <= 0 || frameCount <= 1) return;
    const ratio = Math.max(0, Math.min(1, x / trackWidth));
    setPlaying(false);
    setFrameIndex(Math.min(frameCount - 1, Math.round(ratio * (frameCount - 1))));
  };

  const headerButtonStyle = ({ pressed }: { pressed: boolean }) => [
    styles.headerButton,
    { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
    pressed && { opacity: 0.7 },
  ];

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
            <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>{t('radar_eyebrow')}</Text>
          </View>
          <Text style={[styles.cityName, { color: theme.textPrimary }]} numberOfLines={1}>
            {location.name}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <Pressable
            onPress={() => {
              haptics.select();
              onOpenLayers();
            }}
            style={headerButtonStyle}
            accessibilityRole="button"
            accessibilityLabel={t('radar_open_layers')}
          >
            <Layers size={20} color={theme.textPrimary} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            onPress={() => {
              haptics.select();
              onClose();
            }}
            style={headerButtonStyle}
            accessibilityRole="button"
            accessibilityLabel={t('a11y_back')}
          >
            <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.mapWrap, { borderColor: theme.cardBorder }]}>
        <RadarTileMap
          theme={theme}
          latitude={location.latitude}
          longitude={location.longitude}
          baseUrlTemplate={BASE_TILE_URL}
          radarUrlTemplate={frameSet && frame ? radarTileUrl(frameSet.host, frame) : null}
          tileSize={RADAR_TILE_SIZE}
          maxZoom={RADAR_MAX_ZOOM}
        />

        <Text pointerEvents="none" style={[styles.attribution, { color: theme.textTertiary }]}>
          {RADAR_ATTRIBUTION}
        </Text>

        {status === 'loading' ? (
          <View style={styles.stateOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        ) : null}

        {status === 'error' ? (
          <View style={styles.stateOverlay}>
            <TriangleAlert size={26} color={theme.textSecondary} strokeWidth={2.1} />
            <Text style={[styles.stateText, { color: theme.textSecondary }]}>
              {t('radar_error')}
            </Text>
            <Pressable
              onPress={() => {
                haptics.light();
                reload();
              }}
              style={({ pressed }) => [
                styles.stateButton,
                { backgroundColor: theme.chipBg },
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.stateButtonText, { color: theme.textPrimary }]}>
                {t('radar_retry')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={[styles.controls, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        <Pressable
          onPress={() => {
            haptics.light();
            setPlaying((value) => !value);
          }}
          style={({ pressed }) => [
            styles.playButton,
            { backgroundColor: theme.chipBg },
            pressed && { opacity: 0.75 },
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: playing }}
          accessibilityLabel={playing ? t('radar_pause') : t('radar_play')}
        >
          {playing ? (
            <Pause size={18} color={theme.textPrimary} strokeWidth={2.4} />
          ) : (
            <Play size={18} color={theme.textPrimary} strokeWidth={2.4} />
          )}
        </Pressable>

        <View style={styles.trackColumn}>
          <Pressable
            onPress={(event) => scrubTo(event.nativeEvent.locationX)}
            onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
            style={styles.trackHit}
            accessibilityRole="adjustable"
            accessibilityLabel={t('radar_title')}
            accessibilityValue={
              frameCount > 0
                ? { min: 1, max: frameCount, now: Math.min(frameIndex + 1, frameCount) }
                : undefined
            }
          >
            <View style={[styles.track, { backgroundColor: theme.chipBg }]}>
              <View
                style={[
                  styles.trackFill,
                  {
                    width: `${frameCount > 1 ? ((frameIndex + 1) / frameCount) * 100 : 0}%`,
                    backgroundColor: theme.accent,
                  },
                ]}
              />
            </View>
          </Pressable>
          <View style={styles.trackLabels}>
            <Text style={[styles.frameLabel, { color: theme.textPrimary }]} numberOfLines={1}>
              {frame ? frameLabel(frame, nowTime) : t('radar_title')}
            </Text>
            <Text style={[styles.frameCount, { color: theme.textTertiary }]} numberOfLines={1}>
              {frameCount > 0 ? `${Math.min(frameIndex + 1, frameCount)}/${frameCount}` : ''}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.caption, { color: theme.textTertiary }]}>{t('radar_caption')}</Text>
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
    gap: 14,
    zIndex: 45,
    elevation: 45,
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
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  headerButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 30,
    fontFamily: F.bold,
    letterSpacing: -0.5,
  },
  mapWrap: {
    flex: 1,
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#0B1220',
  },
  attribution: {
    position: 'absolute',
    left: 12,
    bottom: 8,
    fontSize: 9.5,
  },
  stateOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 26,
  },
  stateText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  stateButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  stateButtonText: {
    fontSize: 13.5,
    fontFamily: F.semibold,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  playButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackColumn: {
    flex: 1,
    gap: 6,
  },
  trackHit: {
    paddingVertical: 6,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: 6,
    borderRadius: 3,
  },
  trackLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  frameLabel: {
    fontSize: 12.5,
    fontFamily: F.semibold,
  },
  frameCount: {
    fontSize: 11.5,
    fontFamily: F.medium,
  },
  caption: {
    textAlign: 'center',
    fontSize: 11.5,
  },
});
