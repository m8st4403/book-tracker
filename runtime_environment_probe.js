#!/usr/bin/env node
const fs=require('fs'),cp=require('child_process'),path=require('path');
const root=__dirname;
const timeoutMs=20000;
function result(status,reason,detail={}){
  const out={schema:1,release:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,status,reason,timeoutMs,...detail};
  console.log(JSON.stringify(out,null,2));
  process.exit(status==='PASS'?0:status==='UNAVAILABLE'?3:1);
}
const browser=process.env.CHROMIUM_BIN||'chromium';
const port=9239;
function probeCdp(){
  return new Promise((resolve,reject)=>{
    const http=require('http');
    const req=http.get({host:'127.0.0.1',port,path:'/json/version'},res=>{
      let data=''; res.on('data',c=>data+=c); res.on('end',()=>{
        if(res.statusCode===200 && /webSocketDebuggerUrl/.test(data)) resolve(data); else reject(new Error('CDP_ENDPOINT_INVALID'));
      });
    });
    req.on('error',reject); req.setTimeout(1500,()=>{req.destroy();reject(new Error('CDP_ENDPOINT_TIMEOUT'))});
  });
}
const launchArgs=['--headless=new','--disable-gpu','--in-process-gpu','--no-sandbox','--disable-dev-shm-usage','--no-proxy-server','--proxy-server=direct://','--proxy-bypass-list=*','--disable-features=BlockInsecurePrivateNetworkRequests',`--remote-debugging-port=${port}`,'--user-data-dir=/tmp/book-tracker-runtime-probe-'+process.pid,'about:blank'];
try{cp.execFileSync(browser,['--version'],{encoding:'utf8',timeout:3000});}
catch(e){return result('UNAVAILABLE','BROWSER_NOT_EXECUTABLE',{browser,error:String(e.message||e)});}
const started=Date.now();
const child=cp.spawn(browser,launchArgs,{stdio:'ignore'});
let timer;
(async()=>{
  try{
    for(let i=0;i<40;i++){
      try{const info=await probeCdp(); clearTimeout(timer); try{child.kill('SIGKILL')}catch{} return result('PASS','BROWSER_READY',{elapsedMs:Date.now()-started,cdp:true});}
      catch(e){await new Promise(r=>setTimeout(r,500));}
    }
    try{child.kill('SIGKILL')}catch{}
    return result('UNAVAILABLE','BROWSER_STARTUP_TIMEOUT',{elapsedMs:Date.now()-started,stderrTail:'Chromium did not expose CDP within 20s'});
  }catch(e){try{child.kill('SIGKILL')}catch{};return result('UNAVAILABLE','BROWSER_PROBE_EXCEPTION',{elapsedMs:Date.now()-started,error:String(e.message||e)});}
})();
