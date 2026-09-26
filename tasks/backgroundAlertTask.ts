import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWeather } from '../api/openMeteo';
import { fetchEnsembleSpread } from '../api/providers';
import { loadLastLocation, saveLastWeather } from '../utils/storage';
import { loadEnsembleCache, saveEnsembleCache, isEnsembleFresh } from '../utils/ensembleCache';
import { refreshWeatherWidgets } from '../widget/weatherWidgetTask';
import {
  fireAlertNotifications,
  ALERTS_STORAGE_KEY,
} from '../utils/fireAlertNotifications';
import { DEFAULT_ALERT_SETTINGS } from '../utils/alertRules';
import { rescheduleDigestFromCache, SETTINGS_KEY } from '../hooks/useDigest';
import { fireFavoriteCityAlerts } from '../utils/favoriteCityAlerts';
import { LANGUAGES, setLanguage } from '../utils/i18n';
import type { LanguageKey } from '../utils/i18n';

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
      // Same settings blob the digest path reads (SETTINGS_KEY from useDigest).
      const settingsRaw = await AsyncStorage.getItem(SETTINGS_KEY);
      const storedSettings: Record<string, unknown> = settingsRaw ? JSON.parse(settingsRaw) : {};
      const digestEnabled = storedSettings.digestEnabled === true;
      if (!anyAlertEnabled && !digestEnabled) return BackgroundTask.BackgroundTaskResult.Success;

      // A headless background start begins with i18n's default language (English).
      // Apply the stored one BEFORE anything fires, or every alert - including the
      // city-prefixed saved-city titles - would read English for non-English users.
      const storedLanguage = storedSettings.language;
      if (
        typeof storedLanguage === 'string' &&
        LANGUAGES.some((option) => option.key === storedLanguage)
      ) {
        setLanguage(storedLanguage as LanguageKey);
      }

      const data = await fetchWeather(location);
      if (anyAlertEnabled) {
        await fireAlertNotifications(settings, data);
        // Saved-city sweep: "rain starting in Paris" while you are elsewhere.
        // Opt-in via the `favorites` alert key and rate-limited internally, so
        // the 30-minute task cannot hammer the API.
        await fireFavoriteCityAlerts(settings, data);
      }
      // Keep the home-screen widget fed even when the app is closed. The
      // bundle is also the widget's cache source, so persist it here too.
      try {
        await saveLastWeather(data);
        await refreshWeatherWidgets();
      } catch {
        // Widget updates are best-effort.
      }
      // Refresh the digest schedule from the cached bundle so a user who has
      // not opened the app still gets a current notification body. The ensemble
      // cache is refreshed first (TTL-gated) so the confidence line is current.
      if (digestEnabled) {
        let spread = null;
        try {
          const cached = await loadEnsembleCache(location.latitude, location.longitude);
          if (cached && isEnsembleFresh(cached)) {
            spread = { points: cached.points, members: cached.members, fetchedAt: cached.fetchedAt };
          } else {
            spread = await fetchEnsembleSpread(location.latitude, location.longitude);
            if (spread) await saveEnsembleCache(location.latitude, location.longitude, spread);
          }
        } catch {
          // Ensemble is optional - the digest works without the confidence line.
        }
        await rescheduleDigestFromCache(spread);
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
