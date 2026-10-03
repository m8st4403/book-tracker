#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=__dirname, errors=[];
const h=fs.readFileSync(path.join(root,'runtime_harness.html'),'utf8');
const app=fs.readFileSync(path.join(root,'index.html'),'utf8');
const matrix=JSON.parse(fs.readFileSync(path.join(root,'CROSS_DATA_PROJECTION_MATRIX.json'),'utf8'));
if(!/runBookTrackerSpecGuard/.test(h))errors.push('harness does not call exported runtime guard');
if(!/TIMEOUT_MS=30000/.test(h))errors.push('harness timeout contract missing');
if(!/APP_LOAD_OR_RUNTIME_TIMEOUT/.test(h))errors.push('timeout outcome is not distinguished');
if(!/RUNTIME_GUARD_EXPORT_MISSING/.test(h))errors.push('missing-export outcome is not distinguished');
if(!/status:'UNAVAILABLE'/.test(h))errors.push('unavailable runtime outcome is not represented');
if(!/audit\.expected===24&&audit\.executed===24/.test(h))errors.push('24/24 runtime criterion missing');
const ids=[];for(const f of matrix.fields)for(const ev of f.independentEvidence||[])if(String(ev).startsWith('PROJ-'))ids.push(String(ev).split(' ')[0]);
if(new Set(ids).size!==24)errors.push('matrix must contain 24 unique PROJ anchors');
if(!/window\.runBookTrackerSpecGuard=runSpecGuard/.test(app))errors.push('app runtime guard export missing');
if(errors.length){console.error('RUNTIME_HARNESS_CONTRACT:FAIL');errors.forEach(e=>console.error(e));process.exit(1)}
console.log('RUNTIME_HARNESS_CONTRACT:PASS');
console.log(JSON.stringify({release:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,projectionAnchors:24,timeoutMs:30000,unavailableOutcomeSupported:true},null,2));
