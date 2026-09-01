/**
 * Central feature flags.
 *
 * HOW TO REMOVE A FEATURE:
 *   1. Quick:   flip its flag to false - the UI, hook and sensor subscriptions
 *               disappear everywhere (files remain, zero cost).
 *   2. Surgical: git revert the feature's commit - every file, dependency and
 *               flag line was added in ONE commit, so a single revert removes
 *               it completely.
 *
 * HOW TO ADD A FEATURE:
 *   Add a flag here, guard its component mount + hook call with it, and ship
 *   it in its own isolated commit.
 */
export const FEATURES = {
  /** Device barometer card - live phone-measured pressure vs forecast */
  barometer: true,
  /** Animated rain/snow particles drifting over the gradient background */
  particleOverlay: true,
  /** 48-hour multi-line trend chart (temp / dew point / wind) */
  trendChart: true,
  /** Activity planner scores (running, cycling, laundry, stargazing, photo) */
  activityPlanner: true,
  /** Calendar integration - weather for your upcoming events */
  calendarWeather: true,
  /** Marine forecast card - waves + sea temp (coastal locations only) */
  marineForecast: true,
  /** Background alert monitoring - periodic checks with app closed */
  backgroundAlerts: true,
  /** City comparison screen - favorites side by side */
  cityComparison: true,
  /** Deep dive detail screen on tapping any detail tile */
  tileDetails: true,
  /** "What's normal here" card - 1991-2020 climate normals for the active location */
  climate: true,
} as const;

export type FeatureKey = keyof typeof FEATURES;
