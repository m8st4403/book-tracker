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
const confirmed=inv.currentFeatures.filter(x=>x.browserE2EInCurrentEnvironment==='CONFIRMED').length;
const unconfirmed=inv.currentFeatures.filter(x=>x.browserE2EInCurrentEnvironment==='UNCONFIRMED').length;
if(inv.summary.currentFeaturesBrowserE2EConfirmedInCurrentEnvironment!==confirmed) errors.push('browser E2E confirmed count mismatch');
if(inv.summary.currentFeaturesBrowserE2EUnconfirmedInCurrentEnvironment!==unconfirmed) errors.push('browser E2E unconfirmed count mismatch');
if(confirmed+unconfirmed!==inv.currentFeatures.length) errors.push('every current feature must have explicit browser E2E status');
for(const x of inv.currentFeatures) if(!['CONFIRMED','UNCONFIRMED'].includes(x.browserE2EInCurrentEnvironment)) errors.push(`invalid browser E2E status for ${x.id}`);
if(confirmed>0 && !inv.currentFeatures.every(x=>x.reason && x.reason.includes('iOS Safari or physical-device testing'))) errors.push('browser E2E scope limitation must remain explicit');
if(!errors.length){console.log('FEATURE_STATUS_INVENTORY:PASS');console.log(JSON.stringify(inv.summary,null,2));process.exit(0)}
console.error('FEATURE_STATUS_INVENTORY:FAIL');errors.forEach(e=>console.error(e));process.exit(1);
