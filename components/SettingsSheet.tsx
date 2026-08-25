import React, { useState } from 'react';
import { F } from '../theme/typography';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import * as Notifications from 'expo-notifications';
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
  Radar,
  Bell,
  RefreshCw,
} from '../utils/uiIcons';
import { Overlay } from './Overlay';
import { haptics } from '../utils/haptics';
import { cancelDigest, type AccuracyEntry } from '../hooks/useDigest';
import type { AppSettings } from '../hooks/useSettings';
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

type SheetView = 'main' | 'sources';

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
        <Text style={[styles.title, { color: inputColor }]}>Settings</Text>
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
            Data sources
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
          <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>FEEDBACK</Text>
          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Vibrate size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>Haptic feedback</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Vibration on taps, toggles and alerts
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

          <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>APPEARANCE</Text>
          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Sun size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>Theme</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Follow the system or pick a fixed look
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
              <Text style={[styles.rowTitle, { color: inputColor }]}>App style</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Material You 3 cards or frosted Liquid Glass
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

          <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>NOTIFICATIONS</Text>
          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <RefreshCw size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>Background alerts</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Check alerts even when the app is closed
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
              <Text style={[styles.rowTitle, { color: inputColor }]}>Daily digest</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Tomorrow's forecast every morning
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
              <Text style={[styles.rowTitle, { color: inputColor }]}>Golden hour alert</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Notify when golden light is 60 minutes away
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

          <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>GENERAL</Text>
          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Thermometer size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>Temperature</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Displayed everywhere in the app
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
              <Text style={[styles.rowTitle, { color: inputColor }]}>Wind speed</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Compass, hourly view and alerts
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
              <Clock size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>Clock</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Hourly labels and sun times
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
              <Text style={[styles.rowTitle, { color: inputColor }]}>Snark mode</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Sarcastic commentary under the temperature
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
              <Text style={[styles.rowTitle, { color: inputColor }]}>Data sources</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Providers powering forecasts, radar and air quality
              </Text>
            </View>
            <ChevronRight size={20} color={theme.textTertiary} strokeWidth={2.2} />
          </Pressable>

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
              <Text style={[styles.rowTitle, { color: inputColor }]}>Open-Meteo Forecast</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Primary · temperature, wind, rain, UV (ECMWF · GFS · ICON models)
              </Text>
            </View>
            <StatusChip theme={theme} label="ACTIVE" tone="active" />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Radar size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>MET Norway</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Independent cross-check of the displayed temperature
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
              <StatusChip theme={theme} label="SYNCING" tone="warn" />
            ) : providerCheck.status === 'ok' ? (
              <StatusChip theme={theme} label={delta !== null && delta <= 1.5 ? 'MATCH' : 'DRIFT'} tone={delta !== null && delta <= 1.5 ? 'good' : 'warn'} />
            ) : providerCheck.status === 'error' ? (
              <StatusChip theme={theme} label="OFFLINE" tone="off" />
            ) : (
              <StatusChip theme={theme} label="IDLE" tone="warn" />
            )}
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Gauge size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>Open-Meteo Air Quality</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                AQI · PM2.5 · PM10 · pollen (Europe)
              </Text>
            </View>
            <StatusChip theme={theme} label="ACTIVE" tone="active" />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <MapPin size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>Open-Meteo Geocoding</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Global city search & coordinates
              </Text>
            </View>
            <StatusChip theme={theme} label="ACTIVE" tone="active" />
          </View>

          <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Wind size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: inputColor }]}>Windy</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textTertiary }]}>
                Live radar & interactive weather map layers
              </Text>
            </View>
            <StatusChip theme={theme} label="ACTIVE" tone="active" />
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
  segmentRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
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
