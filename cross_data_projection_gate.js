const fs=require('fs');
const path=require('path');
const root=__dirname;
const m=JSON.parse(fs.readFileSync(path.join(root,'CROSS_DATA_PROJECTION_MATRIX.json'),'utf8'));
const required=new Set(['isbn','title','author','publisher','releaseDate','listPrice','seriesName','volumeNumber','readingStatus','favorite']);
const errors=[]; const seen=new Set(); const app=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const x of m.fields){const k=`${x.field}|${x.projection}`; if(seen.has(k)) errors.push(`duplicate:${k}`); seen.add(k); if(!required.has(x.field)) errors.push(`unknown-field:${x.field}`); if(!x.coverageStatus) errors.push(`missing-status:${k}`); if(x.coverageStatus==='named-evidence' && (!Array.isArray(x.independentEvidence)||x.independentEvidence.length===0)) errors.push(`named-evidence-without-evidence:${k}`); if(x.coverageStatus==='cross-contract-only' && x.verificationRequired!==true) errors.push(`cross-only-must-require-verification:${k}`); if(x.coverageStatus==='named-evidence'){for(const ev of (x.independentEvidence||[])){if(String(ev).startsWith('PROJ-') && !app.includes(ev)) errors.push(`evidence-anchor-missing:${k}:${ev}`);}}}
for(const f of required){if(!m.fields.some(x=>x.field===f)) errors.push(`missing-field:${f}`);}
if(errors.length){console.error('CROSS_DATA_PROJECTION_GATE:FAIL'); errors.forEach(e=>console.error(e)); process.exit(1);}
const counts={}; for(const x of m.fields) counts[x.coverageStatus]=(counts[x.coverageStatus]||0)+1;
console.log('CROSS_DATA_PROJECTION_GATE:PASS'); console.log(JSON.stringify({release:m.release,total:m.fields.length,counts},null,2));
