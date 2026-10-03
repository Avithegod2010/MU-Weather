import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from './utils/fonts';
import { HomeScreen } from './screens/HomeScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import * as Notifications from './utils/notifications';
import { DIGEST_READ_ACTION, speakDigestFromSource } from './utils/spokenDigest';
import {
  ensureWeatherAlertCategory,
  handleWeatherAlertAction,
} from './utils/fireAlertNotifications';
import './tasks/backgroundAlertTask';

export default function App() {
  const [fontsLoaded] = useFonts({
    Outfit_300Light,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  // Digest notification's "Read my forecast" action → speak the forecast aloud.
  // Weather-alert notifications carry "Snooze 1 h" / "Dismiss" buttons → snooze
  // extends that alert's cooldown, dismiss just acknowledges.
  // Unconditional hook: must sit ABOVE the fonts early return.
  useEffect(() => {
    void ensureWeatherAlertCategory();
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier === DIGEST_READ_ACTION) {
        void speakDigestFromSource(response.notification.request.content.body ?? undefined);
      } else {
        handleWeatherAlertAction(
          response.actionIdentifier,
          response.notification.request.content.data,
          response.notification.request.identifier,
        );
      }
    });
    // Cold start: the app was launched by the action tap — recover the response.
    // The body is the offline fallback the action can still read aloud.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      // Clear unconditionally: a stale response must never replay on a later launch.
      void Notifications.clearLastNotificationResponseAsync();
      if (response?.actionIdentifier === DIGEST_READ_ACTION) {
        void speakDigestFromSource(response.notification.request.content.body ?? undefined);
      } else if (response) {
        handleWeatherAlertAction(
          response.actionIdentifier,
          response.notification.request.content.data,
          response.notification.request.identifier,
        );
      }
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) {
    return <View style={styles.splash} />;
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <HomeScreen />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0D1631',
  },
});
