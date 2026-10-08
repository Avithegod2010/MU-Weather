import { SlidingGroup, SlidingItem } from './Sliding';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../utils/i18n';
import { F } from '../theme/typography';
import { Card } from './Card';
import { Snowflake, Sun, Thermometer, Shirt } from '../utils/uiIcons';
import { haptics } from '../utils/haptics';
import type { LucideIcon } from 'lucide-react-native';
import type { AppTheme } from '../theme/palettes';
import type { ComfortJournalEntry, ComfortRating } from '../utils/comfortJournal';

interface ComfortJournalCardProps {
  theme: AppTheme;
  /** The rating already recorded for today, or null when not yet answered. */
  today: ComfortJournalEntry | null;
  /** Total rating days stored - shown once calibration is collecting. */
  total: number;
  /** Record (or change) today's rating. */
  onRate: (rating: ComfortRating) => void;
  revealDelay?: number;
}

const CHOICES: Array<{ rating: ComfortRating; icon: LucideIcon }> = [
  { rating: 'cold', icon: Snowflake },
  { rating: 'ok', icon: Shirt },
  { rating: 'hot', icon: Sun },
];

/**
 * The compact weather-journal prompt: "How did today feel?" with three
 * choices, reusing the existing Card idiom (same surface, header typography
 * and chip shapes as every other home card).
 *
 * Only prompts for TODAY in v1 - no back-filling. Once answered the choice is
 * shown and stays tappable to change it (the journal upserts one entry per
 * date, so changing it replaces the day's rating).
 *
 * Entirely on-device: the rating never leaves the phone.
 */
export function ComfortJournalCard({
  theme,
  today,
  total,
  onRate,
  revealDelay,
}: ComfortJournalCardProps) {
  const savedLabel = today ? t(`journal_rating_${today.rating}`) : null;

  return (
    <Card theme={theme} title={t('journal_title')} icon={Thermometer} revealDelay={revealDelay}>
      {savedLabel ? (
        <>
          <Text style={[styles.saved, { color: theme.textPrimary }]}>
            {t('journal_saved').split('{rating}').join(savedLabel)}
          </Text>
          <Text style={[styles.changeHint, { color: theme.textTertiary }]}>{t('journal_change')}</Text>
        </>
      ) : (
        <Text style={[styles.prompt, { color: theme.textSecondary }]}>{t('journal_prompt')}</Text>
      )}
      <SlidingGroup
        theme={theme}
        activeIndex={CHOICES.findIndex(({ rating }) => today?.rating === rating)}
        color={theme.chipBg}
        radius={14}
        style={styles.choices}
      >
        {CHOICES.map(({ rating, icon: Icon }, index) => {
          const selected = today?.rating === rating;
          return (
            <SlidingItem
              key={rating}
              index={index}
              onPress={() => {
                haptics.select();
                onRate(rating);
              }}
              style={[styles.choice, { borderColor: theme.cardBorder }]}
              pressedOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`journal_a11y_${rating}`)}
            >
              <Icon
                size={16}
                color={selected ? theme.textPrimary : theme.textSecondary}
                strokeWidth={2.2}
              />
              <Text
                style={[styles.choiceText, { color: selected ? theme.textPrimary : theme.textSecondary }]}
                numberOfLines={1}
              >
                {t(`journal_rating_${rating}`)}
              </Text>
            </SlidingItem>
          );
        })}
      </SlidingGroup>
      {total > 0 ? (
        <Text style={[styles.progress, { color: theme.textTertiary }]}>
          {(total === 1 ? t('journal_progress_one') : t('journal_progress')).split('{n}').join(String(total))}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  saved: {
    fontSize: 15,
    fontFamily: F.semibold,
  },
  prompt: {
    fontSize: 14,
    fontFamily: F.regular,
    lineHeight: 19,
  },
  changeHint: {
    fontSize: 12,
    fontFamily: F.regular,
    marginTop: 2,
  },
  choices: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  choice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  choiceText: {
    fontSize: 12.5,
    fontFamily: F.semibold,
  },
  progress: {
    fontSize: 11,
    fontFamily: F.regular,
    marginTop: 10,
    textAlign: 'center',
  },
});