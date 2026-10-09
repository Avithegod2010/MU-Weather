import type { AlertEvidence } from './alertEvidence';

const HOUR_MS = 60 * 60 * 1000;

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    if (formatterCache.size >= 16) {
      const oldest = formatterCache.keys().next();
      if (oldest.done !== true) formatterCache.delete(oldest.value);
    }
    formatterCache.set(timezone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

function validParts(parts: LocalParts): boolean {
  if (
    !Number.isInteger(parts.year) || parts.year < 1900 || parts.year > 2200 ||
    !Number.isInteger(parts.month) || parts.month < 1 || parts.month > 12 ||
    !Number.isInteger(parts.day) || parts.day < 1 || parts.day > 31 ||
    !Number.isInteger(parts.hour) || parts.hour < 0 || parts.hour > 23 ||
    !Number.isInteger(parts.minute) || parts.minute < 0 || parts.minute > 59
  ) return false;
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return check.getUTCFullYear() === parts.year && check.getUTCMonth() === parts.month - 1 &&
    check.getUTCDate() === parts.day;
}

function parseLocalParts(value: string): LocalParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
  };
  return validParts(parts) ? parts : null;
}

function zonedPartsAt(epoch: number, timezone: string): LocalParts | null {
  try {
    const formatter = formatterFor(timezone);
    if (!formatter) return null;
    const values = Object.fromEntries(
      formatter.formatToParts(new Date(epoch))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<string, number>;
    const result = {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
    };
    return validParts(result) ? result : null;
  } catch {
    return null;
  }
}

function sameParts(a: LocalParts, b: LocalParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day &&
    a.hour === b.hour && a.minute === b.minute;
}

/** Convert location-local wall time to an unambiguous epoch; DST gaps/folds return null. */
function localTimeToEpoch(value: string, timezone: string): number | null {
  const target = parseLocalParts(value);
  if (!target) return null;
  const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  let candidate = targetAsUtc;
  for (let attempt = 0; attempt < 4; attempt++) {
    const rendered = zonedPartsAt(candidate, timezone);
    if (!rendered) return null;
    const renderedAsUtc = Date.UTC(
      rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute,
    );
    const delta = targetAsUtc - renderedAsUtc;
    if (delta === 0) break;
    candidate += delta;
  }
  const confirmed = zonedPartsAt(candidate, timezone);
  if (!confirmed || !sameParts(confirmed, target)) return null;

  // A local time inside the autumn clock-change fold maps to two epochs. Since
  // Archive API matching also cannot distinguish those repeated local hours,
  // do not publish a guessed expiry for it.
  for (let offset = -3 * HOUR_MS; offset <= 3 * HOUR_MS; offset += 15 * 60 * 1000) {
    if (offset === 0) continue;
    const alternate = candidate + offset;
    const rendered = zonedPartsAt(alternate, timezone);
    if (rendered && sameParts(rendered, target)) return null;
  }
  return candidate;
}

function nextDate(date: LocalParts): string {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return `${String(next.getUTCFullYear()).padStart(4, '0')}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Known forecast interval end from structured rule provenance. Hourly alerts
 * expire one real hour after the cited forecast hour; daily alerts expire at
 * the next location-local midnight. Observations and unknown timezones do not
 * get an invented expiry.
 */
export function forecastAlertExpiresAt(
  evidence: AlertEvidence | undefined,
  timezone: string | undefined,
): number | null {
  if (!evidence?.observationTime || !timezone) return null;
  if (evidence.source === 'Open-Meteo hourly forecast') {
    const start = localTimeToEpoch(evidence.observationTime, timezone);
    return start === null ? null : start + HOUR_MS;
  }
  if (evidence.source === 'Open-Meteo daily forecast') {
    const date = parseLocalParts(evidence.observationTime);
    if (!date || evidence.observationTime.includes('T')) return null;
    return localTimeToEpoch(`${nextDate(date)}T00:00`, timezone);
  }
  return null;
}
