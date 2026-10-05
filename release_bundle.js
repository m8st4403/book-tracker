#!/usr/bin/env node
const fs=require('fs'),path=require('path'),cp=require('child_process'),os=require('os');
const sourceUpload=__dirname;
const root=path.resolve(sourceUpload,'..');
const version=JSON.parse(fs.readFileSync(path.join(sourceUpload,'package.json'),'utf8')).version;
const outputArg=process.argv.slice(2).find((x)=>x.endsWith('.zip'));
const output=path.resolve(outputArg||path.join(root,`book_tracker_prototype_v${version.replaceAll('.','_')}_release.zip`));
function run(cmd,args,cwd){const r=cp.spawnSync(cmd,args,{cwd,stdio:'inherit',encoding:'utf8'});if(r.status!==0)process.exit(r.status||1)}
function walk(dir){const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...walk(p));else out.push(p)}return out}
function sha(p){const crypto=require('crypto');return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
// 1) The source tree is the only release authority. Never zip a previously built ZIP.
run('npm',['run','test:release'],sourceUpload);
const staging=fs.mkdtempSync(path.join(os.tmpdir(),'book-tracker-release-'));
const stageRoot=path.join(staging,'release');fs.mkdirSync(stageRoot);
cp.execFileSync('cp',['-a',root,path.join(stageRoot,'package')]);
const packageRoot=path.join(stageRoot,'package');
// Remove prior generated ZIPs from the package root so an artifact can never contain itself.
for(const f of fs.readdirSync(packageRoot))if(f.endsWith('.zip'))fs.rmSync(path.join(packageRoot,f),{recursive:true,force:true});
// Recreate a clean staging tree with the exact two release roots.
const finalStage=path.join(staging,'final');fs.mkdirSync(finalStage);
cp.execFileSync('cp',['-a',sourceUpload,path.join(finalStage,'GitHubアップロード')]);
const unnecessary=path.join(root,'アップロード不要');
if(!fs.existsSync(unnecessary))throw new Error('アップロード不要 directory is missing');
cp.execFileSync('cp',['-a',unnecessary,path.join(finalStage,'アップロード不要')]);
if(fs.existsSync(output))fs.rmSync(output,{force:true});
fs.mkdirSync(path.dirname(output),{recursive:true});
run('zip',['-qr',output,'GitHubアップロード','アップロード不要'],finalStage);
// 2) Re-extract the exact ZIP and rerun structural/version/asset gates against what the user will receive.
const verify=fs.mkdtempSync(path.join(os.tmpdir(),'book-tracker-verify-'));
run('unzip',['-q',output,'-d',verify]);
run(process.execPath,['release_artifact_guard.js',verify],sourceUpload);
run(process.execPath,['release_zip_structure_guard.js',output],sourceUpload);
// 3) Byte-level source-vs-zip verification for every GitHub upload file.
const extractedUpload=path.join(verify,'GitHubアップロード');
const srcFiles=walk(sourceUpload).filter(p=>!p.includes(`${path.sep}node_modules${path.sep}`)).map(p=>path.relative(sourceUpload,p)).sort();
const outFiles=walk(extractedUpload).map(p=>path.relative(extractedUpload,p)).sort();
if(JSON.stringify(srcFiles)!==JSON.stringify(outFiles))throw new Error('ZIP file set differs from source GitHubアップロード directory');
for(const rel of srcFiles){if(sha(path.join(sourceUpload,rel))!==sha(path.join(extractedUpload,rel)))throw new Error(`ZIP byte mismatch: ${rel}`)}
const report={schema:1,release:version,zip:output,sha256:sha(output),sourceFileCount:srcFiles.length,verified:true};
fs.writeFileSync(output+'.verified.json',JSON.stringify(report,null,2)+'\n');
console.log(`RELEASE-BUNDLE PASS | ${output}`);
console.log(`RELEASE-BUNDLE SHA256 | ${report.sha256}`);
