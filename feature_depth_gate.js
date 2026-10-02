'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),os=require('os');
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

for(const f of cov.features){
 const anchors=anchorSpec[f.id]||[];
 log(anchors.length>0,`${f.id}-ANCHOR_SPEC`);
 const haystack=f.id==='FEAT-API'?apiSource:source+'\n'+guardSource;
 log(anchors.every(a=>haystack.includes(a)),`${f.id}-ANCHORS`,anchors.filter(a=>!haystack.includes(a)).join(','));
 const mut=f.depth?.requiredMutation;
 log(typeof mut==='string'&&mutationLabels.has(mut),`${f.id}-MUTATION_EVIDENCE`,mut||'missing');
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
 console.log(`INFO | DEPTH-${f.id}-RUNTIME ${runtime}/${required.length} | fault=${mutation} | staticOnly=${staticOnly.join(',')||'none'}`);
}
process.exitCode=fail.length?1:0;
