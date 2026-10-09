import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../utils/i18n';
import { F } from '../theme/typography';
import { Card } from './Card';
import { ChevronLeft, ChevronRight, Clock, Settings } from '../utils/uiIcons';
import { convertWind, formatTemp, formatTemperatureDelta, windUnitLabel } from '../utils/format';
import { haptics } from '../utils/haptics';
import type { OutdoorReasonCode, OutdoorPreferenceControlKey, OutdoorPreferences } from '../utils/outdoorPlanPolicy';
import type { OutdoorWindowFeedbackVote } from '../utils/outdoorWindowFeedbackPolicy';
import type { AppTheme } from '../theme/palettes';

interface BestWindowCardProps {
  theme: AppTheme;
  /** Localized "2 PM – 4 PM looks best today" line from bestWindowLine(). */
  line: string;
  /** 0-100 comfort score for the window. */
  score: number;
  reasons: OutdoorReasonCode[];
  preferences: OutdoorPreferences;
  onPreferenceStep: (key: OutdoorPreferenceControlKey, delta: number) => void;
  windowFeedback: OutdoorWindowFeedbackVote | null;
  onWindowFeedback: (vote: OutdoorWindowFeedbackVote) => void;
  journalSamples: number;
  journalSuggestionSamples: number;
  journalSuggestionOffsetC: number | null;
  journalAppliedOffsetC: number;
  onApplyJournalSuggestion: (offsetC: number) => void;
  onResetJournalSuggestion: () => void;
}

/** Comfort tint: green when the window is genuinely pleasant, amber/red as it degrades. */
function scoreColor(score: number): string {
  if (score >= 70) return '#5BC98C';
  if (score >= 45) return '#EFC25C';
  return '#F0964E';
}

function reasonLabel(code: OutdoorReasonCode): string {
  if (code.startsWith('rain-')) return t('cmp_rain');
  if (code.startsWith('temperature-')) return t('cmp_temp');
  if (code.startsWith('wind-')) return t('cmp_wind');
  if (code.startsWith('uv-')) return t('tile_uv');
  return t('cmp_aqi');
}

function reasonMarker(code: OutdoorReasonCode): string {
  if (code.endsWith('-unknown')) return '?';
  if (code.includes('above-') || code.includes('too-')) return '!';
  return '✓';
}

