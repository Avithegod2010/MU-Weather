/// <reference types="jest" />
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    isAvailableAsync: jest.fn(async () => true),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

import {
  AI_KEY_MIN_LENGTH,
  clearAiCredential,
  describeCredential,
  loadAiCredential,
  parseAiKey,
  providerForKey,
  saveAiCredential,
} from '../utils/aiKeyStore';

const ANTHROPIC = `sk-ant-api03-${'a'.repeat(40)}`;
const OPENAI = `sk-proj-${'b'.repeat(40)}`;

describe('providerForKey', () => {
  it('recognises the published prefixes', () => {
    expect(providerForKey(ANTHROPIC)).toBe('anthropic');
    expect(providerForKey(OPENAI)).toBe('openai');
    expect(providerForKey('sk-anything')).toBe('openai');
  });

  it('does not guess for unknown shapes', () => {
    expect(providerForKey('ghp_1234567890')).toBeNull();
    expect(providerForKey('')).toBeNull();
    expect(providerForKey('sk-ant')).toBeNull();
  });
});

describe('parseAiKey', () => {
  it('accepts a pasted key and trims surrounding whitespace', () => {
    expect(parseAiKey(`  ${ANTHROPIC}\n`)).toEqual({
      ok: true,
      credential: { provider: 'anthropic', key: ANTHROPIC },
    });
    expect(parseAiKey(OPENAI)).toEqual({
      ok: true,
      credential: { provider: 'openai', key: OPENAI },
    });
  });

  it('refuses empty input', () => {
    expect(parseAiKey('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseAiKey('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses anything that could break out of an HTTP header', () => {
    // Interior whitespace and CR/LF would inject a second header line.
    expect(parseAiKey(`sk-ant-${'a'.repeat(30)} extra`)).toEqual({
      ok: false,
      reason: 'invalid_chars',
    });
    expect(parseAiKey(`sk-ant-${'a'.repeat(30)}\r\nX-Evil: 1`)).toEqual({
      ok: false,
      reason: 'invalid_chars',
    });
    expect(parseAiKey(`sk-ant-${'a'.repeat(30)}\u0000`)).toEqual({
      ok: false,
      reason: 'invalid_chars',
    });
  });

  it('refuses keys with an unknown provider prefix instead of guessing', () => {
    expect(parseAiKey('x'.repeat(AI_KEY_MIN_LENGTH + 5))).toEqual({
      ok: false,
      reason: 'unrecognised',
    });
  });

  it('refuses implausibly short keys', () => {
    expect(parseAiKey('sk-ant-short')).toEqual({ ok: false, reason: 'bad_length' });
  });
});

describe('describeCredential', () => {
  it('shows the provider and only the last four characters', () => {
    const label = describeCredential({ provider: 'anthropic', key: ANTHROPIC });
    expect(label).toBe(`Anthropic · …${ANTHROPIC.slice(-4)}`);
    expect(label).not.toContain(ANTHROPIC.slice(7, 20));
    expect(describeCredential({ provider: 'openai', key: OPENAI })).toContain('OpenAI');
  });
});

describe('stored credential', () => {
  afterEach(async () => {
    await clearAiCredential();
  });

  it('round-trips through the secure store', async () => {
    expect(await loadAiCredential()).toBeNull();
    expect(await saveAiCredential({ provider: 'openai', key: OPENAI })).toBe(true);
    expect(await loadAiCredential()).toEqual({ provider: 'openai', key: OPENAI });
  });

  it('forgets the key when it is removed', async () => {
    await saveAiCredential({ provider: 'anthropic', key: ANTHROPIC });
    await clearAiCredential();
    expect(await loadAiCredential()).toBeNull();
  });
});
