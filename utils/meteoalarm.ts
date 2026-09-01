/**
 * MeteoAlarm - official government severe-weather warnings for EUMETNET
 * member countries. Data comes from the free CAP-JSON feeds:
 *   https://feeds.meteoalarm.org/api/v1/warnings/feeds-{slug}
 * where slug is the lowercase FULL country name (ISO codes 404).
 *
 * The feed is country-wide and can be HUGE (Germany ~15.7 MB), so this
 * module: gates on country membership BEFORE fetching, caches one parsed
 * feed in memory for 15 minutes, filters stale entries client-side and
 * narrows to the active coordinates via CAP polygon point-in-polygon.
 * Every fetch/parse failure returns null and never throws - the card is
 * simply absent.
 */

/** ISO2 (uppercase) -> feed slug for every MeteoAlarm member country. */
export const METEOALARM_SLUGS: Record<string, string> = {
  AD: 'andorra',
  AT: 'austria',
  BE: 'belgium',
  BA: 'bosnia-herzegovina',
  BG: 'bulgaria',
  HR: 'croatia',
  CY: 'cyprus',
  CZ: 'czechia',
  DK: 'denmark',
  EE: 'estonia',
  FI: 'finland',
  FR: 'france',
  DE: 'germany',
  GR: 'greece',
  HU: 'hungary',
  IS: 'iceland',
  IE: 'ireland',
  IL: 'israel',
  IT: 'italy',
  LV: 'latvia',
  LT: 'lithuania',
  LU: 'luxembourg',
  MT: 'malta',
  MD: 'moldova',
  ME: 'montenegro',
  NL: 'netherlands',
  MK: 'republic-of-north-macedonia',
  NO: 'norway',
  PL: 'poland',
  PT: 'portugal',
  RO: 'romania',
  RS: 'serbia',
  SK: 'slovakia',
  SI: 'slovenia',
  ES: 'spain',
  SE: 'sweden',
  CH: 'switzerland',
  UA: 'ukraine',
  GB: 'united-kingdom',
};

export type MeteoAlarmSeverity = 'Minor' | 'Moderate' | 'Severe' | 'Extreme';
export type MeteoAlarmLevelColor = 'green' | 'yellow' | 'orange' | 'red';

/** JSON-safe warning row handed to the UI. */
export interface MeteoAlarmWarning {
  id: string;
  event: string;
  headline: string;
  description: string;
  severity: MeteoAlarmSeverity;
  levelColor: MeteoAlarmLevelColor;
  /** ISO 8601 instant of when the warning stops being valid. */
  expires: string;
  areaDesc: string | null;
  senderName: string | null;
}

/** Internal parsed warning: carries the CAP polygons of the chosen info. */
interface ParsedWarning extends MeteoAlarmWarning {
  /** [lat, lon] pairs per area polygon; empty = area-wide warning. */
  polygons: Array<Array<[number, number]>>;
}

