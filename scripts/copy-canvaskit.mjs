// Copies CanvasKit's WebAssembly binary into public/ so the web build can serve it.
// Skia's web runtime loads it from the site root. The file is ~7 MB, so it is generated
// at install time and git-ignored rather than committed. Native builds ignore it.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'canvaskit-wasm', 'bin', 'full', 'canvaskit.wasm');
const targetDir = join(root, 'public');
const target = join(targetDir, 'canvaskit.wasm');

if (!existsSync(source)) {
  console.log('[copy-canvaskit] canvaskit-wasm not installed yet; skipping.');
  process.exit(0);
}
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log('[copy-canvaskit] copied canvaskit.wasm to public/');
