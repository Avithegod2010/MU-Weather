import { SlidingGroup, SlidingItem } from '../components/Sliding';
import { SlidingSwitch } from '../components/SlidingSwitch';
import React, { useCallback, useEffect, useState } from 'react';
import { t, getLanguage } from '../utils/i18n';
import { formatClockParts } from '../utils/format';
import { F } from '../theme/typography';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Sun,
  Moon,
  CloudFog,
  CloudRain,
  Snowflake,
  CloudLightning,
  MapPin,
  ArrowDown,
  Droplets,
  Wind,
  Gauge,
  Umbrella,
  Star,
  ChevronLeft,
  ChevronRight,
  Thermometer,
  Info,
  Bell,
  Flower2,
  TrendingDown,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Plus,
  X,
} from '../utils/uiIcons';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { haptics } from '../utils/haptics';
import { ALERT_DEFINITIONS } from '../utils/alertRules';
import type { AlertKey, AlertSettings, QuietHoursSettings } from '../utils/alertRules';
import * as Notifications from '../utils/notifications';
import { loadStormAlertFeedback, saveStormAlertFeedback } from '../utils/stormAlertFeedback';
import { stormFeedbackEventKey, upsertStormFeedback } from '../utils/stormFeedbackPolicy';
import type { StormFeedbackRecord, StormFeedbackVote } from '../utils/stormFeedbackPolicy';
import { CUSTOM_METRIC_KEYS, formatCustomValue, MAX_NOTE_LENGTH } from '../utils/customAlerts';
import type { CustomMetric, CustomOp } from '../utils/customAlerts';
import { useCustomAlerts } from '../hooks/useCustomAlerts';
import {
  clearAlertHistory,
  loadAlertHistory,
  MAX_ALERT_HISTORY,
  type AlertHistoryEntry,
} from '../utils/alertHistory';
import { formatAlertEvidence } from '../utils/alertEvidence';
import type { WeatherImpact } from '../utils/impactTimeline';
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

function alertSeverityLabel(severity: 'info' | 'warning' | 'severe'): string {
  if (severity === 'severe') return t('alert_severity_severe');
  if (severity === 'warning') return t('alert_severity_warning');
  return t('alert_severity_info');
}

/** Quiet-hour steppers step in 30-minute jumps and wrap through midnight. */
const QUIET_STEP_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;

