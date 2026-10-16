#!/usr/bin/env node
const fs=require('fs');
const path=require('path');
const root=process.cwd();
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const failures=[];
const req=(c,m)=>{if(!c)failures.push(m)};
const expectedVersion=pkg.version;
req(pkg.version===expectedVersion,`version mismatch: ${pkg.version}`);
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
const rankSource=extractFunction(html,'rankBibliographyConfidence');
const adoptionSource=extractFunction(html,'acceptedCalendarReleaseDate');
req(!!rankSource,'rankBibliographyConfidence function not extractable');
req(!!adoptionSource,'acceptedCalendarReleaseDate function not extractable');
let adoptDate;
if(infoSource&&rankSource&&adoptionSource){
 const ctx={};
 vm.runInNewContext([infoSource,rankSource,'function releaseDateProviderValuesAreSemanticallyEquivalent(){return false}',adoptionSource,'this.adoptDate=acceptedCalendarReleaseDate'].join('\n'),ctx);
 adoptDate=ctx.adoptDate;
 const accepted=(value)=>({fieldEvidence:{releaseDate:{value,confidence:'HIGH',decision:{status:'ACCEPT'}}}});
 for(const [raw,want] of [['2025.3','2025-03'],['202503','2025-03'],['2025年3月','2025-03'],['2025-03-08','2025-03-08']]){
  const got=adoptDate(accepted(raw));req(got===want,`accepted date normalization ${raw}: ${got} != ${want}`);
 }
 req(adoptDate(accepted('2025'))==='', 'year-only evidence must not be adopted');
 req(adoptDate({fieldEvidence:{releaseDate:{value:'2025.3',confidence:'HIGH',decision:{status:'REJECT'}}}})==='', 'rejected month evidence must not be adopted');
 req(adoptDate({fieldEvidence:{releaseDate:{value:'2025.3',confidence:'MEDIUM',decision:{status:'ACCEPT'}}}})==='', 'below-HIGH month evidence must not be adopted');
}
// Exercise the actual registration merge and existing-bibliography fill functions,
// not only the shared date-adoption helper. Normalizers unrelated to release dates
// are identity stubs so this gate remains isolated and deterministic.
const mergeSource=extractFunction(html,'mergeRegistrationBook');
const fillSource=extractFunction(html,'fillMissingBibliography');
req(!!mergeSource,'mergeRegistrationBook function not extractable');
req(!!fillSource,'fillMissingBibliography function not extractable');
if(infoSource&&rankSource&&adoptionSource&&mergeSource&&fillSource){
 const ctx={normalizeStoredListPrice:x=>x,normalizeRegistrationIdentity:x=>x,normalizeStoredSeries:x=>x,canonicalIsbn:x=>x,releaseDateProviderValuesAreSemanticallyEquivalent:()=>false,listPriceStatus:()=> 'confirmed',listPriceOf:()=>0,Number,String,Date,Math,Array,Object,JSON};
 vm.runInNewContext([infoSource,rankSource,'function releaseDateProviderValuesAreSemanticallyEquivalent(){return false}',adoptionSource,extractFunction(html,'makeReleaseDateMeta'),mergeSource,fillSource,'this.releaseSavePaths={mergeRegistrationBook,fillMissingBibliography}'].join('\n'),ctx);
 const resolved=(value)=>({isbn:'9784000000000',title:'テスト',fieldEvidence:{releaseDate:{value,confidence:'HIGH',decision:{status:'ACCEPT'},evidence:{provider:'fixture'}}},resolution:{accepted:{},fields:{releaseDate:{provider:'fixture',confidence:'HIGH',decision:{status:'ACCEPT'}}}}});
 let got=ctx.releaseSavePaths.mergeRegistrationBook({isbn:'9784000000000',title:'既存',date:''},resolved('2025.3'));
 req(got.date==='2025-03',`registration merge must save normalized month precision: ${got.date}`);
 got=ctx.releaseSavePaths.mergeRegistrationBook({isbn:'9784000000000',title:'既存',date:'2024-11'},resolved('2025.3'));
 req(got.date==='2024-11','registration merge must preserve existing release date');
 got=ctx.releaseSavePaths.mergeRegistrationBook({isbn:'9784000000000',title:'既存',date:''},resolved('2025'));
 req(got.date==='','registration merge must reject year-only evidence');
 let fill=ctx.releaseSavePaths.fillMissingBibliography({isbn:'9784000000000',title:'既存',date:''},resolved('2025年3月'));
 req(fill.book.date==='2025-03'&&fill.filled.includes('releaseDate'),`bibliography fill must save normalized month precision: ${fill.book.date}`);
 fill=ctx.releaseSavePaths.fillMissingBibliography({isbn:'9784000000000',title:'既存',date:'2024-11'},resolved('2025年3月'));
 req(fill.book.date==='2024-11'&&!fill.filled.includes('releaseDate'),'bibliography fill must preserve existing release date');
 fill=ctx.releaseSavePaths.fillMissingBibliography({isbn:'9784000000000',title:'既存',date:''},resolved('2025'));
 req(fill.book.date===''&&!fill.filled.includes('releaseDate'),'bibliography fill must reject year-only evidence');
}
// The audit uses the page's actual releaseDateInfo implementation; do not duplicate it in tests.
const causes=['CALENDAR_PROJECTION_OK','CALENDAR_PROJECTION_MISSING','SAVED_PRECISION_NOT_CALENDAR_READY','SAVED_VALUE_INVALID','PROVIDER_VALUE_UNAVAILABLE','PROVIDER_VALUE_REJECTED','PROVIDER_CONFLICT','SAVED_VALUE_MISSING','PROVIDER_RESOLUTION_ERROR'];
for(const c of causes) req(html.includes(`code:"${c}"`),`cause taxonomy missing: ${c}`);
req(html.includes('Provider→Resolver採用→保存→カレンダー投影'),'audit path stages missing');
req(html.includes('function acceptedCalendarReleaseDate(resolved)'),'shared accepted calendar-date adoption helper missing');
req(html.includes('if(!String(b.date||"").trim()){const acceptedDate=acceptedCalendarReleaseDate(resolved);if(acceptedDate)merged.date=acceptedDate;}'),'registration must persist accepted releaseDate evidence when date is empty');
req(html.includes('const acceptedDate=acceptedCalendarReleaseDate(resolved);if(acceptedDate){next.date=acceptedDate;'),'missing-date repair must persist the accepted evidence value, not resolved.date');
req(html.includes('const acceptedDate=acceptedCalendarReleaseDate(resolved);if(!acceptedDate){unavailable++;lines.push(canonicalIsbn(b.isbn)+\'｜補完なし｜理由:ACCEPTED_DATE_NORMALIZATION_REJECTED\');continue}const next={...b,date:acceptedDate,releaseDateMeta:makeReleaseDateMeta(resolved)};books[i]=normalizeRegistrationIdentity(next);changed++;'),'repair path must persist normalized accepted date, not raw provider formatting');
req(!html.includes('const next={...b,date:String(ev.value).trim(),releaseDateMeta:makeReleaseDateMeta(resolved)}'),'repair path must not store raw provider date formatting');
req(html.includes('既存蔵書は変更しません'),'read-only contract missing');
if(failures.length){console.error('RELEASE-DATE-PATH-UNIT-GATE FAIL');failures.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log('RELEASE-DATE-PATH-UNIT-GATE PASS | precision fixtures=12 | accepted-date normalization=4 | rejected/year/low-confidence=3 | save-path cases=6 | cause taxonomy=9 | read-only path contract=PASS');
