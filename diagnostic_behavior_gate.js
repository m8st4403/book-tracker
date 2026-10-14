#!/usr/bin/env node
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const fail=[];const req=(c,m)=>{if(!c)fail.push(m)};
req(html.includes('el.dataset.diagnosticText=value'),'diagnostic canonical text storage missing');
req(html.includes('pre.textContent=value'),'diagnostic output must render as textContent');
req(html.includes('renderDiagnosticText("releaseDateRepairResults"'), 'release-date repair must use canonical diagnostic renderer');
req(html.includes('const date=info.precision==="year"?info.date:canonicalCalendarReleaseDate(e?.date);'),'year precision must remain in the internal event model');
req(html.includes('releasePrecision==="year"'),'year precision must be handled explicitly');
req(html.includes('const yearOnly=events.filter(e=>e.releasePrecision==="year");'),'year-only release section must be generated');
req(html.includes('class="calendar-year-month ${has?"has-events":""} ${today?"today-month":""} ${selected?"selected-month":""}"'),'selected month state must be rendered in year grid');
req(html.includes('aria-pressed="${selected?"true":"false"}"'),'selected month ARIA state must be rendered');
req(html.includes('calendarViewMode==="year"'),'year/month view state must remain explicit');

const el={dataset:{},innerHTML:'',children:[],appendChild(x){this.children.push(x)}};
const ctx={document:{createElement(tag){if(tag==='pre')return {className:'',style:{},textContent:''};throw new Error('unexpected tag '+tag)}},$:()=>el};ctx.globalThis=ctx;
const match=html.match(/function renderDiagnosticText\(id,text\)\{[\s\S]*?\n\}/);const fnSrc=match?.[0]||'';
req(!!fnSrc,'renderDiagnosticText function not extractable');
const diagnosticFixture='<b>plain</b><br>\nnext';
if(fnSrc){try{
  const call='renderDiagnosticText("x",'+JSON.stringify(diagnosticFixture)+');';
  vm.runInNewContext(fnSrc+';'+call,ctx,{timeout:1000});
  req(el.dataset.diagnosticText===diagnosticFixture,'canonical text must be retained exactly');
  req(el.children?.[0]?.textContent===diagnosticFixture,'diagnostic text must stay literal, not become HTML');
}catch(e){fail.push('diagnostic renderer simulation failed: '+e.message)}}
if(fail.length){console.error('DIAGNOSTIC-BEHAVIOR-GATE FAIL');fail.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log(`DIAGNOSTIC-BEHAVIOR-GATE PASS | release=${pkg.version} | canonical text/year-view contracts simulated`);
