import {
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  SlideInRight,
  SlideOutRight,
  withTiming,
} from 'react-native-reanimated';

export type DetailAnimStyle = 'fade' | 'slideUp' | 'zoom' | 'push';

export const DETAIL_ANIM_OPTIONS: Array<{ value: DetailAnimStyle; label: string }> = [
  { value: 'fade', label: 'Fade' },
  { value: 'slideUp', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'push', label: 'Push' },
];

/** Whole-screen entrance - short, calm, zero bounce for every style. */
export function detailEntering(style: DetailAnimStyle) {
  switch (style) {
    case 'slideUp':
      return SlideInDown.duration(240);
    case 'push':
      return SlideInRight.duration(240);
    case 'zoom':
      return gentleZoomIn;
    case 'fade':
    default:
      return FadeIn.duration(190);
  }
}

/** Whole-screen exit - quick and quiet. */
export function detailExiting(style: DetailAnimStyle) {
  switch (style) {
    case 'slideUp':
      return SlideOutDown.duration(220);
    case 'push':
      return SlideOutRight.duration(220);
    case 'zoom':
      return gentleZoomOut;
    case 'fade':
    default:
      return FadeOut.duration(160);
  }
}

/** Staggered entrance for content cards - barely-there cascade, max 90ms spread. */
export function sectionEntering(style: DetailAnimStyle, order: number) {
  const delay = Math.min(order * 30, 90);
  if (style === 'fade') {
    return FadeIn.delay(delay).duration(170);
  }
  return FadeInDown.delay(delay).duration(190);
}

/** Header entrance. */
export function headerEntering(style: DetailAnimStyle) {
  if (style === 'fade') {
    return FadeIn.duration(150);
  }
  return FadeInDown.duration(160);
}

/** Gentle zoom: grows from 94% instead of snapping from 0. */
function gentleZoomIn() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.94 }] },
    animations: {
      opacity: withTiming(1, { duration: 190 }),
      transform: [{ scale: withTiming(1, { duration: 190 }) }],
    },
  };
}

function gentleZoomOut() {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: 160 }),
      transform: [{ scale: withTiming(0.97, { duration: 160 }) }],
    },
  };
}
