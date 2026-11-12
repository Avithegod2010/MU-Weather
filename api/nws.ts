/**
 * NOAA/NWS - United States severe-weather warnings & advisories.
 *
 * Source: `https://api.weather.gov/alerts/active?point={lat},{lon}` - CAP v1.2
 * JSON-LD (the alerts web service is keyless; the documentation requests a
 * polite User-Agent so a non-default one is sent with every request):
 *
 *   https://www.weather.gov/documentation/services-web-alerts
 *
 * Shape of one alert (properties):
 *   id, event, severity ('Severe'|'Extreme'|'Moderate'|'Minor'),
 *   urgency, headline, areaDesc, description, instruction,
 *   effective, onset, expires, geocode.policies[0].polygon ("lon,lat …")
 *
 * Filtering rule: only warnings & advisories (Severe/Extreme/Moderate/Minor)
 * with a future expiry are kept; expired and watch-only products are dropped.
 * Point-in-polygon matching narrows alerts to the queried coordinates. The
 * feed is keyless (no API key); a polite User-Agent is sent per the service's
 * documentation. US-focused: non-US locations typically return no alerts.
 */
export interface NwsAlert {
  id: string;
  event: string;
  severity: 'Severe' | 'Extreme' | 'Moderate' | 'Minor';
  urgency: string;
  headline: string;
  areaDesc: string;
  description: string;
  instruction: string;
  effective: string;
  onset: string;
  expires: string;
  expiresAt: number;
  /**
   * Alert outline as [lat, lon] pairs when the feed supplies a shape
   * (GeoJSON geometry, else the geocode policy polygon), else null/absent.
   * Display-only: the containment filter below is unchanged.
   */
  polygon?: [number, number][] | null;
}

const USER_AGENT = 'MU-Weather/1.3.0 (https://github.com/Avithegod2010/MU-Weather)';

const NWS_SEVERITIES = ['Severe', 'Extreme', 'Moderate', 'Minor'] as const;
export type NwsSeverity = (typeof NWS_SEVERITIES)[number];

function parseNwsIso(value: string | undefined): number | null {
  if (!value) return null;
  const t = value.replace(/[+-]\d{2}:\d{2}$/, ''); // strip offset -> naive local time
  const date = new Date(t);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

/**
 * Extract the alert outline as [lat, lon] pairs from a NWS feature. GeoJSON
 * geometry is preferred (largest ring of a Polygon, first ring per polygon of
 * a MultiPolygon); the geocode policy polygon ("lon,lat lon,lat …") is the
 * fallback. Feed-supplied shapes are lon-first, so every pair is swapped.
 */
export function parseAlertPolygon(feature: unknown): [number, number][] | null {
  const f = (feature ?? {}) as {
    geometry?: { type?: unknown; coordinates?: unknown };
    properties?: { geocode?: { policies?: { polygon?: unknown }[] } };
  };
  const toLatLon = (ring: unknown[]): [number, number][] | null => {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    const pts: [number, number][] = [];
    for (const pair of ring) {
      if (!Array.isArray(pair) || typeof pair[0] !== 'number' || typeof pair[1] !== 'number') return null;
      pts.push([pair[1], pair[0]]); // GeoJSON is [lon, lat]
    }
    return pts;
  };
  const geo = f.geometry;
  if (geo && typeof geo === 'object' && Array.isArray(geo.coordinates)) {
    if (geo.type === 'Polygon') {
      let best: [number, number][] | null = null;
      for (const ring of geo.coordinates) {
        const pts = toLatLon(ring);
        if (pts && (!best || pts.length > best.length)) best = pts;
      }
      if (best) return best;
    } else if (geo.type === 'MultiPolygon') {
      let best: [number, number][] | null = null;
      for (const poly of geo.coordinates) {
        if (!Array.isArray(poly) || !Array.isArray(poly[0])) continue;
        const pts = toLatLon(poly[0]);
        if (pts && (!best || pts.length > best.length)) best = pts;
      }
      if (best) return best;
    }
  }
  const policy = f.properties?.geocode?.policies?.[0]?.polygon;
  if (typeof policy === 'string') {
    const raw = policy.split(/[,\s]+/).map(Number);
    if (raw.length >= 6 && raw.every((n) => Number.isFinite(n))) {
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < raw.length; i += 2) pts.push([raw[i + 1], raw[i]]);
      if (pts.length >= 3) return pts;
    }
  }
  return null;
}

export function pointInNwsPolygon(
  lat: number,
  lon: number,
  polygon: string,
): boolean {
  const raw = polygon.split(/[,\s]+/).map(Number);
  if (raw.length < 6) return false;
  const pts: [number, number][] = [];
  for (let i = 0; i < raw.length; i += 2) pts.push([raw[i], raw[i + 1]]);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** ISO-3166 codes whose locations the NWS point feed serves. */
const NWS_ISO2 = new Set(['US', 'PR', 'VI', 'GU', 'AS', 'MP']);

/**
 * Is this location plausibly inside an NWS coverage area? Used as a politeness
 * gate so non-US users never pay a wasted request (mirrors the MeteoAlarm
 * country gate). The search path sets `countryCode`; the GPS path does not, so
 * a coarse bounding-box fallback covers the 50 states, DC, Alaska, Hawaii and
 * the Caribbean territories. Guam / Northern Mariana / American Samoa GPS
 * coordinates fall outside the boxes and are treated as not covered - same
 * class of limitation as MeteoAlarm's country list.
 */
export function inNwsArea(location: { latitude: number; longitude: number; countryCode?: string }): boolean {
  const code = location.countryCode?.toUpperCase();
  if (code) return NWS_ISO2.has(code);
  const lat = location.latitude;
  const lon = location.longitude;
  const continental = lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
  const alaska = lat >= 51 && lat <= 72 && lon >= -180 && lon <= -129;
  const hawaii = lat >= 18.5 && lat <= 22.5 && lon >= -161 && lon <= -154;
  const caribbean = lat >= 17 && lat <= 19.5 && lon >= -68 && lon <= -64;
  return continental || alaska || hawaii || caribbean;
}

export function fetchNwsAlerts(
  lat: number,
  lon: number,
  now: () => number = () => Date.now(),
): Promise<NwsAlert[]> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    void (async () => {
      try {
        const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(5)},${lon.toFixed(5)}`;
        const response = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`NWS responded ${response.status}`);
        }
        const json = await response.json();
        const alerts: NwsAlert[] = [];
        for (const feature of json.features ?? []) {
          const p = feature?.properties;
          if (!p || typeof p.expires !== 'string') continue;
          const expiresAt = parseNwsIso(p.expires);
          if (!expiresAt || expiresAt <= now()) continue; // stale
          if (!p.severity) continue; // watch-only product
          const severity = p.severity as NwsAlert['severity'];
          if (!NWS_SEVERITIES.includes(severity)) continue;
          const polygon = p.geocode?.policies?.[0]?.polygon;
          if (polygon && !pointInNwsPolygon(lat, lon, polygon)) continue;
          alerts.push({
            id: p.id,
            event: p.event,
            severity,
            urgency: p.urgency,
            headline: p.headline,
            areaDesc: p.areaDesc,
            description: p.description,
            instruction: p.instruction,
            effective: p.effective,
            onset: p.onset,
            expires: p.expires,
            expiresAt,
            polygon: parseAlertPolygon(feature),
          });
        }
        resolve(alerts);
      } catch (error) {
        reject(error);
      } finally {
        clearTimeout(timer);
      }
    })();
  });
}
