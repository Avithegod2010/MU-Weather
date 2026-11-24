/**
 * Optional AI digest summariser.
 *
 * Upgrades the plain template digest to a short, natural-language summary from
 * a hosted LLM (Anthropic or OpenAI). The provider key is the USER's own: it is
 * entered in Settings and read from expo-secure-store at call time (see
 * `utils/aiKeyStore`), so no credential is ever compiled into the bundle —
 * `EXPO_PUBLIC_*` variables are inlined by Metro and would be extractable from
 * any published APK. When no key is configured — or the request fails in any
 * way — the caller falls back to the template, so the digest never disappears.
 *
 * This module is the ONLY place that talks to a provider. The key is never
 * logged and never sent anywhere except the provider's own endpoint.
 */
import type { AiCredential, AiProvider } from '../utils/aiKeyStore';

/** Models that are cheap and good enough for a 3-sentence rewrite. */
const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-3-5-haiku-latest',
  openai: 'gpt-4o-mini',
};

/** Endpoints are constants: a stored credential cannot redirect the key. */
const ENDPOINT: Record<AiProvider, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
};

/** Hard cap on the summary so a runaway generation stays notification-sized. */
const MAX_TOKENS = 220;
const TIMEOUT_MS = 12000;

/**
 * Ask the provider for a 2-3 sentence summary of the template digest. The
 * template is passed as the source of truth; the model must not invent data.
 * Returns null on any failure so callers fall back to the template.
 */
export async function summarizeDigest(
  credential: AiCredential,
  templateBody: string,
  cityName: string,
  language: string,
): Promise<string | null> {
  const { provider, key } = credential;
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const system =
      'You rewrite weather-digest facts into a warm, plain 2-3 sentence summary. ' +
      'Use ONLY the facts given — never invent temperatures, rain, or times. ' +
      'Reply in the same language as the facts. No markdown, no lists, no preamble.';
    const user = `City: ${cityName}\nLanguage code: ${language}\nFacts:\n${templateBody}`;

    const init: RequestInit =
      provider === 'openai'
        ? {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: DEFAULT_MODEL.openai,
              max_tokens: MAX_TOKENS,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
            }),
          }
        : {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: DEFAULT_MODEL.anthropic,
              max_tokens: MAX_TOKENS,
              system,
              messages: [{ role: 'user', content: user }],
            }),
          };

    const response = await fetch(ENDPOINT[provider], { ...init, signal: controller.signal });
    if (!response.ok) return null;

    const json = (await response.json()) as Record<string, unknown>;
    let text: string;
    if (provider === 'openai') {
      const choices = json.choices as { message?: { content?: string } }[] | undefined;
      text = choices?.[0]?.message?.content ?? '';
    } else {
      const content = json.content as { type?: string; text?: string }[] | undefined;
      text = content?.find((block) => block.type === 'text')?.text ?? '';
    }
    const summary = text.trim();
    return summary.length > 0 ? summary : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
