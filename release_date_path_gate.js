#!/usr/bin/env node
const fs=require('fs');
const path=require('path');
const root=process.cwd();
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const expected=[
 'CALENDAR_PROJECTION_OK','CALENDAR_PROJECTION_MISSING','SAVED_PRECISION_NOT_CALENDAR_READY',
 'SAVED_VALUE_INVALID','PROVIDER_VALUE_UNAVAILABLE','PROVIDER_VALUE_REJECTED',
 'PROVIDER_CONFLICT','SAVED_VALUE_MISSING','PROVIDER_RESOLUTION_ERROR'
];
const failures=[];
function req(cond,msg){if(!cond)failures.push(msg)}
req(pkg.version==='4.13.238',`version mismatch: ${pkg.version}`);
req(html.includes('async function runReleaseDateAudit()'),'async release-date audit missing');
req(html.includes('function classifyReleaseDatePathCause('),'cause classifier missing');
for(const code of expected)req(html.includes(code),`missing cause code: ${code}`);
req(html.includes('await api.resolveIsbn(canonicalIsbn(b.isbn),{fast:false,seriesFallback:true})'),'audit does not perform resolver read');
req(html.includes('既存蔵書は変更しません'),'audit must declare read-only behavior');
req(html.includes('PROVIDER_CONFLICT'),'provider conflict must be distinguished');
req(html.includes('CALENDAR_PROJECTION_MISSING'),'calendar projection failure must be distinguished');
req(html.includes('canonicalCalendarReleaseDate'),'month/day calendar projection key missing');
req(html.includes('releasePrecision==="month"'),'month precision must be represented in calendar events');
req(html.includes('発売予定・発売月'),'month-level calendar display missing');
req(html.includes('SAVED_VALUE_MISSING'),'saved-value loss must be distinguished');
req(!/books\[[^\]]+\]\s*=/.test(html.slice(html.indexOf('async function runReleaseDateAudit()'), html.indexOf('function allEvents'))),'release-date audit must not mutate books');
if(failures.length){console.error('RELEASE-DATE-PATH-GATE FAIL');failures.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log('RELEASE-DATE-PATH-GATE PASS | cause taxonomy='+expected.length+' | read-only resolver audit wired');
