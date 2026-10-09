import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { t, tDay } from '../utils/i18n';
import { F } from '../theme/typography';
import { WeatherIcon } from './WeatherIcon';
import { ErrorState } from './ErrorState';
import { formatTemp, formatTemperatureDelta, convertWind, windUnitLabel, formatPrecip, precipUnitLabel } from '../utils/format';
import { describeWmo } from '../utils/wmo';
import { betterIndex, betterWindIndex, alignedDays, weekVerdict, COMPARE_DAYS } from '../utils/twoCityCompare';
import type { BetterRule, TwoCityDayRow, WeekVerdict } from '../utils/twoCityCompare';
import type { AppTheme } from '../theme/palettes';
import type { GeoLocation, DayPoint, MonthlyNormal } from '../api/types';
import type { ComparisonEntry } from '../hooks/useCityComparison';

const LABEL_WIDTH = 78;
const COL_WIDTH = 96;
const BEST_COLOR = '#5BC98C';

interface Widths {
  label: number;
  column: number;
  border: string;
}

interface TwoCityComparePanelProps {
  theme: AppTheme;
  favorites: GeoLocation[];
  selection: [string | null, string | null];
  onSelect: (slot: 0 | 1, cityId: string) => void;
  entries: [ComparisonEntry | null, ComparisonEntry | null];
  status: 'idle' | 'loading' | 'ready';
  climateA: MonthlyNormal[] | null;
  climateB: MonthlyNormal[] | null;
  onRetry: () => void;
}

/** Which metric each table row compares, and the rule that decides "better". */
interface DayMetric {
  key: string;
  label: string;
  rule: BetterRule;
  /** Formatted cell text. */
  value: (day: DayPoint | null) => string;
  /** Raw comparable number, used only for the better-side decision. */
  raw: (day: DayPoint | null) => number | null;
  /** Unit suffix from the user's unit settings. */
  unit?: () => string;
}

function dayOfWeek(iso: string): string {
  const time = Date.parse(`${iso}T12:00:00Z`);
  return Number.isNaN(time) ? '--' : tDay(new Date(time).getUTCDay());
}

/** AQI cell text, or '--' when the city has no air-quality data. */
function aqiText(entry: ComparisonEntry | null): string {
  const aqi = entry?.data?.aqi?.usAqi;
  return aqi === null || aqi === undefined ? '--' : String(Math.round(aqi));
}

/** Today's location-local forecast high minus that city's 1991–2020 monthly normal. */
function forecastHighAnomaly(entry: ComparisonEntry | null, months: MonthlyNormal[] | null): string {
  const date = entry?.data?.daily[0]?.date;
  const high = entry?.data?.daily[0]?.tMax;
  if (!date || typeof high !== 'number' || !months) return '--';
  const month = Number(date.slice(5, 7));
  const normal = months.find((row) => row.month === month);
  if (!normal) return '--';
  return formatTemperatureDelta(high - normal.tMaxMean);
}

/**
 * Verdict sentence. Uses the trip planner's wet-day wording so "wet" means the
 * same thing across the app, and reads "evenly matched" on a genuine tie.
 */
