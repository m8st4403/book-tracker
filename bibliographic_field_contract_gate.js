const fs=require('fs'),path=require('path');
const root=process.argv[2]||'.';
const contract=JSON.parse(fs.readFileSync(path.join(root,'BIBLIOGRAPHIC_FIELD_CONTRACT.json'),'utf8'));
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const guard=fs.readFileSync(path.join(root,'dev_guard.js'),'utf8');
const mutation=fs.readFileSync(path.join(root,'mutation_guard.js'),'utf8');
const matrix=JSON.parse(fs.readFileSync(path.join(root,'FEATURE_COVERAGE.json'),'utf8'));
const required=['isbn','title','author','publisher','releaseDate','listPrice','seriesName','volumeNumber','readingStatus','favorite'];
const ids=new Set((contract.fields||[]).map(x=>x.id));
let failures=[];
function check(name,ok,detail){console.log(`${ok?'PASS':'FAIL'} | ${name} | ${detail||''}`);if(!ok)failures.push(name)}
check('FIELD-CONTRACT release matches package',contract.release===JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,`${contract.release}`);
check('FIELD-CONTRACT exactly ten required fields',required.every(x=>ids.has(x))&&ids.size===required.length,JSON.stringify([...ids]));
for(const f of contract.fields){
  check(`FIELD-CONTRACT ${f.id} has source/resolver/storage/projections/failure/mutation`,!!f.source&&!!f.resolver&&!!f.storage&&Array.isArray(f.projections)&&f.projections.length>0&&!!f.failure&&!!f.mutation,JSON.stringify(f));
  check(`FIELD-CONTRACT ${f.id} storage anchor exists`,index.includes(f.storage.split('[')[0])||guard.includes(f.storage.split('[')[0]),f.storage);
  check(`FIELD-CONTRACT ${f.id} mutation evidence exists`,guard.includes(f.mutation)||mutation.includes(f.mutation),f.mutation);
}
const cross=guard.includes('E2E-CROSS-DATA-001 10系統横断契約');
const release=guard.includes('E2E-CROSS-RELEASE-001 canonical release-date contract');
const price=mutation.includes('API trust')||guard.includes('API trust');
check('FIELD-CONTRACT cross-data executable anchor exists',cross);
check('FIELD-CONTRACT release-date executable anchor exists',release);
check('FIELD-CONTRACT price trust executable anchor exists',price);
const featureIds=new Set((matrix.features||[]).map(x=>x.id));
check('FIELD-CONTRACT bibliography/cross feature ledger exists',featureIds.has('FEAT-BIB')&&featureIds.has('FEAT-CROSS'),JSON.stringify([...featureIds].filter(x=>/BIB|CROSS/.test(x))));
process.exitCode=failures.length?1:0;
