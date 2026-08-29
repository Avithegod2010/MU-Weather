import { t } from './i18n';

export interface MoonInfo {
  phaseName: string;
  illumination: number;
  ageDays: number;
}

const SYNODIC_MONTH = 29.53058867;
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

export function moonPhase(date: Date = new Date()): MoonInfo {
  const daysSinceNewMoon = (date.getTime() - KNOWN_NEW_MOON) / 86400000;
  const ageDays = ((daysSinceNewMoon % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const fraction = ageDays / SYNODIC_MONTH;
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * fraction)) * 50);

  let phaseName: string;
  if (ageDays < 1.85) phaseName = t('moon_new');
  else if (ageDays < 7.38) phaseName = t('moon_wax_crescent');
  else if (ageDays < 9.23) phaseName = t('moon_first_quarter');
  else if (ageDays < 14.77) phaseName = t('moon_wax_gibbous');
  else if (ageDays < 16.61) phaseName = t('moon_full');
  else if (ageDays < 22.15) phaseName = t('moon_wane_gibbous');
  else if (ageDays < 24.0) phaseName = t('moon_last_quarter');
  else phaseName = t('moon_wane_crescent');

  return { phaseName, illumination, ageDays };
}

/** Days until the next full or new moon, whichever comes first. */
export function nextMoonMilestone(ageDays: number): { kind: 'full' | 'new'; days: number } {
  const toFull = (SYNODIC_MONTH / 2 - ageDays + SYNODIC_MONTH) % SYNODIC_MONTH;
  const toNew = (SYNODIC_MONTH - ageDays) % SYNODIC_MONTH;
  return toFull <= toNew
    ? { kind: 'full', days: Math.max(1, Math.round(toFull)) }
    : { kind: 'new', days: Math.max(1, Math.round(toNew)) };
}
