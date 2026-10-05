#!/usr/bin/env node
const fs=require('fs'),cp=require('child_process'),path=require('path');
const root=__dirname, browser=process.env.CHROMIUM_BIN||'chromium';
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const gate=path.join(root,'diagnostic_runtime_gate.html');
try{cp.execFileSync(browser,['--version'],{stdio:'ignore',timeout:3000});}catch(e){console.error('DIAGNOSTIC-RUNTIME-GATE FAIL | browser unavailable');process.exit(1)}
const r=cp.spawnSync(browser,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--allow-file-access-from-files','--virtual-time-budget=5000','--dump-dom',`file://${gate}`],{encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});
if(r.error){console.error('DIAGNOSTIC-RUNTIME-GATE FAIL | '+r.error.message);process.exit(1)}
const dom=String(r.stdout||'');
const pass=/<div id="status">PASS<\/div>/.test(dom)||dom.includes('<div id="status">PASS</div>');
if(!pass){console.error('DIAGNOSTIC-RUNTIME-GATE FAIL');console.error(dom.slice(-6000));process.exit(1)}
console.log(`DIAGNOSTIC-RUNTIME-GATE PASS | release=${pkg.version} | browser=chromium | repair/audit/copy=verified`);
