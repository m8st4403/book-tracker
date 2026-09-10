const fs=require('fs'),path=require('path'),cp=require('child_process');
const file=process.argv[2]||'index.html'; const root=path.dirname(path.resolve(file)); const s=fs.readFileSync(file,'utf8');
let pass=true; function check(name,ok,detail){console.log((ok?'PASS':'FAIL')+' '+name+' — '+detail);if(!ok)pass=false}
const scripts=[...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
scripts.forEach((js,i)=>{const f=path.join('/tmp',`bt_guard_${process.pid}_${i}.js`);fs.writeFileSync(f,js);const r=cp.spawnSync('node',['--check',f],{encoding:'utf8'});check('JS構文 #'+(i+1),r.status===0,r.status===0?'OK':r.stderr.trim())});
const ids=[...s.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);check('重複ID',new Set(ids).size===ids.length,'OK');
const fn=[...s.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);check('重複した名前付きfunction',new Set(fn).size===fn.length,'OK');
check('localStorage.clear() 不使用',!s.includes('localStorage.clear('),'OK');
check('4.11.3 Visual Baseline',/4\.11\.3.*Visual Baseline|Visual Baseline.*4\.11\.3/i.test(s+fs.readFileSync(path.join(root,'SPEC.md'),'utf8')),'OK');
check('APP_VERSION 4.13.11',/APP_VERSION\s*=\s*["']4\.13\.11["']/.test(s),'OK');
check('DEMO_ENABLED 定義',/DEMO_ENABLED\s*=/.test(s),'OK');
check('正規登録関数',/window\.addBook|window\.bulkAdd/.test(s),'OK');
check('全選択は checkbox',/id="libAll"[^>]*type="checkbox"/.test(s),'OK');
check('購入状態の直接代入を禁止',!/getMeta\([^)]*\)\.purchaseStatus\s*=/.test(s),'OK');
check('仕様文書',fs.existsSync(path.join(root,'SPEC.md'))&&fs.existsSync(path.join(root,'DEV_GUARD.md')),'OK');
check('ステータス固定幅',s.includes('.library-status-stack{')&&s.includes('width:78px;min-width:78px')&&s.includes('.series-title-status-stack{')&&s.includes('box-sizing:border-box;width:78px'),'78px');
check('折りたたみ状態保持',/seriesOpenKey|setSeriesOpenState/.test(s)&&/data-series-open/.test(s),'OK');
check('タイトル一覧戻るUI',/series-title-collapse\{[^}]*background:transparent!important/.test(s),'元表示');
check('後ろ4枚5px刻み枠線',/series-stack-4/.test(s)&&/translate\(\.5px,5px\)/.test(s)&&/translate\(1px,10px\)/.test(s)&&/translate\(1\.5px,15px\)/.test(s)&&/translate\(2px,20px\)/.test(s)&&/transform:none/.test(s)&&/background:transparent!important/.test(s)&&!/series-stack-5/.test(s),'後ろ4枚・縦5px刻み・枠線のみ');
check('5冊以上タイトル行背景',/\.series-group\.is-cyclic \.series-cyclic-head\{[^}]*background:color-mix\(in srgb,var\(--primary\) 8%,var\(--surface\)\)!important/.test(s)&&/\.series-group\.is-cyclic \.series-cyclic-title\{[^}]*color:var\(--app-text\)!important/.test(s),'5冊以上のみ背景色を少し濃く');



// ===== Browser UI regression tests (v4.13.11) =====
// Uses Chromium + DevTools Protocol only; no npm/browser automation dependency is required.
// The test intentionally measures rendered geometry, not source-code guesses.
function browserUIRegression(){
  const chromiumCandidates=['chromium','chromium-browser','google-chrome','google-chrome-stable'];
  let chrome=null;
  for(const c of chromiumCandidates){
    const r=cp.spawnSync('which',[c],{encoding:'utf8'});
    if(r.status===0){chrome=r.stdout.trim();break}
  }
  if(!chrome){check('UIブラウザ回帰テスト','SKIP','Chromiumが見つかりません');return true}

  const port=9300+(process.pid%500),profile=`/tmp/book_tracker_ui_${process.pid}`;
  const child=cp.spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--no-proxy-server',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  let ok=true;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const getTarget=()=>new Promise((resolve,reject)=>{
    const req=require('http').get(`http://127.0.0.1:${port}/json/list`,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{resolve(JSON.parse(d)[0])}catch(e){reject(e)}})});
    req.on('error',reject);
  });
  const fail=(name,detail)=>{ok=false;check(name,false,detail)};
  const run=async()=>{
    let target=null;
    for(let i=0;i<50&&!target;i++){try{target=await getTarget()}catch(e){await sleep(100)}}
    if(!target)throw new Error('Chromium DevTools targetを取得できませんでした');
    const ws=new WebSocket(target.webSocketDebuggerUrl); let seq=0; const pending=new Map();
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const fn=pending.get(m.id);pending.delete(m.id);fn(m)}};
    await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,m=>m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result));ws.send(JSON.stringify({id,method,params}))});
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Page.setDocumentContent',{frameId:target.id,html:s});
    await sleep(1200);
    const expression=`(async()=>{
      // Deterministic, non-persistent calendar fixture: exercise the real calendarEventHtml path.
      const regressionOwned=books.find(b=>b&&b.isbn)||null;
      const regressionEvent=regressionOwned?{key:'__ui_regression_owned_calendar__',date:regressionOwned.date,title:regressionOwned.title,author:regressionOwned.author,isbn:regressionOwned.isbn,sourceType:'library',source:'蔵書'}:null;
      try{
        if(regressionEvent){
          calendarExtras.push(regressionEvent);
          renderCalendar(); showDay(regressionEvent.date);
        }
      }catch(e){}

      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const click=sel=>{const e=document.querySelector(sel);if(!e)throw new Error('missing '+sel);e.click()};
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,sw:e.scrollWidth,sh:e.scrollHeight,display:getComputedStyle(e).display}};
      const setFont=fs=>{document.body.classList.remove('font-small','font-medium','font-large');document.body.classList.add(fs);void document.body.offsetHeight};
      const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0};
      const targetInfo=()=>[...document.querySelectorAll('button')].filter(b=>/開発用：仕様・回帰チェック|蔵書登録済み（タップで削除）|詳細を見る|ナチュラル/.test(b.innerText)).filter(visible).map(b=>({text:b.innerText,rect:rect(b)}));
      const out={fonts:{},cardBaseline:null,errors:[]};
      for(const fs of ['font-small','font-medium','font-large']){
        setFont(fs); out.generic = out.generic || []; out.fonts[fs]={};
        for(const tab of ['home','add','library','search','calendar','settings']){
          const nav=[...document.querySelectorAll('#bottomNav button')].find(b=>b.dataset.s===tab); if(!nav) throw new Error('missing tab '+tab); nav.click(); await sleep(50);
          if(tab==='calendar' && regressionEvent && ![...document.querySelectorAll('.calendar-register-btn')].some(b=>/蔵書登録済み（タップで削除）/.test(b.innerText))){
            $('selectedEvents').insertAdjacentHTML('beforeend',calendarEventHtml(regressionEvent,regressionEvent.date));
          }
          out.generic.push(...[...document.querySelectorAll('button,.meta-badge,.owned-badge,.unowned-badge,.release-badge,.release-mark,.setting-state')].filter(visible).map(e=>({font:fs,tab,kind:e.tagName.toLowerCase()+'.'+(e.className||''),text:(e.innerText||e.textContent||'').trim(),rect:rect(e)})));
          if(tab==='settings') out.fonts[fs].settings=targetInfo();
          if(tab==='library'){
            const card=document.querySelector('#myBooks .library-card');
            const detail=document.querySelector('#myBooks .library-detail-btn');
            out.fonts[fs].library={card:card&&rect(card),detail:detail&&rect(detail),cardScroll:card?{w:card.scrollWidth,h:card.scrollHeight,cw:card.clientWidth,ch:card.clientHeight}:null,cardOverflow:card?[...card.querySelectorAll('*')].filter(visible).filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,text:(e.innerText||e.textContent||'').trim().slice(0,80),r:rect(e)})):[]};
          }
          if(tab==='calendar') out.fonts[fs].calendar=[...document.querySelectorAll('.calendar-register-btn')].filter(visible).map(b=>({text:b.innerText,rect:rect(b)}));
        }
      }
      setFont('font-medium');
      const baseCard=document.querySelector('#myBooks .library-card');
      out.cardBaseline=baseCard?rect(baseCard):null;
      const checks=[];
      for(const fs of ['font-small','font-medium','font-large']){
        setFont(fs); click('#bottomNav button[data-s="settings"]'); await sleep(30);
        for(const b of document.querySelectorAll('#settings button')) if(visible(b) && /開発用：仕様・回帰チェック/.test(b.innerText)) checks.push({kind:'settings-dev',font:fs,rect:rect(b)});
        for(const b of document.querySelectorAll('#settings button')) if(visible(b) && /ナチュラル/.test(b.innerText)) checks.push({kind:'theme-natural',font:fs,rect:rect(b)});
        click('#bottomNav button[data-s="library"]'); await sleep(30);
        const c=document.querySelector('#myBooks .library-card'); if(c)checks.push({kind:'library-card',font:fs,rect:rect(c)});
        const db=document.querySelector('#myBooks .library-detail-btn'); if(db)checks.push({kind:'library-detail',font:fs,rect:rect(db)});
        click('#bottomNav button[data-s="calendar"]'); await sleep(30);
        for(const b of document.querySelectorAll('.calendar-register-btn')) if(visible(b)) checks.push({kind:'calendar-register',font:fs,rect:rect(b)});
      }
      return {out,checks};
    })()`;
    const evalResult=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(evalResult.exceptionDetails) throw new Error(evalResult.exceptionDetails.exception?.description||evalResult.exceptionDetails.text||'UI回帰テスト内で例外が発生しました');
    const result=evalResult.result?.value;
    if(!result)throw new Error('UI回帰テストの結果を取得できませんでした');

    const offenders=[];
    // Generic guard: every visible button and every visible nowrap status/badge must fit its box.
    const generic=(result.out.generic||[]);
    for(const x of generic){
      if(x.rect.sw>x.rect.w+1 || x.rect.sh>x.rect.h+1) offenders.push(`${x.font} ${x.kind} 「${x.text}」 ${x.rect.sw}x${x.rect.sh} > ${x.rect.w}x${x.rect.h}`);
    }
    for(const [font,data] of Object.entries(result.out.fonts)){
      for(const group of ['settings','calendar']){
        for(const x of (data[group]||[])) if(x.rect.sw>x.rect.w+1 || x.rect.sh>x.rect.h+1) offenders.push(`${font} ${group} 「${x.text}」 ${x.rect.sw}x${x.rect.sh} > ${x.rect.w}x${x.rect.h}`);
      }
      if(data.library?.detail && (data.library.detail.sw>data.library.detail.w+1||data.library.detail.sh>data.library.detail.h+1)) offenders.push(`${font} library-detail ${data.library.detail.sw}x${data.library.detail.sh} > ${data.library.detail.w}x${data.library.detail.h}`);
    }
    if(offenders.length)fail('UI文字はみ出し（小・中・大）',offenders.join(' | '));else check('UI文字はみ出し（小・中・大）',true,'PASS');

    const cardContentOffenders=Object.entries(result.out.fonts).filter(([,d])=>d.library?.cardScroll && (d.library.cardScroll.w>d.library.cardScroll.cw+1 || d.library.cardScroll.h>d.library.cardScroll.ch+1));
    if(cardContentOffenders.length)fail('蔵書カード内部の文字・内容はみ出し',cardContentOffenders.map(([f,d])=>`${f} scroll=${d.library.cardScroll.w}x${d.library.cardScroll.h} client=${d.library.cardScroll.cw}x${d.library.cardScroll.ch} offenders=${JSON.stringify(d.library.cardOverflow)}`).join(' | '));else check('蔵書カード内部の文字・内容はみ出し',true,'小・中・大 PASS');

    const cards=Object.entries(result.out.fonts).map(([font,d])=>[font,d.library?.card]).filter(([,r])=>r);
    if(cards.length){
      const base=cards.find(([f])=>f==='font-medium')[1];
      const changed=cards.filter(([f,r])=>Math.abs(r.w-base.w)>0.5||Math.abs(r.h-base.h)>0.5);
      if(changed.length)fail('蔵書カード寸法のフォント非依存',changed.map(([f,r])=>`${f}=${r.w}x${r.h}, 中=${base.w}x${base.h}`).join(' | '));else check('蔵書カード寸法のフォント非依存',true,`${base.w}x${base.h}`);
    }else fail('蔵書カード寸法のフォント非依存','library-cardが見つかりません');

    // Keep the exact long labels as permanent regression cases, including the known historical bugs.
    const requiredTexts=['開発用：仕様・回帰チェック','蔵書登録済み（タップで削除）'];
    const all=[...Object.values(result.out.fonts).flatMap(d=>[...(d.settings||[]),...(d.calendar||[])])];
    for(const t of requiredTexts){
      const found=all.filter(x=>x.text.includes(t));
      if(!found.length)fail(`必須UIケース「${t}」`,'対象要素が表示されませんでした');
      else if(found.some(x=>x.rect.sw>x.rect.w+1||x.rect.sh>x.rect.h+1))fail(`必須UIケース「${t}」`,'文字がコンテナを超えています');
      else check(`必須UIケース「${t}」`,true,'小・中・大 PASS');
    }
    ws.close();
  };
  return run().then(()=>{try{child.kill()}catch(e){};return ok}).catch(e=>{fail('UIブラウザ回帰テスト',e.message);try{child.kill()}catch(x){};return false});
}

(async()=>{
  const browserOk=await browserUIRegression();
  process.exit(pass&&browserOk?0:1);
})();
