import React, { type ComponentType } from 'react';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

/**
 * Skia's web build reads `global.CanvasKit` once, when its module is evaluated. So the
 * app module must not load until CanvasKit is ready. WithSkiaWeb loads it first, then
 * calls `load()` (a lazy require of the app). The binary is served from the site root:
 * scripts/copy-canvaskit.mjs copies it into public/ at install time.
 */
export function withSkia<P extends object>(
  load: () => { default: ComponentType<P> },
): ComponentType<P> {
  function SkiaRoot(props: P) {
    return React.createElement(WithSkiaWeb, {
      getComponent: load,
      fallback: null,
      opts: { locateFile: (file: string) => `/${file}` },
      componentProps: props,
    } as never);
  }
  return SkiaRoot;
}

/** True once CanvasKit is installed on the global object. */
export function hasSkia(): boolean {
  return (globalThis as { CanvasKit?: unknown }).CanvasKit !== undefined;
}