function PreferenceStepper({
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
    <View style={styles.preferenceRow}>
      <Text style={[styles.preferenceLabel, { color: theme.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <Pressable
        onPress={() => { haptics.select(); onStep(-1); }}
        style={({ pressed }) => [styles.preferenceButton, { backgroundColor: theme.chipBg }, pressed && { opacity: 0.65 }]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${t('a11y_decrease')} ${label}`}
        accessibilityValue={{ text: value }}
      >
        <ChevronLeft size={15} color={theme.textPrimary} strokeWidth={2.4} />
      </Pressable>
      <Text style={[styles.preferenceValue, { color: theme.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
      <Pressable
        onPress={() => { haptics.select(); onStep(1); }}
        style={({ pressed }) => [styles.preferenceButton, { backgroundColor: theme.chipBg }, pressed && { opacity: 0.65 }]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${t('a11y_increase')} ${label}`}
        accessibilityValue={{ text: value }}
      >
        <ChevronRight size={15} color={theme.textPrimary} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

/**
 * Best future outdoor window plus optional user comfort limits. Positive and
 * uncertain reason markers use translated metric names; no new locale copy is
 * introduced by this card.
 */
export function BestWindowCard({
  theme,
  line,
  score,
  reasons,
  preferences,
  onPreferenceStep,
  windowFeedback,
  onWindowFeedback,
  journalSamples,
  journalSuggestionSamples,
  journalSuggestionOffsetC,
  journalAppliedOffsetC,
  onApplyJournalSuggestion,
  onResetJournalSuggestion,
}: BestWindowCardProps) {
  const [showPreferences, setShowPreferences] = useState(false);
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const reasonKeys = [...new Set(reasons)];
  const journalSuggestionPending =
    journalSuggestionOffsetC !== null && Math.abs(journalSuggestionOffsetC - journalAppliedOffsetC) >= 0.1;
  const preferenceRows: {
    key: OutdoorPreferenceControlKey;
    label: string;
    value: string;
  }[] = [
    { key: 'rain', label: t('cmp_rain'), value: `≤${Math.round(preferences.maxRainProbability)}%` },
    {
      key: 'temperature',
      label: t('cmp_temp'),
      value: `${formatTemp(preferences.minTemperatureC)}–${formatTemp(preferences.maxTemperatureC)}`,
    },
    {
      key: 'wind',
      label: t('cmp_wind'),
      value: `≤${Math.round(convertWind(preferences.maxWindKmh))} ${windUnitLabel()}`,
    },
    { key: 'uv', label: t('tile_uv'), value: `≤${Math.round(preferences.maxUvIndex)}` },
    { key: 'aqi', label: t('cmp_aqi'), value: `≤${Math.round(preferences.maxAqi)}` },
  ];
  return (
    <Card theme={theme} title={t('card_best_window')} icon={Clock}>
      <Text style={[styles.line, { color: theme.textPrimary }]}>{line}</Text>
      <View style={styles.reasonRow}>
        {reasonKeys.map((code) => (
          <Text
            key={code}
            style={[
              styles.reason,
              {
                backgroundColor: theme.chipBg,
                color: code.endsWith('-unknown') ? theme.textTertiary : code.includes('above-') || code.includes('too-') ? '#EFC25C' : '#5BC98C',
              },
            ]}
          >
            {reasonLabel(code)} {reasonMarker(code)}
          </Text>
        ))}
      </View>
      <View style={[styles.track, { backgroundColor: theme.chipBg }]}>
        <View style={[styles.fill, { flex: Math.max(clamped, 1), backgroundColor: scoreColor(clamped) }]} />
        <View style={{ flex: Math.max(100 - clamped, 0) }} />
      </View>
      <Text style={[styles.score, { color: theme.textTertiary }]}>
        {t('best_window_score').replace('{n}', String(clamped))}
      </Text>
      <View style={styles.windowFeedbackBlock}>
        <Text style={[styles.windowFeedbackPrompt, { color: theme.textSecondary }]}>
          {t('best_window_feedback_prompt')}
        </Text>
        <View style={styles.windowFeedbackButtons}>
          {([
            { vote: 'good-fit' as const, label: t('best_window_feedback_good') },
            { vote: 'not-for-me' as const, label: t('best_window_feedback_bad') },
          ]).map(({ vote, label }) => {
            const selected = windowFeedback === vote;
            return (
              <Pressable
                key={vote}
                onPress={() => onWindowFeedback(vote)}
                style={({ pressed }) => [
                  styles.windowFeedbackButton,
                  { backgroundColor: selected ? theme.cardBorder : theme.chipBg },
                  pressed && { opacity: 0.65 },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
              >
                <Text style={[styles.windowFeedbackButtonText, { color: theme.textPrimary }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {windowFeedback ? (
          <Text style={[styles.windowFeedbackSaved, { color: theme.textTertiary }]}>
            {t('best_window_feedback_saved')}
          </Text>
        ) : null}
      </View>
      {journalSamples > 0 ? (
        <Text style={[styles.journalProgress, { color: theme.textTertiary }]}>
          {(journalSamples === 1 ? t('journal_progress_one') : t('journal_progress')).replace('{n}', String(journalSamples))}
        </Text>
      ) : null}
      {journalSuggestionOffsetC !== null ? (
        <View style={[styles.journalSuggestion, { borderColor: theme.cardBorder }]}>
          <Text style={[styles.journalSuggestionText, { color: theme.textSecondary }]}>
            {t('journal_preference_suggestion')
              .replace('{offset}', formatTemperatureDelta(journalSuggestionOffsetC))
              .replace('{samples}', String(journalSuggestionSamples))}
          </Text>
          {journalSuggestionPending ? (
            <Pressable
              onPress={() => onApplyJournalSuggestion(journalSuggestionOffsetC)}
              style={({ pressed }) => [styles.journalButton, { backgroundColor: theme.chipBg }, pressed && { opacity: 0.65 }]}
              accessibilityRole="button"
              accessibilityLabel={t('journal_apply_suggestion')}
            >
              <Text style={[styles.journalButtonText, { color: theme.textPrimary }]}>{t('journal_apply_suggestion')}</Text>
            </Pressable>
          ) : null}
          {journalAppliedOffsetC !== 0 ? (
            <Pressable
              onPress={onResetJournalSuggestion}
              style={({ pressed }) => [styles.journalButton, { backgroundColor: theme.chipBg }, pressed && { opacity: 0.65 }]}
              accessibilityRole="button"
              accessibilityLabel={t('journal_reset_suggestion')}
            >
              <Text style={[styles.journalButtonText, { color: theme.textSecondary }]}>{t('journal_reset_suggestion')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : journalAppliedOffsetC !== 0 ? (
        <Pressable
          onPress={onResetJournalSuggestion}
          style={({ pressed }) => [styles.journalButton, { backgroundColor: theme.chipBg, alignSelf: 'flex-start' }, pressed && { opacity: 0.65 }]}
          accessibilityRole="button"
          accessibilityLabel={t('journal_reset_suggestion')}
        >
          <Text style={[styles.journalButtonText, { color: theme.textSecondary }]}>{t('journal_reset_suggestion')}</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => setShowPreferences((visible) => !visible)}
        style={({ pressed }) => [styles.preferencesToggle, { backgroundColor: theme.chipBg }, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: showPreferences }}
        accessibilityLabel={t('s_title')}
      >
        <Settings size={15} color={theme.textSecondary} strokeWidth={2.1} />
        <Text style={[styles.preferencesToggleText, { color: theme.textSecondary }]}>{t('s_title')}</Text>
      </Pressable>
      {showPreferences ? (
        <View style={[styles.preferences, { borderTopColor: theme.cardBorder }]}>
          {preferenceRows.map((row) => (
            <PreferenceStepper
              key={row.key}
              theme={theme}
              label={row.label}
              value={row.value}
              onStep={(delta) => onPreferenceStep(row.key, delta)}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  line: {
    fontSize: 16,
    fontFamily: F.semibold,
    marginBottom: 8,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 11,
  },
  reason: {
    fontSize: 10.5,
    fontFamily: F.semibold,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
    overflow: 'hidden',
  },
  track: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  score: {
    fontSize: 11,
    fontFamily: F.medium,
    marginTop: 7,
  },
  windowFeedbackBlock: {
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.25)',
    paddingTop: 9,
    marginTop: 8,
  },
  windowFeedbackPrompt: {
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: F.medium,
  },
  windowFeedbackButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  windowFeedbackButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  windowFeedbackButtonText: {
    fontSize: 11,
    fontFamily: F.semibold,
  },
  windowFeedbackSaved: {
    fontSize: 10.5,
    fontFamily: F.regular,
  },
  journalProgress: {
    fontSize: 10.5,
    fontFamily: F.regular,
    marginTop: 4,
  },
  journalSuggestion: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 7,
    paddingTop: 9,
    marginTop: 8,
  },
  journalSuggestionText: {
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: F.regular,
  },
  journalButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  journalButtonText: {
    fontSize: 11.5,
    fontFamily: F.semibold,
  },
  preferencesToggle: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  preferencesToggleText: {
    fontSize: 11.5,
    fontFamily: F.medium,
  },
  preferences: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 5,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 34,
  },
  preferenceLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: F.medium,
  },
  preferenceValue: {
    minWidth: 72,
    fontSize: 11.5,
    fontFamily: F.semibold,
    textAlign: 'center',
  },
  preferenceButton: {
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
