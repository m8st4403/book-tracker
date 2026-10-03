#!/usr/bin/env node
const fs=require('fs');const path=require('path');
const root=__dirname;
const app=fs.readFileSync(path.join(root,'index.html'),'utf8');
const matrix=JSON.parse(fs.readFileSync(path.join(root,'CROSS_DATA_PROJECTION_MATRIX.json'),'utf8'));
const errors=[]; const ids=[];
const guardStart=app.indexOf('async function runSpecGuard');
const guardEnd=app.indexOf('window.runBookTrackerSpecGuard=runSpecGuard',guardStart);
if(guardStart<0||guardEnd<0) errors.push('runSpecGuard export/body not found');
const guard=guardStart>=0&&guardEnd>guardStart?app.slice(guardStart,guardEnd):'';
if(!/window\.runBookTrackerSpecGuard\s*=/.test(app)) errors.push('runtime guard is not exported');
if(/runBookTrackerSpecGuard\s*\(\s*\)/.test(app.slice(0,guardStart))) errors.push('runtime guard is invoked before its definition');
if(!/finally\s*\{[\s\S]*savedProjectionBooks/.test(guard)) errors.push('projection audit has no restoration finally block');
if(!/window\.__projectionAuditExecutionLog=\[\]/.test(guard)) errors.push('projection audit runtime telemetry is not reset before execution');
if(!/PROJECTION-AUDIT-RUNTIME/.test(guard)) errors.push('projection audit runtime execution result is not asserted');
for(const m of matrix.fields){
  for(const ev of (m.independentEvidence||[])){
    if(String(ev).startsWith('PROJ-')) ids.push(String(ev));
  }
}
const unique=[...new Set(ids)];
const expected=[...Array(24)].map((_,i)=>`PROJ-${String(i+1).padStart(3,'0')}`);
for(const id of expected){
  const count=guard.split(`projectionBook("${id}`).length-1;
  if(count!==1) errors.push(`${id}: expected exactly one projectionBook execution call in runSpecGuard, found ${count}`);
}
for(const id of unique){if(!expected.includes(id)) errors.push(`unexpected projection anchor ${id}`);}
if(unique.length!==24) errors.push(`matrix PROJ evidence count=${unique.length}, expected 24`);
const requiredCalls=expected.filter(id=>!guard.includes(`projectionBook("${id}`));
if(requiredCalls.length) errors.push(`projectionBook calls missing: ${requiredCalls.join(',')}`);
const sourceFiles=fs.readdirSync(root).filter(f=>/\.(js|json|md|html)$/.test(f));
const sourceText=sourceFiles.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
for(const m of matrix.fields){
  for(const ev of (m.independentEvidence||[])){
    const anchor=String(ev).split(' ')[0];
    if(!sourceText.includes(anchor)) errors.push(`evidence anchor absent from shipped source: ${anchor}`);
  }
}
if(errors.length){console.error('RUNTIME_SPEC_GUARD_CONTRACT:FAIL');errors.forEach(e=>console.error(e));process.exit(1);}
console.log('RUNTIME_SPEC_GUARD_CONTRACT:PASS');
console.log(JSON.stringify({release:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,projectionAnchors:24,restorationFinally:true,exported:true},null,2));
