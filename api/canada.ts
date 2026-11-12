/**
 * Official Environment Canada alerts for the active location, via the keyless
 * WeatherCAN app API (https://www.weather.gc.ca/api/app/v3/{lang}/Location/{lat},{lon}).
 *
 * Response shape (verified live 2026-10-24/11-12 and against the open-source
 * AQHICanadaApp consumer): a JSON array of nearby locations sorted by distance,
 * each carrying an `alert` object that is `{}` when the zone is clear and
 * otherwise `{ zoneId, uuid, alerts: [...] }` with rows like:
 *   { type, bannerText, colour, text, expiryTime, alertCode, issueTime, level }
 *
 * Mirrors api/nws.ts: same card contract (id/event/headline/description/
 * severity/expires/areaDesc), a coverage gate BEFORE any network, and a pure
 * parser exported for tests.
 */

export interface CanadaAlert {
  id: string;
  /** Banner text, e.g. "RAINFALL WARNING IN EFFECT". */
  headline: string;
  /** Banner text with the trailing "IN EFFECT" stripped, e.g. "Rainfall warning". */
  event: string;
  description: string;
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme';
  expires: string;
  areaDesc: string | null;
}

/** ECCC alert levels → the NWS severity vocabulary the card already renders. */
const COLOUR_SEVERITY: Record<string, 'Minor' | 'Moderate' | 'Severe' | 'Extreme'> = {
  red: 'Extreme',
  orange: 'Severe',
  yellow: 'Moderate',
  green: 'Minor',
};

const SEVERITY_RANK: Record<CanadaAlert['severity'], number> = {
  Minor: 0,
  Moderate: 1,
  Severe: 2,
  Extreme: 3,
};

const FETCH_TIMEOUT_MS = 12_000;

export function inCanadaArea(location: { countryCode?: string; latitude: number; longitude: number }): boolean {
  return location.countryCode?.toUpperCase() === 'CA';
}

function stripTags(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** bannerText "WINTER STORM WARNING IN EFFECT" → "Winter storm warning". */
function prettifyBanner(banner: string): string {
  const cleaned = banner.replace(/\s+IN EFFECT\.?\s*$/i, '').trim();
  if (!cleaned) return banner;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

function severityFor(row: { colour?: unknown; type?: unknown }): CanadaAlert['severity'] {
  const colour = typeof row.colour === 'string' ? row.colour.toLowerCase() : '';
  if (colour in COLOUR_SEVERITY) return COLOUR_SEVERITY[colour];
  const type = typeof row.type === 'string' ? row.type.toLowerCase() : '';
  if (type.includes('warning')) return 'Extreme';
  if (type.includes('watch')) return 'Severe';
  return 'Moderate';
}

function isoOrEmpty(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  return Number.isNaN(new Date(value).getTime()) ? '' : value;
}

/**
 * Pure parser: the API response body → card rows. Takes the FIRST nearby
 * location whose zone carries alerts (ECCC zones are area-wide, so the
 * nearest populated entry with alerts covers the queried point). Empty `alert`
 * objects, malformed rows and duplicate ids are all tolerated.
 */
export function parseCanadaAlerts(json: unknown, regionName: string | null): CanadaAlert[] {
  if (!Array.isArray(json)) return [];
  for (const item of json) {
    const props = (item ?? {}) as Record<string, unknown>;
    const alert = (props.alert ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(alert.alerts) ? alert.alerts : null;
    if (!rows || rows.length === 0) continue;
    const region = typeof props.displayName === 'string'
      ? props.displayName
      : regionName;
    const parsed: CanadaAlert[] = [];
    const seen = new Set<string>();
    for (const raw of rows) {
      const row = (raw ?? {}) as Record<string, unknown>;
      const headline = typeof row.bannerText === 'string' && row.bannerText.trim()
        ? stripTags(row.bannerText)
        : typeof row.type === 'string' && row.type.trim()
          ? stripTags(row.type)
          : '';
      if (!headline) continue;
      const code = typeof row.alertCode === 'string' ? row.alertCode : 'CA';
      const issued = typeof row.issueTime === 'string' ? row.issueTime : '';
      const id = `${code}|${issued}|${headline}`;
      if (seen.has(id)) continue;
      seen.add(id);
      parsed.push({
        id,
        headline,
        event: prettifyBanner(headline),
        description: typeof row.text === 'string' ? stripTags(row.text) : '',
        severity: severityFor(row),
        expires: isoOrEmpty(row.expiryTime) || isoOrEmpty(row.eventEndTime),
        areaDesc: region,
      });
    }
    if (parsed.length) {
      return parsed.sort((a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        (a.expires || '9999').localeCompare(b.expires || '9999'),
      );
    }
  }
  return [];
}

export async function fetchCanadaAlerts(
  latitude: number,
  longitude: number,
  language: string,
): Promise<CanadaAlert[]> {
  const lang = language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const url =
    `https://www.weather.gc.ca/api/app/v3/${lang}/Location/` +
    `${latitude.toFixed(4)},${longitude.toFixed(4)}?type=city`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    const isAbort = error instanceof Error && error.name === 'AbortError';
    throw new Error(isAbort ? 'The request timed out.' : 'No internet connection.');
  }
  clearTimeout(timer);
  if (!response.ok) throw new Error(`ECCC alert feed failed (${response.status}).`);
  const json: unknown = await response.json();
  return parseCanadaAlerts(json, null);
}
