import type { ComponentType } from 'react';

/**
 * Native Skia needs no loader: the runtime is linked into the app binary, so the
 * root component is returned as it is. The web build has its own version in
 * skiaWeb.web.ts that loads CanvasKit before the app module is evaluated.
 */
export function withSkia<P extends object>(
  load: () => { default: ComponentType<P> },
): ComponentType<P> {
  return load().default;
}

/** True once the Skia runtime is usable. Native is always ready. */
export function hasSkia(): boolean {
  return true;
}
