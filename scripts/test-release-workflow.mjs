/**
 * Runs the two `run:` steps of `.github/workflows/release-notes.yml` for real,
 * against a throwaway git repo and a stub `gh`, so the release path is checked
 * without waiting for a tag push.
 *
 * What it protects: the workflow holds `contents: write`, and its script used
 * to paste `${{ github.ref_name }}` into the shell body, so a tag name written
 * as shell syntax executed as shell with the release token in scope. The steps
 * are extracted from the committed YAML (not copied here), so this check
 * follows the file rather than restating it.
 *
 * Run: node scripts/test-release-workflow.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(root, '.github/workflows/release-notes.yml');
const workflow = readFileSync(workflowPath, 'utf8')
  .split(String.fromCharCode(13))
  .join('');

const BACKSLASH = String.fromCharCode(92);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);

/** Forward-slash native path, so bash and git both accept it on Windows. */
const slash = (p) => p.split(BACKSLASH).join('/');

/** Pull every `run: |` block out of the workflow, by indentation. */
function extractRunBlocks(source) {
  const lines = source.split(LF).map((line) => line.split(CR).join(''));
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i].trimEnd();
    if (!header.endsWith('run: |')) continue;
    const parentIndent = header.length - header.trimStart().length;
    const body = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === '') {
        body.push('');
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (indent <= parentIndent) break;
      body.push(line.slice(parentIndent + 2));
      i = j;
    }
    blocks.push(body.join(LF));
  }
  return blocks;
}

const [notesStep, releaseStep] = extractRunBlocks(workflow);

const bashWithoutPath = (script, cwd, env) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-step-'));
  const file = path.join(dir, 'step.sh');
  writeFileSync(file, script + LF, 'utf8');
  const wrapper = ['env -i PATH=/nonexistent "$(command -v bash)" "' + slash(file) + '"', ''].join(LF);
  return spawnSync('bash', ['-c', wrapper], { cwd, env, encoding: 'utf8' });
};

const bash = (script, options = {}) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-step-'));
  const file = path.join(dir, 'step.sh');
  writeFileSync(file, script + LF, 'utf8');
  return spawnSync('bash', [slash(file)], {
    cwd: options.cwd,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...options.env },
    encoding: 'utf8',
  });
};

/** A repo with two tagged releases; `second change` is only in v1.1.0. */
function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-repo-'));
  const git = (...args) =>
    spawnSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
      { cwd: dir, env: process.env, encoding: 'utf8' },
    );
  assert.equal(git('init', '-q', '-b', 'master').status, 0);
  writeFileSync(path.join(dir, 'a.txt'), 'one' + LF);
  git('add', '-A');
  git('commit', '-q', '-m', 'first change');
  git('tag', 'v1.0.0');
  writeFileSync(path.join(dir, 'a.txt'), 'two' + LF);
  git('add', '-A');
  git('commit', '-q', '-m', 'second change');
  git('tag', 'v1.1.0');
  const sha = git('rev-parse', 'HEAD').stdout.trim();
  return { dir, sha };
}

/** Stub `gh` on PATH that records its arguments and can claim a release exists. */
function makeGhStub() {
  const bin = mkdtempSync(path.join(tmpdir(), 'release-gh-'));
  const log = path.join(bin, 'calls.log');
  const stub = [
    '#!/usr/bin/env bash',
    'printf "%s" "$*" >> "$GH_LOG"',
    'echo >> "$GH_LOG"',
    'if [ "$1" = "release" ] && [ "$2" = "view" ]; then exit "${GH_VIEW_EXIT:-1}"; fi',
    'exit 0',
    '',
  ].join(LF);
  writeFileSync(path.join(bin, 'gh'), stub, 'utf8');
  chmodSync(path.join(bin, 'gh'), 0o755);
  return { bin: slash(bin), log };
}

const calls = (log) =>
  existsSync(log) ? readFileSync(log, 'utf8').split(LF).map((l) => l.trimEnd()).filter(Boolean) : [];

function runnerTemp(dir) {
  const temp = slash(path.join(dir, 'runner-temp'));
  mkdirSync(temp, { recursive: true });
  return temp;
}

test('both run steps are found and no workflow expression is pasted into them', () => {
  assert.ok(notesStep && notesStep.length > 0, 'notes step missing');
  assert.ok(releaseStep && releaseStep.length > 0, 'release step missing');
  for (const [name, block] of [['notes', notesStep], ['release', releaseStep]]) {
    assert.ok(!block.includes('${{'), name + ' step interpolates a workflow expression into the shell body');
  }
});

test('the write-scoped workflow runs only pinned actions and drops the token from git config', () => {
  assert.match(workflow, /^permissions:\n {2}contents: write$/m);
  const uses = [...workflow.matchAll(/^[ -]*uses:[ ]*(\S+)/gm)].map((m) => m[1]);
  assert.ok(uses.length > 0);
  for (const ref of uses) {
    assert.match(ref, /@[0-9a-f]{40}$/, 'action ' + ref + ' is not pinned to a full commit SHA');
  }
  assert.match(workflow, /persist-credentials: false/);
  assert.ok(
    !workflow.includes('action-gh-release'),
    'a third-party release action still runs with the write token',
  );
});

