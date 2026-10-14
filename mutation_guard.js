#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),{spawnSync}=require('child_process');
const root=__dirname;
const summaryPath=process.env.MUTATION_SUMMARY_PATH||path.join(root,'MUTATION_RESULTS.json');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const apiSource=fs.readFileSync(path.join(root,'api_management.js'),'utf8');
const sourceFingerprint=crypto.createHash('sha256').update([source,apiSource,fs.readFileSync(__filename,'utf8'),fs.readFileSync(path.join(root,'dev_guard.js'),'utf8')].join('\n\u0000'),'utf8').digest('hex');
const docs=['README.md','SPEC.md','DEV_GUARD.md','QUALITY_CONTRACT.md','ROADMAP_TEST_MATRIX.md','RELEASE_TEST_GATE.md','package.json','dev_guard.js'];
function runMutation(name,mutateIndex=source,mutateApi=apiSource){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'book-tracker-mutation-'));
  try{
    // Isolate a complete checkout so unrelated missing-file checks cannot falsely catch a mutation.
    fs.cpSync(root,dir,{recursive:true,filter:(src)=>{
      const rel=path.relative(root,src).split(path.sep);
      if(rel.some(part=>part==='node_modules'||part==='.git'||part==='dist'||part==='coverage')) return false;
      if(/\.zip$/i.test(src)) return false;
      if(path.resolve(src)===path.resolve(summaryPath)) return false;
      return true;
    }});
    const stdoutPath=path.join(os.tmpdir(),`mutation-out-${process.pid}-${Date.now()}.log`);
    const stderrPath=path.join(os.tmpdir(),`mutation-err-${process.pid}-${Date.now()}.log`);
    fs.writeFileSync(path.join(dir,'index.html'),mutateIndex);
    fs.writeFileSync(path.join(dir,'api_management.js'),mutateApi);
    const mutationApplied=mutateIndex!==source||mutateApi!==apiSource;
    const isFeatureAnchor=/^Feature anchor:/.test(name);
    const targetFeature=isFeatureAnchor?featureAnchorMutationSpecs.find(([n])=>n===name)?.[0].replace(/^Feature anchor: /,'FEAT-').toUpperCase():'';
    const targetSpec=isFeatureAnchor?featureAnchorMutationSpecs.find(([n])=>n===name):null;
    const targetFeatureMap={'Feature anchor: navigation':'FEAT-NAV','Feature anchor: scan':'FEAT-SCAN','Feature anchor: backup':'FEAT-BACKUP','Feature anchor: detail':'FEAT-DETAIL','Feature anchor: purchase':'FEAT-PURCHASE','Feature anchor: registration':'FEAT-REG','Feature anchor: library':'FEAT-LIB','Feature anchor: search':'FEAT-SEARCH','Feature anchor: calendar':'FEAT-CAL','Feature anchor: settings':'FEAT-SET','Feature anchor: API':'FEAT-API','Feature anchor: bibliography':'FEAT-BIB','Feature anchor: diagnostics':'FEAT-DIAG','Feature anchor: metrics':'FEAT-METRIC','Feature anchor: cross-data':'FEAT-CROSS','Feature anchor: UI':'FEAT-UI'};
    const targetAnchor=targetSpec?.[1]||'';
    // Match dev_guard's exact haystack for the target feature. FEAT-UI is
    // intentionally checked against index.html plus dev_guard.js, so its baseline
    // must count both sources as well; otherwise a correct UI mutation is rejected
    // because the guard's own anchor declaration is counted only on one side.
    const targetSource=targetFeature==='FEAT-UI'?source+'\n'+fs.readFileSync(path.join(root,'dev_guard.js'),'utf8'):source;
    const targetEscaped=targetAnchor.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const targetTokenLike=/^[A-Za-z_$][\w$]*$/.test(targetAnchor);
    const targetBaseline=targetAnchor?(targetTokenLike?((targetSource.match(new RegExp(`(?<![A-Za-z0-9_$])${targetEscaped}(?![A-Za-z0-9_$])`,'g'))||[]).length):(targetSource.split(targetAnchor).length-1)):0;
    const caseIndex=Number(process.env.MUTATION_CASE_INDEX);
    const cdpPort=Number.isInteger(caseIndex)&&caseIndex>=0?String(9300+caseIndex):process.env.DEV_GUARD_CDP_PORT;
    const outFd=fs.openSync(stdoutPath,'w'),errFd=fs.openSync(stderrPath,'w');
    let r;
    try{
      r=spawnSync(process.execPath,[path.join(dir,'dev_guard.js'),path.join(dir,'index.html')],{encoding:'utf8',timeout:Number(process.env.MUTATION_CASE_TIMEOUT_MS)||60000,cwd:dir,detached:true,stdio:['ignore',outFd,errFd],env:{...process.env,DEV_GUARD_CDP_PORT:cdpPort,DEV_GUARD_STATIC_ONLY:isFeatureAnchor?'1':process.env.DEV_GUARD_STATIC_ONLY||'0',DEV_GUARD_TARGET_ONLY:isFeatureAnchor?'1':process.env.DEV_GUARD_TARGET_ONLY||'0',MUTATION_TARGET_FEATURE:targetFeatureMap[name]||'',MUTATION_TARGET_ANCHOR:targetAnchor,MUTATION_TARGET_BASELINE_COUNT:String(targetBaseline)}});
    }finally{try{fs.closeSync(outFd)}catch(_){}try{fs.closeSync(errFd)}catch(_){}}
    const output=(fs.existsSync(stdoutPath)?fs.readFileSync(stdoutPath,'utf8'):'')+(fs.existsSync(stderrPath)?fs.readFileSync(stderrPath,'utf8'):'');
    try{fs.unlinkSync(stdoutPath)}catch(_){}try{fs.unlinkSync(stderrPath)}catch(_){}
    if(r.error){
      if(r.pid&&r.error.code==='ETIMEDOUT'){try{process.kill(-r.pid,'SIGKILL')}catch(_){}}
      const timeoutText=`MUTATION-EXECUTION-${r.error.code||'ERROR'}: ${r.error.message}`;
      return {caught:false,fatal:true,mutationApplied,output:output+'\n'+timeoutText,failedChecks:[],exitCode:r.status,signal:r.signal||null,errorCode:r.error.code||'ERROR'};
    }
    const failedChecks=[...output.matchAll(/^FAIL \| ([^|\n]+)/gm)].map(m=>m[1].trim());
    const fatal=failedChecks.includes('E2E-FATAL') || /SyntaxError:|ENOENT:|UnhandledPromiseRejection|FATAL/i.test(output) && failedChecks.length===0;
    const caught=mutationApplied&&r.status!==0&&failedChecks.length>0&&!fatal;
    return {caught,fatal,mutationApplied,output,failedChecks,exitCode:r.status,signal:r.signal||null};
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
const uiOperationWiringMutation=(()=>{const m=source.match(/\n\s*\$\("homeUpcomingMore"\)\.onclick=[^\n]+;/);return m?source.replace(m[0],''):source.replace('homeUpcomingMore','homeUpcomingMore_missing');})();
const uiInputOperationContractMutation=source.replace('$("searchUnownedOnly").addEventListener("change",()=>{if($("query").value.trim())$("searchBtn").click()});','');

const uiMutation=source.replace('</body>','<div id="mutationOverflow" style="position:fixed;left:0;top:0;width:1000px;height:20px">mutation</div></body>');
const apiMutation=apiSource.replace('if(p.requireTaxIncluded&&e.taxIncludedConfirmed!==true)return {status:"HOLD",reason:"TAX_STATUS_UNKNOWN_OR_NOT_INCLUDED"};','');
const apiConflictMutation=apiSource.replace('if(conflicting.length&&policy.conflict==="HOLD")return {...top,decision:{status:"HOLD",reason:"PROVIDER_CONFLICT",conflicts:conflicting.map(c=>({provider:c.provider,value:c.value,confidence:c.confidence}))}};','');
const apiRetryAfterMutation=apiSource.replace('const delay=Number.isFinite(retryDelay)?Math.min(5000,retryDelay):700*Math.pow(2,n);','const delay=700*Math.pow(2,n);');
const authorParserMutation=source.replace('[,，]?(?=\\s|$)', '(?=\\s|$)');
const atomicMutation=source.replace(' if(persistPurchaseGroups())return true;\n purchaseGroups=before;\n return false;', ' return persistPurchaseGroups();');
const filterEventMutation=source.replace('["filterAuthor","filterPublisher","filterYear","filterRelease","filterReading","filterFavorite","filterPrice"].forEach(id=>$(id)?.addEventListener("change",renderLibrary));','');
const authorFilterPredicateMutation=source.replace('&&(!fa||authorFilterKey(b,authorIndex).includes(fa))','&&(!fa||true)');
const publisherFilterPredicateMutation=source.replace('&&(!fp||publisherFilterKey(b.publisher)===fp)','&&(!fp||true)');
const compoundFilterAndMutation=source.replace('&&(!fy||releaseYear(b.date)===fy)&&(!fr||','&&(!fy||releaseYear(b.date)===fy)||(!fr||');
const genericIdentityMutation=source.replace('const withoutRole=raw.replace(AUTHOR_ROLE_PREFIX_RE,"").trim();','const withoutRole=raw.trim();');
const authorFragmentMutation=source.replace('if(tokens.length===2)add(part);','tokens.forEach(add);');
const structuredMultiAuthorMutation=source.replace('authorSourceNames(book).forEach(add);','structured.map(x=>normalizeJapaneseBibliographicAuthorDisplay(x)).filter(Boolean).forEach(add);');
const libraryYearPredicateMutation=source.replace('&&(!fy||releaseYear(b.date)===fy)','&&(!fy||true)');
const libraryReleasePredicateMutation=source.replace('&&(!fr||(fr==="known"?known:!known))','&&(!fr||true)');
const libraryReadingPredicateMutation=source.replace('&&(!fre||meta.readingStatus===fre)','&&(!fre||true)');
const libraryFavoritePredicateMutation=source.replace('&&(!ff||(ff==="yes"?meta.favorite===true:meta.favorite!==true))','&&(!ff||true)');
const libraryPricePredicateMutation=source.replace('&&matchesListPriceFilter(b,fprice)','&&true');
const librarySearchPredicateMutation=source.replace('return (!q||[b.title,b.author,b.isbn,b.publisher].join(" ").toLowerCase().includes(q))','return (!q||true)');
const libraryUnreadOnlyPredicateMutation=source.replace('&&(!unreadOnly||meta.readingStatus!=="read")','&&true');
const seriesCoalescingMutation=source.replace('groups.get(targetKey).push(...genericItems);','groups.get(targetKey);');
const seriesSortMutation=source.replace('items=sortSeriesGroupItems(items);','items=[...items];');
const volumeInvariantMutation=source.replaceAll('Number.isInteger(n)&&n>=1?n:null','Number.isInteger(n)&&n>=0?n:null');
const librarySortOracleMutation=source.replace('else if(mode==="volume-asc")r=volumeCompare(x.b,y.b);','else if(mode==="volume-asc")r=0;')
const searchSortMutation=source.replace('if(appSettings.search?.sort==="release-desc")a.sort((x,y)=>compareReleaseTime(x,y,true));','if(false)a.sort((x,y)=>compareReleaseTime(x,y,true));').replace('else if(appSettings.search?.sort==="release-asc")a.sort((x,y)=>compareReleaseTime(x,y,false));','else if(false)a.sort((x,y)=>compareReleaseTime(x,y,false));');
const staleAuthorNewReleaseMutation=source.replace('if(!isCurrentSearch("authorResults",token))return;renderSelectableResults("authorResults",arr);if(arr.length&&isCurrentSearch("authorResults",token))','renderSelectableResults("authorResults",arr);if(arr.length&&isCurrentSearch("authorResults",token))');
const releaseUnknownFirstMutation=source.replace('if(ta==null)return 1;if(tb==null)return -1;','if(ta==null)return -1;if(tb==null)return 1;');
const homeStatsMutation=source.replace('if(homeStats)homeStats.innerHTML=renderStatBoxes(stats,"home");','if(homeStats)homeStats.innerHTML=renderStatBoxes({count:0,priceConfirmedCount:0,total:0,purchaseCount:0,unread:0,favorite:0},"home");').replace('updateSharedStats(stats);','updateSharedStats({count:0,priceConfirmedCount:0,total:0,purchaseCount:0,unread:0,favorite:0});')
const crossReleaseMutation=source.replace('return info.precision==="day"?info.date:""','return "";');
const registrationAtomicMutation=source.replace('if(failedPreparations.length||added.length!==candidates.length-skippedDuplicates.length){','if(false){');
const registrationRollbackMutation=source.replace('if(saveFailed){books=oldBooks;calendarExtras=oldExtras;bookMeta=oldMeta;saveMeta();persistBooks();persistCalendarExtras();metrics?.traceStep("保存失敗・ロールバック"','if(saveFailed){metrics?.traceStep("保存失敗・ロールバック"');
const registrationDuplicateMutation=source.replace('if(usableExisting&&!isRicherBookRecord(prepared,usableExisting)){skippedDuplicates.push(preparedIsbn||key);return;}','if(false){skippedDuplicates.push(preparedIsbn||key);return;}');
const registrationUserWaitMutation=source.replace('waitDelta=Math.max(0,(Number(token?.userWaitMs)||0)-waitBefore);token.processingMs+=(Math.max(0,elapsed-apiDelta-waitDelta));','waitDelta=0;token.processingMs+=(Math.max(0,elapsed-apiDelta-waitDelta));');
const registrationPersistenceMutation=source.replace('function persistBooks(){try{localStorage.setItem(KEY,JSON.stringify(books));return true}catch(e){console.error("books save",e);return false}}','function persistBooks(){return true}');

const releaseUnknownFirstMutationCase=['Release-date unknown ordering + precision eligibility',()=>runMutation('Release-date unknown ordering + precision eligibility',releaseUnknownFirstMutation)];
const genericMutationCase=  ['Generic author identity normalization',()=>runMutation('Generic author identity normalization',genericIdentityMutation)];
const authorFragmentMutationCase=['Author fragment suppression',()=>runMutation('Author fragment suppression',authorFragmentMutation)];
const structuredMultiAuthorMutationCase=['Structured multi-author parsing',()=>runMutation('Structured multi-author parsing',structuredMultiAuthorMutation)];

const featureAnchorMutationSpecs=[
 ['Feature anchor: navigation','id="home"'],
 ['Feature anchor: scan','id="scan"'],
 ['Feature anchor: backup','id="backupDataBtn"'],
 ['Feature anchor: detail','window.openBookDetail=function('],
 ['Feature anchor: purchase','function setPurchaseGroupForBooks('],
 ['Feature anchor: registration','function commitBulkPreparedBooks('],
 ['Feature anchor: library','function renderLibrary('],
 ['Feature anchor: search','async function searchGoogle('],
 ['Feature anchor: calendar','function renderCalendar('],
 ['Feature anchor: settings','function saveSettings('],
 ['Feature anchor: API','bookTrackerApiManagement'],
 ['Feature anchor: bibliography','async function auditAndFillExistingBibliography()'],
 ['Feature anchor: diagnostics','function clearAllDiagnosticResults('],
 ['Feature anchor: metrics','function measureProcessing('],
 ['Feature anchor: cross-data','canonicalReleaseDate'],
 ['Feature anchor: UI','const esc=x=>']
];

function mutateFeatureAnchor(anchor){
  if(/^id="[^"]+"$/.test(anchor)) return anchor.replace(/"$/,'X"');
  const wm=anchor.match(/^window\.([A-Za-z_$][\w$]*)=function\($/); if(wm) return `window.${wm[1]}X=function(`;
  const fm=anchor.match(/^function\s+([A-Za-z_$][\w$]*)\($/); if(fm) return `function ${fm[1]}X(`;
  if(/^const\s+/.test(anchor)) return anchor.replace(/^const\s+([A-Za-z_$][\w$]*)/,(_,n)=>`const ${n}_mutation`);
  if(/^[A-Za-z_$][\w$]*$/.test(anchor)) return `X${anchor}`;
  if(/^scrollWidth<=el\.clientWidth$/.test(anchor)) return 'scrollWidth<=el.clientWidth+1';
  return anchor+'_MUTATED';
}
const featureAnchorCases=featureAnchorMutationSpecs.map(([name,anchor])=>[name,()=>{if(!source.includes(anchor))return {caught:false,fatal:true,mutationApplied:false,failedChecks:[],output:`MUTATION-SPEC-ERROR: anchor not found: ${anchor}`};const mutated=source.replace(anchor,mutateFeatureAnchor(anchor));if(mutated===source)return {caught:false,fatal:true,mutationApplied:false,failedChecks:[],output:`MUTATION-SPEC-ERROR: replacement did not change source: ${anchor}`};return runMutation(name,mutated);}]);
const cases=[...featureAnchorCases,releaseUnknownFirstMutationCase,
  ['UI operation wiring',()=>runMutation('UI operation wiring',uiOperationWiringMutation)],
  ['Search unowned-only change handler',()=>runMutation('Search unowned-only change handler',uiInputOperationContractMutation)],

  ['UI generic overflow',()=>runMutation('UI generic overflow',uiMutation)],
  ['API trust',()=>runMutation('API trust',source,apiMutation)],
  ['API provider conflict',()=>runMutation('API provider conflict',source,apiConflictMutation)],
  ['NDL Retry-After policy',()=>runMutation('NDL Retry-After policy',source,apiRetryAfterMutation)],
  ['Purchase-group atomicity',()=>runMutation('Purchase-group atomicity',atomicMutation)],
  ['Filter change event',()=>runMutation('Filter change event',filterEventMutation)],
  ['Author filter predicate',()=>runMutation('Author filter predicate',authorFilterPredicateMutation)],
  ['Publisher filter predicate',()=>runMutation('Publisher filter predicate',publisherFilterPredicateMutation)],
  ['Compound filter AND',()=>runMutation('Compound filter AND',compoundFilterAndMutation)],
  ['Author parser trailing comma',()=>runMutation('Author parser trailing comma',authorParserMutation)],
  genericMutationCase,
  authorFragmentMutationCase,
  structuredMultiAuthorMutationCase,
  ['Library year predicate',()=>runMutation('Library year predicate',libraryYearPredicateMutation)],
  ['Library release-date predicate',()=>runMutation('Library release-date predicate',libraryReleasePredicateMutation)],
  ['Library reading-status predicate',()=>runMutation('Library reading-status predicate',libraryReadingPredicateMutation)],
  ['Library favorite predicate',()=>runMutation('Library favorite predicate',libraryFavoritePredicateMutation)],
  ['Library price predicate',()=>runMutation('Library price predicate',libraryPricePredicateMutation)],
  ['Library text-search predicate',()=>runMutation('Library text-search predicate',librarySearchPredicateMutation)],
  ['Library unread-only predicate',()=>runMutation('Library unread-only predicate',libraryUnreadOnlyPredicateMutation)],
  ['Registration atomic commit',()=>runMutation('Registration atomic commit',registrationAtomicMutation)],
  ['Registration rollback on save failure',()=>runMutation('Registration rollback on save failure',registrationRollbackMutation)],
  ['Registration duplicate protection',()=>runMutation('Registration duplicate protection',registrationDuplicateMutation)],
  ['Registration persistence',()=>runMutation('Registration persistence',registrationPersistenceMutation)],
  ['Registration user-wait timing',()=>runMutation('Registration user-wait timing',registrationUserWaitMutation)],
  ['Series redundant-scope coalescing',()=>runMutation('Series redundant-scope coalescing',seriesCoalescingMutation)],
  ['Series display sort after scope coalescing',()=>runMutation('Series display sort after scope coalescing',seriesSortMutation)],
  ['Series volume invariant',()=>runMutation('Series volume invariant',volumeInvariantMutation)],
  ['Independent library sort oracle',()=>runMutation('Independent library sort oracle',librarySortOracleMutation)],
  ['Independent search sort oracle',()=>runMutation('Independent search sort oracle',searchSortMutation)],
  ['Author new-release stale response guard',()=>runMutation('Author new-release stale response guard',staleAuthorNewReleaseMutation)],
  ['Home statistics projection',()=>runMutation('Home statistics projection',homeStatsMutation)],
  ['Cross-data release-date coverage',()=>runMutation('Cross-data release-date coverage',crossReleaseMutation)]
];
// Mutation cases are independent. Run them in bounded parallel child processes so the
// quality gate remains complete without making a large mutation suite unnecessarily
// serial. Each child still invokes the same dev_guard and therefore keeps the exact
// mutation semantics; only scheduling changes.
const mutationConcurrency=Math.max(1,Math.min(Number(process.env.MUTATION_CONCURRENCY)||2,cases.length));
let selectedIndex=process.env.MUTATION_CASE_INDEX==null?null:Number(process.env.MUTATION_CASE_INDEX);
if(process.env.MUTATION_CASE_NAME!=null){
  const requested=String(process.env.MUTATION_CASE_NAME);
  const found=cases.findIndex(([name])=>name===requested);
  if(found<0){console.error(`unknown MUTATION_CASE_NAME: ${requested}`);process.exitCode=2;}
  else selectedIndex=found;
}

function runSelectedCase(index){
  const [name,fn]=cases[index];
  const r=fn();
  process.stdout.write(`${r.caught?'PASS':'FAIL'} | MUTATION-${name} | intentional defect ${r.caught?'detected':'NOT detected'} | mutationApplied=${r.mutationApplied?'1':'0'} | failedChecks=${JSON.stringify(r.failedChecks||[])} | fatal=${r.fatal?'1':'0'}\n`);
  if((!r.caught||process.env.MUTATION_DEBUG)&&r.output)process.stdout.write(r.output);
  return r.caught;
}

if(selectedIndex!==null){
  if(!Number.isInteger(selectedIndex)||selectedIndex<0||selectedIndex>=cases.length){
    console.error(`invalid MUTATION_CASE_INDEX: ${process.env.MUTATION_CASE_INDEX}`);
    process.exitCode=2;
  }else{
    const ok=runSelectedCase(selectedIndex);
    process.exitCode=ok?0:1;
  }
}else{
  const {spawn}=require('child_process');
  let nextIndex=0,completed=0,failed=0,finalized=false; const caseResults=new Array(cases.length);
  const children=new Map();
  if(process.env.MUTATION_RESUME==='1'&&fs.existsSync(summaryPath)){
    try{
      const prior=JSON.parse(fs.readFileSync(summaryPath,'utf8'));
      if(prior.sourceFingerprint===sourceFingerprint&&prior.release===JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version){
        for(const old of prior.cases||[]){
          if(old&&old.status==='PASS'&&old.caught===true&&old.mutationApplied===true&&old.timedOut!==true&&cases[old.index]?.[0]===old.name){caseResults[old.index]=old;completed++;}
        }
        console.log(`MUTATION RESUME | reusablePasses=${completed} | total=${cases.length}`);
      }else console.log('MUTATION RESUME | ignored stale summary');
    }catch(e){console.log(`MUTATION RESUME | ignored unreadable summary: ${e.message}`);}
  }
  const saveSummary=()=>{
    const actual=caseResults.filter(Boolean);
    const passed=actual.filter(x=>x.status==='PASS').length;
    const failedCases=actual.filter(x=>x.status!=='PASS').length;
    const summary={schema:2,release:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,generatedAt:new Date().toISOString(),sourceFingerprint,complete:actual.length===cases.length,cases:actual,counts:{total:cases.length,completed:actual.length,passed,failed:failedCases,remaining:cases.length-actual.length}};
    fs.writeFileSync(summaryPath,JSON.stringify(summary,null,2));
  };
  const finishIfDone=()=>{
    if(finalized||completed!==cases.length||children.size!==0)return;
    finalized=true; saveSummary();
    const actual=caseResults.filter(Boolean),passed=actual.filter(x=>x.status==='PASS').length;
    console.log(`MUTATION SUMMARY | cases=${cases.length} | concurrency=${mutationConcurrency} | passed=${passed} | failed=${failed} | resultFile=${summaryPath}`);
    process.exit(failed?1:0);
  };
  const launch=()=>{
    while(children.size<mutationConcurrency&&nextIndex<cases.length){
      const index=nextIndex++;
      if(caseResults[index]?.status==='PASS')continue;
      const child=spawn(process.execPath,[__filename],{
        cwd:root,detached:true,env:{...process.env,MUTATION_CASE_INDEX:String(index)},stdio:['ignore','pipe','pipe']
      });
      children.set(child,index);
      let out='',err='',settled=false;
      const caseTimeoutMs=Math.max(5000,Number(process.env.MUTATION_CASE_TIMEOUT_MS)||60000);
      // Parent watchdog must exceed runMutation's own timeout so it can report a classified failure.
      const childTimeoutMs=Math.max(caseTimeoutMs+10000,Number(process.env.MUTATION_CHILD_TIMEOUT_MS)||caseTimeoutMs+10000);
      const timer=setTimeout(()=>{
        if(settled)return; settled=true;
        const idx=children.get(child); console.error(`MUTATION CHILD TIMEOUT | index=${idx} | timeoutMs=${childTimeoutMs}`);
        try{process.kill(-child.pid,'SIGKILL')}catch(_){try{child.kill('SIGKILL')}catch(__){}}
      },childTimeoutMs);
      child.stdout.on('data',d=>{out+=d}); child.stderr.on('data',d=>{err+=d});
      child.on('close',(code,signal)=>{
        if(!(settled&&code===null&&signal==='SIGKILL'))settled=true;
        clearTimeout(timer); const idx=children.get(child); children.delete(child); completed++;
        if(out)process.stdout.write(out); if(err)process.stderr.write(err);
        const line=out.split(/\r?\n/).find(x=>x.includes('MUTATION-'))||'';
        let failedChecks=[]; const fm=line.match(/failedChecks=(\[[^\n]*\])/); if(fm){try{failedChecks=JSON.parse(fm[1])}catch(_){}}
        const caught=/^PASS \| MUTATION-/.test(line),timedOut=signal==='SIGKILL'&&!caught;
        caseResults[idx]={index:idx,name:cases[idx][0],status:caught?'PASS':'FAIL',caught,mutationApplied:/mutationApplied=1/.test(line),failedChecks,exitCode:code,signal:signal||null,timedOut};
        if(code!==0||signal||!caught){failed++;console.error(`MUTATION CHILD FAILED | index=${idx} | code=${code} | signal=${signal||'none'} | timedOut=${timedOut}`);}
        saveSummary(); launch(); finishIfDone();
      });
    }
    finishIfDone();
  };
  launch();
}
