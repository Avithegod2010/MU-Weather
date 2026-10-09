/**
 * Pure alert-to-impact grouping for a future UI adapter. Callers should map
 * forecast, nowcast and official warnings into the same hazard vocabulary
 * (for example, `rain`) before passing them here. This module has no storage,
 * translation or notification side effects.
 */
export type ImpactSeverity = 'info' | 'warning' | 'severe';

export interface ImpactSignal {
  /** Stable global ID, usually namespaced by its feed/rule; repeated IDs are upserted. */
  id: string;
  /** Normalized hazard key; only equal hazards are eligible for merging. */
  hazard: string;
  /** Human-readable source name, e.g. forecast, nowcast or official warning. */
  source: string;
  severity: ImpactSeverity;
  startsAt: number;
  endsAt: number;
  /** Last update from the origin, epoch milliseconds. */
  sourceUpdatedAt: number;
  title: string;
  /** What is expected. */
  expected: string;
  /** Why it matters. */
  whyItMatters: string;
  /** Suggested action. */
  action: string;
  /** Safety copy from a severe rule/feed. It is always preserved verbatim. */
  safetyCopy?: string;
}

export interface WeatherImpact {
  id: string;
  hazard: string;
  severity: ImpactSeverity;
  title: string;
  startsAt: number;
  endsAt: number;
  /** Unique source names, sorted for stable presentation. */
  sources: string[];
  /** Latest source update in the group, epoch milliseconds. */
  sourceUpdatedAt: number;
  expected: string[];
  reasons: string[];
  actions: string[];
  safetyMessages: string[];
  signalIds: string[];
}

/** Signals this close in time may describe the same developing impact. */
export const IMPACT_MERGE_GAP_MS = 30 * 60 * 1000;

const SEVERITY_RANK: Record<ImpactSeverity, number> = {
  info: 0,
  warning: 1,
  severe: 2,
};

function isSeverity(value: unknown): value is ImpactSeverity {
  return value === 'info' || value === 'warning' || value === 'severe';
}

function isUsableSignal(value: unknown): value is ImpactSignal {
  if (!value || typeof value !== 'object') return false;
  const signal = value as Partial<ImpactSignal>;
  return (
    typeof signal.id === 'string' && signal.id.trim().length > 0 &&
    typeof signal.hazard === 'string' && signal.hazard.trim().length > 0 &&
    typeof signal.source === 'string' && signal.source.trim().length > 0 &&
    isSeverity(signal.severity) &&
    typeof signal.startsAt === 'number' && Number.isFinite(signal.startsAt) &&
    typeof signal.endsAt === 'number' && Number.isFinite(signal.endsAt) && signal.endsAt >= signal.startsAt &&
    typeof signal.sourceUpdatedAt === 'number' && Number.isFinite(signal.sourceUpdatedAt) &&
    typeof signal.title === 'string' && signal.title.trim().length > 0 &&
    typeof signal.expected === 'string' && signal.expected.trim().length > 0 &&
    typeof signal.whyItMatters === 'string' && signal.whyItMatters.trim().length > 0 &&
    typeof signal.action === 'string' && signal.action.trim().length > 0 &&
    (signal.safetyCopy === undefined || typeof signal.safetyCopy === 'string')
  );
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniqueSafetyCopy(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value.trim() || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function upsertSignals(signals: ImpactSignal[]): ImpactSignal[] {
  const byId = new Map<string, ImpactSignal>();
  for (const signal of signals) {
    if (!isUsableSignal(signal)) continue;
    const previous = byId.get(signal.id);
    if (!previous || signal.sourceUpdatedAt >= previous.sourceUpdatedAt) {
      byId.set(signal.id, signal);
    }
  }
  return [...byId.values()];
}

function makeImpact(group: ImpactSignal[]): WeatherImpact {
  const ranked = [...group].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.startsAt - b.startsAt ||
      b.sourceUpdatedAt - a.sourceUpdatedAt,
  );
  const lead = ranked[0];
  const ids = group.map((signal) => signal.id).sort();
  return {
    id: `${lead.hazard}:${ids.join('+')}`,
    hazard: lead.hazard,
    severity: lead.severity,
    title: lead.title,
    startsAt: Math.min(...group.map((signal) => signal.startsAt)),
    endsAt: Math.max(...group.map((signal) => signal.endsAt)),
    sources: uniqueStrings(group.map((signal) => signal.source)).sort(),
    sourceUpdatedAt: Math.max(...group.map((signal) => signal.sourceUpdatedAt)),
    expected: uniqueStrings(group.map((signal) => signal.expected)),
    reasons: uniqueStrings(group.map((signal) => signal.whyItMatters)),
    actions: uniqueStrings(ranked.map((signal) => signal.action)),
    // Never discard safety instructions when a severe signal merges with a
    // routine forecast/nowcast signal for the same hazard.
    safetyMessages: uniqueSafetyCopy(
      group.filter((signal) => signal.severity === 'severe' && signal.safetyCopy)
        .map((signal) => signal.safetyCopy ?? ''),
    ),
    signalIds: ids,
  };
}

/**
 * Merge duplicate/overlapping signals for the same hazard while keeping the
 * strongest severity and every distinct severe safety message. Overlap is
 * transitive and allows a short 30-minute gap to smooth feed timing jitter.
 */
export function aggregateWeatherImpacts(
  input: ImpactSignal[],
  mergeGapMs = IMPACT_MERGE_GAP_MS,
): WeatherImpact[] {
  if (!Number.isFinite(mergeGapMs) || mergeGapMs < 0) return [];
  const signals = upsertSignals(input).sort(
    (a, b) => a.hazard.localeCompare(b.hazard) || a.startsAt - b.startsAt || a.endsAt - b.endsAt,
  );
  const groups: ImpactSignal[][] = [];
  let active: ImpactSignal[] | null = null;
  let activeHazard = '';
  let activeEnd = Number.NEGATIVE_INFINITY;

  for (const signal of signals) {
    if (
      active &&
      signal.hazard === activeHazard &&
      signal.startsAt <= activeEnd + mergeGapMs
    ) {
      active.push(signal);
      activeEnd = Math.max(activeEnd, signal.endsAt);
    } else {
      active = [signal];
      groups.push(active);
      activeHazard = signal.hazard;
      activeEnd = signal.endsAt;
    }
  }
  return groups.map(makeImpact).sort((a, b) => a.startsAt - b.startsAt || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
