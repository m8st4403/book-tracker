#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const root=__dirname;
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const apiSource=fs.readFileSync(path.join(root,'api_management.js'),'utf8');
const docs=['README.md','SPEC.md','DEV_GUARD.md','REGRESSION_COVERAGE.md','ROADMAP_TEST_MATRIX.md','RELEASE_TEST_GATE.md','LOGIC_TEST_MATRIX.md','package.json'];
function runMutation(name,mutateIndex=source,mutateApi=apiSource){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'book-tracker-mutation-'));
  try{
    for(const f of docs) fs.copyFileSync(path.join(root,f),path.join(dir,f));
    fs.writeFileSync(path.join(dir,'index.html'),mutateIndex);
    fs.writeFileSync(path.join(dir,'api_management.js'),mutateApi);
    const r=spawnSync(process.execPath,[path.join(root,'dev_guard.js'),path.join(dir,'index.html')],{encoding:'utf8',timeout:60000,cwd:dir});
    if(r.error) throw r.error;
    return {caught:r.status!==0,output:r.stdout+r.stderr};
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
const uiMutation=source.replace('</body>','<div id="mutationOverflow" style="position:fixed;left:0;top:0;width:1000px;height:20px">mutation</div></body>');
const apiMutation=apiSource.replace(' && (field!=="listPrice" || e.taxIncludedConfirmed)','');
const atomicMutation=source.replace(' if(persistPurchaseGroups())return true;\n purchaseGroups=before;\n return false;', ' return persistPurchaseGroups();');

const cases=[
  ['UI generic overflow',()=>runMutation('UI generic overflow',uiMutation)],
  ['API trust',()=>runMutation('API trust',source,apiMutation)],
  ['Purchase-group atomicity',()=>runMutation('Purchase-group atomicity',atomicMutation)]
];
let ok=true;
for(const [name,fn] of cases){const r=fn();console.log(`${r.caught?'PASS':'FAIL'} | MUTATION-${name} | intentional defect ${r.caught?'detected':'NOT detected'}`);if(!r.caught){ok=false;console.log(r.output)}}
process.exitCode=ok?0:1;
