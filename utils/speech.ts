import * as Speech from 'expo-speech';
import { getLanguage, t, type LanguageKey } from './i18n';

/** BCP-47 voice for every app language. */
export const LANGUAGE_TO_SPEECH: Record<LanguageKey, string> = {
  en: 'en-US',
  hi: 'hi-IN',
  bn: 'bn-IN',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  nl: 'nl-NL',
  el: 'el-GR',
  hu: 'hu-HU',
  id: 'id-ID',
  it: 'it-IT',
};

export interface SpokenForecastParts {
  city: string;
  condition: string;
  temperature: string;
  feelsLike: string;
  high?: string;
  low?: string;
  rain?: string;
}

export interface SpeechCallbacks {
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
}

/** Replace every `{token}` placeholder. split/join avoids `$` pattern pitfalls in values. */
function fill(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [token, value] of Object.entries(values)) {
    out = out.split(`{${token}}`).join(value);
  }
  return out;
}

/** Compose the spoken forecast sentence from translated templates. */
export function buildSpokenForecast(parts: SpokenForecastParts): string {
  let spoken = fill(t('speech_text'), {
    city: parts.city,
    condition: parts.condition,
    temp: parts.temperature,
    feels: parts.feelsLike,
  });
  if (parts.high !== undefined && parts.low !== undefined) {
    spoken += ` ${fill(t('speech_hilo'), { high: parts.high, low: parts.low })}`;
  }
  if (parts.rain !== undefined) {
    spoken += ` ${fill(t('speech_rain'), { rain: parts.rain })}`;
  }
  return spoken;
}

/**
 * Speak the forecast aloud in the active app language.
 * Replaces any ongoing speech (expo-speech would otherwise queue).
 * Safe on devices without a TTS engine — failures are swallowed.
 */
export function speakForecast(text: string, callbacks: SpeechCallbacks = {}): void {
  const { onDone, onStopped, onError } = callbacks;
  try {
    void Speech.stop().catch(() => {});
    Speech.speak(text, {
      language: LANGUAGE_TO_SPEECH[getLanguage()],
      rate: 1.0,
      onDone,
      onStopped,
      onError,
    });
  } catch {
    // No TTS available on this device — stay silent rather than crash.
  }
}

/** Halt any ongoing forecast speech. Safe on devices without a TTS engine. */
export function stopForecastSpeech(): void {
  try {
    void Speech.stop().catch(() => {});
  } catch {
    // No TTS available — nothing to stop.
  }
}
