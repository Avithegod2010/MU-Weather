import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { comparePerfettoRuns, parseCsv } from '../scripts/perfetto/compare-runs.mjs';

const captureWithoutRole = spawnSync('bash', [
  'scripts/perfetto/capture-android.sh',
  '--tier', 'entry',
  '--scenario', 'warm weather refresh',
  '--build', 'profile',
  '--network', 'Wi-Fi, stable',
  '--device-label', 'entry-phone-1',
  '--cache-state', 'warm forecast loaded',
], { cwd: process.cwd(), encoding: 'utf8' });
assert.equal(captureWithoutRole.status, 2, 'the capture CLI requires revision role before checking for a device');
assert.match(captureWithoutRole.stderr, /--revision-role/, 'the CLI explains the required role field');

const root = mkdtempSync(path.join(tmpdir(), 'mu-weather-perfetto-test-'));
const captureDir = path.join(root, 'perfetto-captures');
mkdirSync(captureDir, { recursive: true });

function makeRow(commit, run, weatherDuration, jankyFrames = 0) {
  const traceName = `${commit}-${run}.pftrace`;
  writeFileSync(path.join(captureDir, traceName), new Uint8Array(2048).fill(run));
  return {
    tier: 'entry',
    device_label: 'entry-phone-1',
    device_model: 'Test Phone',
    device_product: 'test_product',
    ram_gib: '4.0',
    soc: 'test_soc',
    android_release: '16',
    android_sdk: '36',
    refresh_rate_hz: '60',
    app_version: '1.0.0',
    app_commit: commit,
    revision_role: commit === 'base123' ? 'baseline' : 'candidate',
    tree_state: 'clean',
    build_type: 'profile',
    network: 'Wi-Fi, stable',
    scenario: 'warm weather refresh',
    cache_state: 'warm forecast loaded',
    run: String(run),
    trace_path: `perfetto-captures/${traceName}`,
    status: 'reviewed',
    trace_reviewed_by: 'Test reviewer',
    trace_reviewed_on: '2026-10-09',
    weather_fetch_span_ms: String(weatherDuration),
    ensemble_fetch_span_ms: '250',
    cache_read_ms: '10',
    post_fetch_parent_span_ms: '20',
    frametimeline_janky_frames: String(jankyFrames),
    frametimeline_total_frames: '100',
  };
}

try {
  const baseline = [makeRow('base123', 1, 100), makeRow('base123', 2, 110), makeRow('base123', 3, 90)];
  const candidate = [makeRow('next456', 1, 130, 1), makeRow('next456', 2, 140, 1), makeRow('next456', 3, 120, 1)];
  const options = {
    tier: 'entry',
    deviceLabel: 'entry-phone-1',
    scenario: 'warm weather refresh',
    cacheState: 'warm forecast loaded',
    baselineCommit: 'base123',
    candidateCommit: 'next456',
    thresholdPercent: 10,
    root,
  };
  const comparison = comparePerfettoRuns([...baseline, ...candidate], options);
  assert.deepEqual(comparison.errors, [], 'matching reviewed trace groups are accepted');
  assert.equal(comparison.metrics.find((row) => row.label === 'Weather fetch span')?.status, 'regression',
    'median wall-span increase beyond the threshold is flagged');
  assert.equal(comparison.metrics.find((row) => row.label === 'FrameTimeline jank rate')?.status, 'regression',
    'jank increase from a zero baseline is explicitly flagged');

  const mismatched = [...baseline, ...candidate.map((row) => ({ ...row, network: 'LTE' }))];
  assert(comparePerfettoRuns(mismatched, options).errors.some((message) => message.includes('appropriately matched')),
    'network-mismatched runs are refused rather than pooled');
  const dirty = [...baseline, ...candidate.map((row) => ({ ...row, tree_state: 'dirty' }))];
  assert(comparePerfettoRuns(dirty, options).errors.some((message) => message.includes('clean source tree')),
    'dirty source builds cannot be presented as commit comparisons');
  assert(comparePerfettoRuns([...baseline.slice(0, 2), ...candidate], options).errors.some((message) => message.includes('Baseline has 2')),
    'fewer than three valid runs cannot establish a comparison');
  const missingTrace = [...baseline, ...candidate.map((row) => ({ ...row, trace_path: 'perfetto-captures/missing.pftrace' }))];
  assert(comparePerfettoRuns(missingTrace, options).errors.some((message) => message.includes('does not exist')),
    'a recorded result without a real on-disk trace is refused');
  const reusedTrace = [...baseline, ...candidate.map((row, index) => ({
    ...row,
    trace_path: index === 0 ? baseline[0].trace_path : row.trace_path,
  }))];
  assert(comparePerfettoRuns(reusedTrace, options).errors.some((message) => message.includes('reused across baseline/candidate')),
    'the same physical capture cannot be counted twice under different commits');
  const missingRole = [...baseline, ...candidate.map((row, index) => ({
    ...row,
    ...(index === 0 ? { revision_role: '' } : {}),
  }))];
  assert(comparePerfettoRuns(missingRole, options).errors.some((message) => message.includes('missing revision_role')),
    'every trace row must declare its baseline or candidate revision role');
  const wrongSide = [...baseline, ...candidate.map((row, index) => ({
    ...row,
    ...(index === 0 ? { revision_role: 'baseline' } : {}),
  }))];
  assert(comparePerfettoRuns(wrongSide, options).errors.some((message) => message.includes("expected 'candidate'")),
    'revision-side labels must agree with the requested baseline and candidate commits');
  const invalidReviewDate = [...baseline, ...candidate.map((row, index) => ({
    ...row,
    ...(index === 0 ? { trace_reviewed_on: '2026-99-99' } : {}),
  }))];
  assert(comparePerfettoRuns(invalidReviewDate, options).errors.some((message) => message.includes('valid ISO trace-review date')),
    'trace review dates must be real calendar dates');
  const unmeasured = [...baseline, ...candidate].map((row) => ({
    ...row,
    weather_fetch_span_ms: '',
    ensemble_fetch_span_ms: '',
    cache_read_ms: '',
    post_fetch_parent_span_ms: '',
    frametimeline_janky_frames: '',
    frametimeline_total_frames: '',
  }));
  assert(comparePerfettoRuns(unmeasured, options).metrics.every((metric) => metric.status === 'insufficient-support'),
    'a trace count without transcribed metric evidence is not a performance result');

  const parsed = parseCsv('name,network\n"run, one","Wi-Fi, stable"\n');
  assert.equal(parsed[0].name, 'run, one', 'CSV parser preserves quoted commas');
  console.log('Perfetto tests enforce required revision roles, reviewed real traces, clean builds, three-run support, and matched conditions');
} finally {
  rmSync(root, { recursive: true, force: true });
}
