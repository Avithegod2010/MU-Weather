import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CloudOff, RefreshCw } from '../utils/uiIcons';
import { t } from '../utils/i18n';
import { F } from '../theme/typography';

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level crash guard. Renders a calm full-screen fallback instead of the
 * RN red error screen when anything in the tree throws during render.
 * Hardcoded dark colors on purpose: if the theme system itself is what
 * crashed, the fallback cannot depend on it.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('[MU Weather] Uncaught render error:', error);
  }

  private readonly handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.screen}>
        <CloudOff width={56} height={56} color="#5B8FD9" />
        <Text style={styles.title}>{t('err_generic')}</Text>
        <Text style={styles.body}>{t('err_body')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('err_retry')}
          onPress={this.handleRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryPressed]}
        >
          <RefreshCw width={18} height={18} color="#0D1631" />
          <Text style={styles.retryLabel}>{t('err_retry')}</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0D1631',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  title: {
    fontSize: 22,
    fontFamily: F.semibold,
    color: '#F2F5FB',
    marginTop: 6,
    textAlign: 'center',
  },
  body: {
    fontSize: 14.5,
    lineHeight: 21,
    fontFamily: F.regular,
    color: 'rgba(242,245,251,0.68)',
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: '#5B8FD9',
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 24,
  },
  retryPressed: {
    opacity: 0.82,
  },
  retryLabel: {
    fontSize: 14.5,
    fontFamily: F.semibold,
    color: '#0D1631',
  },
});
