import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultCsv = path.join(repositoryRoot, 'scripts/perfetto/device-tier-template.csv');
const CAPTURE_DIRECTORY = 'perfetto-captures';
export const MIN_MATCHED_RUNS = 3;
export const DEFAULT_REGRESSION_THRESHOLD_PERCENT = 10;

const MATCHED_FIELDS = [
  'tier',
  'device_label',
  'device_model',
  'device_product',
  'ram_gib',
  'soc',
  'android_release',
  'android_sdk',
  'refresh_rate_hz',
  'build_type',
  'network',
  'scenario',
  'cache_state',
];

const METRICS = [
  { key: 'weather_fetch_span_ms', label: 'Weather fetch span', unit: 'ms' },
  { key: 'ensemble_fetch_span_ms', label: 'Ensemble fetch span', unit: 'ms' },
  { key: 'cache_read_ms', label: 'Cache read span', unit: 'ms' },
  { key: 'post_fetch_parent_span_ms', label: 'Post-fetch side-effect parent span', unit: 'ms' },
];

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0 &&
    !/^(unknown|pending|record manually|n\/a)$/i.test(value.trim());
}

function numeric(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

/** CSV parser for the capture ledger; supports quoted commas and escaped quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error('Capture CSV contains an unterminated quoted field.');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    if (row.some((value) => value.trim() !== '')) rows.push(row);
  }
  if (rows.length < 2) throw new Error('Capture CSV has no run rows.');
  const headers = rows[0].map((header) => header.trim());
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length) throw new Error(`Capture CSV has duplicate headers: ${[...new Set(duplicateHeaders)].join(', ')}`);
  return rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) throw new Error(`Capture CSV row ${rowIndex + 2} has ${values.length} columns; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index].trim()]));
  });
}

function traceProblem(row, root, expectedRole) {
  if (row.status !== 'reviewed') return `run ${row.run || '?'} is not marked reviewed`;
  if (!nonEmpty(row.trace_reviewed_by)) return `run ${row.run || '?'} has no trace reviewer`;
  if (!validIsoDate(row.trace_reviewed_on)) return `run ${row.run || '?'} has no valid ISO trace-review date`;
  if (row.tree_state !== 'clean') return `run ${row.run || '?'} was not captured from a clean source tree`;
  const required = [
    'device_label', 'device_model', 'device_product', 'ram_gib', 'soc', 'android_release',
    'android_sdk', 'refresh_rate_hz', 'app_version', 'app_commit', 'revision_role', 'build_type', 'network',
    'scenario', 'cache_state', 'run', 'trace_path',
  ];
  const missing = required.filter((field) => !nonEmpty(row[field]));
  if (missing.length) return `run ${row.run || '?'} is missing ${missing.join(', ')}`;
  if (row.revision_role !== expectedRole) return `run ${row.run} is marked '${row.revision_role}', expected '${expectedRole}'`;
  const runNumber = Number(row.run);
  if (!Number.isInteger(runNumber) || runNumber < 1) return `run '${row.run}' is not a positive integer`;
  const tracePath = row.trace_path;
  if (path.isAbsolute(tracePath)) return `run ${row.run} trace path must be relative to the repository`;
  const captureRoot = path.resolve(root, CAPTURE_DIRECTORY);
  const resolved = path.resolve(root, tracePath);
  const relative = path.relative(captureRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return `run ${row.run} trace must be stored under ${CAPTURE_DIRECTORY}/`;
  }
  if (path.extname(resolved).toLowerCase() !== '.pftrace') return `run ${row.run} trace path must end in .pftrace`;
  try {
    const stat = statSync(resolved);
    if (!stat.isFile() || stat.size < 1024) return `run ${row.run} trace is missing or too small to be a reviewed capture`;
  } catch {
    return `run ${row.run} trace file does not exist`;
  }
  return null;
}

function jankRate(row) {
  const janky = numeric(row.frametimeline_janky_frames);
  const total = numeric(row.frametimeline_total_frames);
  if (janky === null || total === null || !Number.isInteger(janky) || !Number.isInteger(total) || total <= 0 || janky > total) return null;
  return (janky / total) * 100;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function summarizeMetric(rows, getter) {
  return rows.map((row) => getter(row)).filter((value) => value !== null);
}

function hasSameHardwareAndScenario(baselineRows, candidateRows) {
  const allRows = [...baselineRows, ...candidateRows];
  const differences = [];
  for (const field of MATCHED_FIELDS) {
    const values = new Set(allRows.map((row) => row[field]));
    if (values.size !== 1 || !nonEmpty([...values][0])) {
      differences.push(`${field}: ${[...values].map((value) => value || '(blank)').join(' vs ')}`);
    }
  }
  return differences;
}

/** Refuse unreviewed, synthetic, dirty-tree, or mismatched run groups. */
export function comparePerfettoRuns(rows, options) {
  const {
    tier,
    deviceLabel,
    scenario,
    cacheState,
    baselineCommit,
    candidateCommit,
    thresholdPercent = DEFAULT_REGRESSION_THRESHOLD_PERCENT,
    root = repositoryRoot,
  } = options;
  const errors = [];
  if (baselineCommit === candidateCommit) errors.push('Baseline and candidate commits must be different.');
  if (!Number.isFinite(thresholdPercent) || thresholdPercent < 0) errors.push('Regression threshold must be a non-negative percentage.');
  if (errors.length) return { errors, baseline: [], candidate: [], metrics: [], regressions: [] };

  const selected = rows.filter((row) =>
    row.tier === tier && row.device_label === deviceLabel && row.scenario === scenario && row.cache_state === cacheState,
  );
  const baseline = selected.filter((row) => row.app_commit === baselineCommit);
  const candidate = selected.filter((row) => row.app_commit === candidateCommit);
  if (baseline.length < MIN_MATCHED_RUNS) errors.push(`Baseline has ${baseline.length} selected run(s); at least ${MIN_MATCHED_RUNS} are required.`);
  if (candidate.length < MIN_MATCHED_RUNS) errors.push(`Candidate has ${candidate.length} selected run(s); at least ${MIN_MATCHED_RUNS} are required.`);
  if (errors.length) return { errors, baseline, candidate, metrics: [], regressions: [] };

  for (const [label, group] of [['baseline', baseline], ['candidate', candidate]]) {
    for (const row of group) {
      const problem = traceProblem(row, root, label);
      if (problem) errors.push(problem);
    }
  }
  if (errors.length) return { errors, baseline, candidate, metrics: [], regressions: [] };

  for (const [label, group] of [['baseline', baseline], ['candidate', candidate]]) {
    const runIds = group.map((row) => row.run);
    const tracePaths = group.map((row) => row.trace_path);
    if (new Set(runIds).size !== runIds.length) errors.push(`${label} contains duplicate run IDs.`);
    if (new Set(tracePaths).size !== tracePaths.length) errors.push(`${label} reuses a trace file across runs.`);
  }
  const allTracePaths = [...baseline, ...candidate].map((row) => row.trace_path);
  if (new Set(allTracePaths).size !== allTracePaths.length) errors.push('A trace file is reused across baseline/candidate runs.');
  const mismatches = hasSameHardwareAndScenario(baseline, candidate);
  if (mismatches.length) errors.push(`Runs are not appropriately matched: ${mismatches.join('; ')}.`);
  if (errors.length) return { errors, baseline, candidate, metrics: [], regressions: [] };

  const metricDefinitions = [
    ...METRICS.map((metric) => ({
      label: metric.label,
      unit: metric.unit,
      getter: (row) => numeric(row[metric.key]),
    })),
    {
      label: 'FrameTimeline jank rate',
      unit: '%',
      getter: jankRate,
    },
  ];
  const metrics = metricDefinitions.map((definition) => {
    const baselineValues = summarizeMetric(baseline, definition.getter);
    const candidateValues = summarizeMetric(candidate, definition.getter);
    if (baselineValues.length < MIN_MATCHED_RUNS || candidateValues.length < MIN_MATCHED_RUNS) {
      return {
        label: definition.label,
        unit: definition.unit,
        status: 'insufficient-support',
        baselineN: baselineValues.length,
        candidateN: candidateValues.length,
        baselineMedian: null,
        baselineP95: null,
        candidateMedian: null,
        candidateP95: null,
        deltaPercent: null,
      };
    }
    const baseMedian = median(baselineValues);
    const nextMedian = median(candidateValues);
    const deltaPercent = baseMedian > 0 ? ((nextMedian - baseMedian) / baseMedian) * 100 : nextMedian > 0 ? Infinity : 0;
    const regressed = deltaPercent > thresholdPercent;
    return {
      label: definition.label,
      unit: definition.unit,
      status: regressed ? 'regression' : deltaPercent < -thresholdPercent ? 'improved' : 'within-threshold',
      baselineN: baselineValues.length,
      candidateN: candidateValues.length,
      baselineMedian: baseMedian,
      baselineP95: p95(baselineValues),
      candidateMedian: nextMedian,
      candidateP95: p95(candidateValues),
      deltaPercent,
    };
  });
  const regressions = metrics.filter((metric) => metric.status === 'regression');
  return { errors, baseline, candidate, metrics, regressions };
}

function usage() {
  return [
    'Usage: node scripts/perfetto/compare-runs.mjs',
    '  --tier entry|mid|high --device-label LABEL --scenario TEXT --cache-state TEXT',
    '  --baseline COMMIT --candidate COMMIT [--threshold-percent 10] [--csv PATH]',
    `Requires at least ${MIN_MATCHED_RUNS} separately captured, reviewed, clean-tree .pftrace runs per commit.`,
  ].join('\n');
}

function readArguments(argv) {
  const result = { thresholdPercent: DEFAULT_REGRESSION_THRESHOLD_PERCENT, csv: defaultCsv };
  const required = new Set(['tier', 'device-label', 'scenario', 'cache-state', 'baseline', 'candidate']);
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    index++;
    if (key === 'threshold-percent') result.thresholdPercent = Number(value);
    else if (key === 'csv') result.csv = path.resolve(repositoryRoot, value);
    else if (key === 'tier') result.tier = value;
    else if (key === 'device-label') result.deviceLabel = value;
    else if (key === 'scenario') result.scenario = value;
    else if (key === 'cache-state') result.cacheState = value;
    else if (key === 'baseline') result.baselineCommit = value;
    else if (key === 'candidate') result.candidateCommit = value;
    else throw new Error(`Unknown option: ${argument}`);
  }
  const missing = [...required].filter((key) => !result[
    key === 'device-label' ? 'deviceLabel' :
      key === 'cache-state' ? 'cacheState' :
        key === 'baseline' ? 'baselineCommit' :
          key === 'candidate' ? 'candidateCommit' : key
  ]);
  if (missing.length) throw new Error(`Missing required options: ${missing.map((key) => `--${key}`).join(', ')}`);
  if (!['entry', 'mid', 'high'].includes(result.tier)) throw new Error('--tier must be entry, mid, or high.');
  return result;
}

