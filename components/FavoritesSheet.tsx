import React from 'react';
import { F } from '../theme/typography';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Overlay } from './Overlay';
import { ErrorState } from './ErrorState';
import { haptics } from '../utils/haptics';
import { formatLocationSubtitle } from '../api/openMeteo';
import type { AppTheme } from '../theme/palettes';
import type { GeoLocation } from '../api/types';

interface FavoritesSheetProps {
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  onSelect: (location: GeoLocation) => void;
  favorites: GeoLocation[];
  onRemove: (id: string) => void;
  ready: boolean;
  onCompare: () => void;
}

export function FavoritesSheet({
  theme,
  visible,
  onClose,
  onSelect,
  favorites,
  onRemove,
  ready,
  onCompare,
}: FavoritesSheetProps) {
  const inputColor = theme.isLight ? '#1C2431' : '#FFFFFF';

  return (
    <Overlay theme={theme} visible={visible} onClose={onClose} panelStyle="bottom">
      <View style={styles.grabberWrap}>
        <View style={[styles.grabber, { backgroundColor: theme.textTertiary }]} />
      </View>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: inputColor, flex: 1 }]}>Saved cities</Text>
        {ready && favorites.length >= 2 ? (
          <Pressable
            onPress={() => {
              haptics.select();
              onCompare();
            }}
            style={({ pressed }) => [
              styles.compareButton,
              { backgroundColor: theme.chipBg },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.compareButtonText, { color: theme.textPrimary }]}>
              Compare
            </Text>
          </Pressable>
        ) : null}
      </View>

      {!ready ? null : favorites.length === 0 ? (
        <ErrorState
          theme={theme}
          title="No saved cities yet"
          message="Search for a city and tap the star to keep it here for quick access."
          variant="empty"
        />
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.rowWrapper}>
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed
                      ? theme.isLight
                        ? 'rgba(20,28,44,0.06)'
                        : 'rgba(255,255,255,0.08)'
                      : 'transparent',
                  },
                ]}
                onPress={() => onSelect(item)}
              >
                <MapPin size={18} color={theme.textSecondary} strokeWidth={2} />
                <View style={styles.rowTexts}>
                  <Text style={[styles.rowTitle, { color: inputColor }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]} numberOfLines={1}>
                    {formatLocationSubtitle(item) || 'Saved location'}
                  </Text>
                </View>
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    haptics.warning();
                    onRemove(item.id);
                  }}
                  style={styles.iconButton}
                >
                  <Star size={20} color="#F5C04E" fill="#F5C04E" strokeWidth={2} />
                </Pressable>
                <ChevronRight size={18} color={theme.textTertiary} strokeWidth={2.2} />
              </Pressable>
            </View>
          )}
        />
      )}
    </Overlay>
  );
}

const styles = StyleSheet.create({
  grabberWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
  },
  title: {
    fontSize: 21,
    fontFamily: F.bold,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
  },
  compareButton: {
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  compareButtonText: {
    fontSize: 13.5,
    fontFamily: F.semibold,
  },
  listContent: {
    paddingBottom: 36,
  },
  rowWrapper: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowTexts: {
    flex: 1,
    gap: 1,
  },
  rowTitle: {
    fontSize: 15.5,
    fontFamily: F.semibold,
  },
  rowSubtitle: {
    fontSize: 13,
  },
  iconButton: {
    padding: 4,
  },
});
