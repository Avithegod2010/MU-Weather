import { useSyncExternalStore } from 'react';
import type { SkImage } from '@shopify/react-native-skia';

/**
 * A snapshot of the Home sky canvas, in window coordinates, for the liquid-glass shader to
 * refract. AnimatedBackground publishes it; GlassHighlight reads it. Null means no snapshot yet,
 * and the highlight falls back to its gradient approximation.
 */
export interface SkyBackdrop {
  image: SkImage;
  /** Window size the snapshot covers, in logical pixels. */
  width: number;
  height: number;
}

let current: SkyBackdrop | null = null;
const listeners = new Set<() => void>();

export function setSkyBackdrop(next: SkyBackdrop | null): void {
  current = next;
  listeners.forEach((listener) => listener());
}

/**
 * Debug hook for the visual probes: `window.__MU_DISABLE_SKY_BACKDROP = true` makes the glass use its
 * gradient fallback, so a capture with and without the snapshot can be compared pixel for pixel.
 * Off in normal use.
 */
function backdropDisabled(): boolean {
  return typeof window !== 'undefined' && (window as unknown as { __MU_DISABLE_SKY_BACKDROP?: boolean }).__MU_DISABLE_SKY_BACKDROP === true;
}

export function getSkyBackdrop(): SkyBackdrop | null {
  return backdropDisabled() ? null : current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The latest sky snapshot, re-rendering the caller when it changes. */
export function useSkyBackdrop(): SkyBackdrop | null {
  return useSyncExternalStore(subscribe, getSkyBackdrop, getSkyBackdrop);
}
