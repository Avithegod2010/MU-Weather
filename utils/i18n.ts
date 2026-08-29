import { en } from '../i18n/en';
import { hi } from '../i18n/hi';
import { bn } from '../i18n/bn';
import { es } from '../i18n/es';
import { fr } from '../i18n/fr';
import { de } from '../i18n/de';
import { nl } from '../i18n/nl';
import { el } from '../i18n/el';
import { hu } from '../i18n/hu';
import { id } from '../i18n/id';
import { it } from '../i18n/it';

export type { Strings } from '../i18n/en';

export type LanguageKey = 'en' | 'hi' | 'bn' | 'es' | 'fr' | 'de' | 'nl' | 'el' | 'hu' | 'id' | 'it';

export interface LanguageOption {
  key: LanguageKey;
  name: string;
  native: string;
}

export const LANGUAGES: LanguageOption[] = [
  { key: 'en', name: 'English', native: 'English' },
  { key: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { key: 'bn', name: 'Bengali', native: 'বাংলা' },
  { key: 'nl', name: 'Dutch', native: 'Nederlands' },
  { key: 'fr', name: 'French', native: 'Français' },
  { key: 'de', name: 'German', native: 'Deutsch' },
  { key: 'el', name: 'Greek', native: 'Ελληνικά' },
  { key: 'hu', name: 'Hungarian', native: 'Magyar' },
  { key: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { key: 'it', name: 'Italian', native: 'Italiano' },
  { key: 'es', name: 'Spanish', native: 'Español' },
];

/** Every valid catalog key, derived from the English dictionary. */
export type StringKey = keyof typeof en;
/** Real `wmo_*` keys, e.g. `wmo_63`. */
export type WmoKey = Extract<StringKey, `wmo_${number}`>;
/** Real `day_*` weekday keys, e.g. `day_3`. */
export type DayKey = Extract<StringKey, `day_${number}`>;
/** Real `day_full_*` weekday keys, e.g. `day_full_3`. */
export type DayFullKey = Extract<StringKey, `day_full_${number}`>;
/** Real `health_advice_*` keys. */
export type HealthAdviceKey = Extract<StringKey, `health_advice_${string}`>;

type Dict = Partial<typeof en>;

const DICTS: Record<LanguageKey, Dict> = { en, hi, bn, es, fr, de, nl, el, hu, id, it };

let currentLang: LanguageKey = 'en';
let current: Dict = en;

export function setLanguage(lang: LanguageKey): void {
  currentLang = lang;
  current = DICTS[lang] ?? en;
}

export function getLanguage(): LanguageKey {
  return currentLang;
}

/**
 * Shared fallback chain: requested language → English → the key itself.
 * Takes a plain string so the runtime-built helpers below can use it;
 * static call sites go through the type-safe `t()`.
 */
function lookup(key: string): string {
  const value = (current as Record<string, string | undefined>)[key];
  if (value !== undefined) return value;
  return (en as unknown as Record<string, string>)[key] ?? key;
}

/** Translate a catalog key. A missing key fails at compile time. */
export function t(key: StringKey): string {
  return lookup(key);
}

/** Translate a WMO condition code. Same fallback chain as `t()`. */
export function tWmo(code: number): string {
  return lookup(`wmo_${code}` as WmoKey);
}

/** Translate a weekday index (0 = Sunday). Same fallback chain as `t()`. */
export function tDay(weekday: number): string {
  return lookup(`day_${weekday}` as DayKey);
}

/** Translate a full weekday name (0 = Sunday). Same fallback chain as `t()`. */
export function tDayFull(weekday: number): string {
  return lookup(`day_full_${weekday}` as DayFullKey);
}
