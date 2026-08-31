import { registerRootComponent } from 'expo';

import App from './App';
// Side effect: registers the Android home-screen widget task handler. Safe in
// Expo Go - the widget library falls back to a native no-op module there.
import './widget/weatherWidgetTask';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
