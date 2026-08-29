import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * OS reduce-motion preference, kept as a module global (like utils/haptics.ts)
 * so non-hook callers can read it synchronously - e.g. the animation builders
 * in utils/detailAnimations.ts that run during render, not inside effects.
 */
let enabled = false;
let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((value) => {
      enabled = value;
    })
    .catch(() => {});
  // Keep the global current while the app runs.
  AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
    enabled = value;
  });
}

/** Current OS reduce-motion preference. */
export function getReduceMotion(): boolean {
  ensureInitialized();
  return enabled;
}

/** React hook mirroring the OS reduce-motion preference. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(getReduceMotion);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        if (mounted) setReduced(value);
      },
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
