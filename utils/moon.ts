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
  if (ageDays < 1.85) phaseName = 'New Moon';
  else if (ageDays < 7.38) phaseName = 'Waxing Crescent';
  else if (ageDays < 9.23) phaseName = 'First Quarter';
  else if (ageDays < 14.77) phaseName = 'Waxing Gibbous';
  else if (ageDays < 16.61) phaseName = 'Full Moon';
  else if (ageDays < 22.15) phaseName = 'Waning Gibbous';
  else if (ageDays < 24.0) phaseName = 'Last Quarter';
  else phaseName = 'Waning Crescent';

  return { phaseName, illumination, ageDays };
}
