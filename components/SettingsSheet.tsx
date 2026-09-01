import React, { useState } from 'react';
import { F } from '../theme/typography';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import Svg, { Polyline } from 'react-native-svg';
import * as Notifications from '../utils/notifications';
import {
  Sun,
  Sparkles,
  Clock,
  MapPin,
  Wind,
  Gauge,
  ChevronLeft,
  ChevronRight,
  Vibrate,
  Thermometer,
  Database,
  Info,
  CloudSun,
  CloudRain,
  Radar,
  Bell,
  RefreshCw,
  Droplets,
  Droplet,
  Eye,
  Umbrella,
  Moon as MoonIcon,
  LayoutGrid,
  HeartPulse,
  Zap,
  TrendingUp,
  Footprints,
  Sailboat,
  CalendarDays,
  Palette,
  Check,
  Languages,
  Clock3,
  Luggage,
  Download,
  Upload,
  Flower2,
  Rows3,
} from '../utils/uiIcons';
import type { LucideIcon } from 'lucide-react-native';

/** Every adjust-tiles label, translated. */
const TILE_LABEL_KEYS: Record<string, StringKey> = {
  wind: 'tile_wind',
  aqi: 'tile_aqi',
  uv: 'tile_uv',
  humidity: 'tile_humidity',
  visibility: 'tile_visibility',
  pressure: 'tile_pressure',
  precipitation: 'tile_precipitation',
  rainToday: 'tile_raintoday',
  moon: 'tile_moon',
  health: 'tile_health',
  pollen: 'tile_pollen',
  highlights: 'tile_highlights',
  nowcast: 'tile_nowcast',
  rainChart: 'tile_rainchart',
  hourly: 'tile_hourly',
  daily: 'tile_daily',
  trend: 'tile_trend',
  pastWeek: 'tile_pastweek',
  activity: 'tile_activity',
  tripPlanner: 'tile_trip',
  calendar: 'tile_calendar',
  marine: 'tile_marine',
};
import { Overlay } from './Overlay';
import { haptics } from '../utils/haptics';
import { cancelDigest, type AccuracyEntry } from '../hooks/useDigest';
import type { AppSettings } from '../hooks/useSettings';
import { DETAIL_ANIM_OPTIONS } from '../utils/detailAnimations';
import { TILE_GROUPS } from '../config/tiles';
import { BACKGROUND_OPTIONS } from '../config/backgrounds';
import { COLOR_THEMES } from '../config/colorThemes';
import { LANGUAGES, t, type StringKey } from '../utils/i18n';
import { exportSettings, importSettings } from '../utils/backup';
import type { ProviderCheck } from '../api/providers';
import type { AppTheme } from '../theme/palettes';

interface SettingsSheetProps {
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
  ready: boolean;
  providerCheck: ProviderCheck;
  primaryTemp: number | null;
  lastUpdated: number | null;
  accuracyHistory: AccuracyEntry[];
}

async function ensureNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const { status: requested } = await Notifications.requestPermissionsAsync();
  return requested === 'granted';
}

type SheetView = 'main' | 'sources' | 'tiles' | 'language';

const TILE_ICONS: Record<string, LucideIcon> = {
  highlights: Zap,
  nowcast: Radar,
  rainChart: Droplet,
  hourly: Clock,
  daily: CalendarDays,
  trend: TrendingUp,
  activity: Footprints,
  calendar: CloudSun,
  marine: Sailboat,
  wind: Wind,
  aqi: Gauge,
  uv: Sun,
  humidity: Droplets,
  visibility: Eye,
  pressure: Gauge,
  precipitation: Umbrella,
  rainToday: Droplets,
  moon: MoonIcon,
  health: HeartPulse,
  pollen: Flower2,
  pastWeek: Clock3,
  tripPlanner: Luggage,
};

interface SegmentedOption {
  value: string;
  label: string;
}

