import { useEffect, useRef, useState } from 'react';
import { getReduceMotion } from './reduceMotion';

export interface CountUpOptions {
  /** Value shown on the first render. Defaults to the target, so nothing animates on mount. */
  from?: number;
  /** Duration of the count in milliseconds. */
  duration?: number;
  /** Wait before the count starts, in milliseconds. */
  delay?: number;
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Animates a number from its previous value to `target` with an ease-out curve,
 * driven by requestAnimationFrame. Under OS reduce-motion, or for non-finite
 * targets, the value jumps straight to the target.
 */
export function useCountUp(target: number, options: CountUpOptions = {}): number {
  const { from, duration = 900, delay = 0 } = options;
  const [value, setValue] = useState(from ?? target);
  const shown = useRef(from ?? target);

  useEffect(() => {
    if (!Number.isFinite(target) || getReduceMotion()) {
      shown.current = target;
      setValue(target);
      return;
    }
    const start = shown.current;
    if (start === target) return;

    let frame = 0;
    let startedAt = 0;
    const step = (now: number) => {
      if (startedAt === 0) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / duration);
      const next = start + (target - start) * easeOutCubic(progress);
      shown.current = progress >= 1 ? target : next;
      setValue(shown.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, duration, delay]);

  return value;
}
