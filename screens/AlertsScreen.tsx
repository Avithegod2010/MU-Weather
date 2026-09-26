import React, { useCallback, useEffect, useState } from 'react';
import { t, getLanguage } from '../utils/i18n';
import { formatClockParts } from '../utils/format';
import { F } from '../theme/typography';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  Snowflake,
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
  Sparkles,
} from '../utils/uiIcons';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { haptics } from '../utils/haptics';
import { ALERT_DEFINITIONS } from '../utils/alertRules';
import type { AlertKey } from '../utils/alertRules';
import {
  clearAlertHistory,
  loadAlertHistory,
  MAX_ALERT_HISTORY,
  type AlertHistoryEntry,
} from '../utils/alertHistory';
import type { AppTheme } from '../theme/palettes';

const ALERT_ICONS: Record<AlertKey, typeof CloudRain> = {
  rain: CloudRain,
  thunder: CloudLightning,
  frost: Snowflake,
  uv: Sun,
  pollen: Flower2,
  aqi: Gauge,
  pressure: TrendingDown,
  wind: Wind,
  cape: CloudLightning,
  heat: Thermometer,
  // ── bot2: aurora + alerts + wear ──
  aurora: Sparkles,
  fog: CloudFog,
  blackice: Snowflake,
  coldsnap: Thermometer,
  tempdrop: ArrowDown,
  stargazing: Star,
  raineasing: Umbrella,
  favorites: MapPin,
};

/** Severity dot colours for the alert-history rows. */
const SEVERITY_COLORS: Record<AlertHistoryEntry['severity'], string> = {
  info: '#6FA8DC',
  warning: '#E8D05A',
  severe: '#E85F5F',
};

/** Localized "Sep 24 · 14:05" stamp (app language, user's clock format). */
function historyStamp(at: number): string {
  const date = new Date(at);
  const day = date.toLocaleDateString(getLanguage(), { month: 'short', day: 'numeric' });
  return `${day} · ${formatClockParts(date.getHours(), date.getMinutes())}`;
}

interface AlertsScreenProps {
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  settings: Record<AlertKey, boolean>;
  onToggle: (key: AlertKey) => void;
  ready: boolean;
}

export function AlertsScreen({
  theme,
  visible,
  onClose,
  settings,
  onToggle,
  ready,
}: AlertsScreenProps) {
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState<AlertHistoryEntry[]>([]);

  useEffect(() => {
    if (visible) {
      haptics.select();
    }
  }, [visible]);

  // History is read fresh every time the screen opens: alerts fire from the
  // background task, so there is nothing to subscribe to while it is closed.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const entries = await loadAlertHistory();
      if (!cancelled) setHistory(entries);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const clearHistory = useCallback(() => {
    haptics.light();
    setHistory([]);
    void clearAlertHistory();
  }, []);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 16 }]}
    >
      <AnimatedBackground gradient={theme.gradient} />

      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{t('alerts_title')}</Text>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('a11y_back')}
        >
          <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2.4} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: theme.textSecondary }]}>
          {t('alerts_intro')}
        </Text>

        {ALERT_DEFINITIONS.map((definition) => {
          const Icon = ALERT_ICONS[definition.key];
          const enabled = ready && settings[definition.key];
          return (
            <Pressable
              key={definition.key}
              onPress={() => {
                if (settings[definition.key]) {
                  haptics.light();
                } else {
                  haptics.success();
                }
                void onToggle(definition.key);
              }}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
              accessibilityState={{ checked: enabled }}
            >
              <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
                <Icon size={20} color={theme.textPrimary} strokeWidth={2} />
              </View>
              <View style={styles.rowTexts}>
                <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>
                  {t(definition.title)}
                </Text>
                <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
                  {t(definition.subtitle)}
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={() => {
                  if (settings[definition.key]) {
                    haptics.light();
                  } else {
                    haptics.success();
                  }
                  void onToggle(definition.key);
                }}
                trackColor={{ true: theme.accent, false: theme.trackColor }}
                thumbColor={enabled ? '#FFFFFF' : theme.textTertiary}
                ios_backgroundColor={theme.trackColor}
              />
            </Pressable>
          );
        })}

        <View style={styles.historyBlock}>
          <View style={styles.historyHeader}>
            <Text style={[styles.historyTitle, { color: theme.textPrimary }]}>
              {t('alert_history_title')}
            </Text>
            {history.length > 0 ? (
              <Pressable
                onPress={clearHistory}
                style={({ pressed }) => [
                  styles.historyClear,
                  { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('alert_history_clear')}
              >
                <Text style={[styles.historyClearText, { color: theme.textSecondary }]}>
                  {t('alert_history_clear')}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {history.length === 0 ? (
            <Text style={[styles.historyEmpty, { color: theme.textTertiary }]}>
              {t('alert_history_empty')}
            </Text>
          ) : (
            // The whole stored history - the list scrolls, and a smaller slice
            // would hide older rows with no way to reveal them.
            history.slice(0, MAX_ALERT_HISTORY).map((entry, index) => {
              const Icon = ALERT_ICONS[entry.key as AlertKey] ?? Bell;
              return (
                <View
                  key={`${entry.at}-${entry.key}-${index}`}
                  style={[
                    styles.historyRow,
                    { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
                  ]}
                >
                  <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
                    <Icon size={18} color={theme.textPrimary} strokeWidth={2} />
                  </View>
                  <View style={styles.rowTexts}>
                    <Text
                      style={[styles.historyRowTitle, { color: theme.textPrimary }]}
                      numberOfLines={1}
                    >
                      {entry.title}
                    </Text>
                    <Text
                      style={[styles.historyRowBody, { color: theme.textSecondary }]}
                      numberOfLines={2}
                    >
                      {entry.message}
                    </Text>
                    <Text
                      style={[styles.historyMeta, { color: theme.textTertiary }]}
                      numberOfLines={1}
                    >
                      {entry.city ? `${entry.city} · ` : ''}
                      {historyStamp(entry.at)}
                    </Text>
                  </View>
                  <View
                    style={[styles.severityDot, { backgroundColor: SEVERITY_COLORS[entry.severity] }]}
                  />
                </View>
              );
            })
          )}
        </View>

        <View style={[styles.noteCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
          <Info size={16} color={theme.textSecondary} strokeWidth={2.2} />
          <Text style={[styles.noteText, { color: theme.textSecondary }]}>
            Alerts evaluate on every forecast refresh (app open or pull-to-refresh), with a
            6-hour cooldown per alert type. Saved-city checks run in the background at most
            every 20 minutes. Pollen data covers Europe only.
          </Text>
        </View>
      </ScrollView>
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
    zIndex: 50,
    elevation: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
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
  },
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  intro: {
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15.5,
    fontFamily: F.semibold,
  },
  rowSubtitle: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 6,
  },
  noteText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  historyBlock: {
    marginTop: 14,
    gap: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  historyTitle: {
    fontSize: 16,
    fontFamily: F.semibold,
  },
  historyClear: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  historyClearText: {
    fontSize: 12.5,
    fontFamily: F.semibold,
  },
  historyEmpty: {
    fontSize: 12.5,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  historyRowTitle: {
    fontSize: 14,
    fontFamily: F.semibold,
  },
  historyRowBody: {
    fontSize: 12,
    lineHeight: 16.5,
  },
  historyMeta: {
    fontSize: 11,
    fontFamily: F.medium,
  },
  severityDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
});
