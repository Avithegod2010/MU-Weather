/**
 * Sliding selection: one highlight glides between the options of a group.
 *
 * Material mode slides a solid pill (or an outline) with a quick spring and no bounce.
 * Liquid glass mode draws the same highlight as frosted glass and stretches it while it
 * travels: the leading edge snaps ahead, the trailing edge follows a beat later.
 *
 * Call sites keep their own press handlers, so haptics and business logic do not move.
 * Items report their frames to the group. An optional SlidingTarget inside an item can
 * report a smaller frame instead, such as a colour swatch ring.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppTheme } from '../theme/palettes';
import { LIQUID, MOTION, SLIDE } from '../theme/tokens';
import { useReducedMotion } from '../utils/reduceMotion';
import { GlassBackdropHighlight, GlassHighlight, glassBackdropEffect, glassEffect } from './GlassHighlight';
import { useSkyBackdrop } from '../utils/skyBackdrop';

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Kind = 'item' | 'target';
type Report = (index: number, frame: Frame, kind: Kind) => void;

const GroupContext = createContext<GroupRegistry | null>(null);
const ItemContext = createContext<number | null>(null);

function sameFrame(a: Frame | undefined, b: Frame): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Glass tint: nearly clear, so the blur and the bright rim carry the effect, as on iOS glass. */
function glassTint(color: string | undefined, isLight: boolean): string {
  if (!color) return isLight ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)';
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}2E` : color;
}

/**
 * Animates a highlight frame toward `frame`. The first frame is placed without motion.
 * Each axis has a leading and a trailing edge. Liquid glass snaps the leading edge ahead
 * and lets the trailing edge follow, so the glass stretches along the direction of travel.
 */
function useSlideFrame(frame: Frame | null, liquid: boolean, reduced: boolean) {
  const left = useSharedValue(frame?.x ?? 0);
  const right = useSharedValue((frame?.x ?? 0) + (frame?.width ?? 0));
  const top = useSharedValue(frame?.y ?? 0);
  const bottom = useSharedValue((frame?.y ?? 0) + (frame?.height ?? 0));
  const shown = useSharedValue(frame ? 1 : 0);
  const previous = useRef<Frame | null>(null);

  useEffect(() => {
    if (!frame) {
      shown.value = withTiming(0, { duration: MOTION.fast });
      return;
    }
    const before = previous.current;
    previous.current = frame;
    const startX = frame.x;
    const endX = frame.x + frame.width;
    const startY = frame.y;
    const endY = frame.y + frame.height;

    if (!before || reduced) {
      left.value = startX;
      right.value = endX;
      top.value = startY;
      bottom.value = endY;
      shown.value = 1;
      return;
    }

    shown.value = withTiming(1, { duration: MOTION.fast });
    const movingRight = startX + endX > before.x * 2 + before.width;
    const movingDown = startY + endY > before.y * 2 + before.height;
    if (liquid) {
      if (movingRight) {
        right.value = withSpring(endX, LIQUID.lead);
        left.value = withDelay(LIQUID.lagMs, withSpring(startX, LIQUID.trail));
      } else {
        left.value = withSpring(startX, LIQUID.lead);
        right.value = withDelay(LIQUID.lagMs, withSpring(endX, LIQUID.trail));
      }
      if (movingDown) {
        bottom.value = withSpring(endY, LIQUID.lead);
        top.value = withDelay(LIQUID.lagMs, withSpring(startY, LIQUID.trail));
      } else {
        top.value = withSpring(startY, LIQUID.lead);
        bottom.value = withDelay(LIQUID.lagMs, withSpring(endY, LIQUID.trail));
      }
    } else {
      left.value = withSpring(startX, SLIDE);
      right.value = withSpring(endX, SLIDE);
      top.value = withSpring(startY, SLIDE);
      bottom.value = withSpring(endY, SLIDE);
    }
    // Depend on the numbers, not the object, so a re-render with the same frame does nothing.
    // The shared values read here are stable refs; listing them would only add noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame?.x, frame?.y, frame?.width, frame?.height, liquid, reduced]);

  // Size as values of their own, so the glass shader can follow the sliding frame.
  const width = useDerivedValue(() => Math.abs(right.value - left.value));
  const height = useDerivedValue(() => Math.abs(bottom.value - top.value));
  const pillLeft = useDerivedValue(() => Math.min(left.value, right.value));
  const pillTop = useDerivedValue(() => Math.min(top.value, bottom.value));
  const style = useAnimatedStyle(() => ({
    left: pillLeft.value,
    width: width.value,
    top: pillTop.value,
    height: height.value,
    opacity: shown.value,
  }));
  return { style, width, height, pillLeft, pillTop };
}

interface HighlightProps {
  frame: Frame | null;
  variant: 'fill' | 'ring';
  color?: string;
  stroke?: string;
  fill?: string;
  strokeWidth: number;
  radius: number;
  theme: AppTheme;
  liquid: boolean;
  reduced: boolean;
  /** The group's window position, which the liquid glass needs to find the sky behind it. */
  groupX: SharedValue<number>;
  groupY: SharedValue<number>;
}

function SlidingHighlight({
  frame,
  variant,
  color,
  stroke,
  fill,
  strokeWidth,
  radius,
  theme,
  liquid,
  reduced,
  groupX,
  groupY,
}: HighlightProps) {
  const {
    style: animated,
    width: glassWidth,
    height: glassHeight,
    pillLeft,
    pillTop,
  } = useSlideFrame(frame, liquid, reduced);
  // The sky snapshot, when one exists. It re-renders this highlight each time it changes.
  const backdrop = useSkyBackdrop();
  // The pill's window position: the group's window origin plus the pill's offset in the group.
  const originX = useDerivedValue(() => groupX.value + pillLeft.value);
  const originY = useDerivedValue(() => groupY.value + pillTop.value);

  if (variant === 'ring') {
    return (
      <Animated.View
        pointerEvents="none"
        testID="slide-highlight"
        style={[
          styles.absolute,
          animated,
          {
            borderRadius: radius,
            borderWidth: strokeWidth,
            borderColor: color ?? theme.accent,
            backgroundColor: fill ?? (liquid ? 'rgba(255,255,255,0.08)' : 'transparent'),
          },
          liquid ? styles.ringGlow : null,
        ]}
      />
    );
  }

  if (liquid) {
    // Liquid glass: the Skia shader when it compiles. Otherwise the blur-and-gradient stack below,
    // which is the look the app shipped with.
    const effect = glassEffect();
    const backdropEffect = backdrop ? glassBackdropEffect() : null;
    return (
      <Animated.View
        pointerEvents="none"
        testID="slide-highlight"
        style={[styles.absolute, animated, { borderRadius: radius }, styles.glassShadow]}
      >
        <View style={[styles.glassClip, { borderRadius: radius }]}>
          {backdrop && backdropEffect ? (
            <GlassBackdropHighlight
              effect={backdropEffect}
              backdrop={backdrop}
              width={glassWidth}
              height={glassHeight}
              originX={originX}
              originY={originY}
              radius={radius}
              tint={glassTint(color, theme.isLight)}
              rimStrength={0.3}
            />
          ) : effect ? (
            <GlassHighlight
              effect={effect}
              width={glassWidth}
              height={glassHeight}
              radius={radius}
              tint={glassTint(color, theme.isLight)}
              sky={theme.gradient}
              rimStrength={0.3}
            />
          ) : (
            <>
              <BlurView
                intensity={theme.blurIntensity}
                tint={theme.blurTint}
                experimentalBlurMethod="dimezisBlurView"
                style={StyleSheet.absoluteFill}
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: glassTint(color, theme.isLight) }]} />
              <LinearGradient
                colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.glassSheen}
              />
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.07)']}
                start={{ x: 0.5, y: 0.55 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </>
          )}
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.glassEdge,
            {
              borderRadius: radius,
              borderColor: stroke ?? (theme.isLight ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.32)'),
            },
          ]}
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View
      pointerEvents="none"
      testID="slide-highlight"
      style={[
        styles.absolute,
        animated,
        {
          borderRadius: radius,
          backgroundColor: color ?? (theme.isLight ? '#FFFFFF' : '#F4F6FA'),
          borderWidth: stroke ? strokeWidth : 0,
          borderColor: stroke,
        },
      ]}
    />
  );
}

export interface SlidingGroupProps {
  theme: AppTheme;
  /** Index of the selected item, or -1 when nothing is selected. */
  activeIndex: number;
  /** `fill` paints a pill behind the items. `ring` draws an outline over them. */
  variant?: 'fill' | 'ring';
  /** Fill colour (fill) or outline colour (ring). Defaults to the theme's pill colour or accent. */
  color?: string;
  /** Optional border colour for a filled highlight. */
  stroke?: string;
  /** Background tint behind an outlined (ring) highlight, for example a tinted chip. */
  fill?: string;
  /** Outline width for a ring highlight. Defaults to 2. */
  strokeWidth?: number;
  /** Corner radius of the highlight. Use the item's radius so the edges line up. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

interface GroupRegistry {
  report: Report;
  registerItem: (index: number, node: View | null) => void;
  registerTarget: (index: number, node: View | null) => void;
}

/**
 * A node's frame inside `within`, from layout offsets rather than screen coordinates.
 * Offsets ignore CSS transforms, so a card that is still scaling in cannot skew the frame.
 * The result is relative to the inside of `within`'s border. Null when the node is not laid out.
 */
function offsetFrame(node: View, within: View): Frame | null {
  const el = node as unknown as HTMLElement;
  const root = within as unknown as HTMLElement;
  let x = 0;
  let y = 0;
  let current: HTMLElement = el;
  while (current !== root) {
    x += current.offsetLeft;
    y += current.offsetTop;
    const parent = current.offsetParent as HTMLElement | null;
    if (!parent) return null;
    // Offsets are measured from a parent's padding edge. Each intermediate parent's border sits outside it.
    if (parent !== root) {
      x += parent.clientLeft;
      y += parent.clientTop;
    }
    current = parent;
  }
  return { x, y, width: el.offsetWidth, height: el.offsetHeight };
}

/** Container for a set of SlidingItems. Its direct children must be items (or wrappers around them). */
export function SlidingGroup({
  theme,
  activeIndex,
  variant = 'fill',
  color,
  stroke,
  fill,
  strokeWidth = 2,
  radius = 999,
  style,
  children,
}: SlidingGroupProps) {
  const [items, setItems] = useState<Record<number, Frame>>({});
  const [targets, setTargets] = useState<Record<number, Frame>>({});
  const reduced = useReducedMotion();
  const liquid = theme.styleMode === 'glass';
  const containerRef = useRef<View>(null);
  // The group's window position, for the liquid glass to sample the sky behind it. Measured
  // on a timer, since the group can move; the pill's own offset is added on the UI thread.
  const groupX = useSharedValue(0);
  const groupY = useSharedValue(0);
  const styleRef = useRef(style);
  styleRef.current = style;
  const itemNodes = useRef(new Map<number, View>());
  const targetNodes = useRef(new Map<number, View>());

  const report = useCallback<Report>((index, frame, kind) => {
    const update = kind === 'item' ? setItems : setTargets;
    update((previous) => (sameFrame(previous[index], frame) ? previous : { ...previous, [index]: frame }));
  }, []);

  useEffect(() => {
    if (!liquid) return;
    const measure = () => {
      containerRef.current?.measureInWindow((x, y) => {
        groupX.value = x;
        groupY.value = y;
      });
    };
    measure();
    // Under reduced motion nothing moves, so one measurement after each selection is enough.
    if (reduced) return;
    const timer = setInterval(measure, 400);
    return () => clearInterval(timer);
  }, [liquid, reduced, activeIndex, groupX, groupY]);

  const registry = useMemo<GroupRegistry>(
    () => ({
      report,
      registerItem: (index, node) => {
        if (node) itemNodes.current.set(index, node);
        else itemNodes.current.delete(index);
      },
      registerTarget: (index, node) => {
        if (node) targetNodes.current.set(index, node);
        else targetNodes.current.delete(index);
      },
    }),
    [report],
  );

  // Layout events do not fire for a pure move on the web, so the selected item and its
  // target are measured again whenever the selection changes.
  // The first pass waits for the sheet to settle. On web, layout events can fire while the sheet
  // is still hidden or at zero size, and nothing else would measure the selected item again, so
  // the first highlight stayed invisible until the selection changed.
  const [settledReady, setSettledReady] = useState(false);
  useEffect(() => {
    if (!settledReady) {
      const timer = setTimeout(() => setSettledReady(true), 400);
      return () => clearTimeout(timer);
    }
    const container = containerRef.current;
    const item = itemNodes.current.get(activeIndex);
    if (!container || !item) return;

    if (Platform.OS === 'web') {
      // Layout offsets are immune to a transform still running on an ancestor.
      // A pass can read no offset parent, or a zero size, while the sheet is still settling. That
      // frame must not stand, and nothing else would measure again, so retry for a few seconds.
      let retry: ReturnType<typeof setTimeout> | null = null;
      let attempts = 0;
      const measureWeb = () => {
        retry = null;
        const itemFrame = offsetFrame(item, container);
        if (!itemFrame || itemFrame.width === 0 || itemFrame.height === 0) {
          if (attempts++ < 30) retry = setTimeout(measureWeb, 100);
          return;
        }
        report(activeIndex, itemFrame, 'item');
        const target = targetNodes.current.get(activeIndex);
        const targetFrame = target ? offsetFrame(target, item) : null;
        if (targetFrame) {
          // A target's frame is relative to its item's outer edge, so the item's border is added.
          const itemEl = item as unknown as HTMLElement;
          report(
            activeIndex,
            { ...targetFrame, x: targetFrame.x + itemEl.clientLeft, y: targetFrame.y + itemEl.clientTop },
            'target',
          );
        }
      };
      measureWeb();
      return () => {
        if (retry) clearTimeout(retry);
      };
    }

    // Native: window coordinates. Positions are relative to the inside of the container's border, like child layout.
    const flat = StyleSheet.flatten(styleRef.current) as ViewStyle | undefined;
    const borderLeft = flat?.borderLeftWidth ?? flat?.borderWidth ?? 0;
    const borderTop = flat?.borderTopWidth ?? flat?.borderWidth ?? 0;
    item.measureInWindow((ix, iy, iw, ih) => {
      container.measureInWindow((cx, cy) => {
        report(activeIndex, { x: ix - cx - borderLeft, y: iy - cy - borderTop, width: iw, height: ih }, 'item');
        const target = targetNodes.current.get(activeIndex);
        if (target) {
          target.measureInWindow((tx, ty, tw, th) => {
            // A target's frame is relative to its item; the item offset is added when composing.
            report(activeIndex, { x: tx - ix, y: ty - iy, width: tw, height: th }, 'target');
          });
        }
      });
    });
  }, [activeIndex, report, settledReady]);

  const active = useMemo<Frame | null>(() => {
    const item = items[activeIndex];
    // A zero-size frame is not yet measured; showing it would leave an invisible highlight.
    if (!item || item.width === 0 || item.height === 0) return null;
    const target = targets[activeIndex];
    if (!target) return item;
    // A target's frame is relative to its item, so add the item's offset.
    return { x: item.x + target.x, y: item.y + target.y, width: target.width, height: target.height };
  }, [items, targets, activeIndex]);

  const highlight = (
    <SlidingHighlight
      frame={active}
      variant={variant}
      color={color}
      stroke={stroke}
      fill={fill}
      strokeWidth={strokeWidth}
      radius={radius}
      theme={theme}
      liquid={liquid}
      reduced={reduced}
      groupX={groupX}
      groupY={groupY}
    />
  );

  return (
    <GroupContext.Provider value={registry}>
      <View ref={containerRef} style={style}>
        {variant === 'fill' ? highlight : null}
        {children}
        {variant === 'ring' ? highlight : null}
      </View>
    </GroupContext.Provider>
  );
}

export interface SlidingItemProps extends Omit<PressableProps, 'style' | 'children'> {
  index: number;
  style?: StyleProp<ViewStyle>;
  /** Opacity while pressed. Leave out for no press feedback. */
  pressedOpacity?: number;
  children?: React.ReactNode;
}

/** One selectable option. Its press handler and accessibility props are the call site's own. */
export function SlidingItem({ index, style, pressedOpacity, children, ...pressable }: SlidingItemProps) {
  const group = useContext(GroupContext);
  const ref = useRef<View>(null);

  useEffect(() => {
    group?.registerItem(index, ref.current);
    return () => group?.registerItem(index, null);
  }, [group, index]);

  return (
    <ItemContext.Provider value={index}>
      <Pressable
        {...pressable}
        ref={ref}
        onLayout={(event: LayoutChangeEvent) => group?.report(index, event.nativeEvent.layout, 'item')}
        style={({ pressed }) => [style, pressedOpacity !== undefined && pressed ? { opacity: pressedOpacity } : null]}
      >
        {children}
      </Pressable>
    </ItemContext.Provider>
  );
}

/**
 * A part of a SlidingItem that the highlight should wrap instead of the whole item,
 * for example the swatch in a colour grid. It adds no layout of its own.
 */
export function SlidingTarget({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const group = useContext(GroupContext);
  const index = useContext(ItemContext);
  const ref = useRef<View>(null);

  useEffect(() => {
    if (index === null) return;
    group?.registerTarget(index, ref.current);
    return () => group?.registerTarget(index, null);
  }, [group, index]);

  return (
    <View
      ref={ref}
      style={style}
      onLayout={(event: LayoutChangeEvent) => {
        if (index !== null) group?.report(index, event.nativeEvent.layout, 'target');
      }}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: { position: 'absolute', left: 0, top: 0 },
  glassShadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  glassClip: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  glassSheen: { position: 'absolute', left: 0, right: 0, top: 0, height: '55%' },
  glassEdge: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderWidth: 1 },
  ringGlow: {
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
});
