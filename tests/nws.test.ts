import { pointInNwsPolygon, fetchNwsAlerts, type NwsAlert } from '../api/nws';
import { evaluateNwsAlerts } from '../utils/nwsAlerts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

// ── pointInNwsPolygon ────────────────────────────────────────────────────────

{
  // Square covering lon 0..2, lat 0..2 (NWS polygon format: "lon,lat" pairs).
  const square = '0,0 2,0 2,2 0,2';
  assert(pointInNwsPolygon(1, 1, square), 'inside the square');
  assert(!pointInNwsPolygon(5, 1, square), 'north of the square');
  assert(!pointInNwsPolygon(1, 5, square), 'east of the square');
  assert(!pointInNwsPolygon(-1, -1, square), 'south-west of the square');
}

{
  // Degenerate polygons never match: fewer than 3 vertices.
  assert(!pointInNwsPolygon(1, 1, '1,2'), 'single-vertex polygon');
  assert(!pointInNwsPolygon(1, 1, '1,2 3,4'), 'two-vertex polygon');
  assert(!pointInNwsPolygon(1, 1, ''), 'empty polygon');
}

{
  // A realistic county-shaped polygon around a point.
  const county = '-97.4,32.5 -96.9,32.5 -96.9,32.9 -97.4,32.9 -97.4,32.5';
  assert(pointInNwsPolygon(32.7, -97.2, county), 'inside the county box');
  assert(!pointInNwsPolygon(33.5, -97.2, county), 'north of the county box');
}

// ── evaluateNwsAlerts ────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<NwsAlert> = {}): NwsAlert {
  return {
    id: 'https://api.weather.gov/alerts/akwx0001',
    event: 'Severe Thunderstorm Warning',
    severity: 'Severe',
    urgency: 'Expected',
    headline: 'Severe Thunderstorm Warning issued October 16',
    areaDesc: 'Dallas County',
    description: 'Storms moving east at 30 mph.',
    instruction: 'Move to an interior room.',
    effective: '2026-10-16T18:00:00-05:00',
    onset: '2026-10-16T18:05:00-05:00',
    expires: '2026-10-16T20:00:00-05:00',
    expiresAt: Date.UTC(2026, 9, 17, 1, 0),
    ...overrides,
  };
}

{
  // The rule only calls this with a non-empty list, but the empty path must
  // stay well-formed rather than throwing.
  const [alert] = evaluateNwsAlerts([]);
  equal(alert.key, 'nws', 'empty input still yields an nws key');
  assert(alert.message.includes('No active'), 'empty input message');
  equal(alert.severity, 'warning', 'empty input severity');
}

{
  const [alert] = evaluateNwsAlerts([makeAlert()]);
  equal(alert.key, 'nws', 'key');
  equal(alert.title, 'US severe weather warnings', 'title');
  assert(alert.message.includes('Severe Thunderstorm Warning'), 'message carries the event');
  assert(alert.message.includes('Dallas County'), 'message carries the area');
  equal(alert.severity, 'severe', 'Severe maps to severe');
}

{
  const [severe] = evaluateNwsAlerts([makeAlert({ severity: 'Extreme' })]);
  equal(severe.severity, 'severe', 'Extreme maps to severe');
  const [moderate] = evaluateNwsAlerts([makeAlert({ severity: 'Moderate' })]);
  equal(moderate.severity, 'warning', 'Moderate maps to warning');
  const [minor] = evaluateNwsAlerts([makeAlert({ severity: 'Minor' })]);
  equal(minor.severity, 'warning', 'Minor maps to warning');
  // Mixed list: the worst severity drives the single notification.
  const [mixed] = evaluateNwsAlerts([
    makeAlert({ severity: 'Minor', id: 'a' }),
    makeAlert({ severity: 'Extreme', id: 'b' }),
  ]);
  equal(mixed.severity, 'severe', 'mixed list takes the worst severity');
}

{
  // Outbreak capping: one notification covers at most 6 products.
  const eight = Array.from({ length: 8 }, (_, i) => makeAlert({ id: `alert-${i}` }));
  const [alert] = evaluateNwsAlerts(eight);
  assert(alert.message.includes('6 US severe weather warning(s) active'), 'capped at 6 in the headline');
  equal(evaluateNwsAlerts(eight).length, 1, 'always exactly one triggered alert');
}

{
  const [alert] = evaluateNwsAlerts([makeAlert()]);
  assert(alert.evidence, 'evidence present');
  equal(alert.evidence.metricLabel, 'nws_alerts', 'evidence metric');
  equal(alert.evidence.source, 'NOAA NWS', 'evidence source');
  assert(alert.evidence.actual.includes('1 active'), 'evidence counts the products');
  assert(typeof alert.evidence.observationTime === 'string', 'evidence observation time');
}

// ── fetchNwsAlerts (stubbed network) ─────────────────────────────────────────

const realFetch = globalThis.fetch;

interface CapturedRequest {
  url: string;
  init: RequestInit | undefined;
}

