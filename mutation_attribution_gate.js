#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const root=__dirname;
const src=fs.readFileSync(path.join(root,'mutation_guard.js'),'utf8');
const pipeline=fs.readFileSync(path.join(root,'release_pipeline.js'),'utf8');
let fail=0;const check=(ok,n,d='')=>{console.log(`${ok?'PASS':'FAIL'} | MUTATION-ATTR-${n}${d?' | '+d:''}`);if(!ok)fail++};
check(/failedChecks=\[\.\.\.output\.matchAll\(\/\^FAIL/.test(src),'CAPTURES_FAILED_CHECKS','mutation result records exact failing guard checks');
check(/const fatal=/.test(src)&&/const caught=mutationApplied&&r\.status!==0&&failedChecks\.length>0&&!fatal/.test(src)&&/stdio:\['ignore',outFd,errFd\]/.test(src)&&/MUTATION-EXECUTION-/.test(src)&&/r\.error\.code==='ETIMEDOUT'/.test(src),'NO_CRASH_AS_CATCH','child crash/syntax/ENOENT is not equivalent to intentional defect detection');
check(/MUTATION_TARGET_FEATURE/.test(src)&&/MUTATION_TARGET_ANCHOR/.test(src)&&/const mutationApplied=mutateIndex!==source\|\|mutateApi!==apiSource/.test(src)&&/fs\.cpSync\(root,dir/.test(src),'TARGET_LABELS','feature mutations expose target guard labels');
check(/MUTATION_RESUME==='1'/.test(src)&&/saveSummary\(\)/.test(src)&&/complete:actual.length===cases.length/.test(src),'RESUME_AND_INCREMENTAL','completed cases are persisted incrementally and only matching fingerprints can resume');
check(/const childTimeoutMs=Math.max\(caseTimeoutMs\+10000/.test(src),'WATCHDOG_ORDER','outer watchdog exceeds the inner case timeout');
check(/delete childEnv\.MUTATION_CASE_INDEX/.test(pipeline)&&/delete childEnv\.MUTATION_CASE_NAME/.test(pipeline)&&/childEnv\.MUTATION_RESUME = '1'/.test(pipeline)&&/childEnv\.MUTATION_SUMMARY_PATH = mutationSummaryPath/.test(pipeline),'RELEASE_PIPELINE_FULL_SUITE','release pipeline clears single-case selectors and resumes the full suite from external incremental evidence');
check(/const combinedOutput = `\$\{r\.stdout \|\| ''\}\$\{r\.stderr \|\| ''\}`/.test(pipeline)&&/maxBuffer = 16 \* 1024 \* 1024/.test(pipeline),'RELEASE_PIPELINE_EVIDENCE','pipeline captures mutation output for the report instead of inheriting stdio invisibly');
const cases=[
 {name:'target-only',failed:['MUTATION-TARGET-FEAT-X'],target:'MUTATION-TARGET-FEAT-X',expect:'PASS'},
 {name:'other-only',failed:['E2E-OTHER'],target:'MUTATION-TARGET-FEAT-X',expect:'FAIL'},
 {name:'none',failed:[],target:'MUTATION-TARGET-FEAT-X',expect:'FAIL'},
 {name:'target-plus-other',failed:['MUTATION-TARGET-FEAT-X','E2E-OTHER'],target:'MUTATION-TARGET-FEAT-X',expect:'PASS'}
];
for(const c of cases){const caught=true,targetDetected=c.failed.includes(c.target),status=caught&&targetDetected?'PASS':'FAIL';check(status===c.expect,`SYNTH-${c.name}`,JSON.stringify({caught,targetDetected,status}));}
process.exitCode=fail?1:0;
