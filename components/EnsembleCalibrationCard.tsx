import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { F } from '../theme/typography';
import { t } from '../utils/i18n';
import { convertWind, formatTemperatureDelta, windUnitLabel } from '../utils/format';
import type {
  ContinuousCalibrationMetricSummary,
  EnsembleCalibrationSummary,
} from '../utils/ensembleCalibrationMath';
import type { AppTheme } from '../theme/palettes';

interface EnsembleCalibrationCardProps {
  theme: AppTheme;
  summary: EnsembleCalibrationSummary;
}

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function errorValue(value: number | null, metric: 'temperature' | 'wind'): string {
  if (value === null) return '—';
  if (metric === 'temperature') return formatTemperatureDelta(value);
  return `${convertWind(value).toFixed(1)} ${windUnitLabel()}`;
}

function intervalWidth(value: number | null, metric: 'temperature' | 'wind'): string {
  if (value === null) return '—';
  if (metric === 'temperature') return formatTemperatureDelta(value);
  return `${convertWind(value).toFixed(1)} ${windUnitLabel()}`;
}

function LeadCoverageChart({
  theme,
  summary,
}: {
  theme: AppTheme;
  summary: ContinuousCalibrationMetricSummary;
}) {
  return (
    <View style={styles.coverageChart}>
      <Text style={[styles.chartTitle, { color: theme.textSecondary }]}>
        {t('ensemble_calibration_lead_chart_title')}
      </Text>
      {summary.leadTimeBuckets.map((bucket) => {
        const supported = bucket.sufficientlyPopulated && bucket.centralIntervalCoverage !== null &&
          bucket.coverageLower95 !== null && bucket.coverageUpper95 !== null;
        const coverage = supported ? bucket.centralIntervalCoverage as number : 0;
        const lower = supported ? bucket.coverageLower95 as number : 0;
        const upper = supported ? bucket.coverageUpper95 as number : 0;
        const support = t('ensemble_calibration_support')
          .replace('{cases}', String(bucket.cases))
          .replace('{days}', String(bucket.verifiedDays));
        const estimate = supported
          ? t('ensemble_calibration_coverage_interval')
              .replace('{coverage}', percent(coverage))
              .replace('{lower}', percent(lower))
              .replace('{upper}', percent(upper))
          : t('ensemble_calibration_bucket_insufficient');
        const label = `${bucket.startLeadHours}–${bucket.endLeadHours} hours. ${support}. ${estimate}`;
        return (
          <View key={`${bucket.startLeadHours}:${bucket.endLeadHours}`} style={styles.coverageRow}
            accessible accessibilityRole="text" accessibilityLabel={label}>
            <View style={styles.coverageLabels}>
              <Text style={[styles.leadLabel, { color: theme.textPrimary }]}>
                {bucket.startLeadHours}–{bucket.endLeadHours} h
              </Text>
              <Text style={[styles.supportLabel, { color: theme.textTertiary }]}>{support}</Text>
            </View>
            <View style={[styles.coverageTrack, { backgroundColor: theme.chipBg }]}>
              {supported ? (
                <>
                  <View style={[styles.coverageFill, { width: `${coverage * 100}%`, backgroundColor: theme.accent }]} />
                  <View style={[styles.coverageUncertainty, {
                    left: `${lower * 100}%`,
                    width: `${Math.max(1, (upper - lower) * 100)}%`,
                    backgroundColor: theme.textPrimary,
                  }]} />
                </>
              ) : null}
              <View style={[styles.targetMarker, { left: '80%', backgroundColor: theme.textTertiary }]} />
            </View>
            <Text style={[styles.coverageEstimate, { color: theme.textSecondary }]}>{estimate}</Text>
          </View>
        );
      })}
    </View>
  );
}

function MetricRow({
  theme,
  title,
  metric,
  summary,
}: {
  theme: AppTheme;
  title: string;
  metric: 'temperature' | 'wind';
  summary: ContinuousCalibrationMetricSummary;
}) {
  const ready = summary.status === 'ready';
  const lines = ready
    ? [
        t('ensemble_calibration_metrics')
          .replace('{error}', errorValue(summary.medianAbsoluteError, metric))
          .replace('{coverage}', percent(summary.centralIntervalCoverage))
          .replace('{width}', intervalWidth(summary.meanIntervalWidth, metric)),
        t('ensemble_calibration_coverage_interval')
          .replace('{coverage}', percent(summary.centralIntervalCoverage))
          .replace('{lower}', percent(summary.coverageLower95))
          .replace('{upper}', percent(summary.coverageUpper95)),
      ]
    : [
        t('ensemble_calibration_insufficient')
          .replace('{cases}', String(summary.verifiedCases))
          .replace('{requiredCases}', String(summary.requiredCases))
          .replace('{days}', String(summary.verifiedDays))
          .replace('{requiredDays}', String(summary.requiredDays)),
      ];

  return (
    <View style={styles.metric} accessible accessibilityRole="text"
      accessibilityLabel={`${title}. ${lines.join('. ')}`}>
      <Text style={[styles.metricTitle, { color: theme.textPrimary }]}>{title}</Text>
      {lines.map((line, index) => (
        <Text key={`${index}:${line}`} style={[styles.metricBody, { color: theme.textSecondary }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

/** Sample-gated, local verification of the temperature and wind ensemble bands. */
export function EnsembleCalibrationCard({ theme, summary }: EnsembleCalibrationCardProps) {
  return (
    <Card theme={theme} title={t('ensemble_calibration_title')}>
      <Text style={[styles.caption, { color: theme.textTertiary }]}>
        {t('ensemble_calibration_info')}
      </Text>
      <View style={styles.metrics}>
        <MetricRow
          theme={theme}
          title={t('ensemble_calibration_temperature')}
          metric="temperature"
          summary={summary.temperature}
        />
        <LeadCoverageChart theme={theme} summary={summary.temperature} />
        <MetricRow
          theme={theme}
          title={t('ensemble_calibration_wind')}
          metric="wind"
          summary={summary.wind}
        />
        <LeadCoverageChart theme={theme} summary={summary.wind} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 11.5, lineHeight: 16, marginBottom: 10 },
  metrics: { gap: 12 },
  metric: { gap: 3 },
  metricTitle: { fontSize: 12.5, fontFamily: F.semibold },
  metricBody: { fontSize: 11.5, lineHeight: 16 },
  coverageChart: { gap: 7, marginTop: -5, marginBottom: 4 },
  chartTitle: { fontSize: 11.5, fontFamily: F.semibold },
  coverageRow: { gap: 4 },
  coverageLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  leadLabel: { fontSize: 11, fontFamily: F.medium },
  supportLabel: { fontSize: 10.5, fontVariant: ['tabular-nums'] },
  coverageTrack: { height: 10, borderRadius: 6, overflow: 'visible', position: 'relative' },
  coverageFill: { height: 10, borderRadius: 6, opacity: 0.7 },
  coverageUncertainty: { position: 'absolute', top: -3, height: 16, width: 2, borderRadius: 2 },
  targetMarker: { position: 'absolute', top: -2, width: 1, height: 14 },
  coverageEstimate: { fontSize: 10.5, lineHeight: 14 },
});
