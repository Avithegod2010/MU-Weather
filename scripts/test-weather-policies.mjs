import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'mu-weather-policies-'));
const compiler = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

try {
  const compile = spawnSync(
    process.execPath,
    [
      compiler,
      '--ignoreConfig',
      '--rootDir',
      root,
      '--outDir',
      outDir,
      '--module',
      'commonjs',
      '--target',
      'es2019',
      '--strict',
      '--skipLibCheck',
      'utils/impactTimeline.ts',
      'utils/alertEvidence.ts',
      'utils/alertEscalation.ts',
      'utils/alertRules.ts',
      'utils/alertImpactHistory.ts',
      'utils/stormFeedbackPolicy.ts',
      'utils/currentImpactTimeline.ts',
      'utils/meteoalarm.ts',
      'utils/outdoorPlanPolicy.ts',
      'utils/outdoorPlanAdapter.ts',
      'utils/tripDeparture.ts',
      'utils/forecastLogExportFormat.ts',
      'utils/widgetFreshness.ts',
      'utils/freshnessPolicy.ts',
      'utils/weatherOfflinePolicy.ts',
      'utils/outdoorWindowFeedbackPolicy.ts',
      'tests/weatherPolicies.test.ts',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout ?? '');
    process.stderr.write(compile.stderr ?? '');
    process.exitCode = compile.status ?? 1;
  } else {
    const run = spawnSync(process.execPath, [path.join(outDir, 'tests', 'weatherPolicies.test.js')], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TZ: 'America/New_York' },
    });
    process.stdout.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    process.exitCode = run.status ?? 1;
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
