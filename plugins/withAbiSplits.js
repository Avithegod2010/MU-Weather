/**
 * withAbiSplits — local config plugin that injects a Gradle `splits { abi { } }`
 * block into android/app/build.gradle during prebuild, so EAS builds emit
 * per-architecture APKs (armeabi-v7a, arm64-v8a, x86_64) alongside a universal one.
 *
 * Why a config plugin: SDK 57 has no `android.split` config field and eas.json has
 * no ABI option; the android/ folder is regenerated on every EAS build, so the only
 * durable way to add the Gradle block is via withAppBuildGradle.
 *
 * Why universalApk stays true: it keeps app-universal-release.apk in the outputs,
 * which is the artifact used for the GitHub release / single-file installs.
 * Split APKs are standalone-installable (`adb install -r`) and share the same
 * versionCode by default.
 *
 * Idempotent: the injection is skipped when a `splits {` block already exists.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const SPLITS_BLOCK = `
    splits {
        abi {
            enable true
            reset()
            include 'armeabi-v7a', 'arm64-v8a', 'x86_64'
            universalApk true
        }
    }
`;

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('splits {')) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        'android {',
        `android {${SPLITS_BLOCK}`
      );
    }
    return cfg;
  });
};
