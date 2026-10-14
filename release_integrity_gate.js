#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=__dirname;
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const version=pkg.version;
const fail=[];
const req=(c,m)=>{if(!c)fail.push(m)};
const text=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=text('index.html');
const app=(html.match(/const APP_VERSION="([^"]+)"/)||[])[1];
const guard=(html.match(/const DEV_GUARD_VERSION="([^"]+)"/)||[])[1];
req(/^\d+\.\d+\.\d+$/.test(version),`invalid package version: ${version}`);
req(app===version,`APP_VERSION mismatch: ${app} !== ${version}`);
req(guard===version,`DEV_GUARD_VERSION mismatch: ${guard} !== ${version}`);
req(html.includes(`id="appVersionText">バージョン：${version}`),`visible About version mismatch: ${version}`);
req(html.includes(`id="appHeaderSub">v${version}`),`visible header version mismatch: ${version}`);
for(const file of ['README.md','SPEC.md','DEVELOPMENT_ROADMAP_DECISION.json','FUNCTIONAL_OUTCOME_MATRIX.json','FEATURE_STATUS_INVENTORY.json','FEATURE_COVERAGE.json','BIBLIOGRAPHIC_FIELD_CONTRACT.json','CROSS_DATA_PROJECTION_MATRIX.json','QUALITY_GATE_CATALOG.json','RELEASE_ASSET_MANIFEST.json']){
  const s=text(file); req(s.includes(version),`${file} does not declare ${version}`);
}
const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else files.push(p)}}walk(root);
const versionRefs=new Map();
for(const p of files){const rel=path.relative(root,p);if(rel==='node_modules')continue;const ext=path.extname(p).toLowerCase(); if(!['.js','.html','.json'].includes(ext)) continue; const s=fs.readFileSync(p,'utf8');const matches=[...s.matchAll(/(?:v)?4\.13\.\d+\b/g)].map(m=>m[0]);for(const v of matches){const normalized=v.replace(/^v/,'');if(normalized!==version && ext==='.json'){const arr=versionRefs.get(rel)||[];arr.push(v);versionRefs.set(rel,arr)}}}
for(const [rel,vals] of versionRefs)req(false,`stale release version in ${rel}: ${[...new Set(vals)].join(', ')}`);
const manifest=JSON.parse(text('RELEASE_ASSET_MANIFEST.json'));req(manifest.release===version,`manifest release mismatch: ${manifest.release} !== ${version}`);
const roadmap=JSON.parse(text('DEVELOPMENT_ROADMAP_DECISION.json'));req(roadmap.release===version,`roadmap release mismatch: ${roadmap.release} !== ${version}`);
const catalog=JSON.parse(text('QUALITY_GATE_CATALOG.json'));req(catalog.release===version,`catalog release mismatch: ${catalog.release} !== ${version}`);
req(catalog.stages.some(x=>x.id==='release-integrity'&&x.script==='release_integrity_gate.js'),'release-integrity gate is not in quality pipeline catalog');
req(catalog.stages.some(x=>x.id==='diagnostic-runtime'&&x.script==='diagnostic_runtime_gate.js'),'diagnostic-runtime gate is not in quality pipeline catalog');
if(fail.length){console.error('RELEASE-INTEGRITY-GATE FAIL');fail.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log(`RELEASE-INTEGRITY-GATE PASS | release=${version} | version sources/stale refs/catalog checked`);
