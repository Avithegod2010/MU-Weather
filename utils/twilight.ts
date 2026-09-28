/**
 * Sun position + twilight phases, computed locally (zero API calls).
 *
 * Standard NOAA/SunCalc-style solar geometry: Julian day cycles give solar
 * noon, then each twilight band is solved from its own critical elevation
 * angle via the hour-angle equation. Verified against published sunrise /
 * sunset tables for London, Tokyo and New York (deltas under a few minutes)
 * and against polar day/night behaviour at 78°N.
 *
 * Angles are degrees at the module edges, radians inside.
 */

const DAY_MS = 86400000;
const JULIAN_1970 = 2440588;
const JULIAN_2000 = 2451545;
/** Mean solar-noon offset at longitude 0, in days (SunCalc's J0). */
const J0 = 0.0009;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
/** Mean obliquity of the ecliptic. */
const OBLIQUITY = 23.4397 * RAD;
/** Elevation of the sun's upper limb at the visible horizon. */
const HORIZON_DEG = -0.833;

function toDays(date: Date): number {
  return date.getTime() / DAY_MS - 0.5 + JULIAN_1970 - JULIAN_2000;
}

function julianCycle(d: number, lw: number): number {
  return Math.round(d - J0 - lw / (2 * Math.PI));
}

function approxTransit(ht: number, lw: number, n: number): number {
  return J0 + (ht + lw) / (2 * Math.PI) + n;
}

function solarTransitDays(ds: number, m: number, l: number): number {
  return JULIAN_2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);
}

function solarMeanAnomaly(d: number): number {
  return RAD * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(m: number): number {
  const c = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  const perigee = RAD * 102.9372;
  return m + c + perigee + Math.PI;
}

function declination(l: number): number {
  return Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));
}

function rightAscension(l: number): number {
  return Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY), Math.cos(l));
}

function siderealTime(d: number, lw: number): number {
  return RAD * (280.16 + 360.9856235 * d) - lw;
}

function azimuthFrom(h: number, phi: number, dec: number): number {
  // SunCalc convention: measured from south; +180° converts to a compass
  // bearing (0 = north) at the call site.
  return Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
}

function elevationFrom(h: number, phi: number, dec: number): number {
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
}

function fromJulian(j: number): Date {
  return new Date((j + 0.5 - JULIAN_1970) * DAY_MS);
}

export interface TwilightWindow {
  start: Date;
  end: Date;
}

/** 'polar_day' = sun never crosses the horizon down, 'polar_night' = never up. */
export type PolarState = 'normal' | 'polar_day' | 'polar_night';

export interface TwilightData {
  solarNoon: Date;
  sunrise: Date | null;
  sunset: Date | null;
  /** Sun at -6° in the morning (civil twilight begins). */
  civilDawn: Date | null;
  civilDusk: Date | null;
  /** Sun at -12° in the morning. */
  nauticalDawn: Date | null;
  nauticalDusk: Date | null;
  /** Sun at -18° in the morning (full astronomical darkness after this). */
  astroDawn: Date | null;
  astroDusk: Date | null;
  /** -6° → -4° before sunrise (photographers' blue hour). */
  blueMorning: TwilightWindow | null;
  blueEvening: TwilightWindow | null;
  /** -4° → +6° after sunrise. */
  goldenMorning: TwilightWindow | null;
  goldenEvening: TwilightWindow | null;
  /** Compass bearing of the sun right now, 0-360°, 0 = north. */
  currentAzimuth: number;
  /** Sun elevation right now, degrees; negative = below the horizon. */
  currentElevation: number;
  polarState: PolarState;
  /** True while the current instant falls inside a blue-hour window. */
  isBlueNow: boolean;
  /** Minutes until the next blue-hour window starts; null when none today. */
  nextBlueInMinutes: number | null;
}

