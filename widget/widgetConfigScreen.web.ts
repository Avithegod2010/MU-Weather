// Web (react-native-web) stand-in for the multi-city widget configuration screen.
//
// The configuration screen is launched only by the Android WidgetConfigurationActivity,
// so there is nothing to register in the browser. Metro picks this file for the web
// platform, which keeps react-native-android-widget out of the web bundle entirely.
// The native registration in widget/widgetConfigScreen.tsx is unchanged.

export {};
