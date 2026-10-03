'use strict';
const fs=require('fs'),path=require('path');
const root=__dirname;
const cov=JSON.parse(fs.readFileSync(path.join(root,'FEATURE_COVERAGE.json'),'utf8'));
const policy=JSON.parse(fs.readFileSync(path.join(root,'EVIDENCE_REUSE_POLICY.json'),'utf8'));
const matrix=JSON.parse(fs.readFileSync(path.join(root,'FUNCTIONAL_OUTCOME_MATRIX.json'),'utf8'));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
let fail=0;const check=(ok,n,d='')=>{console.log(`${ok?'PASS':'FAIL'} | REUSE-${n}${d?' | '+d:''}`);if(!ok)fail++};
check(policy.release===pkg.version,'VERSION',`${policy.release}=${pkg.version}`);
check(cov.release===pkg.version,'COVERAGE-VERSION',`${cov.release}=${pkg.version}`);
check(matrix.release===pkg.version,'OUTCOME-VERSION',`${matrix.release}=${pkg.version}`);
const primary=new Map(matrix.features.map(f=>[f.primaryEvidence,f.id]));
const allowed=new Map(policy.sharedEvidence.map(x=>[x.evidence,x]));
const actual=new Map();
for(const f of cov.features){
 for(const [layer,v] of Object.entries(f.layers)){
  if(v.status!=='required') continue;
  for(const e of v.evidence||[]){
   const producer=primary.get(e);
   if(!producer || producer===f.id) continue;
   const key=`${f.id}:${layer}`;
   const a=actual.get(e)||[];a.push(key);actual.set(e,a);
   const p=allowed.get(e);
   check(!!p,`DECLARED-${key}`,e);
   if(p){check(p.producer===producer,`PRODUCER-${key}`,`${producer} vs ${p.producer}`);check(p.allowedConsumers.includes(key),`ALLOW-${key}`,e);}
  }
 }
}
for(const [e,p] of allowed){
 const producer=primary.get(e);
 if(!producer) continue;
 const actualConsumers=actual.get(e)||[];
 check(new Set(actualConsumers).size===new Set(p.allowedConsumers).size && p.allowedConsumers.every(x=>actualConsumers.includes(x)),`POLICY-COMPLETE-${e}`,`declared=${p.allowedConsumers.length} actual=${actualConsumers.length}`);
}
// A consumer may not rely on another feature's primary evidence exclusively at the outcome level.
for(const f of matrix.features){
 check(typeof f.primaryEvidence==='string' && primary.get(f.primaryEvidence)===f.id,`PRIMARY-OWN-${f.id}`,f.primaryEvidence);
}
process.exitCode=fail?1:0;
