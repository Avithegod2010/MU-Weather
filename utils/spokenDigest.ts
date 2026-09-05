import * as Notifications from './notifications';
import { t } from './i18n';
import {
  buildSpokenForecast,
  speakForecast,
  type SpokenForecastParts,
} from './speech';

/**
 * Wires the digest notification's "Read my forecast" Android action button to
 * the speech engine: the button is registered as a notification category, the
 * latest spoken-forecast parts are memoized here by HomeScreen, and App.tsx
 * calls speakDigestFromSource() when the action tap arrives.
 */

/** Identifier of the notification category carrying the read action. */
export const DIGEST_CATEGORY = 'digest';
/** Identifier of the "Read my forecast" action button. */
export const DIGEST_READ_ACTION = 'read_forecast';

/** Register the digest category so the scheduled notification shows the action button. */
export async function registerDigestReadAction(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(DIGEST_CATEGORY, [
      {
        identifier: DIGEST_READ_ACTION,
        buttonTitle: t('notif_digest_action'),
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // Categories unsupported in this environment — the digest simply shows
    // without the action button. Best-effort, never crash.
  }
}

let latestParts: SpokenForecastParts | null = null;
let lastSpokeAt = 0;

/** Memoize the latest spoken-forecast parts (HomeScreen calls this on every fetch). */
export function setSpokenDigestSource(parts: SpokenForecastParts | null): void {
  latestParts = parts;
}

/** Speak the memoized forecast. Never throws; skips if one spoke less than 60 s ago. */
export async function speakDigestFromSource(): Promise<void> {
  // Dedup: the response listener AND the cold-start last-response path can both
  // see the same tap — only one speech per minute.
  if (Date.now() - lastSpokeAt < 60 * 1000) return;
  // Cold start: the app was launched by the action tap and HomeScreen has not
  // fetched yet — poll for the memo for up to 8 s.
  const deadline = Date.now() + 8 * 1000;
  while (latestParts === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const parts = latestParts;
  if (!parts) return;
  // Re-check after the wait: the concurrent listener/cold-start call for the
  // same tap may have spoken while this one was polling.
  if (Date.now() - lastSpokeAt < 60 * 1000) return;
  lastSpokeAt = Date.now();
  try {
    speakForecast(buildSpokenForecast(parts));
  } catch {
    // Speech failures are swallowed — never crash on a notification action.
  }
}
