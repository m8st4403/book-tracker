'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname;
const cov=JSON.parse(fs.readFileSync(path.join(root,'FEATURE_COVERAGE.json'),'utf8'));
const mutation=fs.readFileSync(path.join(root,'mutation_guard.js'),'utf8');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const apiSource=fs.readFileSync(path.join(root,'api_management.js'),'utf8');
const guardSource=fs.readFileSync(path.join(root,'dev_guard.js'),'utf8');
const anchorSpec={
 'FEAT-NAV':['nav','home','add','library','search','calendar','settings'],
 'FEAT-SCAN':['id="scan"','function scan(','function stopScan('],
 'FEAT-BACKUP':['id="backupDataBtn"','id="restoreDataBtn"','function validateBackupData(','function restoreBackupData('],
 'FEAT-DETAIL':['window.openBookDetail=function(','id="detailPrice"','id="detailReading"','id="detailFavorite"','id="detailMemo"'],
 'FEAT-PURCHASE':['purchaseGroups','function setPurchaseGroupForBooks(','function getPurchaseGroupForBook('],
 'FEAT-REG':['function prepareRegistrationBook(','function prepareRegistrationBatch(','function commitBulkPreparedBooks('],
 'FEAT-LIB':['function renderLibrary('],
 'FEAT-SEARCH':['function searchGoogle(','setSearchSort'],
 'FEAT-CAL':['function renderCalendar(','function addCalendarExtra(','function canonicalReleaseDate('],
 'FEAT-SET':['function saveSettings','function loadSettings','id="profileSave"'],
 'FEAT-API':['bookTrackerApiManagement','resolveIsbn'],
 'FEAT-BIB':['function auditAndFillExistingBibliography','function repairExistingSeries'],
 'FEAT-DIAG':['function copyElementText(','function clearAllDiagnosticResults(','copyAllDiagnosticReportBtn'],
 'FEAT-METRIC':['function measureProcessing(','processingMs','userWaitMs'],
 'FEAT-CROSS':['canonicalIsbn','canonicalReleaseDate','listPriceOf','seriesScope'],
 'FEAT-UI':['const esc=x=>','scrollWidth<=el.clientWidth']
};
const fail=[];
const log=(ok,n,d='')=>{console.log(`${ok?'PASS':'FAIL'} | DEPTH-${n}${d?' | '+d:''}`);if(!ok)fail.push(n)};
log(cov.schemaVersion===3,'SCHEMA',String(cov.schemaVersion));
log(cov.release===JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,'VERSION',`${cov.release}`);
log(cov.features.length===16,'FEATURE_COUNT',String(cov.features.length));
const allSource=source+'\n'+apiSource+'\n'+guardSource+'\n'+mutation;
const checkLabels=new Set([...guardSource.matchAll(/check\('([^']+)'/g)].map(m=>m[1]));
const mutationLabels=new Set([...mutation.matchAll(/\['([^']+)'/g)].map(m=>m[1]));
const mutationCaseNames=[...mutation.matchAll(/^\s*\['([^']+)',\s*\(\)=>runMutation\(/gm)].map(m=>m[1]);
const mutationCaseByFeature={
 'FEAT-NAV':'Feature anchor: navigation','FEAT-SCAN':'Feature anchor: scan','FEAT-BACKUP':'Feature anchor: backup',
 'FEAT-DETAIL':'Feature anchor: detail','FEAT-PURCHASE':'Feature anchor: purchase','FEAT-REG':'Feature anchor: registration',
 'FEAT-LIB':'Feature anchor: library','FEAT-SEARCH':'Feature anchor: search','FEAT-CAL':'Feature anchor: calendar',
 'FEAT-SET':'Feature anchor: settings','FEAT-API':'Feature anchor: API','FEAT-BIB':'Feature anchor: bibliography',
 'FEAT-DIAG':'Feature anchor: diagnostics','FEAT-METRIC':'Feature anchor: metrics','FEAT-CROSS':'Feature anchor: cross-data',
 'FEAT-UI':'Feature anchor: UI'
};
const mutationTargetChecks={
 'FEAT-NAV':'FEAT-NAV','FEAT-SCAN':'FEAT-SCAN','FEAT-BACKUP':'FEAT-BACKUP',
 'FEAT-DETAIL':'FEAT-DETAIL','FEAT-PURCHASE':'FEAT-PURCHASE','FEAT-REG':'FEAT-REG',
 'FEAT-LIB':'FEAT-LIB','FEAT-SEARCH':'FEAT-SEARCH','FEAT-CAL':'FEAT-CAL',
 'FEAT-SET':'FEAT-SET','FEAT-API':'FEAT-API','FEAT-BIB':'FEAT-BIB',
 'FEAT-DIAG':'FEAT-DIAG','FEAT-METRIC':'FEAT-METRIC','FEAT-CROSS':'FEAT-CROSS',
 'FEAT-UI':'FEAT-UI'
};
function currentSourceFingerprint(){
 const files=['index.html','api_management.js','mutation_guard.js','dev_guard.js'];
 return crypto.createHash('sha256').update(files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n\u0000'),'utf8').digest('hex');
}
const mutationResultPath=process.env.MUTATION_RESULTS_PATH||process.env.MUTATION_SUMMARY_PATH||path.join(root,'MUTATION_RESULTS.json');
let mutationResults=null;
if(fs.existsSync(mutationResultPath)){
 try{mutationResults=JSON.parse(fs.readFileSync(mutationResultPath,'utf8'));}catch(e){log(false,'MUTATION_RESULTS_PARSE',e.message);}
}else{
 log(false,'MUTATION_RESULTS_PRESENT',mutationResultPath);
}
if(mutationResults){
 log(mutationResults.schema===2,'MUTATION_RESULTS_SCHEMA',String(mutationResults.schema));
 log(mutationResults.release===JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,'MUTATION_RESULTS_VERSION',`${mutationResults.release}`);
 log(mutationResults.sourceFingerprint===currentSourceFingerprint(),'MUTATION_RESULTS_FINGERPRINT');
 log(mutationResults.counts?.failed===0&&mutationResults.counts?.passed===mutationResults.counts?.total,'MUTATION_RESULTS_COMPLETE',JSON.stringify(mutationResults.counts||{}));
}
function mutationEvidence(feature){
 const required=cov.features.find(x=>x.id===feature)?.depth?.requiredMutation;
 const target=mutationTargetChecks[feature];
 const result=(mutationResults?.cases||[]).find(x=>x.name===required);
 const executed=!!result;
 const caught=result?.caught===true&&result?.status==='PASS'&&result?.exitCode===0&&result?.mutationApplied===true&&result?.timedOut!==true;
 const targetDetected=Array.isArray(result?.failedChecks)&&result.failedChecks.includes(target);
 return {required,target,executed,caught,targetDetected,status:executed&&caught&&targetDetected?'PASS':'FAIL',result};
}

for(const f of cov.features){
 const anchors=anchorSpec[f.id]||[];
 log(anchors.length>0,`${f.id}-ANCHOR_SPEC`);
 const haystack=f.id==='FEAT-API'?apiSource:source+'\n'+guardSource;
 log(anchors.every(a=>haystack.includes(a)),`${f.id}-ANCHORS`,anchors.filter(a=>!haystack.includes(a)).join(','));
 const mut=f.depth?.requiredMutation;
 log(typeof mut==='string'&&mutationLabels.has(mut),`${f.id}-MUTATION_EVIDENCE`,mut||'missing');
 const mutationRun=mutationEvidence(f.id);
 log(mutationRun.status==='PASS',`${f.id}-MUTATION_VERIFIED`,JSON.stringify({required:mut,executed:mutationRun.executed,caught:mutationRun.caught,target:mutationRun.target,targetDetected:mutationRun.targetDetected,failedChecks:mutationRun.result?.failedChecks||[]}));
 const required=Object.entries(f.layers).filter(([,v])=>v.status==='required');
 let runtime=0,mutation=0,staticOnly=[];
 for(const [layer,v] of required){
   const ev=v.evidence||[];
   for(const e of ev) log(checkLabels.has(e)||mutationLabels.has(e)||/^STATIC-/.test(e),`${f.id}-${layer}-EVIDENCE_EXISTS`,e);
   const hasRuntime=ev.some(e=>checkLabels.has(e)&&/^E2E-|^LOGIC-/.test(e));
   const hasFault=ev.some(e=>mutationLabels.has(e));
   const hasStatic=ev.some(e=>/^STATIC-/.test(e));
   if(hasRuntime)runtime++;
   if(hasFault)mutation++;
   if(!hasRuntime&&!hasFault&&!hasStatic) staticOnly.push(layer);
   if(layer==='失敗復旧') log(hasRuntime||hasFault,`${f.id}-${layer}-FAULT_OR_RUNTIME`,ev.join(' ; '));
   else log(hasRuntime||hasStatic,`${f.id}-${layer}-EVIDENCE_CLASS`,ev.join(' ; '));
 }
 log(runtime>0,`${f.id}-RUNTIME_BASELINE`,`${runtime}/${required.length}`);
 console.log(`INFO | DEPTH-${f.id}-RUNTIME ${runtime}/${required.length} | mutation-required=${mut||'none'} | mutation-verified=${mutationRun.status==='PASS'?1:0} | mutation-caught=${mutationRun.caught?1:0} | mutation-target-detected=${mutationRun.targetDetected?1:0} | legacyFaultEvidence=${mutation} | staticOnly=${staticOnly.join(',')||'none'}`);
}
process.exitCode=fail.length?1:0;