function printResult(result, options) {
  process.stdout.write(`Perfetto comparison: ${options.tier} / ${options.deviceLabel} / ${options.scenario} / cache=${options.cacheState}\n`);
  process.stdout.write(`Baseline ${options.baselineCommit}: ${result.baseline.length} reviewed run(s); candidate ${options.candidateCommit}: ${result.candidate.length} reviewed run(s).\n`);
  process.stdout.write(`Regression threshold: >${options.thresholdPercent}% median increase. Median and nearest-rank p95 are shown per metric.\n\n`);
  for (const metric of result.metrics) {
    if (metric.status === 'insufficient-support') {
      process.stdout.write(`INSUFFICIENT  ${metric.label}: ${metric.baselineN}/${result.baseline.length} baseline and ${metric.candidateN}/${result.candidate.length} candidate values; at least ${MIN_MATCHED_RUNS} each required.\n`);
      continue;
    }
    const delta = Number.isFinite(metric.deltaPercent) ? `${metric.deltaPercent >= 0 ? '+' : ''}${metric.deltaPercent.toFixed(1)}%` : 'increase from zero';
    process.stdout.write(`${metric.status.toUpperCase().padEnd(14)} ${metric.label}: median ${metric.baselineMedian.toFixed(2)}→${metric.candidateMedian.toFixed(2)} ${metric.unit}, p95 ${metric.baselineP95.toFixed(2)}→${metric.candidateP95.toFixed(2)} ${metric.unit} (${delta}, n=${metric.baselineN}/${metric.candidateN}).\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = readArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
    } else {
      const rows = parseCsv(readFileSync(options.csv, 'utf8'));
      const result = comparePerfettoRuns(rows, { ...options, root: repositoryRoot });
      if (result.errors.length) {
        process.stderr.write(`COMPARISON REFUSED: ${result.errors.join('\n')}\n`);
        process.exitCode = 1;
      } else {
        printResult(result, options);
        const supportedMetrics = result.metrics.filter((metric) => metric.status !== 'insufficient-support');
        if (supportedMetrics.length === 0) {
          process.stderr.write(`\nNo metric has the required ${MIN_MATCHED_RUNS} values per commit; no regression decision can be made.\n`);
          process.exitCode = 1;
        } else if (result.regressions.length) {
          process.stderr.write(`\n${result.regressions.length} metric(s) exceed the stated regression threshold.\n`);
          process.exitCode = 1;
        }
      }
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
    process.exitCode = 2;
  }
}
