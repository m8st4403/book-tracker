#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const root=__dirname;
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const apiSource=fs.readFileSync(path.join(root,'api_management.js'),'utf8');
const docs=['README.md','SPEC.md','DEV_GUARD.md','REGRESSION_COVERAGE.md','ROADMAP_TEST_MATRIX.md','RELEASE_TEST_GATE.md','LOGIC_TEST_MATRIX.md','package.json'];
function runMutation(name,mutateIndex=source,mutateApi=apiSource){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'book-tracker-mutation-'));
  try{
    for(const f of docs) fs.copyFileSync(path.join(root,f),path.join(dir,f));
    fs.writeFileSync(path.join(dir,'index.html'),mutateIndex);
    fs.writeFileSync(path.join(dir,'api_management.js'),mutateApi);
    const r=spawnSync(process.execPath,[path.join(root,'dev_guard.js'),path.join(dir,'index.html')],{encoding:'utf8',timeout:60000,cwd:dir});
    if(r.error) throw r.error;
    return {caught:r.status!==0,output:r.stdout+r.stderr};
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
const uiMutation=source.replace('</body>','<div id="mutationOverflow" style="position:fixed;left:0;top:0;width:1000px;height:20px">mutation</div></body>');
const apiMutation=apiSource.replace(' && (field!=="listPrice" || e.taxIncludedConfirmed)','');
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
const registrationAtomicMutation=source.replace('if(failedPreparations.length||added.length!==candidates.length-skippedDuplicates.length){','if(false){');
const registrationRollbackMutation=source.replace('if(saveFailed){books=oldBooks;calendarExtras=oldExtras;bookMeta=oldMeta;saveMeta();persistBooks();persistCalendarExtras();metrics?.traceStep("保存失敗・ロールバック"','if(saveFailed){metrics?.traceStep("保存失敗・ロールバック"');
const registrationDuplicateMutation=source.replace('if(usableExisting&&!isRicherBookRecord(prepared,usableExisting)){skippedDuplicates.push(preparedIsbn||key);return;}','if(false){skippedDuplicates.push(preparedIsbn||key);return;}');
const registrationUserWaitMutation=source.replace('waitDelta=Math.max(0,(Number(token?.userWaitMs)||0)-waitBefore);token.processingMs+=(Math.max(0,elapsed-apiDelta-waitDelta));','waitDelta=0;token.processingMs+=(Math.max(0,elapsed-apiDelta-waitDelta));');
const registrationPersistenceMutation=source.replace('function persistBooks(){try{localStorage.setItem(KEY,JSON.stringify(books));return true}catch(e){console.error("books save",e);return false}}','function persistBooks(){return true}');

const genericMutationCase=  ['Generic author identity normalization',()=>runMutation('Generic author identity normalization',genericIdentityMutation)];
const authorFragmentMutationCase=['Author fragment suppression',()=>runMutation('Author fragment suppression',authorFragmentMutation)];
const structuredMultiAuthorMutationCase=['Structured multi-author parsing',()=>runMutation('Structured multi-author parsing',structuredMultiAuthorMutation)];
const cases=[
  ['UI generic overflow',()=>runMutation('UI generic overflow',uiMutation)],
  ['API trust',()=>runMutation('API trust',source,apiMutation)],
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
  ['Series redundant-scope coalescing',()=>runMutation('Series redundant-scope coalescing',seriesCoalescingMutation)]
];
let ok=true;
for(const [name,fn] of cases){const r=fn();console.log(`${r.caught?'PASS':'FAIL'} | MUTATION-${name} | intentional defect ${r.caught?'detected':'NOT detected'}`);if(!r.caught){ok=false;console.log(r.output)}}
process.exitCode=ok?0:1;
