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
  // Unconditional hook: must sit ABOVE the fonts early return.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier === DIGEST_READ_ACTION) void speakDigestFromSource();
    });
    // Cold start: the app was launched by the action tap — recover the response.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.actionIdentifier === DIGEST_READ_ACTION) {
        void Notifications.clearLastNotificationResponseAsync();
        void speakDigestFromSource();
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
