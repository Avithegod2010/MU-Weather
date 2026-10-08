/**
 * Design tokens shared by the home screen, cards, charts and motion helpers.
 *
 * Values replace the scattered literals that used to live in each component.
 * They are plain numbers so they can feed StyleSheet, SVG and Reanimated alike.
 * Colours stay in theme/palettes.ts (they depend on the weather condition).
 */

/** Corner radii. Cards use xl, inner surfaces lg, chips and pills use pill. */
export const RADIUS = {
  xs: 10,
  sm: 14,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

/** Spacing scale in logical pixels. */
export const SPACE = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

/** Type scale in logical pixels. Pair with a font family from theme/typography.ts. */
export const TYPE = {
  eyebrow: 12,
  caption: 12.5,
  body: 14.5,
  bodyLarge: 16,
  title: 19,
  chapter: 24,
  hero: 96,
} as const;

/** Motion durations in milliseconds. */
export const MOTION = {
  fast: 180,
  base: 320,
  reveal: 560,
  wipe: 900,
  slow: 620,
  ambient: 9000,
} as const;

/** Spring configs for interactive feedback (Reanimated withSpring). */
export const SPRING = {
  /** Snappy squeeze while a finger is down. */
  press: { damping: 18, stiffness: 420, mass: 0.6 },
  /** Soft return once the finger lifts. */
  release: { damping: 13, stiffness: 240, mass: 0.7 },
} as const;
