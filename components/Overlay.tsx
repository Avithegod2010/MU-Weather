import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { AppTheme } from '../theme/palettes';
import { t } from '../utils/i18n';

interface OverlayProps {
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  panelStyle?: 'top' | 'bottom';
}

export function Overlay({
  theme,
  visible,
  onClose,
  children,
  panelStyle = 'top',
}: OverlayProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.55,
  }));

  const isTop = panelStyle === 'top';
  const panelStyleAnim = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: isTop ? (1 - progress.value) * -48 : (1 - progress.value) * 400,
      },
    ],
    opacity: progress.value,
  }));

  if (!visible && progress.value === 0) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={t('a11y_close')}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          isTop ? styles.panelTop : styles.panelBottom,
          panelStyleAnim,
          {
            backgroundColor: theme.isLight ? '#F3F5F9' : '#141A26',
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#000000',
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  panelTop: {
    top: 0,
    bottom: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  panelBottom: {
    bottom: 0,
    maxHeight: '72%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
});
