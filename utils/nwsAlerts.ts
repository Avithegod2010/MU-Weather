import { getLanguage, t } from './i18n';
import { formatClockParts } from './format';
import type { TriggeredAlert } from './alertRules';
import type { NwsAlert } from '../api/nws';

/**
 * Turns fetched NWS warnings+advisories into the app's triggered-alert shape.
 *
 * The rule fires ONCE per location refresh (one cooldown key, like the other
 * provider rules), with a compact list of the most severe active products so a
 * single 6 h cooldown covers an entire outbreak.
 */
export function evaluateNwsAlerts(alerts: NwsAlert[]): TriggeredAlert[] {
  const capped = alerts.slice(0, 6);
  const hasSevere = capped.some((alert) =>
    alert.severity === 'Severe' || alert.severity === 'Extreme',
  );
  const severity: TriggeredAlert['severity'] = hasSevere ? 'severe' : 'warning';

  const rows = capped.map((alert) => {
    const when = new Date(alert.expiresAt).toLocaleTimeString(
      getLanguage(),
      { hour: 'numeric', minute: '2-digit' },
    );
    return `${alert.event} · ${alert.areaDesc} (${when})`;
  }).join('; ');

  const message = capped.length
    ? `${capped.length} US severe weather warning(s) active — ${rows}.`
    : 'No active US NWS warnings.';

  return [
    {
      key: 'nws',
      title: 'US severe weather warnings',
      message,
      severity,
      evidence: {
        metricLabel: 'nws_alerts',
        actual: `${capped.length} active warning(s)`,
        threshold: 'active',
        source: 'NOAA NWS',
        ...(capped.length ? { observationTime: new Date().toISOString() } : {}),
      },
    },
  ];
}
