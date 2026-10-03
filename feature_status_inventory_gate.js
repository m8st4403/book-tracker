#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=__dirname;
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const inv=JSON.parse(fs.readFileSync(path.join(root,'FEATURE_STATUS_INVENTORY.json'),'utf8'));
const fc=JSON.parse(fs.readFileSync(path.join(root,'FEATURE_COVERAGE.json'),'utf8'));
const errors=[];
if(inv.release!==pkg.version) errors.push(`inventory release ${inv.release} != package ${pkg.version}`);
if(inv.currentFeatures.length!==fc.features.length) errors.push(`inventory feature count ${inv.currentFeatures.length} != coverage ${fc.features.length}`);
const ids=new Set(fc.features.map(x=>x.id));
for(const x of inv.currentFeatures) if(!ids.has(x.id)) errors.push(`inventory contains unknown feature ${x.id}`);
if(inv.summary.currentFeaturesAutomatedContractPass!==inv.currentFeatures.length) errors.push('not all current features have complete automated contract evidence');
if(inv.summary.currentFeaturesBrowserE2EConfirmedInCurrentEnvironment!==0) errors.push('browser E2E confirmation must remain explicit and not be fabricated by this inventory');
if(inv.summary.currentFeaturesBrowserE2EUnconfirmedInCurrentEnvironment!==inv.currentFeatures.length) errors.push('browser E2E unconfirmed count mismatch');
if(!errors.length){console.log('FEATURE_STATUS_INVENTORY:PASS');console.log(JSON.stringify(inv.summary,null,2));process.exit(0)}
console.error('FEATURE_STATUS_INVENTORY:FAIL');errors.forEach(e=>console.error(e));process.exit(1);
