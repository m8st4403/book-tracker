const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2] || '.');
const uploadDir = fs.existsSync(path.join(root, 'GitHubアップロード')) ? path.join(root, 'GitHubアップロード') : root;
const unnecessaryDir = path.join(root, 'アップロード不要');
const fail = (m) => { console.error(`FAIL | ${m}`); process.exitCode = 1; };
const pass = (m) => console.log(`PASS | ${m}`);
if (!fs.existsSync(uploadDir)) fail('GitHubアップロード directory is missing');
if (fs.existsSync(path.join(root, 'GitHubアップロード')) && !fs.existsSync(unnecessaryDir)) fail('アップロード不要 directory is missing');
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out=[];
  for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,e.name);
    if(e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}
const uploadFiles = walk(uploadDir);
const relativeFiles = uploadFiles.map(p=>path.relative(uploadDir,p)).sort();
const manifestPath=path.join(uploadDir,'RELEASE_ASSET_MANIFEST.json');
if (!fs.existsSync(manifestPath)) fail('RELEASE_ASSET_MANIFEST.json is missing');
let manifest=null;
try { manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')); } catch(e) { fail(`RELEASE_ASSET_MANIFEST.json is invalid: ${e.message}`); }
if (manifest) {
  const expected=[...new Set(manifest.assets||[])].sort();
  const missing=expected.filter(x=>!relativeFiles.includes(x));
  const unexpected=relativeFiles.filter(x=>!expected.includes(x));
  if (manifest.schemaVersion!==1) fail(`unsupported release asset manifest schema: ${manifest.schemaVersion}`);
  else pass('release asset manifest schema is supported');
  if (missing.length) fail(`manifest assets missing from GitHubアップロード: ${missing.join(', ')}`);
  else pass('all manifest assets are present in GitHubアップロード');
  if (unexpected.length) fail(`files not declared by release asset manifest: ${unexpected.join(', ')}`);
  else pass('GitHubアップロード contains only manifest-declared current assets');
}
const forbiddenHistorical = uploadFiles.filter(p => /(?:CHANGELOG(?:_v\d+_\d+_\d+)?|PAST_FIX_QUALITY_AUDIT|NEXT_IMPLEMENTATION_PRIORITY|REGRESSION_COVERAGE|LOGIC_TEST_MATRIX|RULE_LEDGER|RULE_TEST_MATRIX|RULE_GAP_AUDIT|OPERATION_CATALOG)/i.test(path.basename(p)));
if (forbiddenHistorical.length) fail(`historical files leaked into GitHubアップロード: ${forbiddenHistorical.map(p=>path.relative(uploadDir,p)).join(', ')}`); else pass('historical changelog/audit/priority files are kept out of GitHubアップロード');
const currentVersion = (() => { const pkg=JSON.parse(fs.readFileSync(path.join(uploadDir,'package.json'),'utf8')); return pkg.version; })();
const index=fs.readFileSync(path.join(uploadDir,'index.html'),'utf8');
const app=(index.match(/const APP_VERSION="([^"]+)"/)||[])[1];
const guard=(index.match(/const DEV_GUARD_VERSION="([^"]+)"/)||[])[1];
if(currentVersion && currentVersion===app && app===guard) pass(`release versions are consistent: ${currentVersion}`); else fail(`release version mismatch: package=${currentVersion} app=${app} guard=${guard}`);
const pkg=JSON.parse(fs.readFileSync(path.join(uploadDir,'package.json'),'utf8'));
if(pkg.scripts?.test==='npm run test:release' && pkg.scripts?.['test:release']?.includes('release_artifact_guard.js')) pass('quality and artifact gates are connected through npm scripts'); else fail('quality and artifact gates are not connected through npm scripts');
for(const required of ['dev_guard.js','mutation_guard.js','feature_coverage_gate.js','feature_depth_gate.js','functional_outcome_gate.js','FUNCTIONAL_OUTCOME_MATRIX.json','EVIDENCE_REUSE_POLICY.json','evidence_reuse_gate.js','FEATURE_COVERAGE.json','RELEASE_TEST_GATE.md','QUALITY_CONTRACT.md','OPERATION_CONTRACT.md','RELEASE_ASSET_MANIFEST.json']) { if(fs.existsSync(path.join(uploadDir,required))) pass(`required quality asset present: ${required}`); else fail(`required quality asset missing: ${required}`); }
const readme=fs.readFileSync(path.join(uploadDir,'README.md'),'utf8');
if(readme.includes(`**v${currentVersion}**`)||readme.includes(`# v${currentVersion}`)) pass('README declares current release version'); else fail('README does not declare current release version');
const unnecessaryFiles=fs.existsSync(unnecessaryDir)?walk(unnecessaryDir):[];
const hasChangelog=unnecessaryFiles.some(p=>path.basename(p)===`CHANGELOG_v${currentVersion.replaceAll('.','_')}.md`);
if(fs.existsSync(path.join(root,'アップロード不要'))) { if(hasChangelog) pass('current changelog is stored in アップロード不要'); else fail('current changelog is missing from アップロード不要'); } else pass('self-contained upload folder does not require historical changelog directory');
const top=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name);
if(top.length===0) pass('self-contained GitHub release folder has no required sibling directories'); else if(top.length===2&&top.includes('GitHubアップロード')&&top.includes('アップロード不要')) pass('release package has exactly two top-level directories'); else fail(`release package top-level structure is invalid: ${top.join(', ')}`);
if(!process.exitCode) console.log('Release artifact guard: PASS');
