/**
 * Safe wrapper around expo-notifications for Expo Go on Android.
 *
 * WHY THIS EXISTS: importing 'expo-notifications' (the package index) eagerly
 * loads DevicePushTokenAutoRegistration.fx, whose module-scope call to
 * addPushTokenListener() throws "remote push was removed from Expo Go"
 * on Android (SDK 53+). We only use LOCAL notifications, so we import the
 * exact deep modules we need and skip the push machinery entirely.
 *
 * Keep this surface identical to the parts of expo-notifications we use.
 * When moving to a development build, this file can be swapped back to
 * 'expo-notifications' with zero call-site changes.
 *
 * Categories and notification-response events are still LOCAL-notification
 * surface — nothing here touches the push machinery.
 */

export { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
export {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
export { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
export { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
export { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
export { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
export { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
export { setNotificationCategoryAsync } from 'expo-notifications/build/setNotificationCategoryAsync';
export {
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
  clearLastNotificationResponseAsync,
} from 'expo-notifications/build/NotificationsEmitter';
