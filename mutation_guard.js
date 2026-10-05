#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const root=__dirname;
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const apiSource=fs.readFileSync(path.join(root,'api_management.js'),'utf8');
const docs=['README.md','SPEC.md','DEV_GUARD.md','QUALITY_CONTRACT.md','ROADMAP_TEST_MATRIX.md','RELEASE_TEST_GATE.md','package.json'];
function runMutation(name,mutateIndex=source,mutateApi=apiSource){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'book-tracker-mutation-'));
  try{
    for(const f of docs) fs.copyFileSync(path.join(root,f),path.join(dir,f));
    fs.writeFileSync(path.join(dir,'index.html'),mutateIndex);
    fs.writeFileSync(path.join(dir,'api_management.js'),mutateApi);
    const r=spawnSync(process.execPath,[path.join(root,'dev_guard.js'),path.join(dir,'index.html')],{encoding:'utf8',timeout:180000,cwd:dir});
    if(r.error) throw r.error;
    return {caught:r.status!==0,output:r.stdout+r.stderr};
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
const uiOperationWiringMutation=(()=>{const m=source.match(/\n\s*\$\("homeUpcomingMore"\)\.onclick=[^\n]+;/);return m?source.replace(m[0],''):source.replace('homeUpcomingMore','homeUpcomingMore_missing');})();
const uiInputOperationContractMutation=source.replace('id="searchUnownedOnly" data-data-operation="1"','id="searchUnownedOnly"');

const uiMutation=source.replace('</body>','<div id="mutationOverflow" style="position:fixed;left:0;top:0;width:1000px;height:20px">mutation</div></body>');
const apiMutation=apiSource.replace('if(p.requireTaxIncluded&&e.taxIncludedConfirmed!==true)return {status:"HOLD",reason:"TAX_STATUS_UNKNOWN_OR_NOT_INCLUDED"};','');
const apiConflictMutation=apiSource.replace('if(conflicting.length&&policy.conflict==="HOLD")return {...top,decision:{status:"HOLD",reason:"PROVIDER_CONFLICT",conflicts:conflicting.map(c=>({provider:c.provider,value:c.value,confidence:c.confidence}))}};','');
const authorParserMutation=source.replace('[,，]?', '');
const atomicMutation=source.replace(' if(persistPurchaseGroups())return true;\n purchaseGroups=before;\n return false;', ' return persistPurchaseGroups();');
const filterEventMutation=source.replace('["filterAuthor","filterPublisher","filterYear","filterRelease","filterReading","filterFavorite","filterPrice"].forEach(id=>$(id)?.addEventListener("change",renderLibrary));','');
const authorFilterPredicateMutation=source.replace('&&(!fa||authorFilterKey(b,authorIndex).includes(fa))','&&(!fa||true)');
const publisherFilterPredicateMutation=source.replace('&&(!fp||publisherFilterKey(b.publisher)===fp)','&&(!fp||true)');
const compoundFilterAndMutation=source.replace('&&(!fy||String(b.date||"").slice(0,4)===fy)&&(!fr||','&&(!fy||String(b.date||"").slice(0,4)===fy)||(!fr||');
const genericIdentityMutation=source.replace('return raw.replace(/[\s\u00a0]+/g,"" ).toUpperCase();','return raw.toUpperCase();');
const authorFragmentMutation=source.replace('if(tokens.length===2)add(part);','tokens.forEach(add);');
const structuredMultiAuthorMutation=source.replace('authorSourceNames(book).forEach(add);','structured.map(x=>normalizeJapaneseBibliographicAuthorDisplay(x)).filter(Boolean).forEach(add);');
const libraryYearPredicateMutation=source.replace('&&(!fy||String(b.date||"").slice(0,4)===fy)','&&(!fy||true)');
const libraryReleasePredicateMutation=source.replace('&&(!fr||(fr==="known"?known:!known))','&&(!fr||true)');
const libraryReadingPredicateMutation=source.replace('&&(!fre||meta.readingStatus===fre)','&&(!fre||true)');
const libraryFavoritePredicateMutation=source.replace('&&(!ff||(ff==="yes"?meta.favorite===true:meta.favorite!==true))','&&(!ff||true)');
const libraryPricePredicateMutation=source.replace('&&matchesListPriceFilter(b,fprice)','&&true');
const librarySearchPredicateMutation=source.replace('return (!q||[b.title,b.author,b.isbn,b.publisher].join(" ").toLowerCase().includes(q))','return (!q||true)');
const libraryUnreadOnlyPredicateMutation=source.replace('&&(!unreadOnly||meta.readingStatus!=="read")','&&true');
const seriesCoalescingMutation=source.replace('groups.get(targetKey).push(...genericItems);','groups.get(targetKey);');
const seriesSortMutation=source.replace('items=sortSeriesGroupItems(items);','items=[...items];');
const volumeInvariantMutation=source.replace('Number.isInteger(n)&&n>=1?n:null','Number.isInteger(n)&&n>=0?n:null');
const librarySortOracleMutation=source.replace('else if(mode==="volume-asc")r=volumeCompare(x.b,y.b);','else if(mode==="volume-asc")r=0;')
const searchSortMutation=source.replace('if(appSettings.search?.sort==="release-desc")a.sort((x,y)=>releaseTime(y)-releaseTime(x));','if(false)a.sort((x,y)=>releaseTime(y)-releaseTime(x));').replace('else if(appSettings.search?.sort==="release-asc")a.sort((x,y)=>releaseTime(x)-releaseTime(y));','else if(false)a.sort((x,y)=>releaseTime(x)-releaseTime(y));').replace('else a.sort((x,y)=>{','else if(false)a.sort((x,y)=>{')
const releaseUnknownFirstMutation=source.replace('if(ta==null)return 1;if(tb==null)return -1;','if(ta==null)return -1;if(tb==null)return 1;');
const homeStatsMutation=source.replace('if(homeStats)homeStats.innerHTML=renderStatBoxes(stats,"home");','if(homeStats)homeStats.innerHTML=renderStatBoxes({count:0,priceConfirmedCount:0,total:0,purchaseCount:0,unread:0,favorite:0},"home");').replace('updateSharedStats(stats);','updateSharedStats({count:0,priceConfirmedCount:0,total:0,purchaseCount:0,unread:0,favorite:0});')
const crossReleaseMutation=source.replace("date:'2026-01-15'","date:''").replace("date:'2026-02-15'","date:''");
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
 ['Feature anchor: search','function searchBooks('],
 ['Feature anchor: calendar','function renderCalendar('],
 ['Feature anchor: settings','function saveSettings('],
 ['Feature anchor: API','bookTrackerApiManagement'],
 ['Feature anchor: bibliography','function auditExistingBibliography'],
 ['Feature anchor: diagnostics','function clearAllDiagnosticResults('],
 ['Feature anchor: metrics','function measureProcessing('],
 ['Feature anchor: cross-data','canonicalReleaseDate'],
 ['Feature anchor: UI','function esc(']
];