function buildVerdictText(
  verdict: WeekVerdict,
  entryA: ComparisonEntry | null,
  entryB: ComparisonEntry | null,
): string | null {
  if (verdict.empty) return null;
  if (verdict.winner === -1) return t('c2_verdict_tie');
  const winner = verdict.winner === 0 ? entryA : entryB;
  const name = winner?.city.name ?? '';
  if (!name) return null;
  const wet = verdict.winner === 0 ? verdict.wetA : verdict.wetB;
  const other = verdict.winner === 0 ? verdict.wetB : verdict.wetA;
  return t('c2_verdict')
    .split('{city}')
    .join(name)
    .split('{wet}')
    .join(String(wet))
    .split('{other}')
    .join(String(other));
}
export function TwoCityComparePanel({
  theme,
  favorites,
  selection,
  onSelect,
  entries,
  status,
  climateA,
  climateB,
  onRetry,
}: TwoCityComparePanelProps) {
  const widths: Widths = { label: LABEL_WIDTH, column: COL_WIDTH, border: theme.trackColor };
  const [entryA, entryB] = entries;

  // --- Not enough saved cities to compare anything. ---
  if (favorites.length < 2) {
    return (
      <ErrorState
        theme={theme}
        title={t('c2_needs_two')}
        message={t('c2_needs_two_msg')}
        variant="empty"
      />
    );
  }

  const verdict = weekVerdict(entryA?.data ?? null, entryB?.data ?? null);
  const verdictText = buildVerdictText(verdict, entryA, entryB);

  const metrics: DayMetric[] = [
    {
      key: 'high',
      label: t('c2_high'),
      rule: 'warmest',
      raw: (day) => (day ? day.tMax : null),
      value: (day) => (day ? formatTemp(day.tMax) : '--'),
    },
    {
      key: 'low',
      label: t('c2_low'),
      rule: 'coolest',
      raw: (day) => (day ? day.tMin : null),
      value: (day) => (day ? formatTemp(day.tMin) : '--'),
    },
    {
      key: 'rain',
      label: t('c2_rain_chance'),
      // Percentage points, so it needs the percent epsilon - not the mm one.
      rule: 'least_rainy',
      raw: (day) => (day ? day.precipProbabilityMax : null),
      value: (day) => (day ? `${Math.round(day.precipProbabilityMax)}%` : '--'),
    },
    {
      key: 'precip',
      label: t('c2_precip'),
      rule: 'driest',
      raw: (day) => (day ? day.precipSum : null),
      value: (day) => (day ? formatPrecip(day.precipSum) : '--'),
      unit: precipUnitLabel,
    },
    {
      key: 'wind',
      label: t('c2_wind'),
      rule: 'calmest',
      raw: (day) => (day ? day.windMax : null),
      value: (day) => (day ? String(Math.round(convertWind(day.windMax))) : '--'),
      unit: windUnitLabel,
    },
    {
      key: 'uv',
      label: t('c2_uv'),
      rule: 'sunniest',
      raw: (day) => (day ? day.uvIndexMax : null),
      value: (day) => (day ? String(Math.round(day.uvIndexMax)) : '--'),
    },
  ];

  const rows = alignedDays(entryA?.data ?? null, entryB?.data ?? null);
  return (
    <View style={styles.root}>
      {/* City pickers */}
      <View style={styles.pickers}>
        {[0, 1].map((slot) => (
          <CitySlot
            key={slot}
            theme={theme}
            slot={slot as 0 | 1}
            favorites={favorites}
            selectedId={selection[slot]}
            entry={slot === 0 ? entryA : entryB}
            onSelect={onSelect}
            onRetry={onRetry}
            width={COL_WIDTH}
          />
        ))}
      </View>

      {status === 'loading' ? (
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>{t('c2_loading')}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableContent}>
          <View>
            <LiveHeader theme={theme} entryA={entryA} entryB={entryB} widths={widths} />
            <LiveRow theme={theme} widths={widths} label={t('cmp_temp')}
              a={entryA?.data ? formatTemp(entryA.data.current.temperature) : '--'}
              b={entryB?.data ? formatTemp(entryB.data.current.temperature) : '--'} />
            <LiveRow theme={theme} widths={widths} label={t('cmp_feels')}
              a={entryA?.data ? formatTemp(entryA.data.current.apparentTemperature) : '--'}
              b={entryB?.data ? formatTemp(entryB.data.current.apparentTemperature) : '--'} />
            <LiveRow theme={theme} widths={widths} label={t('cmp_wind')}
              a={entryA?.data ? `${Math.round(convertWind(entryA.data.current.windSpeed))} ${windUnitLabel()}` : '--'}
              b={entryB?.data ? `${Math.round(convertWind(entryB.data.current.windSpeed))} ${windUnitLabel()}` : '--'} />
            <LiveRow theme={theme} widths={widths} label={t('c2_humidity')}
              a={entryA?.data ? `${Math.round(entryA.data.current.humidity)}%` : '--'}
              b={entryB?.data ? `${Math.round(entryB.data.current.humidity)}%` : '--'} />
            <LiveRow theme={theme} widths={widths} label={t('cmp_aqi')} a={aqiText(entryA)} b={aqiText(entryB)} />
            <LiveRow
              theme={theme}
              widths={widths}
              label={t('c2_anomaly')}
              a={forecastHighAnomaly(entryA, climateA)}
              b={forecastHighAnomaly(entryB, climateB)}
            />
          </View>
        </ScrollView>
      )}
      <Text style={[styles.climateNote, { color: theme.textTertiary }]}>{t('c2_anomaly_note')}</Text>

      {verdictText ? (
        <View style={[styles.verdict, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
          <Text style={[styles.verdictText, { color: theme.textPrimary }]}>{verdictText}</Text>
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
        {t('c2_week_title').split('{n}').join(String(COMPARE_DAYS))}
      </Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.weekContent}>
        {rows.map((row, dayIndex) => (
          <DayBlock key={`${row.date}-${dayIndex}`} theme={theme} row={row} metrics={metrics} widths={widths} />
        ))}
        {rows.length === 0 ? (
          <Text style={[styles.emptyRow, { color: theme.textTertiary }]}>{t('c2_no_days')}</Text>
        ) : null}
      </ScrollView>

      <Text style={[styles.caption, { color: theme.textTertiary }]}>{t('c2_caption')}</Text>
    </View>
  );
}
interface CitySlotProps {
  theme: AppTheme;
  slot: 0 | 1;
  favorites: GeoLocation[];
  selectedId: string | null;
  entry: ComparisonEntry | null;
  onSelect: (slot: 0 | 1, cityId: string) => void;
  onRetry: () => void;
  width: number;
}

/**
 * One city column header. Tapping the name steps to the NEXT saved city, so a
 * pair can be cycled without a modal; the a11y label spells that out and always
 * includes the city currently shown.
 */
function CitySlot({
  theme,
  slot,
  favorites,
  selectedId,
  entry,
  onSelect,
  onRetry,
  width,
}: CitySlotProps) {
  const slotLabel = t('c2_slot').split('{n}').join(String(slot + 1));
  const selected = favorites.find((city) => city.id === selectedId) ?? null;
  const cityName = selected?.name ?? t('c2_pick_city');

  const cycle = () => {
    if (favorites.length === 0) return;
    const index = favorites.findIndex((city) => city.id === selectedId);
    // index -1 (nothing selected) resolves to the first city.
    const next = favorites[(index + 1 + favorites.length) % favorites.length];
    onSelect(slot, next.id);
  };

  const failed = entry !== null && entry.data === null;

  return (
    <View style={[styles.slot, { width }]}>
      <Pressable
        onPress={cycle}
        style={({ pressed }) => [styles.slotButton, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={`${slotLabel}: ${cityName}. ${t('c2_cycle_hint')}`}
      >
        <Text style={[styles.slotEyebrow, { color: theme.textTertiary }]}>{slotLabel}</Text>
        <Text style={[styles.slotName, { color: theme.textPrimary }]} numberOfLines={1}>
          {cityName}
        </Text>
      </Pressable>
      {entry?.data ? (
        <WeatherIcon
          code={entry.data.current.weatherCode}
          isDay={entry.data.current.isDay}
          size={26}
          themeColor={theme.textPrimary}
        />
      ) : null}
      {entry?.data ? (
        <Text style={[styles.slotSky, { color: theme.textSecondary }]} numberOfLines={2}>
          {describeWmo(entry.data.current.weatherCode).label}
        </Text>
      ) : null}
      {/* One city's failure must offer the app's standard retry, not a blank. */}
      {failed ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.slotRetry, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={`${slotLabel} ${cityName}: ${t('err_weather')}. ${t('err_retry')}`}
        >
          <Text style={[styles.slotRetryText, { color: BEST_COLOR }]}>{t('err_retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function LiveHeader({
  theme,
  entryA,
  entryB,
  widths,
}: {
  theme: AppTheme;
  entryA: ComparisonEntry | null;
  entryB: ComparisonEntry | null;
  widths: Widths;
}) {
  return (
    <View style={styles.headerRow}>
      <View style={{ width: widths.label }} />
      {[entryA, entryB].map((entry, index) => (
        <View key={index} style={[styles.cityCell, { width: widths.column }]}>
          <Text style={[styles.cityName, { color: theme.textPrimary }]} numberOfLines={2}>
            {entry?.city.name ?? '--'}
          </Text>
        </View>
      ))}
    </View>
  );
}

function LiveRow({
  theme,
  label,
  a,
  b,
  widths,
}: {
  theme: AppTheme;
  label: string;
  a: string;
  b: string;
  widths: Widths;
}) {
  return (
    <View style={[styles.metricRow, { borderTopColor: widths.border }]}>
      <View style={{ width: widths.label, justifyContent: 'center' }}>
        <Text style={[styles.metricLabel, { color: theme.textTertiary }]}>{label}</Text>
      </View>
      {[a, b].map((value, index) => (
        <View key={index} style={[styles.valueCell, { width: widths.column }]}>
          <Text
            style={[styles.valueText, { color: theme.textPrimary }]}
            // "Temp, 18° / 22°" reads sensibly to TalkBack.
            accessibilityLabel={`${label}: ${a} / ${b}`}
          >
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}
/** One day of the 7-day block: its weekday header plus the metric rows. */
function DayBlock({
  theme,
  row,
  metrics,
  widths,
}: {
  theme: AppTheme;
  row: TwoCityDayRow;
  metrics: DayMetric[];
  widths: Widths;
}) {
  return (
    <View style={[styles.dayBlock, { borderColor: theme.trackColor, backgroundColor: theme.cardBg }]}>
      <Text style={[styles.dayHeader, { color: theme.textSecondary }]}>{dayOfWeek(row.date)}</Text>
      {metrics.map((metric) => {
        // Wind has its own epsilon, so it uses the dedicated helper.
        const better =
          metric.key === 'wind'
            ? betterWindIndex(metric.raw(row.a), metric.raw(row.b))
            : betterIndex(metric.raw(row.a), metric.raw(row.b), metric.rule);
        const cells = [metric.value(row.a), metric.value(row.b)];
        const unit = metric.unit?.() ?? '';
        const best = better === -1 ? null : t('c2_best');
        return (
          <View
            key={metric.key}
            style={styles.metricRow}
            // One chunk per row so TalkBack reads "High: 18° / 22°, better" rather
            // than three disconnected fragments.
            accessible
            accessibilityLabel={`${dayOfWeek(row.date)} ${metric.label}: ${cells[0]}, ${cells[1]}${best ? `, ${best}` : ''}`}
          >
            <View style={{ width: widths.label * 0.58, justifyContent: 'center' }}>
              <Text style={[styles.dayMetricLabel, { color: theme.textTertiary }]} numberOfLines={1}>
                {metric.label}
              </Text>
            </View>
            {cells.map((text, index) => {
              const isBest = index === better;
              return (
                <View key={index} style={[styles.valueCell, { width: widths.column * 0.68 }]}>
                  <Text style={[styles.dayValue, { color: isBest ? BEST_COLOR : theme.textPrimary }]}>
                    {text}
                    {text !== '--' && unit ? ` ${unit}` : ''}
                    {isBest ? ' *' : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  pickers: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  slot: { alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  slotButton: { alignItems: 'center' },
  slotEyebrow: { fontSize: 10, fontFamily: F.bold, letterSpacing: 1.4 },
  slotName: { fontSize: 15, fontFamily: F.semibold, textAlign: 'center' },
  slotSky: { fontSize: 11, textAlign: 'center', lineHeight: 15 },
  slotRetry: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  slotRetryText: { fontSize: 11.5, fontFamily: F.semibold },
  loadingText: { fontSize: 14, textAlign: 'center', paddingVertical: 18 },
  climateNote: { fontSize: 11, lineHeight: 15, marginTop: -6 },
  tableContent: { paddingBottom: 4 },
  headerRow: { flexDirection: 'row', marginBottom: 4 },
  cityCell: { alignItems: 'center', paddingHorizontal: 4 },
  cityName: { fontSize: 13, fontFamily: F.semibold, textAlign: 'center' },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  metricLabel: { fontSize: 12.5, fontFamily: F.semibold },
  valueCell: { alignItems: 'center', paddingHorizontal: 4 },
  valueText: { fontSize: 16, fontFamily: F.semibold },
  verdict: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },
  verdictText: { fontSize: 14, fontFamily: F.medium, lineHeight: 20 },
  sectionTitle: { fontSize: 11, fontFamily: F.bold, letterSpacing: 1.6 },
  weekContent: { gap: 10, paddingBottom: 4 },
  dayBlock: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dayHeader: { fontSize: 13, fontFamily: F.semibold, marginBottom: 2 },
  dayMetricLabel: { fontSize: 11.5 },
  dayValue: { fontSize: 14, fontFamily: F.semibold },
  emptyRow: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  caption: { textAlign: 'center', fontSize: 12 },
});