/** Compass bearing of the sun at `date` for `lat`/`lon` (degrees, 0 = north). */
export function sunAzimuth(date: Date, lat: number, lon: number): number {
  const lw = -lon * RAD;
  const d = toDays(date);
  const m = solarMeanAnomaly(d);
  const l = eclipticLongitude(m);
  const h = siderealTime(d, lw) - rightAscension(l);
  const az = azimuthFrom(h, lat * RAD, declination(l)) * DEG + 180;
  return ((az % 360) + 360) % 360;
}

/** Sun elevation at `date` for `lat`/`lon` in degrees. */
export function sunElevation(date: Date, lat: number, lon: number): number {
  const lw = -lon * RAD;
  const d = toDays(date);
  const m = solarMeanAnomaly(d);
  const l = eclipticLongitude(m);
  const dec = declination(l);
  const h = siderealTime(d, lw) - rightAscension(l);
  return elevationFrom(h, lat * RAD, dec) * DEG;
}

/**
 * Full day event table for the local day containing `date`. Rise/set times
 * are computed around that day's solar noon, so they always are today's
 * times in local wall-clock terms.
 */
export function computeTwilight(date: Date, lat: number, lon: number): TwilightData {
  const lw = -lon * RAD;
  const phi = lat * RAD;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const m = solarMeanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = declination(l);
  const jNoon = solarTransitDays(ds, m, l);

  function eventsAt(
    elevationDeg: number,
  ): { rise: Date | null; set: Date | null; polar: PolarState } {
    const h0 = elevationDeg * RAD;
    const cosH0 =
      (Math.sin(h0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cosH0 > 1) return { rise: null, set: null, polar: 'polar_night' };
    if (cosH0 < -1) return { rise: null, set: null, polar: 'polar_day' };
    const w0 = Math.acos(cosH0);
    const jSet = solarTransitDays(approxTransit(w0, lw, n), m, l);
    const jRise = jNoon - (jSet - jNoon);
    return { rise: fromJulian(jRise), set: fromJulian(jSet), polar: 'normal' };
  }

  const sun = eventsAt(HORIZON_DEG);
  const civil = eventsAt(-6);
  const nautical = eventsAt(-12);
  const astro = eventsAt(-18);
  const minusFour = eventsAt(-4);
  const plusSix = eventsAt(6);

  const window = (start: Date | null, end: Date | null): TwilightWindow | null =>
    start && end ? { start, end } : null;

  const blueMorning = window(civil.rise, minusFour.rise);
  const blueEvening = window(minusFour.set, civil.set);
  const goldenMorning = window(minusFour.rise, plusSix.rise);
  const goldenEvening = window(plusSix.set, minusFour.set);

  const nowMs = date.getTime();
  const inside = (w: TwilightWindow | null): boolean =>
    w !== null && nowMs >= w.start.getTime() && nowMs <= w.end.getTime();
  const isBlueNow = inside(blueMorning) || inside(blueEvening);

  let nextBlueInMinutes: number | null = null;
  if (!isBlueNow) {
    const starts = [blueMorning, blueEvening]
      .filter((w): w is TwilightWindow => w !== null && w.start.getTime() > nowMs)
      .map((w) => w.start.getTime());
    if (starts.length > 0) {
      nextBlueInMinutes = Math.max(1, Math.round((Math.min(...starts) - nowMs) / 60000));
    }
  }

  return {
    solarNoon: fromJulian(jNoon),
    sunrise: sun.rise,
    sunset: sun.set,
    civilDawn: civil.rise,
    civilDusk: civil.set,
    nauticalDawn: nautical.rise,
    nauticalDusk: nautical.set,
    astroDawn: astro.rise,
    astroDusk: astro.set,
    blueMorning,
    blueEvening,
    goldenMorning,
    goldenEvening,
    currentAzimuth: sunAzimuth(date, lat, lon),
    currentElevation: sunElevation(date, lat, lon),
    polarState: sun.polar,
    isBlueNow,
    nextBlueInMinutes,
  };
}


