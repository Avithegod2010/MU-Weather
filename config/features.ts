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
} as const;

export type FeatureKey = keyof typeof FEATURES;