const SEVERITIES: readonly MeteoAlarmSeverity[] = ['Minor', 'Moderate', 'Severe', 'Extreme'];
const LEVEL_COLORS: readonly MeteoAlarmLevelColor[] = ['green', 'yellow', 'orange', 'red'];
const SEVERITY_RANK: Record<MeteoAlarmSeverity, number> = {
  Minor: 0,
  Moderate: 1,
  Severe: 2,
  Extreme: 3,
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

interface FeedCache {
  slug: string;
  fetchedAt: number;
  warnings: ParsedWarning[];
}

/** One parsed feed in memory (deliberately NOT AsyncStorage - warnings go stale). */
let cache: FeedCache | null = null;

/** Feed slug for a country code, or null when the country is not a member. */
export function meteoalarmSlugFor(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null;
  return METEOALARM_SLUGS[countryCode.toUpperCase()] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asSeverity(value: unknown): MeteoAlarmSeverity | null {
  return SEVERITIES.includes(value as MeteoAlarmSeverity)
    ? (value as MeteoAlarmSeverity)
    : null;
}

function severityToColor(severity: MeteoAlarmSeverity): MeteoAlarmLevelColor {
  switch (severity) {
    case 'Minor':
      return 'green';
    case 'Moderate':
      return 'yellow';
    case 'Severe':
      return 'orange';
    case 'Extreme':
      return 'red';
  }
}

/** "2; orange; Moderate" -> 'orange' (awareness_level parameter value). */
function awarenessLevelColor(value: unknown): MeteoAlarmLevelColor | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(';').map((part) => part.trim().toLowerCase());
  return LEVEL_COLORS.includes(parts[1] as MeteoAlarmLevelColor)
    ? (parts[1] as MeteoAlarmLevelColor)
    : null;
}

/**
 * Parse a CAP polygon string "lat,lon lat,lon ..." (LATITUDE FIRST,
 * space-separated pairs). Returns null when malformed or too small to
 * enclose an area.
 */
export function parseCapPolygon(raw: string): Array<[number, number]> | null {
  const pairs = raw.trim().split(/\s+/);
  if (pairs.length < 3) return null;
  const out: Array<[number, number]> = [];
  for (const pair of pairs) {
    const parts = pair.split(',');
    if (parts.length !== 2) return null;
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    out.push([lat, lon]);
  }
  return out;
}

/** Standard ray-casting point-in-polygon over (lat, lon) pairs. */
export function pointInPolygon(lat: number, lon: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lonI] = polygon[i];
    const [latJ, lonJ] = polygon[j];
    const intersects =
      lonI > lon !== lonJ > lon && lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Location match for a parsed warning. Warnings whose chosen info has no
 * parseable polygon anywhere are treated as area-wide (country-wide) and
 * always match; otherwise the point must fall inside one of the polygons.
 */
export function matchesLocation(
  warning: ParsedWarning,
  lat: number,
  lon: number,
): boolean {
  if (warning.polygons.length === 0) return true;
  return warning.polygons.some((polygon) => pointInPolygon(lat, lon, polygon));
}

/**
 * Pick the info entry whose language prefix matches the app language,
 * falling back to English, then to the first entry.
 */
function pickInfo(infos: unknown[], lang: string): Record<string, unknown> | null {
  const withPrefix: Array<{ prefix: string; info: Record<string, unknown> }> = [];
  for (const entry of infos) {
    const info = asRecord(entry);
    if (!info) continue;
    const language = asString(info.language);
    withPrefix.push({ prefix: language.split('-')[0].toLowerCase(), info });
  }
  if (withPrefix.length === 0) return null;
  return (
    withPrefix.find((row) => row.prefix === lang)?.info ??
    withPrefix.find((row) => row.prefix === 'en')?.info ??
    withPrefix[0].info
  );
}

/** Collect the awareness_level colour from the parameter array. */
function parameterAwarenessColor(parameters: unknown): MeteoAlarmLevelColor | null {
  if (!Array.isArray(parameters)) return null;
  for (const entry of parameters) {
    const param = asRecord(entry);
    if (!param) continue;
    if (asString(param.valueName) === 'awareness_level') {
      return awarenessLevelColor(param.value);
    }
  }
  return null;
}

function parseOneWarning(entry: unknown, now: number, lang: string): ParsedWarning | null {
  const outer = asRecord(entry);
  if (!outer) return null;
  const alert = asRecord(outer.alert);
  if (!alert) return null;

  // Only currently-issued alerts.
  if (asString(alert.status) !== 'Actual') return null;

  const infoRaw = alert.info;
  const infos = Array.isArray(infoRaw) ? infoRaw : [];
  const info = pickInfo(infos, lang);
  if (!info) return null;

  // The feed keeps stale entries around - drop anything already over.
  if (asString(info.urgency) === 'Past') return null;
  const expires = asString(info.expires);
  const expiresMs = Date.parse(expires);
  if (!Number.isFinite(expiresMs) || expiresMs <= now) return null;

  const severity = asSeverity(info.severity);
  const awarenessColor = parameterAwarenessColor(info.parameter);
  const levelColor = awarenessColor ?? (severity ? severityToColor(severity) : 'yellow');
  const finalSeverity = severity ?? (SEVERITIES[LEVEL_COLORS.indexOf(levelColor)] ?? 'Moderate');

  const areas = Array.isArray(info.area) ? info.area : [];
  const polygons: Array<Array<[number, number]>> = [];
  const areaDescs: string[] = [];
  for (const areaEntry of areas) {
    const area = asRecord(areaEntry);
    if (!area) continue;
    const desc = asString(area.areaDesc).trim();
    if (desc && !areaDescs.includes(desc)) areaDescs.push(desc);
    const polygonStrings = Array.isArray(area.polygon) ? area.polygon : [];
    for (const polygonString of polygonStrings) {
      if (typeof polygonString !== 'string') continue;
      const polygon = parseCapPolygon(polygonString);
      if (polygon) polygons.push(polygon);
    }
  }

  const id = asString(alert.identifier) || asString(outer.uuid);
  if (!id) return null;

  return {
    id,
    event: asString(info.event).trim(),
    headline: asString(info.headline).trim(),
    description: asString(info.description).trim(),
    severity: finalSeverity,
    levelColor,
    expires,
    areaDesc: areaDescs.length > 0 ? areaDescs.join(', ') : null,
    senderName: asString(info.senderName).trim() || null,
    polygons,
  };
}

/** Strip the internal polygon data, leaving the JSON-safe public shape. */
function toPublicWarning(warning: ParsedWarning): MeteoAlarmWarning {
  return {
    id: warning.id,
    event: warning.event,
    headline: warning.headline,
    description: warning.description,
    severity: warning.severity,
    levelColor: warning.levelColor,
    expires: warning.expires,
    areaDesc: warning.areaDesc,
    senderName: warning.senderName,
  };
}

/**
 * Parse a raw feed JSON defensively: keep only Actual / non-Past /
 * not-yet-expired warnings, one per identifier, most severe (soonest
 * expiring) first. Polygon data stays attached for location filtering.
 */
function parseParsedWarnings(json: unknown, now: number, lang: string): ParsedWarning[] {
  const root = asRecord(json);
  const warningsRaw = root && Array.isArray(root.warnings) ? root.warnings : [];

  const byId = new Map<string, ParsedWarning>();
  for (const entry of warningsRaw) {
    const parsed = parseOneWarning(entry, now, lang);
    if (!parsed) continue;
    if (!byId.has(parsed.id)) byId.set(parsed.id, parsed);
  }

  return Array.from(byId.values()).sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    return Date.parse(a.expires) - Date.parse(b.expires);
  });
}

