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
        ...summary.leadTimeBuckets
          .filter((bucket) => bucket.sufficientlyPopulated)
          .map((bucket) =>
            t('ensemble_calibration_lead')
              .replace('{from}', String(bucket.startLeadHours))
              .replace('{to}', String(bucket.endLeadHours))
              .replace('{error}', errorValue(bucket.medianAbsoluteError, metric))
              .replace('{coverage}', percent(bucket.centralIntervalCoverage))
              .replace('{cases}', String(bucket.cases))
              .replace('{days}', String(bucket.verifiedDays)),
          ),
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
        <MetricRow
          theme={theme}
          title={t('ensemble_calibration_wind')}
          metric="wind"
          summary={summary.wind}
        />
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
});
