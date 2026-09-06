#!/usr/bin/env node
/* Book Tracker v4.10.0 static development guard. Usage: node dev_guard.js index.html */
const fs=require('fs');
const path=process.argv[2]||'index.html';
const s=fs.readFileSync(path,'utf8');
const checks=[];
const add=(name,ok,detail='')=>checks.push({name,ok,detail});
const scripts=[...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const tmp=[];
for(let i=0;i<scripts.length;i++){const f=`/tmp/book-tracker-script-${process.pid}-${i}.js`;fs.writeFileSync(f,scripts[i]);tmp.push(f);}
const cp=require('child_process');
for(let i=0;i<tmp.length;i++){const r=cp.spawnSync(process.execPath,['--check',tmp[i]],{encoding:'utf8'});add(`JS構文 #${i+1}`,r.status===0,r.status===0?'OK':r.stderr.trim());}
for(const f of tmp)try{fs.unlinkSync(f)}catch{}
const ids=[...s.matchAll(/\bid=["']([^"']+)["']/gi)].map(m=>m[1]);
const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);add('重複ID',dup.length===0,dup.length?dup.join(', '):'OK');
const fn=[...s.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
const dupFn=fn.filter((x,i)=>fn.indexOf(x)!==i);add('重複した名前付きfunction',dupFn.length===0,dupFn.length?dupFn.join(', '):'OK');
add('localStorage.clear() 不使用',!/localStorage\.clear\s*\(/.test(s),'OK');
add('仕様ガードコメント',s.includes('[BOOK TRACKER / SPEC GUARD]'),'不足');
add('APP_VERSION 4.10.0',/const\s+APP_VERSION=["']4\.10\.0["']/.test(s),'不足');
add('DEMO_ENABLED 定義',/const\s+DEMO_ENABLED\s*=/.test(s),'不足');
add('正規登録関数',/window\.addBook\s*=/.test(s)&&/window\.bulkAdd\s*=/.test(s),'不足');
add('全選択は checkbox',/class="check selectAll" type="checkbox"/.test(s)&&/class="check similarAll" type="checkbox"/.test(s),'不足');
const direct=[...s.matchAll(/getMeta\([^\n;]+\)\.purchaseStatus\s*=\s*["'][^"']+["']/g)].map(m=>m[0]);
add('購入状態の直接代入を禁止',direct.length===0,direct.length?direct.join(' / '):'OK');
add('仕様文書',fs.existsSync('SPEC.md')&&fs.existsSync('DEV_GUARD.md'),'SPEC.md / DEV_GUARD.md が必要');
const failed=checks.filter(x=>!x.ok);
for(const x of checks)console.log(`${x.ok?'PASS':'FAIL'} ${x.name}${x.detail?' — '+x.detail:''}`);
process.exitCode=failed.length?1:0;
