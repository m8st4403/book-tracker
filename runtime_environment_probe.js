#!/usr/bin/env node
const fs=require('fs'),cp=require('child_process'),path=require('path');
const root=__dirname;
const timeoutMs=10000;
function result(status,reason,detail={}){
  const out={schema:1,release:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,status,reason,timeoutMs,...detail};
  console.log(JSON.stringify(out,null,2));
  process.exit(status==='PASS'?0:status==='UNAVAILABLE'?3:1);
}
const browser=process.env.CHROMIUM_BIN||'chromium';
try{cp.execFileSync(browser,['--version'],{encoding:'utf8',timeout:3000});}
catch(e){return result('UNAVAILABLE','BROWSER_NOT_EXECUTABLE',{browser,error:String(e.message||e)});}
const probe='about:blank';
const started=Date.now();
try{
  const r=cp.spawnSync(browser,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--dump-dom',probe],{encoding:'utf8',timeout:timeoutMs,maxBuffer:1024*1024});
  if(r.error?.code==='ETIMEDOUT') return result('UNAVAILABLE','BROWSER_STARTUP_TIMEOUT',{elapsedMs:Date.now()-started,stderrTail:String(r.stderr||'').slice(-1200)});
  if(r.status!==0) return result('FAIL','BROWSER_PROBE_FAILED',{elapsedMs:Date.now()-started,exitCode:r.status,signal:r.signal||null,stderrTail:String(r.stderr||'').slice(-1200)});
  if(!String(r.stdout||'').includes('<html')) return result('FAIL','BROWSER_PROBE_INVALID_OUTPUT',{elapsedMs:Date.now()-started,stdoutTail:String(r.stdout||'').slice(-500)});
  return result('PASS','BROWSER_READY',{elapsedMs:Date.now()-started});
}catch(e){return result('UNAVAILABLE','BROWSER_PROBE_EXCEPTION',{elapsedMs:Date.now()-started,error:String(e.message||e)});}
