import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'mu-weather-alert-pipeline-'));
const compiler = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const runner = `
  const Module = require('node:module');
  const originalLoad = Module._load;
  const values = new Map();
  const storage = {
    getItem: async (key) => values.has(key) ? values.get(key) : null,
    setItem: async (key, value) => { values.set(key, String(value)); },
    removeItem: async (key) => { values.delete(key); },
    multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null]),
  };
  const notifications = {
    AndroidImportance: { HIGH: 4 },
    getPermissionsAsync: async () => ({ status: 'denied' }),
    requestPermissionsAsync: async () => ({ status: 'denied' }),
    setNotificationChannelAsync: async () => undefined,
    setNotificationCategoryAsync: async () => undefined,
    scheduleNotificationAsync: async () => undefined,
  };
  Module._load = function(request, parent, isMain) {
    if (request === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
    if (request === './notifications' && parent?.filename?.endsWith('/utils/fireAlertNotifications.js')) return notifications;
    return originalLoad.call(this, request, parent, isMain);
  };
  require(process.argv[1]);
`;

try {
  const compile = spawnSync(process.execPath, [
    compiler,
    '--ignoreConfig',
    '--rootDir',
    root,
    '--outDir',
    outDir,
    '--module',
    'commonjs',
    '--target',
    'es2022',
    '--strict',
    '--skipLibCheck',
    'utils/fireAlertNotifications.ts',
    'utils/favoriteCityAlerts.ts',
    'tests/alertPipeline.test.ts',
  ], { cwd: root, encoding: 'utf8' });
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout ?? '');
    process.stderr.write(compile.stderr ?? '');
    process.exitCode = compile.status ?? 1;
  } else {
    const testFile = path.join(outDir, 'tests', 'alertPipeline.test.js');
    const run = spawnSync(process.execPath, ['-e', runner, testFile], { cwd: root, encoding: 'utf8' });
    process.stdout.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    process.exitCode = run.status ?? 1;
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
