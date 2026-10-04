#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
const stageTimeoutMs = { mutation: 600000 };
const maxBuffer = 8 * 1024 * 1024;
const results = [];

for (const [name, script] of stages) {
  const started = Date.now();
  const spawnOptions = name === 'mutation'
    ? {cwd, encoding:'utf8', timeout:stageTimeoutMs[name] || timeoutMs, stdio:'inherit'}
    : {cwd, encoding:'utf8', timeout:stageTimeoutMs[name] || timeoutMs, maxBuffer};
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
