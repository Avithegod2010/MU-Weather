import * as Notifications from './notifications';
import { t } from './i18n';
import {
  buildSpokenForecast,
  speakForecast,
  stopForecastSpeech,
  type SpokenForecastParts,
  type SpeechCallbacks,
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

/**
 * Re-tap cooldown after a readout ends. Long enough to swallow the duplicate
 * delivery of one tap (the response listener and the cold-start path can both
 * fire), short enough that an intentional replay feels immediate.
 */
const RETAP_GUARD_MS = 3 * 1000;

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
/** True while speech started by the digest action is still playing. */
let digestSpeaking = false;
/** When the last digest readout ended (0 = never) — re-tap cooldown anchor. */
let digestEndedAt = 0;

/** Live speech state for the speaker button: any speech originated by the action. */
export function isDigestSpeaking(): boolean {
  return digestSpeaking;
}

/** Memoize the latest spoken-forecast parts (HomeScreen calls this on every fetch). */
export function setSpokenDigestSource(parts: SpokenForecastParts | null): void {
  latestParts = parts;
}

/**
 * Stop a digest readout in progress. Called by the hero's speaker button when
 * it is tapped while the digest (not the button) is the active voice.
 */
export function stopDigestSpeech(): void {
  try {
    stopForecastSpeech();
  } finally {
    finishDigestSpeech();
  }
}

function finishDigestSpeech(): void {
  if (digestSpeaking) {
    digestSpeaking = false;
    digestEndedAt = Date.now();
  }
}

/**
 * Speak the memoized forecast. Never throws.
 *
 * A tap is only ignored while a readout is actually playing (or within
 * `RETAP_GUARD_MS` of one finishing, which swallows the duplicate delivery of a
 * single tap — the live listener and the cold-start last-response path can both
 * see it). Otherwise a tap always speaks, so replaying after the readout ends
 * works.
 *
 * `fallbackText` (the notification body captured at tap time) is spoken when the
 * fresh bundle never arrives — offline with no cache, a fetch slower than the
 * poll window, or no restorable location. A user-initiated action must never
 * end in silence.
 */
export async function speakDigestFromSource(
  fallbackText?: string,
  callbacks: SpeechCallbacks = {},
): Promise<void> {
  if (digestSpeaking || Date.now() - digestEndedAt < RETAP_GUARD_MS) return;
  // Cold start: the app was launched by the action tap and HomeScreen has not
  // fetched yet — poll for the memo. The fetch itself gets 15 s, so this window
  // is generous before falling back to the notification body.
  const deadline = Date.now() + 10000;
  while (latestParts === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (digestSpeaking || Date.now() - digestEndedAt < RETAP_GUARD_MS) return;

  const parts = latestParts;
  const text = parts ? buildSpokenForecast(parts) : (fallbackText ?? '').trim();
  if (!text) return;

  digestSpeaking = true;
  try {
    speakForecast(text, {
      onDone: () => {
        finishDigestSpeech();
        callbacks.onDone?.();
      },
      onStopped: () => {
        finishDigestSpeech();
        callbacks.onStopped?.();
      },
      onError: () => {
        finishDigestSpeech();
        callbacks.onError?.();
      },
    });
  } catch {
    // Speech failures are swallowed — never crash on a notification action.
    finishDigestSpeech();
  }
}
