import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localeDir = path.join(root, 'i18n');

function readDictionary(filePath, exportName) {
  const sourceText = readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .find((item) => ts.isIdentifier(item.name) && item.name.text === exportName);
  if (!declaration || !declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) {
    throw new Error(`Could not find the '${exportName}' object in ${path.relative(root, filePath)}`);
  }

  const dictionary = new Map();
  for (const property of declaration.initializer.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
      ? property.name.text
      : null;
    if (!name) throw new Error(`Non-static locale key in ${path.relative(root, filePath)}`);
    if (!ts.isStringLiteralLike(property.initializer)) {
      throw new Error(`Non-literal locale value for '${name}' in ${path.relative(root, filePath)}`);
    }
    dictionary.set(name, property.initializer.text);
  }
  return dictionary;
}

function placeholders(value) {
  return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
    .map((match) => match[1])
    .sort();
}

const localeFiles = readdirSync(localeDir)
  .filter((name) => name.endsWith('.ts'))
  .sort();
const english = readDictionary(path.join(localeDir, 'en.ts'), 'en');
const failures = [];

for (const fileName of localeFiles) {
  const locale = path.basename(fileName, '.ts');
  if (locale === 'en') continue;
  const dictionary = readDictionary(path.join(localeDir, fileName), locale);
  const missing = [...english.keys()].filter((key) => !dictionary.has(key));
  const extra = [...dictionary.keys()].filter((key) => !english.has(key));
  if (missing.length || extra.length) {
    failures.push(`${locale}: key mismatch (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`);
  }
  for (const [key, englishValue] of english) {
    const localizedValue = dictionary.get(key);
    if (localizedValue === undefined) continue;
    const expected = placeholders(englishValue);
    const actual = placeholders(localizedValue);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`${locale}.${key}: placeholders ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
    }
  }
}

if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${localeFiles.length} locale dictionaries have matching keys and placeholders (translation quality is not assessed).`);
}
