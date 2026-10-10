import type { EnsembleSpreadPoint, HourPoint } from '../api/types';
import { MIN_RAIN_EPISODE_ENSEMBLE_MEMBERS } from './ensembleRainEpisodeMath';

export interface EnsembleRainChartValue {
  probability: number;
  members: number;
}

/**
 * Align supported raw ICON-EPS hourly rain shares with the primary forecast's
 * local timestamps. Repeated local hours (for example, the DST fall-back hour)
 * are ambiguous without offsets, so omit them rather than pairing the wrong dot.
 */
export function alignEnsembleRainProbabilities(
  hours: readonly Pick<HourPoint, 'time'>[],
  points: readonly Pick<EnsembleSpreadPoint, 'time' | 'rainProb' | 'rainMembers'>[] | null | undefined,
): (EnsembleRainChartValue | null)[] {
  const aligned: (EnsembleRainChartValue | null)[] = hours.map(() => null);
  if (!points || points.length === 0 || hours.length === 0) return aligned;

  const hourCounts = new Map<string, number>();
  for (const hour of hours) {
    if (typeof hour.time === 'string' && hour.time.length > 0) {
      hourCounts.set(hour.time, (hourCounts.get(hour.time) ?? 0) + 1);
    }
  }

  const pointCounts = new Map<string, number>();
  const pointByTime = new Map<string, (typeof points)[number]>();
  for (const point of points) {
    if (typeof point.time !== 'string' || point.time.length === 0) continue;
    pointCounts.set(point.time, (pointCounts.get(point.time) ?? 0) + 1);
    if (!pointByTime.has(point.time)) pointByTime.set(point.time, point);
  }

  return hours.map((hour) => {
    if (
      typeof hour.time !== 'string' ||
      hourCounts.get(hour.time) !== 1 ||
      pointCounts.get(hour.time) !== 1
    ) return null;

    const point = pointByTime.get(hour.time);
    if (
      !point ||
      typeof point.rainProb !== 'number' || !Number.isFinite(point.rainProb) ||
      point.rainProb < 0 || point.rainProb > 100 ||
      typeof point.rainMembers !== 'number' || !Number.isInteger(point.rainMembers) ||
      point.rainMembers < MIN_RAIN_EPISODE_ENSEMBLE_MEMBERS
    ) return null;

    return { probability: point.rainProb, members: point.rainMembers };
  });
}