test('a tag name that is shell syntax is refused before git or gh is touched', () => {
  const { dir, sha } = makeRepo();
  const temp = runnerTemp(dir);
  const { bin, log } = makeGhStub();
  const DOL = String.fromCharCode(36);
  const BT = String.fromCharCode(96);
  const hostile = [
    'v1.0.0; touch PWNED',
    'v1.0.0' + DOL + '(touch PWNED)',
    'v1.0.0' + BT + 'touch PWNED' + BT,
    'v1.0.0 && touch PWNED',
    // A refname git actually accepts: git only forbids spaces, ~ ^ : ? * [ and
    // control characters, so this is a legal tag that the old workflow ran.
    'v1.0.0' + DOL + '(touch' + DOL + '{IFS}PWNED)',
    'release-v1.0.0',
  ];
  for (const ref of hostile) {
    const result = bash(notesStep, {
      cwd: dir,
      env: {
        REF_NAME: ref,
        COMMIT_SHA: sha,
        RUNNER_TEMP: temp,
        PATH: bin + ':' + process.env.PATH,
      },
    });
    assert.notEqual(result.status, 0, 'tag ' + JSON.stringify(ref) + ' was accepted');
    assert.match(result.stderr, /refusing release notes/);
    assert.ok(!existsSync(path.join(dir, 'PWNED')), 'tag ' + JSON.stringify(ref) + ' ran a command');
    assert.deepEqual(calls(log), [], 'gh was called for a rejected tag');
  }
});

test('a normal tag produces notes for its own range only', () => {
  const { dir, sha } = makeRepo();
  const temp = runnerTemp(dir);
  const result = bash(notesStep, {
    cwd: dir,
    env: { REF_NAME: 'v1.1.0', COMMIT_SHA: sha, RUNNER_TEMP: temp },
  });
  assert.equal(result.status, 0, result.stderr);
  const body = readFileSync(path.join(dir, 'runner-temp', 'release-body.md'), 'utf8');
  assert.ok(body.startsWith('## Changes in v1.1.0'));
  assert.match(body, /- second change/);
  assert.ok(!body.includes('- first change'), 'notes for v1.1.0 leaked the previous release');
  assert.ok(body.includes('Built from `' + sha + '`.'));
});

test('the first release in the repo lists the whole history', () => {
  const { dir, sha } = makeRepo();
  const temp = runnerTemp(dir);
  const result = bash(notesStep, {
    cwd: dir,
    env: { REF_NAME: 'v1.0.0', COMMIT_SHA: sha, RUNNER_TEMP: temp },
  });
  assert.equal(result.status, 0, result.stderr);
  const body = readFileSync(path.join(dir, 'runner-temp', 'release-body.md'), 'utf8');
  assert.match(body, /- first change/);
  assert.ok(!body.includes('- second change'), 'the first release listed a later commit');
});

test('gh creates the release when none exists, passing the tag and the body file', () => {
  const { dir } = makeRepo();
  runnerTemp(dir);
  const body = slash(path.join(dir, 'runner-temp', 'release-body.md'));
  writeFileSync(body, 'notes' + LF);
  const { bin, log } = makeGhStub();
  const result = bash(releaseStep, {
    cwd: dir,
    env: {
      REF_NAME: 'v1.1.0',
      BODY_FILE: body,
      GH_TOKEN: 'stub',
      GH_LOG: log,
      GH_VIEW_EXIT: '1',
      PATH: bin + ':' + process.env.PATH,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls(log), [
    'release view v1.1.0',
    'release create v1.1.0 --title v1.1.0 --notes-file ' + body + ' --verify-tag',
  ]);
});

test('gh edits the existing release instead of failing on a re-run', () => {
  const { dir } = makeRepo();
  runnerTemp(dir);
  const body = slash(path.join(dir, 'runner-temp', 'release-body.md'));
  writeFileSync(body, 'notes' + LF);
  const { bin, log } = makeGhStub();
  const result = bash(releaseStep, {
    cwd: dir,
    env: {
      REF_NAME: 'v1.1.0',
      BODY_FILE: body,
      GH_TOKEN: 'stub',
      GH_LOG: log,
      GH_VIEW_EXIT: '0',
      PATH: bin + ':' + process.env.PATH,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls(log), ['release view v1.1.0', 'release edit v1.1.0 --notes-file ' + body]);
});

test('a runner without gh fails loudly instead of skipping the release', () => {
  const { dir } = makeRepo();
  // Strip PATH completely, keeping only the bash binary the runner itself uses,
  // so `gh` genuinely cannot be resolved.
  const result = bashWithoutPath(releaseStep, dir, { REF_NAME: 'v1.1.0', GH_TOKEN: 'stub' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /gh CLI not found/);
});
