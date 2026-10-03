'use strict';
const fs=require('fs'),path=require('path');
const root=__dirname;
const m=JSON.parse(fs.readFileSync(path.join(root,'FUNCTIONAL_OUTCOME_MATRIX.json'),'utf8'));
const guard=fs.readFileSync(path.join(root,'dev_guard.js'),'utf8');
const labels=new Set([...guard.matchAll(/check\('([^']+)'/g)].map(x=>x[1]));
let fail=0;const check=(ok,n,d='')=>{console.log(`${ok?'PASS':'FAIL'} | OUTCOME-QUALITY-${n}${d?' | '+d:''}`);if(!ok)fail++};
const seen=new Map();
for(const f of m.features){
 check(typeof f.primaryEvidence==='string'&&labels.has(f.primaryEvidence),`${f.id}-PRIMARY-RUNTIME`,f.primaryEvidence||'');
 const a=seen.get(f.primaryEvidence)||[];a.push(f.id);seen.set(f.primaryEvidence,a);
}
for(const [e,ids] of seen) check(ids.length===1,`UNIQUE-${e}`,ids.join(','));
// Generic cross-domain evidence is allowed in layer coverage, but a feature's primary outcome proof
// must identify one feature-specific executable assertion. This prevents a broad persistence smoke test
// from silently becoming the sole proof for unrelated features.
check([...seen.values()].every(v=>v.length===1),'PRIMARY-EVIDENCE-CLOSED',`${seen.size}/${m.features.length}`);
process.exitCode=fail?1:0;
