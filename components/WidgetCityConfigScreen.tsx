import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { F } from '../theme/typography';
import { t } from '../utils/i18n';
import { loadFavorites } from '../utils/favoritesStore';
import { loadWidgetCity, saveWidgetCity } from '../utils/widgetCityConfig';
import { loadCitySnapshot } from '../utils/citySnapshots';
import {
  renderCityWidgetFromSnapshot,
  renderCityWidgetNoData,
  renderCityWidgetUnconfigured,
} from '../components/WeatherWidgetCity';
import type { GeoLocation } from '../api/types';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';

/**
 * Configuration screen for the multi-city home-screen widget, registered with
 * `registerWidgetConfigurationScreen` (see widget/widgetConfigScreen.tsx).
 *
 * Unlike the widget components themselves, THIS screen is ordinary in-app UI
 * rendered inside the app, so its strings are localized - the user reads them
 * while configuring, in their own language.
 *
 * The library hands us `renderWidget` (draws this one widget instance) and
 * `setResult('ok' | 'cancel')`, which must be called exactly once. 'ok' commits
 * the placement; 'cancel' makes the launcher remove a widget being placed for
 * the first time.
 */
export function WidgetCityConfigScreen({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const [favorites, setFavorites] = useState<GeoLocation[]>([]);
  const [loading, setLoading] = useState(true);

  // Draw the placeholder first so the launcher preview never shows stale data
  // from a previous configuration of this same widget id.
  useEffect(() => {
    renderWidget(renderCityWidgetUnconfigured());
  }, [renderWidget]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [list] = await Promise.all([loadFavorites()]);
      if (cancelled) return;
      setFavorites(list);
      setLoading(false);
      // Re-draw the current selection so reconfiguring an existing widget shows
      // its city rather than the unconfigured placeholder.
      const existing = await loadWidgetCity(widgetInfo.widgetId);
      if (cancelled || !existing) return;
      const snapshot = await loadCitySnapshot(existing.id);
      if (cancelled) return;
      renderWidget(
        snapshot ? renderCityWidgetFromSnapshot(snapshot) : renderCityWidgetNoData(),
      );
    })();
    return () => {
      cancelled = true;
    };
    // renderWidget is stable per widget id; re-running on it is harmless.
  }, [widgetInfo.widgetId, renderWidget]);

  const choose = useCallback(
    async (city: GeoLocation) => {
      await saveWidgetCity(widgetInfo.widgetId, city);
      const snapshot = await loadCitySnapshot(city.id);
      renderWidget(snapshot ? renderCityWidgetFromSnapshot(snapshot) : renderCityWidgetNoData());
      // 'ok' tells the launcher the widget is configured and may be placed.
      setResult('ok');
    },
    [renderWidget, setResult, widgetInfo.widgetId],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('wcfg_title')}</Text>
        <Text style={styles.subtitle}>{t('wcfg_sub')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {loading ? (
          <Text style={styles.empty}>{t('wcfg_loading')}</Text>
        ) : favorites.length === 0 ? (
          <Text style={styles.empty}>{t('fav_none_msg')}</Text>
        ) : (
          favorites.map((city) => (
            <Pressable
              key={city.id}
              onPress={() => void choose(city)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
            >
              <View style={styles.rowText}>
                <Text style={styles.city}>{city.name}</Text>
                {city.admin1 || city.country ? (
                  <Text style={styles.region}>
                    {[city.admin1, city.country].filter(Boolean).join(', ')}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
      <Pressable
        onPress={() => setResult('cancel')}
        style={({ pressed }) => [styles.cancel, pressed && styles.rowPressed]}
        accessibilityRole="button"
      >
        <Text style={styles.cancelText}>{t('wcfg_cancel')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1631' },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  title: { color: '#FFFFFF', fontSize: 20, fontFamily: F.semibold },
  subtitle: { color: '#B9C6DC', fontSize: 13, fontFamily: F.regular, marginTop: 4, lineHeight: 18 },
  list: { paddingHorizontal: 14, paddingBottom: 8, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2947',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 8,
  },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1 },
  city: { color: '#FFFFFF', fontSize: 15, fontFamily: F.semibold },
  region: { color: '#B9C6DC', fontSize: 12, fontFamily: F.regular, marginTop: 2 },
  chevron: { color: '#B9C6DC', fontSize: 22, fontFamily: F.regular },
  empty: { color: '#B9C6DC', fontSize: 14, fontFamily: F.regular, lineHeight: 20, paddingTop: 12 },
  cancel: { marginHorizontal: 14, marginBottom: 12, paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: '#B9C6DC', fontSize: 15, fontFamily: F.semibold },
});