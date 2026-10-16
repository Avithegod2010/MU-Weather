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
