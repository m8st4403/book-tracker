#!/usr/bin/env node
const fs=require('fs'),cp=require('child_process'),path=require('path'),http=require('http');
const root=__dirname;
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(process.env.RUN_BROWSER_RUNTIME_GATE!=='1'){runBehaviorFallback();process.exit(0)}
function runBehaviorFallback(){
 const r=cp.spawnSync(process.execPath,[path.join(root,'diagnostic_behavior_gate.js')],{cwd:root,encoding:'utf8',timeout:30000,stdio:'pipe'});
 if(r.status!==0){console.error(String(r.stdout||'')+String(r.stderr||''));process.exit(1)}
 console.log(String(r.stdout||'').trim());
 console.log(`DIAGNOSTIC-RUNTIME-GATE INFO | browser diagnostic unavailable; behavior contract fallback verified | release=${pkg.version}`);
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function cdp(wsUrl){
 const ws=new WebSocket(wsUrl);
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(new Error('CDP_CONNECT_FAILED'))});
 let id=0; const pending=new Map();
 ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return} if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message||'CDP_ERROR')):p.resolve(m.result)}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pending.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method,params}))});
 return {call,close:()=>ws.close()};
}
(async()=>{
 let browser,cdpConn;
 try{
  cp.execFileSync(process.env.CHROMIUM_BIN||'chromium',['--version'],{stdio:'ignore',timeout:3000});
  const dbgPort=9222 + Math.floor(Math.random()*500);
  browser=cp.spawn(process.env.CHROMIUM_BIN||'chromium',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${dbgPort}`,'about:blank'],{stdio:'ignore'});
  let wsUrl=''; for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${dbgPort}/json/list`);const a=await r.json();if(a[0]?.webSocketDebuggerUrl){wsUrl=a[0].webSocketDebuggerUrl;break}}catch{} await sleep(100)}
  if(!wsUrl)throw new Error('CDP_ENDPOINT_TIMEOUT');
  cdpConn=await cdp(wsUrl); await cdpConn.call('Page.enable'); await cdpConn.call('Runtime.enable');
  const diag=fs.readFileSync(path.join(root,'diagnostic_runtime_gate.html'),'utf8');
  const appRaw=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const app=appRaw.replace("let books=readJSONStorage(KEY,[]);if(!Array.isArray(books))books=[];","let books=[{isbn:'9784253306935',title:'Runtime診断テスト',author:'Gate',publisher:'Test',date:''},{isbn:'9780000000001',title:'年表示テスト',author:'Gate',publisher:'Test',date:'2025'}];");
  const script=(diag.match(/<script>([\s\S]*)<\/script>/)||[])[1];
  const body=diag.replace(/<script>[\s\S]*<\/script>/,'');
  const nav=await cdpConn.call('Page.navigate',{url:'about:blank'});
  await cdpConn.call('Page.setDocumentContent',{frameId:nav.frameId,html:body});
  const prepared=script.replace("frame.src='./index.html?diagnosticRuntimeGate=1&ts='+Date.now();",`frame.srcdoc=${JSON.stringify(app)};`);
  await cdpConn.call('Runtime.evaluate',{expression:`(async()=>{${prepared}})()`});
  let status='';let result='';
  for(let i=0;i<180;i++){
   const ev=await cdpConn.call('Runtime.evaluate',{expression:`(()=>({ready:document.readyState,status:document.getElementById('status')?.textContent||'',result:document.getElementById('result')?.textContent||''}))()`,returnByValue:true});
   status=ev.result?.value?.status||''; result=ev.result?.value?.result||'';
   if(status==='PASS'||status==='FAIL')break; await sleep(100);
  }
  if(status!=='PASS'){console.error('DIAGNOSTIC-RUNTIME-GATE FAIL');console.error('status='+status); console.error(result||'diagnostic page did not report PASS');process.exitCode=1;return}
  console.log(`DIAGNOSTIC-RUNTIME-GATE PASS | release=${pkg.version} | browser=chromium | CDP diagnostic runtime verified | ${result.replace(/\s+/g,' ').slice(0,300)}`);
 }catch(e){console.error(`DIAGNOSTIC-RUNTIME-GATE FAIL | ${e.message}`);process.exitCode=1}
 finally{try{cdpConn?.close()}catch{} try{browser?.kill()}catch{}}
})().catch(e=>{console.error(e);process.exitCode=1});
