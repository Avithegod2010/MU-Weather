/// <reference types="jest" />
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
import { it as itCat } from '../i18n/it';
import { pt } from '../i18n/pt';
import { pl } from '../i18n/pl';
import { tr } from '../i18n/tr';
import { uk } from '../i18n/uk';
import { ru } from '../i18n/ru';

const CATALOGS: Record<string, Record<string, string>> = {
  hi, bn, es, fr, de, nl, el, hu, id, itCat, pt, pl, tr, uk, ru,
};

const EN_KEYS = Object.keys(en).sort();

describe('i18n catalogs', () => {
  it('every catalog has exactly the English key set', () => {
    for (const [lang, dict] of Object.entries(CATALOGS)) {
      const keys = Object.keys(dict).sort();
      const missing = EN_KEYS.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !EN_KEYS.includes(k));
      expect(`${lang} missing: ${missing.join(',')}`).toBe(`${lang} missing: `);
      expect(`${lang} extra: ${extra.join(',')}`).toBe(`${lang} extra: `);
    }
  });

  it('every translated value is a non-empty string', () => {
    const empties: string[] = [];
    for (const [lang, dict] of Object.entries(CATALOGS)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value).toBe('string');
        if (value === '') empties.push(`${lang}/${key}`);
      }
    }
    expect(empties).toEqual([]);
  });

  it('placeholders survive translation', () => {
    const placeholder = /\{[a-z0-9_]+\}/g;
    const enPlaceholders: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(en)) {
      const found = value.match(placeholder);
      if (found) enPlaceholders[key] = found.sort();
    }
    for (const [lang, dict] of Object.entries(CATALOGS)) {
      for (const [key, expected] of Object.entries(enPlaceholders)) {
        const found = (dict[key] ?? '').match(placeholder)?.sort() ?? [];
        expect(`${lang}/${key}: ${found.join(',')}`).toBe(
          `${lang}/${key}: ${expected.join(',')}`,
        );
      }
    }
  });
});
