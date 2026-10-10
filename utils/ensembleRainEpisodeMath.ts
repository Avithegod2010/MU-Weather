import { RAIN_EVENT_THRESHOLD_MM } from '../api/rain';

export const MIN_COMPLETE_RAIN_EPISODE_HOURS = 24;
export const MIN_VALID_RAIN_EPISODE_HOURS_PER_MEMBER = 20;
export const MIN_RAIN_EPISODE_ENSEMBLE_MEMBERS = 10;

export interface EnsembleRainMemberSeries {
  memberId: string;
  precipitation: (number | null | undefined)[];
}

export interface EnsembleRainEpisodeProbability {
  date: string;
  /** Chance that any forecast hour in this local day crosses the event threshold. */
  probability: number;
  members: number;
  forecastHours: number;
}

function parseLocalHour(value: string): { date: string; hour: number; minute: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const [, date, hourText, minuteText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const dateEpoch = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(dateEpoch) || new Date(dateEpoch).toISOString().slice(0, 10) !== date ||
      hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { date, hour, minute };
}

/**
 * Estimate each complete local day's any-hour rain-event probability from
 * joint member trajectories. A member counts once if any hour is wet; hourly
 * probabilities are never multiplied and hourly independence is not assumed.
 * Only days with all 24 distinct top-of-hour local timestamps are eligible;
 * partial days, duplicate/missing hours and ambiguous DST days are omitted.
 */
export function summarizeEnsembleRainEpisodes(
  times: string[],
  members: EnsembleRainMemberSeries[],
  eventThresholdMm = RAIN_EVENT_THRESHOLD_MM,
): EnsembleRainEpisodeProbability[] {
  if (!Number.isFinite(eventThresholdMm) || eventThresholdMm < 0 || !Array.isArray(times) || !Array.isArray(members)) {
    return [];
  }
  const indicesByDate = new Map<string, {
    indices: number[];
    hours: Set<number>;
    hasDuplicateHour: boolean;
    hasNonHourTimestamp: boolean;
  }>();
  times.forEach((time, index) => {
    if (typeof time !== 'string') return;
    const parsed = parseLocalHour(time);
    if (!parsed) return;
    const group = indicesByDate.get(parsed.date) ?? {
      indices: [],
      hours: new Set<number>(),
      hasDuplicateHour: false,
      hasNonHourTimestamp: false,
    };
    group.indices.push(index);
    if (parsed.minute !== 0) group.hasNonHourTimestamp = true;
    if (group.hours.has(parsed.hour)) group.hasDuplicateHour = true;
    group.hours.add(parsed.hour);
    indicesByDate.set(parsed.date, group);
  });

  const summaries: EnsembleRainEpisodeProbability[] = [];
  for (const [date, group] of indicesByDate) {
    const completeHourCoverage = group.indices.length === MIN_COMPLETE_RAIN_EPISODE_HOURS &&
      group.hours.size === MIN_COMPLETE_RAIN_EPISODE_HOURS &&
      !group.hasDuplicateHour && !group.hasNonHourTimestamp &&
      Array.from({ length: MIN_COMPLETE_RAIN_EPISODE_HOURS }, (_, hour) => hour)
        .every((hour) => group.hours.has(hour));
    if (!completeHourCoverage) continue;

    let usableMembers = 0;
    let wetMembers = 0;
    for (const member of members) {
      let validHours = 0;
      let wet = false;
      for (const index of group.indices) {
        const value = member.precipitation[index];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
        validHours += 1;
        if (value >= eventThresholdMm) wet = true;
      }
      if (validHours < Math.min(MIN_VALID_RAIN_EPISODE_HOURS_PER_MEMBER, group.indices.length)) continue;
      usableMembers += 1;
      if (wet) wetMembers += 1;
    }
    if (usableMembers < MIN_RAIN_EPISODE_ENSEMBLE_MEMBERS) continue;
    summaries.push({
      date,
      probability: wetMembers / usableMembers,
      members: usableMembers,
      forecastHours: group.indices.length,
    });
  }
  return summaries.sort((a, b) => a.date.localeCompare(b.date));
}
