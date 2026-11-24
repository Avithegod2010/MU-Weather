/**
 * withPrivacyManifest — local config plugin that closes the two data-exposure
 * defaults found in the shipped v1.5.0 manifest (audit M1 + M2).
 *
 * Why a plugin: `android/` is gitignored and regenerated on every EAS build, so
 * anything set there would be lost. `app.json` has no durable field for
 * `allowBackup`, and the four dangerous permissions below are injected by
 * library manifests (React Native's own, expo-sensors, expo-calendar) rather
 * than by app code — dropping them from `android.permissions` does not stop the
 * manifest merger from putting them back. `<uses-permission tools:node="remove">`
 * is the merge-time way to refuse them, so it has to be written into the
 * manifest during prebuild.
 *
 * M1 — allowBackup=false: Android Auto Backup was uploading the app data dir
 * (last location, comfort journal, favourites, alert rules, 16 widget-city
 * assignments) to the user's Google Drive, in an app whose privacy policy says
 * data stays on the device. Explicit export in utils/backup.ts is unaffected.
 *
 * M2 — blocked permissions:
 *   SYSTEM_ALERT_WINDOW   inherited from React Native; "display over other apps"
 *                         enables tapjacking over any app, and this app never
 *                         draws an overlay.
 *   ACTIVITY_RECOGNITION  no step counting exists anywhere in the tree.
 *   READ/WRITE_EXTERNAL_STORAGE (maxSdk 32) — unused; the app writes only to
 *                         Paths.cache and Paths.document.
 *   WRITE_CALENDAR        the calendar is read-only in code (getCalendarsAsync /
 *                         getEventsAsync only, no create/updateEventAsync), so a
 *                         write grant would be pure consent surface.
 *
 * The widget permissions and the launcher badge permissions are deliberately
 * left alone: widgets are the product, and badge permissions are normalised by
 * the launcher. The two exported components (audit M3) are a separate change.
 *
 * Idempotent: re-running replaces the existing remove-markers instead of
 * appending duplicates.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const BLOCKED_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.ACTIVITY_RECOGNITION',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.WRITE_CALENDAR',
];

const TOOLS_NS = 'http://schemas.android.com/tools';

module.exports = function withPrivacyManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ || {};

    // tools:node="remove" is a merge directive; without the namespace the
    // generated manifest fails aapt2 resource linking.
    if (!manifest.$['xmlns:tools']) manifest.$['xmlns:tools'] = TOOLS_NS;

    const application = (manifest.application || [])[0];
    if (application) {
      application.$ = application.$ || {};
      // No cloud backup of the app data dir, and no legacy key/value backup
      // either: both flags are needed because fullBackupContent defaulted to
      // "include everything" on API < 31 and dataExtractionRules on 31+.
      application.$['android:allowBackup'] = 'false';
      application.$['android:fullBackupContent'] = 'false';
      delete application.$['android:dataExtractionRules'];
    }

    const blocked = new Set(BLOCKED_PERMISSIONS);
    const declared = manifest['uses-permission'] || [];
    // Drop any declaration of a blocked permission (Expo's android.permissions
    // or a config plugin may have added one) and let the remove-marker speak
    // for it instead — a plain declaration in this manifest would win.
    const kept = declared.filter((entry) => {
      const name = entry && entry.$ && entry.$['android:name'];
      return !name || !blocked.has(name);
    });
    for (const name of BLOCKED_PERMISSIONS) {
      const alreadyMarked = kept.some(
        (entry) =>
          entry && entry.$ && entry.$['android:name'] === name && entry.$['tools:node'] === 'remove'
      );
      if (!alreadyMarked) {
        kept.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
      }
    }
    manifest['uses-permission'] = kept;

    return cfg;
  });
};
