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

/** Translate a catalog key. Falls back to English, then the key itself. */
export function t(key: string): string {
  const dict = current as Record<string, string | undefined>;
  const value = dict[key];
  if (value !== undefined) return value;
  return (en as unknown as Record<string, string>)[key] ?? key;
}
