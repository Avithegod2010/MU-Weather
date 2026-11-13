/**
 * Copies the bundled alarm tones (assets/sounds/*.wav) into the APK's
 * res/raw/ so expo-notifications notification channels can reference them by
 * file name (Android channel sounds must live in res/raw). Runs at prebuild.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SOURCE_DIR = 'assets/sounds';
const VALID_NAME = /^[a-z0-9_-]+\.wav$/i;

const withAlarmSounds = (config) => {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const sourceDir = path.join(projectRoot, SOURCE_DIR);
      const rawDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'raw');
      if (!fs.existsSync(sourceDir)) {
        throw new Error(`withAlarmSounds: missing source directory '${SOURCE_DIR}'`);
      }
      fs.mkdirSync(rawDir, { recursive: true });
      for (const name of fs.readdirSync(sourceDir)) {
        // basename() + allowlist: only plain .wav names may reach path.join.
        const base = path.basename(String(name));
        if (base !== name || !VALID_NAME.test(base)) continue;
        fs.copyFileSync(path.join(sourceDir, base), path.join(rawDir, base));
      }
      return mod;
    },
  ]);
};

module.exports = withAlarmSounds;
