#!/usr/bin/env node
const fs=require('fs');
const path=require('path');
const root=process.cwd();
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const failures=[];
const req=(c,m)=>{if(!c)failures.push(m)};
req(pkg.version==='4.13.246',`version mismatch: ${pkg.version}`);
// Regression fixtures are expressed as contracts so a future edit cannot silently
// remove a precision class or cause category used by the real audit.
const precisionCases=[
 ['202610','month',true,'MONTH'],
 ['2026.10','month',true,'MONTH'],
 ['1996.3','month',true,'MONTH'],
 ['2026-10-03','day',true,'DAY'],
 ['2026/10/03','day',true,'DAY'],
 ['2026年10月3日','day',true,'DAY'],
 ['2026-10','month',true,'MONTH'],
 ['2026/10','month',true,'MONTH'],
 ['2026年10月','month',true,'MONTH'],
 ['2026','year',false,'YEAR_ONLY'],
 ['', 'unknown',false,'MISSING'],
 ['not-a-date','unknown',false,'UNPARSEABLE']
];
function extractFunction(src,name){
 const marker=`function ${name}(`; const start=src.indexOf(marker); if(start<0)return null;
 let brace=src.indexOf('{',start), depth=0, quote=null, esc=false;
 for(let i=brace;i<src.length;i++){
   const ch=src[i];
   if(quote){ if(esc){esc=false;continue} if(ch==='\\'){esc=true;continue} if(ch===quote)quote=null; continue; }
   if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}
   if(ch==='{')depth++; else if(ch==='}'&&--depth===0)return src.slice(start,i+1);
 }
 return null;
}
const vm=require('vm');
const infoSource=extractFunction(html,'releaseDateInfo');
req(!!infoSource,'releaseDateInfo function not extractable');
let releaseDateInfo;
if(infoSource){
 const ctx={}; vm.runInNewContext(infoSource+';this.releaseDateInfo=releaseDateInfo;',ctx); releaseDateInfo=ctx.releaseDateInfo;
}
for(const [raw,precision,eligible,reason] of precisionCases){
 if(releaseDateInfo){
   const got=releaseDateInfo(raw);
   req(got.precision===precision,`precision fixture ${raw||'<empty>'}: ${got.precision} != ${precision}`);
   req(got.calendarEligible===eligible,`calendar eligibility fixture ${raw||'<empty>'}: ${got.calendarEligible} != ${eligible}`);
   req(got.reason===reason,`reason fixture ${raw||'<empty>'}: ${got.reason} != ${reason}`);
 }
}
// The audit uses the page's actual releaseDateInfo implementation; do not duplicate it in tests.
const causes=['CALENDAR_PROJECTION_OK','CALENDAR_PROJECTION_MISSING','SAVED_PRECISION_NOT_CALENDAR_READY','SAVED_VALUE_INVALID','PROVIDER_VALUE_UNAVAILABLE','PROVIDER_VALUE_REJECTED','PROVIDER_CONFLICT','SAVED_VALUE_MISSING','PROVIDER_RESOLUTION_ERROR'];
for(const c of causes) req(html.includes(`code:"${c}"`),`cause taxonomy missing: ${c}`);
req(html.includes('Provider→Resolver採用→保存→カレンダー投影'),'audit path stages missing');
req(html.includes('既存蔵書は変更しません'),'read-only contract missing');
if(failures.length){console.error('RELEASE-DATE-PATH-UNIT-GATE FAIL');failures.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log('RELEASE-DATE-PATH-UNIT-GATE PASS | precision fixtures=12 | cause taxonomy=9 | read-only path contract=PASS');
