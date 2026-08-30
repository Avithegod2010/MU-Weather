import React from 'react';
import { t } from '../utils/i18n';
import { F } from '../theme/typography';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
import { useGeocoding } from '../hooks/useGeocoding';
import { haptics } from '../utils/haptics';
import { formatLocationSubtitle } from '../api/openMeteo';
import type { AppTheme } from '../theme/palettes';
import type { GeoLocation } from '../api/types';

interface SearchOverlayProps {
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  onSelect: (location: GeoLocation) => void;
  favorites: GeoLocation[];
  onToggleFavorite: (location: GeoLocation) => void;
  isFavorite: (id: string) => boolean;
}

export function SearchOverlay({
  theme,
  visible,
  onClose,
  onSelect,
  favorites,
  onToggleFavorite,
  isFavorite,
}: SearchOverlayProps) {
  const [query, setQuery] = React.useState('');
  const { results, searching, error } = useGeocoding(query);

  React.useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const surfaceBg = theme.isLight ? 'rgba(20,28,44,0.06)' : 'rgba(255,255,255,0.08)';
  const inputColor = theme.isLight ? '#1C2431' : '#FFFFFF';

  const renderRow = (item: GeoLocation, showStar: boolean) => {
    const fav = isFavorite(item.id);
    return (
      <View style={styles.rowWrapper}>
        <Pressable
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: pressed ? surfaceBg : 'transparent' },
          ]}
          onPress={() => onSelect(item)}
        >
          <MapPin size={18} color={theme.textSecondary} strokeWidth={2} />
          <View style={styles.rowTexts}>
            <Text style={[styles.rowTitle, { color: inputColor }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]} numberOfLines={1}>
              {formatLocationSubtitle(item) || 'Coordinates location'}
            </Text>
          </View>
          {showStar ? (
            <Pressable
              hitSlop={12}
              onPress={() => {
                if (fav) {
                  haptics.light();
                } else {
                  haptics.success();
                }
                onToggleFavorite(item);
              }}
              style={styles.starButton}
            >
              <Star
                size={20}
                color={fav ? '#F5C04E' : theme.textTertiary}
                fill={fav ? '#F5C04E' : 'transparent'}
                strokeWidth={2}
              />
            </Pressable>
          ) : null}
        </Pressable>
      </View>
    );
  };

  const emptyQuery = query.trim().length < 2;

  return (
    <Overlay theme={theme} visible={visible} onClose={onClose} panelStyle="top">
      <KeyboardAvoidingView behavior="height" style={styles.flexOne} enabled>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.backButton}>
            <ChevronLeft size={26} color={inputColor} strokeWidth={2.4} />
          </Pressable>
          <View style={[styles.inputWrap, { backgroundColor: surfaceBg }]}>
            <Search size={19} color={theme.textTertiary} strokeWidth={2.2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('search_placeholder')}
              placeholderTextColor={theme.textTertiary}
              style={[styles.input, { color: inputColor }]}
              autoFocus={visible}
              returnKeyType="search"
            />
            {searching ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : null}
          </View>
        </View>

        {error ? (
          <ErrorState
            theme={theme}
            title={t('search_unavailable')}
            message={error}
            variant="empty"
          />
        ) : emptyQuery && !favorites.length ? (
          <ErrorState
            theme={theme}
            title={t('search_find')}
            message={t('search_find_msg')}
            variant="empty"
          />
        ) : (
          <FlatList
            data={emptyQuery ? [] : results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              emptyQuery ? (
                <View style={styles.favoritesSection}>
                  <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>
                    {t('search_saved')}
                  </Text>
                  {favorites.map((fav) => (
                    <View key={fav.id}>{renderRow(fav, false)}</View>
                  ))}
                </View>
              ) : searching ? null : (
                <ErrorState
                  theme={theme}
                  title={t('search_none')}
                  message={t('search_none_msg').replace('{q}', query.trim())}
                  variant="empty"
                />
              )
            }
            renderItem={({ item }) => renderRow(item, true)}
          />
        )}
      </KeyboardAvoidingView>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
  },
  backButton: {
    padding: 6,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 999,
    paddingHorizontal: 16,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 15.5,
    paddingVertical: 0,
  },
  listContent: {
    paddingBottom: 40,
  },
  rowWrapper: {
    paddingHorizontal: 12,
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
  starButton: {
    padding: 6,
  },
  favoritesSection: {
    paddingTop: 8,
    paddingHorizontal: 12,
    gap: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: F.bold,
    letterSpacing: 1.6,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
});