function Segmented({
  theme,
  options,
  value,
  onChange,
}: {
  theme: AppTheme;
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const activeColor = theme.isLight ? '#FFFFFF' : '#F4F6FA';
  const activeText = theme.isLight ? '#1C2431' : '#1C2431';
  return (
    <View style={[styles.segmentWrap, { backgroundColor: theme.chipBg }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!active) {
                haptics.select();
                onChange(option.value);
              }
            }}
            style={[styles.segment, active && { backgroundColor: activeColor }]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: active ? activeText : theme.textSecondary },
                active && { fontFamily: F.bold },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatusChip({ theme, label, tone }: { theme: AppTheme; label: string; tone: 'active' | 'good' | 'warn' | 'off' }) {
  const color =
    tone === 'active' ? '#5BC98C' : tone === 'good' ? '#5BC98C' : tone === 'warn' ? '#F0964E' : '#E85F5F';
  return (
    <View style={[styles.statusChip, { backgroundColor: theme.chipBg }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusText, { color }]}>{label}</Text>
    </View>
  );
}

export function SettingsSheet({
  theme,
  visible,
  onClose,
  settings,
  onUpdate,
  ready,
  providerCheck,
  primaryTemp,
  lastUpdated,
  accuracyHistory,
}: SettingsSheetProps) {
  const inputColor = theme.isLight ? '#1C2431' : '#FFFFFF';
  const [view, setView] = useState<SheetView>('main');
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  const showBackupMsg = (message: string) => {
    setBackupMsg(message);
    setTimeout(() => setBackupMsg(null), 4000);
  };
  const onExportBackup = async () => {
    haptics.select();
    try {
      const uri = await exportSettings(settings);
      await Sharing.shareAsync(uri, { mimeType: 'application/json' });
      showBackupMsg(t('backup_exported'));
    } catch {
      showBackupMsg(t('backup_error'));
    }
  };
  const onImportBackup = () => {
    haptics.select();
    Alert.alert(t('backup_confirm_title'), t('backup_confirm_body'), [
      { text: t('backup_cancel'), style: 'cancel' },
      {
        text: t('backup_apply'),
        onPress: () => {
          void (async () => {
            const result = await importSettings();
            if (result.outcome === 'canceled') return;
            if (result.outcome === 'invalid') {
              showBackupMsg(t('backup_invalid'));
              return;
            }
            onUpdate(result.settings);
            haptics.success();
            showBackupMsg(t('backup_done'));
          })();
        },
      },
    ]);
  };

  const avgDelta =
    accuracyHistory.length > 0
      ? accuracyHistory.reduce((sum, entry) => sum + entry.d, 0) / accuracyHistory.length
      : null;

  const delta =
    providerCheck.status === 'ok' && providerCheck.temperature !== null && primaryTemp !== null
      ? Math.abs(providerCheck.temperature - primaryTemp)
      : null;

  const updatedLabel =
    lastUpdated === null
      ? 'Waiting for first sync'
      : `Last sync ${new Date(lastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

  return (
    <Overlay theme={theme} visible={visible} onClose={onClose} panelStyle="bottom">
      <View style={styles.grabberWrap}>
        <View style={[styles.grabber, { backgroundColor: theme.textTertiary }]} />
      </View>

      {view === 'main' ? (
        <Text style={[styles.title, { color: inputColor }]}>{t('s_title')}</Text>
      ) : view === 'language' ? (
        <>
          {LANGUAGES.map((language) => {
            const active = settings.language === language.key;
            return (
              <Pressable
                key={language.key}
                onPress={() => {
                  haptics.select();
                  onUpdate({ language: language.key });
                }}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View style={styles.rowTexts}>
                  <Text
                    style={[
                      styles.rowTitle,
                      { color: inputColor },
                      active && { fontFamily: F.bold },
                    ]}
                  >
                    {language.name} ({language.native})
                  </Text>
                </View>
                {active ? (
                  <Check size={20} color={theme.accent} strokeWidth={2.6} />
                ) : null}
              </Pressable>
            );
          })}
          <View style={[styles.noteCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <Info size={16} color={theme.textSecondary} strokeWidth={2.2} />
            <Text style={[styles.noteText, { color: theme.textSecondary }]}>
              Weather content is translated. More languages arrive in future updates.
            </Text>
          </View>
        </>
      ) : view === 'tiles' ? (
        <>
          <Text style={[styles.intro, { color: theme.textSecondary }]}>
            Turn off anything you don't need and it disappears from the home screen. Your choices
            are saved on this device.
          </Text>
          {TILE_GROUPS.map((group) => (
            <View key={group.title}>
              <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>
                {t(group.title === 'Main sections' ? 'tile_group_main' : 'tile_group_detail')}
              </Text>
              {group.tiles.map((tile) => {
                const TileIcon = TILE_ICONS[tile.key] ?? Sparkles;
                const visible = !(settings.hiddenTiles ?? []).includes(tile.key);
                return (
                  <View
                    key={tile.key}
                    style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
                  >
                    <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
                      <TileIcon size={20} color={theme.textPrimary} strokeWidth={2} />
                    </View>
                    <View style={styles.rowTexts}>
                      <Text style={[styles.rowTitle, { color: inputColor }]}>
                        {t(TILE_LABEL_KEYS[tile.key])}
                      </Text>
                    </View>
                    <Switch
                      value={ready ? visible : true}
                      onValueChange={(value) => {
                        if (value) {
                          haptics.success();
                        } else {
                          haptics.light();
                        }
                        const next = new Set(settings.hiddenTiles ?? []);
                        if (value) {
                          next.delete(tile.key);
                        } else {
                          next.add(tile.key);
                        }
                        onUpdate({ hiddenTiles: Array.from(next) });
                      }}
                      trackColor={{ true: theme.accent, false: theme.trackColor }}
                      thumbColor={visible ? '#FFFFFF' : theme.textTertiary}
                      ios_backgroundColor={theme.trackColor}
                    />
                  </View>
                );
              })}
            </View>
          ))}
          <View style={[styles.noteCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <Info size={16} color={theme.textSecondary} strokeWidth={2.2} />
            <Text style={[styles.noteText, { color: theme.textSecondary }]}>
              Current weather and severe alerts always stay on.
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.titleRow}>
          <Pressable
            onPress={() => {
              haptics.select();
              setView('main');
            }}
            hitSlop={8}
            style={styles.backButton}
          >
            <ChevronLeft size={24} color={inputColor} strokeWidth={2.4} />
          </Pressable>
          <Text style={[styles.title, { color: inputColor, paddingHorizontal: 0 }]}>
            {view === 'sources'
              ? 'Data sources'
              : view === 'tiles'
                ? 'Adjust tiles'
                : 'Language'}
          </Text>
        </View>
      )}

      {view === 'main' ? (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>{t('s_sec_feedback')}</Text>
          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Vibrate size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_haptics')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_haptics_sub')}
              </Text>
            </View>
            <Switch
              value={ready ? settings.hapticsEnabled : true}
              onValueChange={(value) => {
                if (value) {
                  haptics.success();
                } else {
                  haptics.light();
                }
                onUpdate({ hapticsEnabled: value });
              }}
              trackColor={{ true: theme.accent, false: theme.trackColor }}
              thumbColor={settings.hapticsEnabled ? '#FFFFFF' : theme.textTertiary}
              ios_backgroundColor={theme.trackColor}
            />
          </View>

          <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>{t('s_sec_appearance')}</Text>
          <View style={[styles.themeGrid, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            {COLOR_THEMES.map((option) => {
              const active = settings.colorTheme === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    if (!active) {
                      haptics.select();
                      onUpdate({ colorTheme: option.key });
                    }
                  }}
                  style={({ pressed }) => [styles.themeGridItem, pressed && { opacity: 0.7 }]}
                >
                  <View
                    style={[
                      styles.themeSwatchRing,
                      { borderColor: active ? theme.accent : 'transparent' },
                    ]}
                  >
                    <View style={[styles.themeSwatch, { backgroundColor: option.swatch }]} />
                  </View>
                  <Text
                    style={[
                      styles.themeSwatchLabel,
                      { color: active ? inputColor : theme.textSecondary },
                      active && { fontFamily: F.bold },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Sun size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_theme')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_theme_sub')}
              </Text>
            </View>
          </View>
          <View style={styles.segmentRow}>
            <Segmented
              theme={theme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              value={settings.themeMode}
              onChange={(value) => onUpdate({ themeMode: value as AppSettings['themeMode'] })}
            />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Sparkles size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_appstyle')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_appstyle_sub')}
              </Text>
            </View>
          </View>
          <View style={styles.segmentRow}>
            <Segmented
              theme={theme}
              options={[
                { value: 'material', label: 'Material You' },
                { value: 'glass', label: 'Liquid Glass' },
              ]}
              value={settings.styleMode}
              onChange={(value) => onUpdate({ styleMode: value as AppSettings['styleMode'] })}
            />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Palette size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_homebg')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_homebg_sub')}
              </Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.bgScroller}
            contentContainerStyle={styles.bgSwatchRow}
          >
            {BACKGROUND_OPTIONS.map((option) => {
              const active = settings.homeBackground === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    if (!active) {
                      haptics.select();
                      onUpdate({ homeBackground: option.key });
                    }
                  }}
                  style={({ pressed }) => [styles.bgSwatchWrap, pressed && { opacity: 0.75 }]}
                >
                  <LinearGradient
                    colors={option.gradient as unknown as readonly [string, string, string]}
                    locations={[0, 0.52, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={[
                      styles.bgSwatch,
                      active && styles.bgSwatchActive,
                      { borderColor: active ? inputColor : 'transparent' },
                    ]}
                  />
                  <Text
                    style={[
                      styles.bgSwatchLabel,
                      { color: active ? inputColor : theme.textSecondary },
                      active && { fontFamily: F.bold },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Sparkles size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_tileanim')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_tileanim_sub')}
              </Text>
            </View>
          </View>
          <View style={styles.segmentRow}>
            <Segmented
              theme={theme}
              options={DETAIL_ANIM_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              value={settings.detailAnimation}
              onChange={(value) => onUpdate({ detailAnimation: value as AppSettings['detailAnimation'] })}
            />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Rows3 size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_density')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_density_sub')}
              </Text>
            </View>
          </View>
          <View style={styles.segmentRow}>
            <Segmented
              theme={theme}
              options={[
                { value: 'comfortable', label: t('s_density_comfortable') },
                { value: 'compact', label: t('s_density_compact') },
              ]}
              value={settings.layoutDensity}
              onChange={(value) => onUpdate({ layoutDensity: value as AppSettings['layoutDensity'] })}
            />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Palette size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('icon_style')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('icon_style_subtitle')}
              </Text>
            </View>
          </View>
          <View style={styles.segmentRow}>
            <Segmented
              theme={theme}
              options={[
                { value: 'outline', label: t('icon_style_outline') },
                { value: 'filled', label: t('icon_style_filled') },
                { value: 'colorful', label: t('icon_style_colorful') },
              ]}
              value={settings.iconStyle}
              onChange={(value) => onUpdate({ iconStyle: value as AppSettings['iconStyle'] })}
            />
          </View>

          <Pressable
            onPress={() => {
              haptics.select();
              setView('tiles');
            }}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
              pressed && { opacity: 0.75 },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <LayoutGrid size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_adjust')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_adjust_sub')}
              </Text>
            </View>
            <ChevronRight size={20} color={theme.textTertiary} strokeWidth={2.2} />
          </Pressable>

          <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>{t('s_sec_notifications')}</Text>
          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <RefreshCw size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_bgalerts')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_bgalerts_sub')}
              </Text>
            </View>
            <Switch
              value={ready ? settings.backgroundAlerts : true}
              onValueChange={(value) => {
                if (value) {
                  haptics.success();
                } else {
                  haptics.light();
                }
                onUpdate({ backgroundAlerts: value });
              }}
              trackColor={{ true: theme.accent, false: theme.trackColor }}
              thumbColor={settings.backgroundAlerts ? '#FFFFFF' : theme.textTertiary}
              ios_backgroundColor={theme.trackColor}
            />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Bell size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_digest')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_digest_sub')}
              </Text>
            </View>
            <Switch
              value={ready ? settings.digestEnabled : false}
              onValueChange={(value) => {
                if (value) {
                  haptics.success();
                  void ensureNotificationPermission().then((granted) => {
                    onUpdate({ digestEnabled: granted });
                  });
                } else {
                  haptics.light();
                  void cancelDigest();
                  onUpdate({ digestEnabled: false });
                }
              }}
              trackColor={{ true: theme.accent, false: theme.trackColor }}
              thumbColor={settings.digestEnabled ? '#FFFFFF' : theme.textTertiary}
              ios_backgroundColor={theme.trackColor}
            />
          </View>
          {settings.digestEnabled ? (
            <View style={styles.segmentRow}>
              <Segmented
                theme={theme}
                options={[
                  { value: '7', label: '7 AM' },
                  { value: '8', label: '8 AM' },
                  { value: '9', label: '9 AM' },
                ]}
                value={String(settings.digestHour)}
                onChange={(value) => onUpdate({ digestHour: Number(value) })}
              />
            </View>
          ) : null}

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Sun size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_golden')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_golden_sub')}
              </Text>
            </View>
            <Switch
              value={ready ? settings.goldenHourEnabled : false}
              onValueChange={(value) => {
                if (value) {
                  haptics.success();
                  void ensureNotificationPermission().then((granted) => {
                    onUpdate({ goldenHourEnabled: granted });
                  });
                } else {
                  haptics.light();
                  onUpdate({ goldenHourEnabled: false });
                }
              }}
              trackColor={{ true: theme.accent, false: theme.trackColor }}
              thumbColor={settings.goldenHourEnabled ? '#FFFFFF' : theme.textTertiary}
              ios_backgroundColor={theme.trackColor}
            />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <CloudRain size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('rain_alert')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('rain_alert_subtitle')}
              </Text>
            </View>
            <Switch
              value={ready ? settings.rainAlertEnabled : false}
              onValueChange={(value) => {
                if (value) {
                  haptics.success();
                  void ensureNotificationPermission().then((granted) => {
                    onUpdate({ rainAlertEnabled: granted });
                  });
                } else {
                  haptics.light();
                  onUpdate({ rainAlertEnabled: false });
                }
              }}
              trackColor={{ true: theme.accent, false: theme.trackColor }}
              thumbColor={settings.rainAlertEnabled ? '#FFFFFF' : theme.textTertiary}
              ios_backgroundColor={theme.trackColor}
            />
          </View>

          <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>{t('s_sec_general')}</Text>
          <Pressable
            onPress={() => {
              haptics.select();
              setView('language');
            }}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
              pressed && { opacity: 0.75 },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Languages size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_language')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {LANGUAGES.find((l) => l.key === settings.language)?.native ?? 'English'}
              </Text>
            </View>
            <ChevronRight size={20} color={theme.textTertiary} strokeWidth={2.2} />
          </Pressable>
          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Thermometer size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_temp')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_temp_sub')}
              </Text>
            </View>
          </View>
          <View style={styles.segmentRow}>
            <Segmented
              theme={theme}
              options={[
                { value: 'celsius', label: '°C' },
                { value: 'fahrenheit', label: '°F' },
              ]}
              value={settings.tempUnit}
              onChange={(value) => onUpdate({ tempUnit: value as AppSettings['tempUnit'] })}
            />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Wind size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_wind')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_wind_sub')}
              </Text>
            </View>
          </View>
          <View style={styles.segmentRow}>
            <Segmented
              theme={theme}
              options={[
                { value: 'kmh', label: 'km/h' },
                { value: 'mph', label: 'mph' },
              ]}
              value={settings.windUnit}
              onChange={(value) => onUpdate({ windUnit: value as AppSettings['windUnit'] })}
            />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Umbrella size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('precip_unit')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('precip_unit_subtitle')}
              </Text>
            </View>
          </View>
          <View style={styles.segmentRow}>
            <Segmented
              theme={theme}
              options={[
                { value: 'mm', label: 'mm' },
                { value: 'inches', label: 'in' },
              ]}
              value={settings.precipUnit}
              onChange={(value) => onUpdate({ precipUnit: value as AppSettings['precipUnit'] })}
            />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Clock size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_clock')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_clock_sub')}
              </Text>
            </View>
          </View>
          <View style={styles.segmentRow}>
            <Segmented
              theme={theme}
              options={[
                { value: '12h', label: '12h' },
                { value: '24h', label: '24h' },
              ]}
              value={settings.timeFormat}
              onChange={(value) => onUpdate({ timeFormat: value as AppSettings['timeFormat'] })}
            />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Sparkles size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_snark')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_snark_sub')}
              </Text>
            </View>
            <Switch
              value={ready ? settings.snarkMode : false}
              onValueChange={(value) => {
                if (value) {
                  haptics.success();
                } else {
                  haptics.light();
                }
                onUpdate({ snarkMode: value });
              }}
              trackColor={{ true: theme.accent, false: theme.trackColor }}
              thumbColor={settings.snarkMode ? '#FFFFFF' : theme.textTertiary}
              ios_backgroundColor={theme.trackColor}
            />
          </View>

          <Pressable
            onPress={() => {
              haptics.select();
              setView('sources');
            }}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
              pressed && { opacity: 0.75 },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Database size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('s_sources')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('s_sources_sub')}
              </Text>
            </View>
            <ChevronRight size={20} color={theme.textTertiary} strokeWidth={2.2} />
          </Pressable>

          <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>
            {t('backup_section')}
          </Text>
          <Pressable
            onPress={onExportBackup}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
              pressed && { opacity: 0.75 },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Download size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('backup_export')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('backup_export_subtitle')}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={onImportBackup}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
              pressed && { opacity: 0.75 },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Upload size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('backup_import')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('backup_import_subtitle')}
              </Text>
            </View>
          </Pressable>
          {backupMsg ? (
            <Text
              style={[
                styles.backupMsg,
                { color: theme.textTertiary },
              ]}
            >
              {backupMsg}
            </Text>
          ) : null}

          <View style={[styles.noteCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <Info size={16} color={theme.textSecondary} strokeWidth={2.2} />
            <Text style={[styles.noteText, { color: theme.textSecondary }]}>
              More personalization arrives in future updates.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <>
          <Text style={[styles.intro, { color: theme.textSecondary }]}>
            MU Weather blends multiple independent providers for the best accuracy. The primary
            forecast is continuously cross-checked against a second national weather service.
          </Text>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <CloudSun size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('src_forecast')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('src_forecast_sub')}
              </Text>
            </View>
            <StatusChip theme={theme} label={t('chip_active')} tone="active" />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Radar size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('src_metno')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('src_metno_sub')}
              </Text>
              {providerCheck.status === 'ok' && delta !== null ? (
                <Text
                  style={[
                    styles.deltaText,
                    { color: delta <= 1.5 ? '#5BC98C' : '#F0964E' },
                  ]}
                >
                  MET {Math.round(providerCheck.temperature ?? 0)}° vs app{' '}
                  {Math.round(primaryTemp ?? 0)}°
                </Text>
              ) : null}
              {accuracyHistory.length >= 2 ? (
                <View style={styles.sparkRow}>
                  <Svg width={120} height={30} viewBox="0 0 120 30">
                    <Polyline
                      points={accuracyHistory
                        .slice(-12)
                        .map((entry, index, array) => {
                          const x = (index / Math.max(array.length - 1, 1)) * 116 + 2;
                          const y = 27 - (Math.min(entry.d, 3) / 3) * 24;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ')}
                      stroke={theme.accent}
                      strokeWidth={2}
                      fill="none"
                      strokeLinecap="round"
                    />
                  </Svg>
                  <Text style={[styles.avgText, { color: theme.textTertiary }]}>
                    avg drift {avgDelta?.toFixed(1)}° over {accuracyHistory.length} checks
                  </Text>
                </View>
              ) : null}
            </View>
            {providerCheck.status === 'checking' ? (
              <StatusChip theme={theme} label={t('chip_syncing')} tone="warn" />
            ) : providerCheck.status === 'ok' ? (
              <StatusChip theme={theme} label={delta !== null && delta <= 1.5 ? t('chip_match') : t('chip_drift')} tone={delta !== null && delta <= 1.5 ? 'good' : 'warn'} />
            ) : providerCheck.status === 'error' ? (
              <StatusChip theme={theme} label={t('chip_offline')} tone="off" />
            ) : (
              <StatusChip theme={theme} label={t('chip_idle')} tone="warn" />
            )}
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Gauge size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('src_aqi')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('src_aqi_sub')}
              </Text>
            </View>
            <StatusChip theme={theme} label={t('chip_active')} tone="active" />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <MapPin size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('src_geo')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('src_geo_sub')}
              </Text>
            </View>
            <StatusChip theme={theme} label={t('chip_active')} tone="active" />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Wind size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>{t('src_windy')}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                {t('src_windy_sub')}
              </Text>
            </View>
            <StatusChip theme={theme} label={t('chip_active')} tone="active" />
          </View>

          <View style={[styles.noteCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <Info size={16} color={theme.textSecondary} strokeWidth={2.2} />
            <Text style={[styles.noteText, { color: theme.textSecondary }]}>
              {updatedLabel} · Sources: open-meteo.com · met.no · windy.com
            </Text>
          </View>
        </>
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
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  title: {
    fontSize: 21,
    fontFamily: F.bold,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  backButton: {
    padding: 8,
  },
  backupMsg: {
    fontSize: 11.5,
    fontFamily: F.regular,
    marginTop: 8,
    marginLeft: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: F.bold,
    letterSpacing: 1.6,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 8,
  },
  intro: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 24,
    paddingTop: 2,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
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
  deltaText: {
    fontSize: 11.5,
    fontFamily: F.semibold,
    marginTop: 2,
  },
  sparkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  avgText: {
    fontSize: 11,
    flex: 1,
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  themeGridItem: {
    width: '25%',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
  },
  themeSwatchRing: {
    width: 60,
    height: 60,
    borderRadius: 999,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeSwatch: {
    width: 46,
    height: 46,
    borderRadius: 999,
  },
  themeSwatchLabel: {
    fontSize: 11,
    fontFamily: F.medium,
  },
  segmentRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  bgScroller: {
    flexGrow: 0,
    marginBottom: 10,
  },
  bgSwatchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  bgSwatchWrap: {
    alignItems: 'center',
    gap: 6,
    width: 68,
  },
  bgSwatch: {
    width: 64,
    height: 44,
    borderRadius: 14,
    borderWidth: 3,
  },
  bgSwatchActive: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  bgSwatchLabel: {
    fontSize: 11,
    fontFamily: F.medium,
  },
  segmentWrap: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    gap: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 999,
  },
  segmentText: {
    fontSize: 12.5,
    fontFamily: F.medium,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: F.bold,
    letterSpacing: 1.2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontFamily: F.bold,
    letterSpacing: 0.8,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 24,
  },
  noteText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
});
