/**
 * Checks `plugins/withPrivacyManifest.js` without a node_modules tree or a
 * Gradle build: the plugin is loaded with a stub for `@expo/config-plugins`,
 * run against a manifest shaped like the one Expo prebuild produces for the
 * shipped v1.5.0 APK, and the result is fed through a model of the Android
 * manifest merger (library permissions minus `tools:node="remove"` entries).
 *
 * Run: node scripts/test-privacy-manifest.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = Module.createRequire(import.meta.url);

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '@expo/config-plugins') {
    // withAndroidManifest only needs to hand back a config carrying the action.
    return {
      withAndroidManifest: (config, action) => ({ ...config, applyManifestAction: action }),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const withPrivacyManifest = require('../plugins/withPrivacyManifest.js');
Module._load = originalLoad;

/** Permissions injected by React Native / expo-sensors / expo-calendar / launchers. */
const LIBRARY_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.ACTIVITY_RECOGNITION',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.WRITE_CALENDAR',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'com.sec.android.provider.badge.permission.READ',
  'com.sec.android.provider.badge.permission.WRITE',
];

const BLOCKED = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.ACTIVITY_RECOGNITION',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.WRITE_CALENDAR',
];

function prebuildManifest() {
  // Mirrors the merged manifest decoded from app-universal-release.apk (v1.5.0):
  // allowBackup="true", the dangerous permissions present, no tools namespace.
  return {
    $: {
      'xmlns:android': 'http://schemas.android.com/apk/res/android',
      package: 'com.avithegod.muweather',
    },
    'uses-permission': [
      { $: { 'android:name': 'android.permission.ACCESS_COARSE_LOCATION' } },
      { $: { 'android:name': 'android.permission.ACCESS_FINE_LOCATION' } },
      { $: { 'android:name': 'android.permission.READ_CALENDAR' } },
    ],
    'uses-permission-sdk-23': [
      { $: { 'android:name': 'android.permission.ACTIVITY_RECOGNITION' } },
    ],
    application: [
      {
        $: {
          'android:name': '.MainActivity',
          'android:allowBackup': 'true',
          'android:dataExtractionRules': '@xml/data_extraction_rules',
        },
      },
    ],
  };
}

function runPlugin(manifest) {
  const config = withPrivacyManifest({ name: 'MU Weather', slug: 'mu-weather' });
  assert.equal(typeof config.applyManifestAction, 'function');
  const result = config.applyManifestAction({ modResults: { manifest } });
  return result.modResults.manifest;
}

/** Model of the manifest merger for one app: library + app, minus remove-markers. */
function mergedPermissions(manifest, library = LIBRARY_PERMISSIONS) {
  const removed = new Set(
    (manifest['uses-permission'] || [])
      .filter((entry) => entry.$ && entry.$['tools:node'] === 'remove')
      .map((entry) => entry.$['android:name'])
  );
  const merged = new Set(library);
  for (const key of ['uses-permission', 'uses-permission-sdk-23']) {
    for (const entry of manifest[key] || []) {
      const name = entry.$ && entry.$['android:name'];
      if (name && entry.$['tools:node'] !== 'remove') merged.add(name);
    }
  }
  for (const name of removed) merged.delete(name);
  return merged;
}

test('allowBackup is off and no extraction rules remain', () => {
  const manifest = runPlugin(prebuildManifest());
  const app = manifest.application[0];
  assert.equal(app.$['android:allowBackup'], 'false');
  assert.equal(app.$['android:fullBackupContent'], 'false');
  assert.equal(app.$['android:dataExtractionRules'], undefined);
});

test('tools namespace is declared for the remove directives', () => {
  const manifest = runPlugin(prebuildManifest());
  assert.equal(manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
});

test('every blocked permission is refused at merge time', () => {
  const manifest = runPlugin(prebuildManifest());
  const effective = mergedPermissions(manifest);
  for (const name of BLOCKED) {
    assert.equal(effective.has(name), false, name + ' survived the merge');
    assert.ok(
      manifest['uses-permission'].some(
        (entry) => entry.$['android:name'] === name && entry.$['tools:node'] === 'remove'
      ),
      name + ' has no remove marker'
    );
  }
});

test('permissions the app actually uses survive', () => {
  const effective = mergedPermissions(runPlugin(prebuildManifest()));
  for (const name of [
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.READ_CALENDAR',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'com.sec.android.provider.badge.permission.READ',
  ]) {
    assert.ok(effective.has(name), name + ' was removed');
  }
});

test('a library re-declaring WRITE_CALENDAR cannot reintroduce it', () => {
  // app.json no longer asks for WRITE_CALENDAR, but a future calendarWritePermission
  // would only add a plain declaration; the remove marker still wins.
  const manifest = runPlugin(prebuildManifest());
  manifest['uses-permission'].push({
    $: { 'android:name': 'android.permission.WRITE_CALENDAR' },
  });
  const effective = mergedPermissions(manifest);
  assert.equal(effective.has('android.permission.WRITE_CALENDAR'), false);
});

test('running twice does not duplicate entries', () => {
  const once = runPlugin(prebuildManifest());
  const twice = runPlugin(prebuildManifest());
  const count = (manifest) =>
    manifest['uses-permission'].filter((entry) => entry.$['tools:node'] === 'remove').length;
  assert.equal(count(twice), BLOCKED.length);
  assert.equal(count(once), count(twice));
  const names = twice['uses-permission'].map((entry) => entry.$['android:name']);
  assert.equal(new Set(names).size, names.length);
});

test('a manifest without allowBackup or an application node does not crash', () => {
  const manifest = runPlugin({ manifest: { $: { package: 'x' } } });
  assert.equal(manifest['uses-permission'].length, BLOCKED.length);
  assert.equal(manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
});

test('app.json asks only for the permissions the app uses and registers the plugin last', () => {
  const appJson = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8'));
  const android = appJson.expo.android;
  assert.deepEqual(android.permissions, [
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.READ_CALENDAR',
  ]);
  const calendar = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-calendar');
  assert.deepEqual(Object.keys(calendar[1]), ['calendarPermission']);
  const plugins = appJson.expo.plugins;
  assert.equal(plugins[plugins.length - 1], './plugins/withPrivacyManifest');
  assert.ok(existsSync(path.join(root, 'plugins', 'withPrivacyManifest.js')));
});
