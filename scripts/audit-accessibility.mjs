import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirs = ['components', 'screens'];
const buttonControls = new Set([
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'SlidingItem',
  'PressScale',
  'Button',
]);
const labeledControls = new Set([...buttonControls, 'TextInput', 'Switch', 'Slider', 'SlidingSwitch']);
// These wrappers forward their Pressable props; their consumer surfaces are audited below.
const propForwardingWrappers = new Set(['components/PressScale.tsx', 'components/Sliding.tsx']);
const failures = [];

function jsxName(node) {
  return ts.isIdentifier(node) ? node.text : null;
}

function attributes(opening) {
  const result = new Map();
  for (const attribute of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attribute)) continue;
    result.set(jsxName(attribute.name), attribute.initializer);
  }
  return result;
}

function hasExplicitLabel(attrs) {
  for (const name of ['accessibilityLabel', 'accessibilityLabelledBy', 'aria-label']) {
    const value = attrs.get(name);
    if (!value) continue;
    if (ts.isStringLiteral(value) && value.text.trim()) return true;
    if (ts.isJsxExpression(value) && value.expression) return true;
  }
  return false;
}

function hasRole(attrs) {
  const value = attrs.get('accessibilityRole') ?? attrs.get('role');
  if (!value) return false;
  if (ts.isStringLiteral(value) && value.text.trim()) return true;
  return ts.isJsxExpression(value) && value.expression !== undefined;
}

function textChildIsMeaningful(child) {
  if (ts.isJsxText(child)) return /[\p{L}\p{N}]/u.test(child.text.trim());
  if (ts.isJsxExpression(child)) {
    const expression = child.expression;
    if (!expression || expression.kind === ts.SyntaxKind.NullKeyword) return false;
    if (ts.isIdentifier(expression) && ['true', 'false', 'undefined', 'null'].includes(expression.text)) return false;
    return true;
  }
  if (ts.isJsxElement(child)) return child.children.some(textChildIsMeaningful);
  if (ts.isJsxSelfClosingElement(child)) return false;
  if (ts.isJsxFragment(child)) return child.children.some(textChildIsMeaningful);
  return false;
}

function hasVisibleTextLabel(opening) {
  const element = opening.parent;
  if (!ts.isJsxElement(element)) return false;
  return element.children.some(textChildIsMeaningful);
}

function visit(node, source, relativeFile) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const tag = jsxName(node.tagName);
    if (tag && labeledControls.has(tag)) {
      const attrs = attributes(node);
      const accessible = attrs.get('accessible');
      const explicitlyHidden = accessible && ts.isJsxExpression(accessible) &&
        accessible.expression?.kind === ts.SyntaxKind.FalseKeyword;
      if (!explicitlyHidden) {
        const labelRequired = tag === 'TextInput' || tag === 'Switch' || tag === 'Slider' || tag === 'SlidingSwitch';
        if (!hasExplicitLabel(attrs) && (labelRequired || !hasVisibleTextLabel(node))) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          failures.push(`${relativeFile}:${line + 1}: <${tag}> has no explicit accessibility label or visible text label`);
        }
        if (buttonControls.has(tag) && !hasRole(attrs)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          failures.push(`${relativeFile}:${line + 1}: <${tag}> has no explicit accessibility role`);
        }
      }
    }
  }
  ts.forEachChild(node, (child) => visit(child, source, relativeFile));
}

function collectTsx(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectTsx(full));
    else if (entry.isFile() && entry.name.endsWith('.tsx')) files.push(full);
  }
  return files;
}

for (const directory of sourceDirs) {
  for (const file of collectTsx(path.join(root, directory))) {
    const relativeFile = path.relative(root, file);
    if (propForwardingWrappers.has(relativeFile)) continue;
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    visit(source, source, relativeFile);
  }
}

if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.stderr.write(`\n${failures.length} static accessibility issue(s); this check does not replace TalkBack/VoiceOver or human review.\n`);
  process.exitCode = 1;
} else {
  console.log('PASS: JSX controls in components/ and screens/ have static names and button roles where required. This does not replace human screen-reader review.');
}