async function withStubFetch(
  respond: (url: string) => { ok: boolean; status?: number; body?: unknown },
  run: (captured: CapturedRequest[]) => Promise<void>,
): Promise<void> {
  const captured: CapturedRequest[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    captured.push({ url, init });
    const response = respond(url);
    return {
      ok: response.ok,
      status: response.status ?? 200,
      json: async () => response.body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  try {
    await run(captured);
  } finally {
    globalThis.fetch = realFetch;
  }
}

function feature(properties: Record<string, unknown>): { properties: Record<string, unknown> } {
  return { properties };
}

const NOW = Date.UTC(2026, 9, 16, 18, 0);

async function main(): Promise<void> {
  {
    // Non-2xx must reject (the hook keeps last-known warnings instead).
    let rejected = false;
    await withStubFetch(
      () => ({ ok: false, status: 503 }),
      async () => {
        try {
          await fetchNwsAlerts(32.8, -97.0, () => NOW);
        } catch {
          rejected = true;
        }
      },
    );
    assert(rejected, 'HTTP 503 rejects');
  }

  {
    // Filtering: expired products, watch-only products, and unknown severities
    // are dropped; a Severe warning inside its validity window survives.
    let result: NwsAlert[] = [];
    await withStubFetch(
      () => ({
        ok: true,
        body: {
          features: [
            feature({
              id: 'kept',
              event: 'Tornado Warning',
              severity: 'Severe',
              urgency: 'Immediate',
              headline: 'Tornado Warning',
              areaDesc: 'Tarrant County',
              description: 'Take cover now.',
              instruction: 'Go to a basement.',
              effective: '2026-10-16T12:00:00-05:00',
              onset: '2026-10-16T12:05:00-05:00',
              expires: '2026-10-16T23:00:00Z',
              geocode: {},
            }),
            feature({
              id: 'expired',
              event: 'Flash Flood Warning',
              severity: 'Severe',
              urgency: 'Expected',
              expires: '2026-10-16T10:00:00Z',
              geocode: {},
            }),
            feature({
              id: 'watch',
              event: 'Tornado Watch',
              severity: null,
              urgency: 'Future',
              expires: '2026-10-17T10:00:00Z',
              geocode: {},
            }),
            feature({
              id: 'unknown-severity',
              event: 'Special Weather Statement',
              severity: 'Unknown',
              urgency: 'Likely',
              expires: '2026-10-17T10:00:00Z',
              geocode: {},
            }),
          ],
        },
      }),
      async () => {
        result = await fetchNwsAlerts(32.8, -97.0, () => NOW);
      },
    );

    equal(result.length, 1, 'only the one valid warning survives');
    equal(result[0].id, 'kept', 'kept id');
    equal(result[0].event, 'Tornado Warning', 'kept event');
    equal(result[0].severity, 'Severe', 'kept severity');
    assert(typeof result[0].expiresAt === 'number' && result[0].expiresAt > 0, 'expiresAt parsed');
  }

  {
    // Polygon matching: a warning whose polygon does not contain the point is
    // dropped even though the point query returned it.
    let result: NwsAlert[] = [];
    await withStubFetch(
      () => ({
        ok: true,
        body: {
          features: [
            feature({
              id: 'in-polygon',
              event: 'Severe Thunderstorm Warning',
              severity: 'Severe',
              urgency: 'Expected',
              expires: '2026-10-16T23:00:00Z',
              areaDesc: 'Box County',
              geocode: { policies: [{ polygon: '-97.5,32.4 -96.9,32.4 -96.9,33.0 -97.5,33.0' }] },
            }),
            feature({
              id: 'out-of-polygon',
              event: 'Severe Thunderstorm Warning',
              severity: 'Severe',
              urgency: 'Expected',
              expires: '2026-10-16T23:00:00Z',
              areaDesc: 'Far County',
              geocode: { policies: [{ polygon: '-80,40 -79,40 -79,41 -80,41' }] },
            }),
          ],
        },
      }),
      async () => {
        result = await fetchNwsAlerts(32.8, -97.0, () => NOW);
      },
    );
    equal(result.length, 1, 'only the in-polygon warning survives');
    equal(result[0].id, 'in-polygon', 'surviving id');
  }

  {
    // Politeness: the request carries the documented User-Agent and the
    // point=lat,lon query parameter.
    let captured: CapturedRequest | null = null;
    await withStubFetch(
      () => ({ ok: true, body: { features: [] } }),
      async (requests) => {
        await fetchNwsAlerts(40.7128, -74.006, () => NOW);
        captured = requests[0] ?? null;
      },
    );
    assert(captured, 'a request was made');
    const headers = (captured as unknown as CapturedRequest).init?.headers as Record<string, string>;
    assert(headers['User-Agent']?.includes('MU-Weather'), 'User-Agent identifies the app');
    assert(
      (captured as unknown as CapturedRequest).url.includes('point=40.71280,-74.00600'),
      'point=lat,lon query',
    );
  }

  console.log('PASS: NWS polygon, evaluation, and fetch filtering behaviour locked.');
}

void main().catch((error) => {
  console.error(error);
  throw error;
});
