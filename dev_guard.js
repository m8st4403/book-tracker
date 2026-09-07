#!/usr/bin/env node
/* Book Tracker v4.11.8 static development guard. Usage: node dev_guard.js index.html */
const fs=require('fs');
const path=require('path');
const target=process.argv[2]||'index.html';
const targetPath=path.resolve(target);
const baseDir=path.dirname(targetPath);
const s=fs.readFileSync(targetPath,'utf8');
const checks=[];
const add=(name,ok,detail='')=>checks.push({name,ok,detail});
const scripts=[...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const cp=require('child_process');
const tmp=[];
for(let i=0;i<scripts.length;i++){const f=`/tmp/book-tracker-script-${process.pid}-${i}.js`;fs.writeFileSync(f,scripts[i]);tmp.push(f);}
for(let i=0;i<tmp.length;i++){const r=cp.spawnSync(process.execPath,['--check',tmp[i]],{encoding:'utf8'});add(`JS構文 #${i+1}`,r.status===0,r.status===0?'OK':r.stderr.trim());}
for(const f of tmp)try{fs.unlinkSync(f)}catch{}
const ids=[...s.matchAll(/\bid=["']([^"']+)["']/gi)].map(m=>m[1]);
const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);add('重複ID',dup.length===0,dup.length?dup.join(', '):'OK');
const fn=[...s.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
const dupFn=fn.filter((x,i)=>fn.indexOf(x)!==i);add('重複した名前付きfunction',dupFn.length===0,dupFn.length?dupFn.join(', '):'OK');
add('localStorage.clear() 不使用',!/localStorage\.clear\s*\(/.test(s),'OK');
add('仕様ガードコメント',s.includes('[BOOK TRACKER / SPEC GUARD]'),'OK');
add('APP_VERSION 4.11.8',/const\s+APP_VERSION\s*=\s*["']4\.11\.8["']/.test(s),'OK');
add('DEMO_ENABLED 定義',/const\s+DEMO_ENABLED\s*=/.test(s),'OK');
add('正規登録関数',/window\.addBook\s*=/.test(s)&&/window\.bulkAdd\s*=/.test(s),'OK');
add('全選択は checkbox',/class="check selectAll" type="checkbox"/.test(s)&&/class="check similarAll" type="checkbox"/.test(s),'OK');
const direct=[...s.matchAll(/getMeta\([^\n;]+\)\.purchaseStatus\s*=\s*["'][^"']+["']/g)].map(m=>m[0]);
add('購入状態の直接代入を禁止',direct.length===0,direct.length?direct.join(' / '):'OK');
add('仕様文書',fs.existsSync(path.join(baseDir,'SPEC.md'))&&fs.existsSync(path.join(baseDir,'DEV_GUARD.md')),'SPEC.md / DEV_GUARD.md が必要');
add('filter reset wiring',s.includes('function resetLibraryFilters')&&s.includes('filterReading')&&s.includes('filterFavorite')&&s.includes('if(input)input.value=""'),'OK');
add('library sort wiring',/function\s+compareLibraryItems\s*\(/.test(s)&&/a\.sort\(compareLibraryItems\)/.test(s)&&/grouped\.sort\(/.test(s),'OK');
add('bare-number volume parsing',s.includes('function volumeNo')&&s.includes('(?:巻|集)?$'),'OK');
add('runtime regression tests',/REG-001: filter reset/.test(s)&&/REG-002: sort/.test(s)&&/REG-003: titles ending in bare numbers/.test(s)&&/REG-004: compact library stats/.test(s)&&/REG-005: long titles\/series headers/.test(s)&&/REG-006: summary opens/.test(s),'REG-001〜006');
add('v4.11.8 feature wiring',/renderSeriesLibraryGroup/.test(s)&&/toggleLibraryReading/.test(s)&&/toggleLibraryFavorite/.test(s)&&/deleteLibraryStatus/.test(s)&&/library-select/.test(s)&&/series-title-name/.test(s),'シリーズ循環・ステータスタップ・サムネイル選択位置');
add('visual baseline guard',/v4.11.8 feature additions; v4.11.3 remains the visual baseline/.test(s),'v4.11.3基準を明記');
add('library stats compact',/library-stats\.is-compact/.test(s)&&/updateLibraryStatsCompact/.test(s),'初期2列→スクロール時5列固定');
const failed=checks.filter(x=>!x.ok);
for(const x of checks)console.log(`${x.ok?'PASS':'FAIL'} ${x.name}${x.detail?' — '+x.detail:''}`);
process.exitCode=failed.length?1:0;
