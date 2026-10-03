#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=__dirname, pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const cat=JSON.parse(fs.readFileSync(path.join(root,'QUALITY_GATE_CATALOG.json'),'utf8'));
const pipeline=fs.readFileSync(path.join(root,'release_pipeline.js'),'utf8');
const errors=[];
if(cat.release!==pkg.version) errors.push(`catalog release mismatch ${cat.release} != ${pkg.version}`);
const seen=new Set();
for(const x of cat.stages){
 if(seen.has(x.id)) errors.push(`duplicate stage id ${x.id}`); seen.add(x.id);
 if(!fs.existsSync(path.join(root,x.script))) errors.push(`missing stage script ${x.script}`);
 if(!pipeline.includes(`catalog.stages.map`)) errors.push('release pipeline is not catalog-driven');
}
const scripts=pkg.scripts||{};
for(const x of cat.stages){ if(!scripts[`test:${x.id}`] && x.id!=='guard' && x.id!=='mutation'){} }
if(!pipeline.includes('const catalog = JSON.parse')) errors.push('pipeline catalog preflight missing');
if(errors.length){console.error('QUALITY_GATE_CATALOG:FAIL');errors.forEach(e=>console.error(e));process.exit(1)}
console.log('QUALITY_GATE_CATALOG:PASS');
console.log(JSON.stringify({release:pkg.version,stages:cat.stages.length},null,2));
