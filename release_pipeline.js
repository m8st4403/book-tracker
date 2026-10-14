#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cwd = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
const releaseVersion = packageJson.version;
const catalogPath = path.join(cwd, 'QUALITY_GATE_CATALOG.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

if (catalog.release !== releaseVersion) {
  throw new Error(`QUALITY_GATE_CATALOG release mismatch: ${catalog.release} !== ${releaseVersion}`);
}

const stages = catalog.stages.map(x => [x.id, x.script]);
const timeoutMs = 180000;
const stageTimeoutMs = { mutation: 900000 };
const maxBuffer = 16 * 1024 * 1024;
// Mutation must always execute the complete suite, even when the parent shell is
// configured to run one case. Keep incremental evidence outside the upload folder.
const mutationSummaryPath = path.join(os.tmpdir(), `book-tracker-mutation-${releaseVersion}.json`);
const results = [];

for (const [name, script] of stages) {
  const started = Date.now();
  const childEnv = { ...process.env };
  // Make the same external mutation evidence available to both the mutation writer
  // and every downstream reader (notably feature_depth_gate). Setting these only
  // inside the mutation stage left later child processes looking for a missing
  // in-folder MUTATION_RESULTS.json and caused false depth-gate failures.
  childEnv.MUTATION_SUMMARY_PATH = mutationSummaryPath;
  childEnv.MUTATION_RESULTS_PATH = mutationSummaryPath;
  let spawnOptions;
  if (name === 'mutation') {
    // A caller may set MUTATION_CASE_INDEX/NAME for debugging. Never let that
    // accidentally turn the release gate into a one-case smoke test.
    delete childEnv.MUTATION_CASE_INDEX;
    delete childEnv.MUTATION_CASE_NAME;
    childEnv.MUTATION_CONCURRENCY = childEnv.MUTATION_CONCURRENCY || '2';
    childEnv.MUTATION_CASE_TIMEOUT_MS = childEnv.MUTATION_CASE_TIMEOUT_MS || '45000';
    childEnv.MUTATION_CHILD_TIMEOUT_MS = childEnv.MUTATION_CHILD_TIMEOUT_MS || '55000';
    // The mutation runner writes with MUTATION_SUMMARY_PATH, while feature_depth_gate
    // consumes MUTATION_RESULTS_PATH. Keep both contracts pointed at the same external
    // evidence file so later gates see the exact completed run without polluting the ZIP.
    childEnv.MUTATION_SUMMARY_PATH = mutationSummaryPath;
    childEnv.MUTATION_RESULTS_PATH = mutationSummaryPath;
    childEnv.MUTATION_RESUME = '1';
    spawnOptions = {cwd, encoding:'utf8', timeout:stageTimeoutMs[name] || timeoutMs, maxBuffer, env:childEnv};
  } else {
    spawnOptions = {cwd, encoding:'utf8', timeout:stageTimeoutMs[name] || timeoutMs, maxBuffer, env:childEnv};
  }
  const r = spawnSync(process.execPath, [script], spawnOptions);
  const elapsedMs = Date.now() - started;
  let status = 'PASS';
  if (r.error && r.error.code === 'ETIMEDOUT') status = 'TIMEOUT';
  else if (r.status !== 0) status = 'FAIL';

  const combinedOutput = `${r.stdout || ''}${r.stderr || ''}`;
  results.push({
    stage: name,
    script,
    status,
    elapsedMs,
    exitCode: r.status,
    signal: r.signal || null,
    outputTail: combinedOutput.slice(-1200)
  });

  process.stdout.write(combinedOutput);
  console.log(`PIPELINE | ${name} | ${status} | ${elapsedMs} ms`);

  if (status !== 'PASS') break;
}

const report = {
  schema: 2,
  release: releaseVersion,
  timeoutMs,
  maxBuffer,
  completedAt: new Date().toISOString(),
  results
};
fs.writeFileSync(
  path.join(cwd, '..', 'release_pipeline_report.json'),
  JSON.stringify(report, null, 2) + '\n'
);

const bad = results.find(x => x.status !== 'PASS');
process.exit(bad ? 1 : 0);
