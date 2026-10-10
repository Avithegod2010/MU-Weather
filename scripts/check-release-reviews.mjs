import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const signoffPath = path.join(root, 'scripts/reviews/review-signoffs.json');
const requiredLocales = ['en', 'hi', 'bn', 'es', 'fr', 'de', 'nl', 'el', 'hu', 'id', 'it', 'pt', 'pl', 'tr'];
const requiredScreenReaders = ['talkback', 'voiceover'];

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCalendarIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validateOne(row, name, failures, options = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    failures.push(`${name}: missing review record`);
    return;
  }
  if (row.status !== 'approved') failures.push(`${name}: status must be "approved"`);
  if (!nonEmpty(row.reviewer)) failures.push(`${name}: reviewer is required`);
  if (!isCalendarIsoDate(row.date)) failures.push(`${name}: valid ISO review date (YYYY-MM-DD) is required`);
  if (!nonEmpty(row.evidence)) failures.push(`${name}: evidence reference is required`);
  if (options.requireQualification && !nonEmpty(row.qualification)) failures.push(`${name}: storm-safety qualification is required`);
}

function indexUniqueRecords(rows, keyField, category, allowedIds, failures) {
  if (!Array.isArray(rows)) {
    failures.push(`${category}: expected an array of review records`);
    return new Map();
  }
  const byId = new Map();
  for (const row of rows) {
    const id = row && typeof row === 'object' && !Array.isArray(row) ? row[keyField] : undefined;
    if (typeof id !== 'string' || !allowedIds.includes(id)) {
      failures.push(`${category}: unexpected reviewer record '${String(id)}'`);
      continue;
    }
    if (byId.has(id)) {
      failures.push(`${category}.${id}: duplicate review record`);
      continue;
    }
    byId.set(id, row);
  }
  return byId;
}

export function validateReleaseSignoffs(document) {
  const failures = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) return ['signoff file: expected a JSON object'];
  if (document.schemaVersion !== 1) failures.push('signoff file: unsupported schemaVersion');

  const screenReaderById = indexUniqueRecords(
    document.screenReaders,
    'id',
    'screen-reader',
    requiredScreenReaders,
    failures,
  );
  for (const id of requiredScreenReaders) validateOne(screenReaderById.get(id), `screen-reader.${id}`, failures);

  const nativeByLocale = indexUniqueRecords(
    document.nativeSpeakers,
    'locale',
    'native-speaker',
    requiredLocales,
    failures,
  );
  for (const locale of requiredLocales) validateOne(nativeByLocale.get(locale), `native-speaker.${locale}`, failures);

  validateOne(document.stormSafety, 'storm-safety', failures, { requireQualification: true });
  return failures;
}

export function checkReleaseSignoffs(filePath = signoffPath) {
  let document;
  try {
    document = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return [`signoff file: could not read/parse ${path.relative(root, filePath)} (${error instanceof Error ? error.message : String(error)})`];
  }
  return validateReleaseSignoffs(document);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const failures = checkReleaseSignoffs();
  if (failures.length) {
    process.stderr.write(`Release review gate BLOCKED: ${failures.length} required human sign-off item(s) incomplete.\n`);
    process.stderr.write(`${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
    process.exitCode = 1;
  } else {
    console.log('Release review gate passed: TalkBack, VoiceOver, native-speaker, and storm-safety sign-offs are complete.');
  }
}