/** JSON-safe variant of {@link parseParsedWarnings} (polygons stripped). */
export function parseWarnings(json: unknown, now: number, lang: string): MeteoAlarmWarning[] {
  return parseParsedWarnings(json, now, lang).map(toPublicWarning);
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Active warnings for the given location, or null when the country is not
 * a MeteoAlarm member (checked BEFORE any network call), the fetch fails or
 * the feed cannot be parsed. Served from the in-memory cache for 15 minutes;
 * failures never poison the cache.
 */
export async function fetchMeteoAlarmWarnings(
  countryCode: string,
  lat: number,
  lon: number,
  lang: string,
): Promise<MeteoAlarmWarning[] | null> {
  const slug = meteoalarmSlugFor(countryCode);
  if (!slug) return null;

  const now = Date.now();
  if (cache && cache.slug === slug && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.warnings
      .filter((warning) => matchesLocation(warning, lat, lon))
      .map(toPublicWarning);
  }

  let json: unknown;
  try {
    json = await fetchJson(`https://feeds.meteoalarm.org/api/v1/warnings/feeds-${slug}`);
  } catch {
    return null; // network/parse failure - leave any existing cache untouched
  }
  if (json === null) return null;

  const parsed = parseParsedWarnings(json, Date.now(), lang);
  cache = { slug, fetchedAt: Date.now(), warnings: parsed };
  return parsed
    .filter((warning) => matchesLocation(warning, lat, lon))
    .map(toPublicWarning);
}
