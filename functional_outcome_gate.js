'use strict';
const fs=require('fs'),path=require('path');
const root=__dirname;
const m=JSON.parse(fs.readFileSync(path.join(root,'FUNCTIONAL_OUTCOME_MATRIX.json'),'utf8'));
const cov=JSON.parse(fs.readFileSync(path.join(root,'FEATURE_COVERAGE.json'),'utf8'));
const guard=fs.readFileSync(path.join(root,'dev_guard.js'),'utf8');
const mut=fs.readFileSync(path.join(root,'mutation_guard.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const labels=new Set([...guard.matchAll(/check\('([^']+)'/g)].map(x=>x[1]));
const mutations=new Set([...mut.matchAll(/\['([^']+)'/g)].map(x=>x[1]));
let fail=0; const check=(ok,n,d='')=>{console.log(`${ok?'PASS':'FAIL'} | OUTCOME-${n}${d?' | '+d:''}`);if(!ok)fail++};
check(m.release===pkg.version,'VERSION',`${m.release}=${pkg.version}`);
check(m.schemaVersion===1,'SCHEMA');
const ids=new Set(cov.features.map(f=>f.id));
check(m.features.length===ids.size,'COUNT',`${m.features.length}/${ids.size}`);
for(const f of m.features){
  check(ids.has(f.id),`${f.id}-FEATURE`);
  check(f.operation?.trim().length>0,`${f.id}-OPERATION`);
  check(f.observableOutcome?.trim().length>0,`${f.id}-OUTCOME`);
  check(f.failureInvariant?.trim().length>0,`${f.id}-FAILURE`);
  check(labels.has(f.primaryEvidence),`${f.id}-PRIMARY-EVIDENCE`,f.primaryEvidence);
  const covf=cov.features.find(x=>x.id===f.id);
  const ev=Object.values(covf?.layers||{}).flatMap(x=>x.evidence||[]);
  check(ev.includes(f.primaryEvidence),`${f.id}-COVERAGE-LINK`);
  check(typeof covf?.depth?.requiredMutation==='string'&&mutations.has(covf.depth.requiredMutation),`${f.id}-MUTATION-LINK`,covf?.depth?.requiredMutation||'');
}
check(m.features.every(f=>ids.has(f.id)),'BIDIRECTIONAL-CLOSURE');
process.exitCode=fail?1:0;
