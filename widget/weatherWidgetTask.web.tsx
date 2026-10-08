// Web (react-native-web) stand-in for the Android home-screen widget task.
//
// The native module registers a headless task through react-native-android-widget,
// which calls AppRegistry.registerHeadlessTask at import time. react-native-web has
// no such API, so importing the native module would crash the browser preview on
// startup. Home-screen widgets only exist on Android, so this file keeps the same
// exported functions as widget/weatherWidgetTask.tsx and does nothing. Metro picks
// this file only for the web platform; the Android task module is unchanged.

/** Same surface as the native module. There are no home-screen widgets on the web. */
export async function refreshWeatherWidgets(): Promise<void> {}

/** Same surface as the native module. There are no home-screen widgets on the web. */
export async function refreshCityWidgets(): Promise<void> {}
