import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWeather } from '../api/openMeteo';
import { loadLastLocation, saveLastWeather } from '../utils/storage';
import { refreshWeatherWidgets } from '../widget/weatherWidgetTask';
import {
  fireAlertNotifications,
  ALERTS_STORAGE_KEY,
} from '../utils/fireAlertNotifications';
import { DEFAULT_ALERT_SETTINGS } from '../utils/alertRules';

export const BACKGROUND_ALERT_TASK = 'background-alert-task';

// Guard against duplicate definition during Fast Refresh.
const globalScope = globalThis as typeof globalThis & { __muBgAlertTaskDefined?: boolean };

if (!globalScope.__muBgAlertTaskDefined) {
  globalScope.__muBgAlertTaskDefined = true;

  TaskManager.defineTask(BACKGROUND_ALERT_TASK, async (): Promise<BackgroundTask.BackgroundTaskResult> => {
    try {
      const location = await loadLastLocation();
      if (!location) return BackgroundTask.BackgroundTaskResult.Success;

      const raw = await AsyncStorage.getItem(ALERTS_STORAGE_KEY);
      const settings = { ...DEFAULT_ALERT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
      const anyAlertEnabled = Object.values(settings).some(Boolean);
      if (!anyAlertEnabled) return BackgroundTask.BackgroundTaskResult.Success;

      const data = await fetchWeather(location);
      await fireAlertNotifications(settings, data);
      // Keep the home-screen widget fed even when the app is closed. The
      // bundle is also the widget's cache source, so persist it here too.
      try {
        await saveLastWeather(data);
        await refreshWeatherWidgets();
      } catch {
        // Widget updates are best-effort.
      }

      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerBackgroundAlerts(): Promise<void> {
  try {
    // minimumInterval is in MINUTES per expo-background-task types.
    await BackgroundTask.registerTaskAsync(BACKGROUND_ALERT_TASK, {
      minimumInterval: 30,
    });
  } catch {
    // Registration can fail on some devices/launchers - non-critical.
  }
}

export async function unregisterBackgroundAlerts(): Promise<void> {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_ALERT_TASK);
  } catch {
    // Nothing registered.
  }
}
