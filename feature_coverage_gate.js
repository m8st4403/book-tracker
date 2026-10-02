const fs=require('fs'),path=require('path');
const root=__dirname, pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const guard=fs.readFileSync(path.join(root,'dev_guard.js'),'utf8'), mutation=fs.readFileSync(path.join(root,'mutation_guard.js'),'utf8'), contract=fs.readFileSync(path.join(root,'FEATURE_CONTRACT.md'),'utf8');
const cov=JSON.parse(fs.readFileSync(path.join(root,'FEATURE_COVERAGE.json'),'utf8'));
const layers=['入口','操作','状態','データ','永続化','復元','投影','失敗復旧']; const fail=[];
function check(ok,name,detail=''){console.log(`${ok?'PASS':'FAIL'} | COVERAGE-${name}${detail?' | '+detail:''}`);if(!ok)fail.push(name)}
function labels(re,src){const a=new Set(),r=new RegExp(re,'g');let m;while((m=r.exec(src)))a.add(m[1]);return a}
const staticLabels=labels("check\\('([^']+)'",guard), mutationLabels=labels("\\['([^']+)'",mutation), all=new Set([...staticLabels,...mutationLabels]);
check(cov.schemaVersion===3,'SCHEMA',String(cov.schemaVersion)); check(cov.release===pkg.version,'VERSION',`coverage=${cov.release} package=${pkg.version}`); check(JSON.stringify(cov.layers)===JSON.stringify(layers),'LAYERS');
const ids=cov.features.map(f=>f.id), dup=ids.filter((x,i)=>ids.indexOf(x)!==i); check(!dup.length,'UNIQUE_IDS',JSON.stringify(dup));
const contractIds=[...new Set([...contract.matchAll(/\bFEAT-[A-Z]+\b/g)].map(m=>m[0]))];
check(contractIds.every(id=>ids.includes(id))&&ids.every(id=>contractIds.includes(id)),'BIDIRECTIONAL_IDS',JSON.stringify({missing:contractIds.filter(x=>!ids.includes(x)),extra:ids.filter(x=>!contractIds.includes(x))}));
for(const f of cov.features){const ls=f.layers||{};check(layers.every(l=>ls[l]),`${f.id}-ALL_LAYERS`);const refs=[];for(const l of layers){const x=ls[l];if(!x)continue;if(x.status==='required'){check(Array.isArray(x.evidence)&&x.evidence.length>0,`${f.id}-${l}-EVIDENCE`);for(const ev of x.evidence||[]){check(all.has(ev),`${f.id}-${l}-EXACT`,ev);refs.push(ev)}}else if(x.status==='not-applicable'){check(typeof x.reason==='string'&&x.reason.trim(),`${f.id}-${l}-NA_REASON`)}else check(false,`${f.id}-${l}-STATUS`,String(x.status))}
const runtime=refs.some(x=>/^E2E-|^LOGIC-/.test(x)); check(runtime,`${f.id}-RUNTIME`); const fr=ls['失敗復旧']; if(fr?.status==='required'){const failEvidence=refs.some(x=>mutationLabels.has(x)||/rollback|rolls back|atomic|failure|timeout|conflict|predicate|wiring|timing|trust|unknown ordering/i.test(x));check(failEvidence,`${f.id}-FAILURE_EVIDENCE`)}}
process.exitCode=fail.length?1:0;
