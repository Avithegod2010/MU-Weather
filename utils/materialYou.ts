/**
 * Material You dynamic color (Android 12+ wallpaper palette).
 *
 * `react-native-material-you-colors` resolves its native TurboModule with
 * `TurboModuleRegistry.getEnforcing('MaterialYouColors')` at MODULE SCOPE, which
 * throws the moment the native module is missing (Expo Go on the new
 * architecture). The package must therefore never be imported statically — it is
 * loaded here through a guarded lazy `require`, and every call is wrapped in
 * try/catch. When the module is unavailable this module returns `null` and the
 * theme layer falls back to the static seed-blue gradient in COLOR_THEMES.
 *
 * Shade ORDER (verified against the installed 0.1.2 sources and its README
 * theme example — both paths share ONE canonical order, no remap needed):
 * - The JS generator (`lib/module/Monet/Shades.js`, ported from AOSP SystemUI
 *   monet) builds tones [100, 99, 95, 90, 80, 70, 60, ~50, 40, 30, 20, 10, 0],
 *   lightest first (pure white unshifted at index 0).
 * - The native module (`android/.../MaterialYouColorsModule.java`) reads the
 *   resources system_*_0 .. system_*_1000 in suffix order
 *   [0, 10, 50, 100, 200, ..., 900, 1000]. AOSP names shades inverted to the
 *   tone value: suffix 0 = tone 100 (lightest) ... suffix 1000 = tone 0
 *   (darkest), so the native array is ALSO lightest first. Cross-check: the
 *   package README's dark theme uses `system_neutral1[11]` ("shade 900") as
 *   background — tone 10, near-black — matching the JS path's index 11.
 */

import type { MaterialYouPalette } from 'react-native-material-you-colors';

export type { MaterialYouPalette };

/** Seed for the generated palette used wherever the wallpaper palette is unavailable. */
const FALLBACK_SEED = '#3E8ED8';

type MaterialYouModule = typeof import('react-native-material-you-colors').default;

const PALETTE_KEYS = [
  'system_accent1',
  'system_accent2',
  'system_accent3',
  'system_neutral1',
  'system_neutral2',
] as const;

let cached: MaterialYouPalette | null | undefined;

function loadModule(): MaterialYouModule | null {
  try {
    // Lazy require on purpose — a static import would crash Expo Go (new arch).
    const mod = require('react-native-material-you-colors') as { default?: MaterialYouModule };
    return mod?.default ?? null;
  } catch {
    return null;
  }
}

function isHexShade(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function isValidPalette(palette: MaterialYouPalette): boolean {
  return PALETTE_KEYS.every((key) => {
    const shades = palette[key];
    return Array.isArray(shades) && shades.length === 13 && shades.every(isHexShade);
  });
}

function compute(): MaterialYouPalette | null {
  const materialYou = loadModule();
  if (!materialYou) {
    console.log('[materialYou] native module unavailable - Material You theme uses the static seed palette');
    return null;
  }
  try {
    const palette = materialYou.getMaterialYouPalette(FALLBACK_SEED, 'TONAL_SPOT');
    if (!isValidPalette(palette)) {
      console.log('[materialYou] palette failed validation - Material You theme uses the static seed palette');
      return null;
    }
    return palette;
  } catch (error) {
    console.log('[materialYou] palette resolution failed - Material You theme uses the static seed palette', error);
    return null;
  }
}

/**
 * Resolve the Material You palette once per app session. Returns `null` only
 * when the package could not be loaded (e.g. Expo Go on the new architecture)
 * or produced an unusable result; callers then fall back to a static gradient.
 */
export function resolveMaterialYouPalette(): MaterialYouPalette | null {
  if (cached === undefined) cached = compute();
  return cached;
}

/**
 * Re-run the guarded resolve + validate cycle and return the fresh result.
 * Used on app foreground transitions so a wallpaper change is picked up
 * without restarting the app. Every failure path is guarded:
 * - `compute()` itself try/catches the native call and validation, so a
 *   synchronous native throw becomes `null` here.
 * - A `null` result never evicts an already-good palette from the memo
 *   (one failed refresh must not regress the theme to the static gradient),
 *   and the catch keeps the previous palette so this can never throw into a
 *   React event handler. Callers compare against their current palette and
 *   simply ignore a `null` return.
 */
export function refreshMaterialYouPalette(): MaterialYouPalette | null {
  try {
    const next = compute();
    if (next !== null || cached == null) cached = next;
    return next;
  } catch (error) {
    console.log('[materialYou] palette refresh failed - keeping the previous palette', error);
    return cached ?? null;
  }
}
