/**
 * Optional AI digest summaries need a provider API key. That key belongs to the
 * user, not to the build: a key compiled into the app (Expo's `EXPO_PUBLIC_*`
 * variables are inlined at bundle time) is a billable credential that anyone
 * who downloads the APK can extract with `strings`. So the key is collected in
 * Settings and kept in the platform's encrypted store (Android Keystore-backed
 * via expo-secure-store) — never in the bundle, never in AsyncStorage, never in
 * settings exports.
 *
 * The parsing rules live here as pure functions so they can be unit-tested
 * without a device, and because the key is placed verbatim into an HTTP header
 * when it is used: anything that could break out of that header (whitespace,
 * control characters) is rejected at the door.
 */
import * as SecureStore from 'expo-secure-store';

export type AiProvider = 'anthropic' | 'openai';

export interface AiCredential {
  provider: AiProvider;
  key: string;
}

export type AiKeyParseResult =
  | { ok: true; credential: AiCredential }
  | { ok: false; reason: 'empty' | 'unrecognised' | 'invalid_chars' | 'bad_length' };

/** SecureStore keys must be alphanumeric plus ".", "-" and "_". */
const STORE_KEY = 'mu_weather.ai_credential_v1';

/** Anthropic keys are ~108 chars, OpenAI project keys ~164; keep a sane rail. */
export const AI_KEY_MIN_LENGTH = 20;
export const AI_KEY_MAX_LENGTH = 512;

/**
 * Providers are told apart by their published key prefixes. An unrecognised
 * prefix is refused rather than guessed: sending a key to the wrong provider
 * leaks it to a third party and burns a request on a 401.
 */
export function providerForKey(key: string): AiProvider | null {
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-')) return 'openai';
  return null;
}

/**
 * Validate a pasted key. Returns the credential to store, or a reason the
 * Settings UI can explain. Surrounding whitespace is trimmed (paste artefact);
 * interior whitespace and control characters are refused.
 */
export function parseAiKey(raw: string): AiKeyParseResult {
  const key = raw.trim();
  if (key.length === 0) return { ok: false, reason: 'empty' };
  // eslint-disable-next-line no-control-regex
  if (!/^[A-Za-z0-9._-]+$/.test(key)) return { ok: false, reason: 'invalid_chars' };
  if (key.length < AI_KEY_MIN_LENGTH || key.length > AI_KEY_MAX_LENGTH) {
    return { ok: false, reason: 'bad_length' };
  }
  const provider = providerForKey(key);
  if (!provider) return { ok: false, reason: 'unrecognised' };
  return { ok: true, credential: { provider, key } };
}

/** Short, non-secret label for the Settings row: "Anthropic · …a1b2". */
export function describeCredential(credential: AiCredential): string {
  const provider = credential.provider === 'openai' ? 'OpenAI' : 'Anthropic';
  const tail = credential.key.slice(-4);
  return `${provider} · …${tail}`;
}

/** Read the stored credential, or null when none is configured / storage is unavailable. */
export async function loadAiCredential(): Promise<AiCredential | null> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return null;
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { provider?: unknown; key?: unknown };
    if (typeof parsed.key !== 'string') return null;
    const provider =
      parsed.provider === 'openai' || parsed.provider === 'anthropic'
        ? parsed.provider
        : providerForKey(parsed.key);
    if (!provider) return null;
    return { provider, key: parsed.key };
  } catch {
    return null;
  }
}

/**
 * Persist a key. Returns false when the platform store refused it (web, or a
 * device with a broken keystore) so the caller can tell the user instead of
 * silently dropping their key.
 */
export async function saveAiCredential(credential: AiCredential): Promise<boolean> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return false;
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(credential));
    return true;
  } catch {
    return false;
  }
}

/** Remove the stored key. Failure is non-fatal: nothing else depends on it. */
export async function clearAiCredential(): Promise<void> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return;
    await SecureStore.deleteItemAsync(STORE_KEY);
  } catch {
    // Best-effort; the caller cannot do anything with a backend that refuses.
  }
}
