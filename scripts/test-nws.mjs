import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'mu-weather-nws-'));
const compiler = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

try {
  // The NWS graph (api/nws, utils/nwsAlerts, utils/i18n, utils/format) is pure
  // TS with no react-native imports, so no Module._load stubbing is needed.
  const compile = spawnSync(process.execPath, [
    compiler,
    '--ignoreConfig',
    '--rootDir', root,
    '--outDir', outDir,
    '--module', 'commonjs',
    '--target', 'es2022',
    '--strict',
    '--skipLibCheck',
    'api/nws.ts',
    'utils/nwsAlerts.ts',
    'tests/nws.test.ts',
  ], { cwd: root, encoding: 'utf8' });
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout ?? '');
    process.stderr.write(compile.stderr ?? '');
    process.exitCode = compile.status ?? 1;
  } else {
    const testFile = path.join(outDir, 'tests', 'nws.test.js');
    const run = spawnSync(process.execPath, [testFile], { cwd: root, encoding: 'utf8' });
    process.stdout.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    process.exitCode = run.status ?? 1;
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
