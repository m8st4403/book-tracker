#!/usr/bin/env node
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=process.cwd(), pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const failures=[];
const req=(c,m)=>{if(!c)failures.push(m)};
req(pkg.version==='4.13.247',`version mismatch: ${pkg.version}`);
const src=fs.readFileSync(path.join(root,'api_management.js'),'utf8');
const ctx={console,performance:{now:()=>0},window:{},document:{createElement:()=>({}),head:{appendChild(){}}},fetch:async()=>{throw new Error('network must not be used by semantic gate')},URLSearchParams,AbortController,DOMException,Error,setTimeout,clearTimeout};
ctx.globalThis=ctx;ctx.window=ctx;
try{vm.runInNewContext(src,ctx,{timeout:5000});}catch(e){console.error('RELEASE-DATE-RESOLVER-SEMANTICS-GATE FAIL');console.error(e);process.exit(1)}
const api=ctx.bookTrackerApiManagement;
req(!!api?.mergeCandidates,'mergeCandidates export missing');
req(!!api?.releaseDateInfo,'releaseDateInfo export missing');
function candidate(value,provider,priority){return {field:'releaseDate',value,confidence:'HIGH',evidence:{identifierMatched:true,schemaValidated:true,semanticValidated:true,countryMatched:true},provider,priority};}
if(api?.mergeCandidates){
  const same=api.mergeCandidates('releaseDate',[candidate('202304','openBD',1),candidate('2023.4','ndl',2)],{});
  req(same?.decision?.status==='ACCEPT','equivalent month formats must be accepted');
  req(same?.evidence?.crossSourceAgreement===true,'equivalent month formats must produce cross-source agreement');
  const same2=api.mergeCandidates('releaseDate',[candidate('2026-02','openBD',1),candidate('202602','ndl',2)],{});
  req(same2?.decision?.status==='ACCEPT','ISO and compact month formats must be accepted as equal');
  const conflict=api.mergeCandidates('releaseDate',[candidate('202304','openBD',1),candidate('202305','ndl',2)],{});
  req(conflict?.decision?.status==='HOLD'&&conflict?.decision?.reason==='PROVIDER_CONFLICT','different months must remain a real provider conflict');
  const dayConflict=api.mergeCandidates('releaseDate',[candidate('2026-10-01','openBD',1),candidate('2026-10-15','ndl',2)],{});
  req(dayConflict?.decision?.status==='HOLD'&&dayConflict?.decision?.reason==='PROVIDER_CONFLICT','different days must remain a real provider conflict');
}
if(api?.releaseDateInfo){
  for(const [input,expected] of [['202304','2023-04'],['2023.4','2023-04'],['2026-02','2026-02'],['202602','2026-02'],['2023年4月','2023-04']])req(api.releaseDateInfo(input).date===expected,`${input} normalization failed`);
}
if(failures.length){console.error('RELEASE-DATE-RESOLVER-SEMANTICS-GATE FAIL');failures.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log('RELEASE-DATE-RESOLVER-SEMANTICS-GATE PASS | equivalent month forms=4 | true conflicts=2 | network=0');