function stepQuietMinutes(value: number, delta: number): number {
  return (((value + delta) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Quiet hours are minutes since midnight - shown as a clock. */
function quietClock(minutes: number): string {
  return formatClockParts(Math.floor(minutes / 60), minutes % 60);
}

/** One minus / value / plus row (the trip-planner stepper idiom). */
function StepperRow({
  theme,
  label,
  value,
  onStep,
}: {
  theme: AppTheme;
  label: string;
  value: string;
  onStep: (delta: number) => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={[styles.stepperLabel, { color: theme.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <Pressable
        onPress={() => onStep(-1)}
        hitSlop={8}
        style={({ pressed }) => [
          styles.stepperButton,
          { backgroundColor: theme.chipBg },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('a11y_decrease')}
      >
        <ChevronLeft size={18} color={theme.textPrimary} strokeWidth={2.4} />
      </Pressable>
      <Text style={[styles.stepperValue, { color: theme.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
      <Pressable
        onPress={() => onStep(1)}
        hitSlop={8}
        style={({ pressed }) => [
          styles.stepperButton,
          { backgroundColor: theme.chipBg },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('a11y_increase')}
      >
        <ChevronRight size={18} color={theme.textPrimary} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

/** Builder: metric cycle order, per-metric step/clamp and a default value. */
const METRIC_ORDER: CustomMetric[] = [
  'uv',
  'wind',
  'temp',
  'humidity',
  'pressure',
  'aqi',
  'cape',
];

const METRIC_STEPS: Record<CustomMetric, { step: number; min: number; max: number }> = {
  uv: { step: 1, min: 0, max: 12 },
  wind: { step: 1, min: 0, max: 200 },
  temp: { step: 1, min: -40, max: 60 },
  humidity: { step: 5, min: 0, max: 100 },
  pressure: { step: 1, min: 900, max: 1100 },
  aqi: { step: 10, min: 0, max: 500 },
  cape: { step: 100, min: 0, max: 6000 },
};

/** Draft value when the builder opens on (or switches to) a metric. */
const METRIC_DEFAULT_VALUES: Record<CustomMetric, number> = {
  uv: 8,
  wind: 40,
  temp: 30,
  humidity: 85,
  pressure: 1000,
  aqi: 150,
  cape: 2500,
};

/** Rule-row icon per metric. */
const CUSTOM_ICONS: Record<CustomMetric, typeof CloudRain> = {
  uv: Sun,
  wind: Wind,
  temp: Thermometer,
  humidity: Droplets,
  pressure: Gauge,
  aqi: Gauge,
  cape: CloudLightning,
};

interface SegmentedOption {
  value: string;
  label: string;
}

/** Two-option segmented control (the SettingsSheet idiom, local copy). */
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
  const activeText = '#1C2431';
  const activeIndex = options.findIndex((option) => option.value === value);
  return (
    <SlidingGroup
      theme={theme}
      activeIndex={activeIndex}
      color={activeColor}
      style={[styles.segmentWrap, { backgroundColor: theme.chipBg }]}
    >
      {options.map((option, index) => {
        const active = index === activeIndex;
        return (
          <SlidingItem
            key={option.value}
            index={index}
            onPress={() => {
              if (!active) {
                haptics.select();
                onChange(option.value);
              }
            }}
            style={styles.segment}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
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
          </SlidingItem>
        );
      })}
    </SlidingGroup>
  );
}

interface AlertsScreenProps {
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  settings: AlertSettings;
  onToggle: (key: AlertKey) => void;
  onUpdateQuiet: (patch: Partial<QuietHoursSettings>) => void;
  ready: boolean;
  currentImpacts: WeatherImpact[];
  /** Stable, local city ID used to keep storm feedback scoped to this place. */
  feedbackScope: string;
}

export function AlertsScreen({
  theme,
  visible,
  onClose,
  settings,
  onToggle,
  onUpdateQuiet,
  ready,
  currentImpacts,
  feedbackScope,
}: AlertsScreenProps) {
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState<AlertHistoryEntry[]>([]);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [stormFeedback, setStormFeedback] = useState<StormFeedbackRecord[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<'checking' | 'granted' | 'not-granted'>('checking');
  const { rules, addRule, toggleRule, deleteRule, setNote } = useCustomAlerts();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [draftMetric, setDraftMetric] = useState<CustomMetric>('temp');
  const [draftOp, setDraftOp] = useState<CustomOp>('gte');
  const [draftValue, setDraftValue] = useState<number>(30);
  /** Optional note drafted in the builder / while editing a rule's note. */
  const [draftNote, setDraftNote] = useState('');
  /** Which rule row is showing its note editor, if any. */
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    haptics.select();
    const initialRefresh = setTimeout(() => setClockNow(Date.now()), 0);
    const timer = setInterval(() => setClockNow(Date.now()), 60_000);
    return () => {
      clearTimeout(initialRefresh);
      clearInterval(timer);
    };
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

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void Notifications.getPermissionsAsync()
      .then(({ status }) => {
        if (!cancelled) setNotificationPermission(status === 'granted' ? 'granted' : 'not-granted');
      })
      .catch(() => {
        if (!cancelled) setNotificationPermission('not-granted');
      });
    void loadStormAlertFeedback().then((rows) => {
      if (!cancelled) setStormFeedback(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const submitStormFeedback = useCallback((eventKey: string, vote: StormFeedbackVote) => {
    const row: StormFeedbackRecord = { scope: feedbackScope, eventKey, vote, at: Date.now() };
    setStormFeedback((previous) => upsertStormFeedback(previous, row));
    void saveStormAlertFeedback(feedbackScope, eventKey, vote, row.at);
  }, [feedbackScope]);

  const clearHistory = useCallback(() => {
    haptics.light();
    setHistory([]);
    void clearAlertHistory();
  }, []);
  const enabledRuleNames = [
    ...ALERT_DEFINITIONS.filter((definition) => settings[definition.key]).map((definition) => t(definition.title)),
    ...rules.filter((rule) => rule.enabled).map((rule) =>
      `${t(CUSTOM_METRIC_KEYS[rule.metric])} ${rule.op === 'gte' ? '≥' : '≤'} ${formatCustomValue(rule.metric, rule.value)}`,
    ),
  ];
  const previewRuleNames = enabledRuleNames.length
    ? `${enabledRuleNames.slice(0, 4).join(', ')}${enabledRuleNames.length > 4 ? ` +${enabledRuleNames.length - 4}` : ''}`
    : t('unavailable');
  const permissionLabel = notificationPermission === 'granted'
    ? t('alert_permission_granted')
    : notificationPermission === 'not-granted'
      ? t('alert_permission_not_granted')
      : '…';
  const quietLabel = settings.quietHoursEnabled
    ? `${quietClock(settings.quietStartMinutes)}–${quietClock(settings.quietEndMinutes)}`
    : t('alert_preview_off');
  const matchingForecastImpacts = currentImpacts.filter((impact) =>
    impact.signalIds.some((id) => id.startsWith('forecast:')),
  );

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

        <View style={[styles.previewCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
          <Text style={[styles.previewTitle, { color: theme.textPrimary }]}>{t('alert_preview_title')}</Text>
          <Text style={[styles.previewBody, { color: theme.textSecondary }]}>
            {t('alert_preview_line')
              .replace('{rules}', previewRuleNames)
              .replace('{permission}', permissionLabel)
              .replace('{quiet}', quietLabel)}
          </Text>
          {matchingForecastImpacts[0] ? (
            <Text style={[styles.previewBody, { color: theme.textSecondary }]}>
              {t('alert_preview_match').replace('{title}', matchingForecastImpacts[0].title)}
            </Text>
          ) : (
            <Text style={[styles.previewBody, { color: theme.textTertiary }]}>
              {t('alert_preview_no_match')}
            </Text>
          )}
        </View>

        {currentImpacts.length > 0 ? (
          <View style={styles.historyBlock}>
            <Text style={[styles.historyTitle, { color: theme.textPrimary }]}>
              {t('tile_warnings')}
            </Text>
            {currentImpacts.map((impact) => {
              const normalizedKey = impact.hazard.slice(impact.hazard.lastIndexOf(':') + 1);
              const iconKey = normalizedKey === 'temperature'
                ? 'heat'
                : normalizedKey === 'air-quality'
                  ? 'aqi'
                  : normalizedKey === 'ice'
                    ? 'frost'
                    : normalizedKey;
              const Icon = ALERT_ICONS[iconKey as AlertKey] ?? Bell;
              const severityLabel = alertSeverityLabel(impact.severity);
              const details = [
                ...impact.safetyMessages,
                ...impact.expected,
                ...impact.reasons,
                ...impact.actions,
              ].filter((detail, index, all) => Boolean(detail.trim()) && all.indexOf(detail) === index);
              const sourceUpdateText = impact.sourceUpdates
                .map(({ source, updatedAt }) =>
                  `${source} · ${t('aurora_updated').replace('{time}', historyStamp(updatedAt))}`,
                )
                .join(' · ');
              const untilText = impact.endsAt > impact.sourceUpdatedAt
                ? t('warnings_until').replace('{t}', historyStamp(impact.endsAt))
                : null;
              const isStormImpact = normalizedKey === 'storm' || normalizedKey === 'thunder';
              const feedbackEventKey = isStormImpact ? stormFeedbackEventKey(impact) : '';
              const currentVote = isStormImpact
                ? stormFeedback.find((row) => row.scope === feedbackScope && row.eventKey === feedbackEventKey)?.vote
                : undefined;
              return (
                <View
                  key={impact.id}
                  style={[
                    styles.historyRow,
                    { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
                  ]}
                  accessible={!isStormImpact}
                  accessibilityRole={isStormImpact ? undefined : 'text'}
                  accessibilityLabel={isStormImpact ? undefined : [severityLabel, impact.title, ...details, sourceUpdateText, untilText]
                    .filter(Boolean)
                    .join(', ')}
                >
                  <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
                    <Icon size={18} color={theme.textPrimary} strokeWidth={2} />
                  </View>
                  <View style={styles.rowTexts}>
                    <Text
                      style={[styles.historyRowTitle, { color: theme.textPrimary }]}
                      accessibilityLabel={`${severityLabel}, ${impact.title}`}
                    >
                      {impact.title}{impact.signalIds.length > 1 ? ` ×${impact.signalIds.length}` : ''}
                    </Text>
                    <Text style={[styles.historyRowBody, { color: theme.textSecondary }]}>
                      {details.join('\n')}
                    </Text>
                    <Text style={[styles.historyMeta, { color: theme.textTertiary }]}>
                      {sourceUpdateText}{untilText ? ` · ${untilText}` : ''}
                    </Text>
                    {isStormImpact ? (
                      <View style={styles.feedbackBlock}>
                        <Text style={[styles.feedbackQuestion, { color: theme.textSecondary }]}>
                          {t('alert_storm_feedback_prompt')}
                        </Text>
                        <View style={styles.feedbackButtons}>
                          {([
                            { vote: 'useful' as const, label: t('alert_storm_feedback_useful'), Icon: ThumbsUp },
                            { vote: 'not-useful' as const, label: t('alert_storm_feedback_not_useful'), Icon: ThumbsDown },
                          ]).map(({ vote, label, Icon: FeedbackIcon }) => {
                            const selected = currentVote === vote;
                            return (
                              <Pressable
                                key={vote}
                                onPress={() => {
                                  haptics.select();
                                  submitStormFeedback(feedbackEventKey, vote);
                                }}
                                style={({ pressed }) => [
                                  styles.feedbackButton,
                                  { backgroundColor: selected ? theme.cardBorder : theme.chipBg },
                                  pressed && { opacity: 0.65 },
                                ]}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                accessibilityLabel={label}
                              >
                                <FeedbackIcon size={14} color={theme.textPrimary} strokeWidth={2.2} />
                                <Text style={[styles.feedbackButtonText, { color: theme.textPrimary }]}>{label}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        {currentVote ? (
                          <Text style={[styles.feedbackSaved, { color: theme.textTertiary }]}>
                            {t('alert_storm_feedback_saved')}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                  <View
                    style={[styles.severityDot, { backgroundColor: SEVERITY_COLORS[impact.severity] }]}
                  />
                </View>
              );
            })}
          </View>
        ) : null}

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
              <SlidingSwitch theme={theme}
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

        <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
          <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
            <Moon size={20} color={theme.textPrimary} strokeWidth={2} />
          </View>
          <View style={styles.rowTexts}>
            <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>
              {t('s_quiet_hours')}
            </Text>
            <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
              {t('s_quiet_sub')}
            </Text>
          </View>
          <SlidingSwitch theme={theme}
            value={ready ? settings.quietHoursEnabled : false}
            onValueChange={(value) => {
              if (value) {
                haptics.success();
              } else {
                haptics.light();
              }
              onUpdateQuiet({ quietHoursEnabled: value });
            }}
            trackColor={{ true: theme.accent, false: theme.trackColor }}
            thumbColor={settings.quietHoursEnabled ? '#FFFFFF' : theme.textTertiary}
            ios_backgroundColor={theme.trackColor}
          />
        </View>

        {ready && settings.quietHoursEnabled ? (
          <>
            <StepperRow
              theme={theme}
              label={t('s_quiet_start')}
              value={quietClock(settings.quietStartMinutes)}
              onStep={(delta) =>
                onUpdateQuiet({
                  quietStartMinutes: stepQuietMinutes(
                    settings.quietStartMinutes,
                    delta * QUIET_STEP_MINUTES,
                  ),
                })
              }
            />
            <StepperRow
              theme={theme}
              label={t('s_quiet_end')}
              value={quietClock(settings.quietEndMinutes)}
              onStep={(delta) =>
                onUpdateQuiet({
                  quietEndMinutes: stepQuietMinutes(
                    settings.quietEndMinutes,
                    delta * QUIET_STEP_MINUTES,
                  ),
                })
              }
            />
          </>
        ) : null}

        <View style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
          <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
            <Bell size={20} color={theme.textPrimary} strokeWidth={2} />
          </View>
          <View style={styles.rowTexts}>
            <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>
              {t('s_custom_alerts')}
            </Text>
            <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
              {t('s_custom_sub')}
            </Text>
          </View>
        </View>

        {rules.map((rule) => {
          const MetricIcon = CUSTOM_ICONS[rule.metric];
          return (
            <View
              key={rule.id}
              style={[styles.row, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
            >
              <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
                <MetricIcon size={20} color={theme.textPrimary} strokeWidth={2} />
              </View>
              <View style={styles.rowTexts}>
                <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                  {t(CUSTOM_METRIC_KEYS[rule.metric])} {rule.op === 'gte' ? '≥' : '≤'}{' '}
                  {formatCustomValue(rule.metric, rule.value)}
                </Text>
                {editingNoteId === rule.id ? (
                  <TextInput
                    value={draftNote}
                    onChangeText={setDraftNote}
                    onBlur={() => {
                      setNote(rule.id, draftNote);
                      setEditingNoteId(null);
                    }}
                    onSubmitEditing={() => {
                      setNote(rule.id, draftNote);
                      setEditingNoteId(null);
                    }}
                    autoFocus
                    maxLength={MAX_NOTE_LENGTH}
                    style={[styles.customNoteInput, { backgroundColor: theme.chipBg, color: theme.textPrimary, borderColor: theme.cardBorder }]}
                    placeholder={t('custom_note')}
                    placeholderTextColor={theme.textTertiary}
                    accessibilityLabel={t('custom_note')}
                  />
                ) : rule.note ? (
                  <Pressable
                    onPress={() => {
                      haptics.select();
                      setDraftNote(rule.note ?? '');
                      setEditingNoteId(rule.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('custom_note')}: ${rule.note}`}
                  >
                    <Text style={[styles.customNote, { color: theme.textTertiary }]} numberOfLines={1}>
                      {rule.note}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <SlidingSwitch theme={theme}
                value={rule.enabled}
                onValueChange={() => {
                  if (rule.enabled) {
                    haptics.light();
                  } else {
                    haptics.success();
                  }
                  toggleRule(rule.id);
                }}
                trackColor={{ true: theme.accent, false: theme.trackColor }}
                thumbColor={rule.enabled ? '#FFFFFF' : theme.textTertiary}
                ios_backgroundColor={theme.trackColor}
              />
              <Pressable
                onPress={() => {
                  haptics.light();
                  deleteRule(rule.id);
                }}
                hitSlop={8}
                style={styles.customDelete}
                accessibilityRole="button"
                accessibilityLabel={t('custom_delete')}
              >
                <X size={18} color={theme.textSecondary} strokeWidth={2.4} />
              </Pressable>
            </View>
          );
        })}

        {builderOpen ? (
          <View
            style={[
              styles.customBuilder,
              { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
            ]}
          >
            <StepperRow
              theme={theme}
              label={t('custom_metric')}
              value={t(CUSTOM_METRIC_KEYS[draftMetric])}
              onStep={(delta) => {
                const index = METRIC_ORDER.indexOf(draftMetric);
                const next =
                  METRIC_ORDER[(index + delta + METRIC_ORDER.length) % METRIC_ORDER.length];
                if (next) {
                  setDraftMetric(next);
                  setDraftValue(METRIC_DEFAULT_VALUES[next]);
                }
              }}
            />
            <View style={styles.customSegmentRow}>
              <Segmented
                theme={theme}
                options={[
                  { value: 'gte', label: '≥' },
                  { value: 'lte', label: '≤' },
                ]}
                value={draftOp}
                onChange={(value) => setDraftOp(value as CustomOp)}
              />
            </View>
            <StepperRow
              theme={theme}
              label={t('custom_value')}
              value={formatCustomValue(draftMetric, draftValue)}
              onStep={(delta) => {
                const { step, min, max } = METRIC_STEPS[draftMetric];
                setDraftValue(Math.min(max, Math.max(min, draftValue + delta * step)));
              }}
            />
            <TextInput
              value={draftNote}
              onChangeText={setDraftNote}
              maxLength={MAX_NOTE_LENGTH}
              style={[
                styles.customNoteInput,
                { backgroundColor: theme.chipBg, color: theme.textPrimary, borderColor: theme.cardBorder },
              ]}
              placeholder={t('custom_note')}
              placeholderTextColor={theme.textTertiary}
              accessibilityLabel={t('custom_note')}
            />
            <Pressable
              onPress={() => {
                haptics.success();
                addRule(draftMetric, draftOp, draftValue, draftNote);
                setDraftNote('');
                setBuilderOpen(false);
              }}
              style={({ pressed }) => [
                styles.customAdd,
                { backgroundColor: theme.chipBg, borderColor: theme.accent },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('custom_add_rule')}
            >
              <Plus size={16} color={theme.textPrimary} strokeWidth={2.4} />
              <Text style={[styles.customAddText, { color: theme.textPrimary }]}>
                {t('custom_add_rule')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              haptics.select();
              setBuilderOpen(true);
            }}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('custom_add_rule')}
          >
            <View style={[styles.iconBox, { backgroundColor: theme.chipBg }]}>
              <Plus size={20} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rowTexts}>
              <Text style={[styles.rowTitle, { color: theme.textPrimary }]}>
                {t('custom_add_rule')}
              </Text>
            </View>
          </Pressable>
        )}

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
            // Keep each outcome row intact: merging repeated alert signals can
            // hide whether delivery was scheduled, suppressed, or expired.
            history.slice(0, MAX_ALERT_HISTORY).map((entry) => {
              const key = entry.key.slice(entry.key.lastIndexOf(':') + 1);
              const Icon = ALERT_ICONS[key as AlertKey] ?? Bell;
              const details = [
                entry.message,
                entry.evidence ? formatAlertEvidence(entry.evidence) : null,
              ].filter((detail): detail is string => Boolean(detail));
              const cityLabel = entry.city?.trim() ?? '';
              const outcome = entry.deliveryStatus === 'scheduled'
                ? t('alert_outcome_scheduled')
                : entry.deliveryStatus === 'quiet-hours'
                  ? t('alert_outcome_quiet_hours')
                  : entry.deliveryStatus === 'permission-denied'
                    ? t('alert_outcome_permission')
                    : entry.deliveryStatus === 'scheduling-failed'
                      ? t('alert_outcome_failed')
                      : entry.deliveryStatus === 'expired'
                        ? t('alert_outcome_expired')
                        : t('alert_outcome_legacy');
              const expired = entry.deliveryStatus !== 'expired' &&
                typeof entry.expiresAt === 'number' && entry.expiresAt <= clockNow;
              const outcomeDetails = [
                outcome,
                entry.escalated ? t('alert_outcome_escalated') : null,
                expired ? t('alert_outcome_expired') : null,
              ].filter((value): value is string => Boolean(value));
              const timeLabel = historyStamp(entry.at);
              const severityLabel = alertSeverityLabel(entry.severity);
              const accessibleLabel = [
                severityLabel,
                entry.title,
                ...outcomeDetails,
                ...details,
                cityLabel,
                timeLabel,
              ].filter(Boolean).join(', ');
              return (
                <View
                  key={`${entry.key}:${entry.at}:${entry.deliveryStatus ?? 'legacy'}`}
                  style={[
                    styles.historyRow,
                    { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
                  ]}
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={accessibleLabel}
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
                    <Text style={[styles.historyRowBody, { color: theme.textSecondary }]}>
                      {details.join('\n')}
                    </Text>
                    <Text style={[styles.historyMeta, { color: theme.textTertiary }]}>
                      {outcomeDetails.join(' · ')}
                    </Text>
                    <Text
                      style={[styles.historyMeta, { color: theme.textTertiary }]}
                      numberOfLines={1}
                    >
                      {cityLabel ? `${cityLabel} · ` : ''}{timeLabel}
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
  previewCard: {
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  previewTitle: {
    fontSize: 14,
    fontFamily: F.semibold,
  },
  previewBody: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: F.regular,
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
  feedbackBlock: {
    gap: 6,
    marginTop: 7,
  },
  feedbackQuestion: {
    fontSize: 11.5,
    fontFamily: F.medium,
  },
  feedbackButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  feedbackButtonText: {
    fontSize: 11,
    fontFamily: F.semibold,
  },
  feedbackSaved: {
    fontSize: 10.5,
    fontFamily: F.regular,
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
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  stepperLabel: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: F.medium,
  },
  stepperValue: {
    fontSize: 14,
    fontFamily: F.semibold,
    minWidth: 64,
    textAlign: 'center',
  },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customBuilder: {
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 2,
    marginTop: 2,
  },
  customDelete: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  customAddText: {
    fontSize: 13.5,
    fontFamily: F.semibold,
  },
  customNoteInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 6,
    fontSize: 13.5,
    fontFamily: F.medium,
  },
  customNote: {
    fontSize: 12.5,
    fontFamily: F.medium,
    marginTop: 2,
    fontStyle: 'italic',
  },
  customSegmentRow: {
    marginTop: 4,
    paddingHorizontal: 4,
  },
  segmentWrap: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 11,
  },
  segmentText: {
    fontSize: 14,
    fontFamily: F.medium,
  },
});
