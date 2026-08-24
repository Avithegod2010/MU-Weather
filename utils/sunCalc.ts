const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function toJulian(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function sunPosition(jd: number): { decl: number; ra: number } {
  const n = jd - 2451545.0;
  const meanLon = (280.46 + 0.9856474 * n) % 360;
  const meanAnom = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const eclipticLon = (meanLon + 1.915 * Math.sin(meanAnom) + 0.02 * Math.sin(2 * meanAnom)) * RAD;
  const obliquity = 23.439 * RAD;
  const decl = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLon));
  const ra = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLon), Math.cos(eclipticLon));
  return { decl, ra };
}

function moonPosition(jd: number): { decl: number; ra: number } {
  const d = jd - 2451545.0;
  const meanLon = (218.316 + 13.176396 * d) * RAD;
  const meanAnom = (134.963 + 13.064993 * d) * RAD;
  const argLat = (93.272 + 13.22935 * d) * RAD;
  const eclipticLon = meanLon + 6.289 * RAD * Math.sin(meanAnom);
  const eclipticLat = 5.128 * RAD * Math.sin(argLat);
  const obliquity = 23.439 * RAD;
  const decl = Math.asin(
    Math.sin(eclipticLat) * Math.cos(obliquity) +
      Math.cos(eclipticLat) * Math.sin(obliquity) * Math.sin(eclipticLon),
  );
  const ra = Math.atan2(
    Math.sin(eclipticLon) * Math.cos(obliquity) - Math.tan(eclipticLat) * Math.sin(obliquity),
    Math.cos(eclipticLon),
  );
  return { decl, ra };
}

function localSiderealAngle(jd: number, lon: number): number {
  const d = jd - 2451545.0;
  const gmstHours = (18.697374558 + 24.06570982441908 * d) % 24;
  const gmstDeg = ((gmstHours + 24) % 24) * 15;
  return (gmstDeg + lon) * RAD;
}

function altitude(jd: number, lat: number, lon: number, decl: number, ra: number): number {
  const lst = localSiderealAngle(jd, lon);
  const hourAngle = lst - ra;
  const phi = lat * RAD;
  return (
    Math.asin(
      Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle),
    ) * DEG
  );
}

export function solarElevation(date: Date, lat: number, lon: number): number {
  const { decl, ra } = sunPosition(toJulian(date));
  return altitude(toJulian(date), lat, lon, decl, ra);
}

export interface HourWindow {
  start: Date;
  end: Date;
}

export interface GoldenBlueHours {
  goldenMorning: HourWindow | null;
  goldenEvening: HourWindow | null;
  blueMorning: HourWindow | null;
  blueEvening: HourWindow | null;
}

function startOfLocalDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function classify(elevation: number): 'golden' | 'blue' | null {
  if (elevation >= -4 && elevation <= 6) return 'golden';
  if (elevation >= -6 && elevation < -4) return 'blue';
  return null;
}

export function findGoldenBlueHours(lat: number, lon: number): GoldenBlueHours {
  const dayStart = startOfLocalDay(new Date());
  const stepMs = 5 * 60 * 1000;
  const windows: Array<{ kind: 'golden' | 'blue'; start: Date; end: Date }> = [];

  let currentKind: 'golden' | 'blue' | null = null;
  let windowStart: Date | null = null;

  for (let t = dayStart.getTime(); t <= dayStart.getTime() + 86400000; t += stepMs) {
    const date = new Date(t);
    const kind = classify(solarElevation(date, lat, lon));
    if (kind !== currentKind) {
      if (currentKind && windowStart) {
        windows.push({ kind: currentKind, start: windowStart, end: date });
      }
      currentKind = kind;
      windowStart = kind ? date : null;
    }
  }
  if (currentKind && windowStart) {
    windows.push({ kind: currentKind, start: windowStart, end: new Date(dayStart.getTime() + 86400000) });
  }

  const pick = (kind: 'golden' | 'blue', morning: boolean): HourWindow | null => {
    const found = windows.find(
      (w) => w.kind === kind && (morning ? w.end.getHours() < 12 : w.start.getHours() >= 12),
    );
    return found ? { start: found.start, end: found.end } : null;
  };

  return {
    goldenMorning: pick('golden', true),
    goldenEvening: pick('golden', false),
    blueMorning: pick('blue', true),
    blueEvening: pick('blue', false),
  };
}

export function dayLengthFor(date: Date, lat: number, lon: number): number | null {
  const dayStart = startOfLocalDay(date);
  const stepMs = 5 * 60 * 1000;
  let riseMs: number | null = null;
  let setMs: number | null = null;
  let previousAbove = solarElevation(new Date(dayStart.getTime()), lat, lon) > -0.833;

  for (let t = dayStart.getTime() + stepMs; t <= dayStart.getTime() + 86400000; t += stepMs) {
    const above = solarElevation(new Date(t), lat, lon) > -0.833;
    if (above && !previousAbove && riseMs === null) riseMs = t;
    if (!above && previousAbove && setMs === null) setMs = t;
    previousAbove = above;
    if (riseMs !== null && setMs !== null) break;
  }
  if (riseMs === null || setMs === null) return null;
  return setMs - riseMs;
}

export function daylightDeltaMinutes(lat: number, lon: number): number | null {
  const today = dayLengthFor(new Date(), lat, lon);
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dayLengthFor(yesterdayDate, lat, lon);
  if (today === null || yesterday === null) return null;
  return Math.round((today - yesterday) / 60000);
}

export interface MoonTimes {
  rise: Date | null;
  set: Date | null;
}

export function moonTimes(date: Date, lat: number, lon: number): MoonTimes {
  const dayStart = startOfLocalDay(date);
  const stepMs = 15 * 60 * 1000;
  const h0 = 0.125;
  let rise: Date | null = null;
  let set: Date | null = null;
  let previousAlt = altitude(toJulian(dayStart), lat, lon, moonPosition(toJulian(dayStart)).decl, moonPosition(toJulian(dayStart)).ra);

  for (let t = dayStart.getTime() + stepMs; t <= dayStart.getTime() + 86400000; t += stepMs) {
    const jd = toJulian(new Date(t));
    const pos = moonPosition(jd);
    const alt = altitude(jd, lat, lon, pos.decl, pos.ra);
    if (alt > h0 && previousAlt <= h0 && rise === null) rise = new Date(t);
    if (alt < h0 && previousAlt >= h0 && set === null) set = new Date(t);
    previousAlt = alt;
    if (rise !== null && set !== null) break;
  }
  return { rise, set };
}

export function formatDateClock(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${String(minutes).padStart(2, '0')} ${period}`;
}