const featureAnchorCases=featureAnchorMutationSpecs.map(([name,anchor])=>[name,()=>runMutation(name,source.replace(anchor,anchor.replace(/[\^$.*+?()[\]{}|]/g,'')+'__MUTATED__'))]);
const cases=[...featureAnchorCases,releaseUnknownFirstMutationCase,
  ['UI operation wiring',()=>runMutation('UI operation wiring',uiOperationWiringMutation)],
  ['UI input operation contract',()=>runMutation('UI input operation contract',uiInputOperationContractMutation)],

  ['UI generic overflow',()=>runMutation('UI generic overflow',uiMutation)],
  ['API trust',()=>runMutation('API trust',source,apiMutation)],
  ['API provider conflict',()=>runMutation('API provider conflict',source,apiConflictMutation)],
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
  ['Home statistics projection',()=>runMutation('Home statistics projection',homeStatsMutation)],
  ['Cross-data release-date coverage',()=>runMutation('Cross-data release-date coverage',crossReleaseMutation)]
];
// Mutation cases are independent. Run them in bounded parallel child processes so the
// quality gate remains complete without making a large mutation suite unnecessarily
// serial. Each child still invokes the same dev_guard and therefore keeps the exact
// mutation semantics; only scheduling changes.
const mutationConcurrency=Math.max(1,Math.min(Number(process.env.MUTATION_CONCURRENCY)||4,cases.length));
const selectedIndex=process.env.MUTATION_CASE_INDEX==null?null:Number(process.env.MUTATION_CASE_INDEX);

function runSelectedCase(index){
  const [name,fn]=cases[index];
  const r=fn();
  process.stdout.write(`${r.caught?'PASS':'FAIL'} | MUTATION-${name} | intentional defect ${r.caught?'detected':'NOT detected'}\\n`);
  if(!r.caught&&r.output)process.stdout.write(r.output);
  return r.caught;
}

if(selectedIndex!==null){
  if(!Number.isInteger(selectedIndex)||selectedIndex<0||selectedIndex>=cases.length){
    console.error(`invalid MUTATION_CASE_INDEX: ${process.env.MUTATION_CASE_INDEX}`);
    process.exitCode=2;
  }else{
    process.exitCode=runSelectedCase(selectedIndex)?0:1;
  }
}else{
  const {spawn}=require('child_process');
  let nextIndex=0,completed=0,failed=0;
  const children=new Map();

  const launch=()=>{
    while(children.size<mutationConcurrency&&nextIndex<cases.length){
      const index=nextIndex++;
      const child=spawn(process.execPath,[__filename],{
        cwd:root,
        env:{...process.env,MUTATION_CASE_INDEX:String(index)},
        stdio:['ignore','pipe','pipe']
      });
      children.set(child,index);
      let out='',err='';
      child.stdout.on('data',d=>{out+=d});
      child.stderr.on('data',d=>{err+=d});
      child.on('close',(code,signal)=>{
        const idx=children.get(child);
        children.delete(child);
        completed++;
        if(out)process.stdout.write(out);
        if(err)process.stderr.write(err);
        if(code!==0||signal){failed++;console.error(`MUTATION CHILD FAILED | index=${idx} | code=${code} | signal=${signal||'none'}`);}
        launch();
        if(completed===cases.length){
          console.log(`MUTATION SUMMARY | cases=${cases.length} | concurrency=${mutationConcurrency} | failed=${failed}`);
          process.exit(failed?1:0);
        }
      });
    }
  };
  launch();
}
