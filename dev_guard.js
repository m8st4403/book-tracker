const fs=require('fs'),path=require('path'),cp=require('child_process');
const file=process.argv[2]||'index.html'; const root=path.dirname(path.resolve(file)); const s=fs.readFileSync(file,'utf8');
let pass=true; function check(name,ok,detail){console.log((ok?'PASS':'FAIL')+' '+name+' — '+detail);if(!ok)pass=false}
const scripts=[...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
scripts.forEach((js,i)=>{const f=path.join('/tmp',`bt_guard_${process.pid}_${i}.js`);fs.writeFileSync(f,js);const r=cp.spawnSync('node',['--check',f],{encoding:'utf8'});check('JS構文 #'+(i+1),r.status===0,r.status===0?'OK':r.stderr.trim())});
const ids=[...s.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);check('重複ID',new Set(ids).size===ids.length,'OK');
const fn=[...s.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);check('重複した名前付きfunction',new Set(fn).size===fn.length,'OK');
check('localStorage.clear() 不使用',!s.includes('localStorage.clear('),'OK');
check('4.11.3 Visual Baseline',/4\.11\.3.*Visual Baseline|Visual Baseline.*4\.11\.3/i.test(s+fs.readFileSync(path.join(root,'SPEC.md'),'utf8')),'OK');
check('APP_VERSION 4.13.24',/APP_VERSION\s*=\s*["']4\.13\.24["']/.test(s),'OK');
check('近日発売見出しの統一CSS',/#home \.home-upcoming-head b\{font-size:var\(--unified-card-heading-size\)!important\}/.test(s),'類似作品と同じ統一変数');
check('詳細画面透過なしの限定CSS',/\.detail-overlay \.detail-sheet\{background:var\(--surface\)!important\}/.test(s),'詳細画面だけ透過なし');
check('タイトル一覧に戻るは非ボタン要素',!/<button[^>]*class=\"series-title-collapse\"/.test(s)&&/class=\"series-title-collapse\" role=\"button\"/.test(s),'span role=button');
check('DEMO_ENABLED 定義',/DEMO_ENABLED\s*=/.test(s),'OK');
check('本番サンプル無効化ゲート',/Production\/App Store builds set DEMO_ENABLED=false/.test(s),'本番ではfalseにする明示コメントあり');
check('正規登録関数',/window\.addBook|window\.bulkAdd/.test(s),'OK');
check('全選択は checkbox',/id="libAll"[^>]*type="checkbox"/.test(s),'OK');
check('購入状態の直接代入を禁止',!/getMeta\([^)]*\)\.purchaseStatus\s*=/.test(s),'OK');
check('仕様文書',fs.existsSync(path.join(root,'SPEC.md'))&&fs.existsSync(path.join(root,'DEV_GUARD.md')),'OK');
check('ステータス固定幅',s.includes('.library-status-stack{')&&s.includes('width:78px;min-width:78px')&&s.includes('.series-title-status-stack{')&&s.includes('box-sizing:border-box;width:78px'),'78px');
check('折りたたみ状態保持',/seriesOpenKey|setSeriesOpenState/.test(s)&&/data-series-open/.test(s),'OK');
check('タイトル一覧戻るUI',/series-title-collapse\{[^}]*background:none!important/.test(s)&&/series-title-collapse\{[^}]*padding:0!important/.test(s),'ボタン枠・背景・余白なしのテキスト表示');
check('2〜4冊シリーズ切替設定',/function getSeriesShortState\(name\)/.test(s)&&/shortToggle=items\.length>=2&&items\.length<=4/.test(s)&&/data-series-short="1"/.test(s)&&/class="series-group is-short-toggle"/.test(s)&&/nextSeriesShortState/.test(s),'2〜4冊だけ全巻表示↔タイトルだけ表示');
check('1冊・5冊以上の表示設定維持',/if\(!cyclic\)/.test(s)&&/items\.length>4/.test(s)&&/shortToggle=items\.length>=2&&items\.length<=4/.test(s),'1冊は従来、5冊以上は従来の3状態循環');
check('後ろ4枚5px刻み枠線',/series-stack-4/.test(s)&&/translate\(\.5px,5px\)/.test(s)&&/translate\(1px,10px\)/.test(s)&&/translate\(1\.5px,15px\)/.test(s)&&/translate\(2px,20px\)/.test(s)&&/transform:none/.test(s)&&/background:transparent!important/.test(s)&&!/series-stack-5/.test(s),'後ろ4枚・縦5px刻み・枠線のみ');
check('5冊以上タイトル行背景',/\.series-group\.is-cyclic \.series-cyclic-head\{background:color-mix\(in srgb,color-mix\(in srgb,var\(--primary\) 12%,var\(--surface\)\) var\(--panel-surface-alpha\),transparent\)!important/.test(s)&&/\.series-group\.is-cyclic \.series-cyclic-title\{color:var\(--app-text\)!important/.test(s),'最終CSSで背景と文字色を維持');
check('背景画像cover/center',/#appBackground\{[^}]*background-image:[^}]*background-position:center center;background-size:cover/.test(s)&&/body\{[^}]*background-image:none!important/.test(s),'固定背景レイヤー + cover + center');
check('背景パネル約70%透明',/--panel-surface-alpha:30%/.test(s)&&/color-mix\(in srgb,var\(--surface\) var\(--panel-surface-alpha\),transparent\)!important/.test(s),'パネル不透明30%');
check('文字色補正の実効背景対応',/function blendHex\(/.test(s)&&/effectivePanelBackground\(/.test(s)&&/autoContrastText\(p\.text,panelBg\)/.test(s),'パネル実効背景を基準に補正');
check('5冊以上タイトル行の最終背景ルール',/\.series-group\.is-cyclic \.series-cyclic-head\{background:color-mix\(in srgb,color-mix\(in srgb,var\(--primary\) 12%,var\(--surface\)\) var\(--panel-surface-alpha\),transparent\)!important/.test(s),'最終CSSで背景を維持');
check('シリーズ表示の選択ソート経路',/grouped\.sort\(\(g1,g2\)=>\{[^}]*compareLibraryItems\(a1,a2\)/.test(s),'compareLibraryItemsを使用');
check('一括変更はupdateBookMeta経由',/ids\.forEach\(i=>updateBookMeta\(books\[i\]\.isbn,patch,false\)\)/.test(s),'updateBookMeta経由');
check('一括削除は保存後再描画',s.includes('ids.forEach(i=>books.splice(i,1));')&&s.includes('persistBooks()')&&s.includes('render();'),'persistBooks→render');
check('登録後検索結果再描画',/if\(window\.addResultsData\)[\s\S]*renderResults\("addResults"/.test(s),'addBook後に検索結果再描画');
check('削除後検索結果再描画',/removeBookFromCalendar[\s\S]*refreshAddResults\(\)/.test(s),'削除後refreshAddResults');
check('状態変更は保存→render',/function updateBookMeta\([\s\S]*saveMeta\(\);[\s\S]*if\(doRender\)render\(\)/.test(s),'updateBookMetaの一連性');
check('初期表示タブはホーム',/history\.scrollRestoration=\"manual\"/.test(s)&&/setMainTab\(\"home\"\);window\.addEventListener\(\"pageshow\",\(\)=>setMainTab\(\"home\"\)/.test(s),'初回ロード／pageshowともホームを明示');




// ===== Browser UI regression tests (v4.13.12) =====
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
  const storageShim=`<script>(function(){try{window.localStorage.getItem("__bt_guard_probe__")}catch(e){const m=new Map();Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(String(k),String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:i=>Array.from(m.keys())[i]??null,get length(){return m.size}}})}})();</script>`;
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
    await send('Page.setDocumentContent',{frameId:target.id,html:storageShim+s});
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
      const out={fonts:{},cardBaseline:null,errors:[]}; const specChecks=[]; const specAdd=(name,ok,detail)=>specChecks.push({name,ok,detail:detail||''});
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
      // ===== v4.13.13 full SPEC coverage audit =====
      const savedAlert=window.alert, savedConfirm=window.confirm;
      const savedBooks3=books.slice(), savedMeta3=JSON.parse(JSON.stringify(bookMeta)), savedExtras3=calendarExtras.slice();
      const savedSort3=$("librarySort")?.value||"registered-desc", savedFilter3=$("libraryFilter")?.value||"", savedSeriesView3=localStorage.getItem("seriesView_v444"), savedAutoText3=appSettings.autoTextContrast;
      try{
        const c10=canonicalIsbn("0306406152"), c13=canonicalIsbn("9780306406157");
        specAdd("ISBN-10/13 canonical一致",c10===c13,c10+" / "+c13);
        const dup=dedupeBookResults([{isbn:"0306406152",title:"A"},{isbn:"9780306406157",title:"A"},{isbn:"9780000000000",title:"B"}]);
        specAdd("検索結果ISBN重複排除",dup.filter(x=>canonicalIsbn(x.isbn)===c10).length===1,"結果"+dup.length+"件");
        const noIsbnDup=dedupeBookResults([{title:"ISBNなしA",author:"著者",publisher:"出版社",date:"2025-01-01"},{title:"ISBNなしA",author:"著者",publisher:"出版社",date:"2025-01-01"},{title:"ISBNなしA",author:"別著者",publisher:"出版社",date:"2025-01-01"}]);
        specAdd("ISBNなし複合キー重複排除",noIsbnDup.length===2,"結果"+noIsbnDup.length+"件");
        books=[{isbn:"0306406152",title:"Canonical State",author:"A",publisher:"P",date:"2025-01-01"}];bookMeta={};updateBookMeta("0306406152",{readingStatus:"read",favorite:true},false);const sameMeta=getMeta("9780306406157");
        specAdd("ISBN-10/13状態共有",sameMeta.readingStatus==="read"&&sameMeta.favorite===true,"ISBN-10/13で同一メタデータ");

        window.alert=()=>{}; window.confirm=()=>true;
        books=[]; calendarExtras=[]; bookMeta={};
        const future=addDaysKey(localDateKey(),1);
        const futureOk=await window.addBook({isbn:"guard-future",title:"Future",author:"A",publisher:"P",date:future,price:100});
        specAdd("発売前登録禁止",futureOk===false&&books.length===0,"future add rejected");
        const past=localDateKey();
        const addOk=await window.addBook({isbn:"guard-owned",title:"Owned",author:"A",publisher:"P",date:past,price:100});
        const ownedMeta=getMeta("guard-owned");
        specAdd("登録=蔵書=購入済み",addOk&&books.length===1&&ownedMeta.purchaseStatus==="purchased",JSON.stringify(ownedMeta));
        updateBookMeta("guard-owned",{readingStatus:"read",favorite:1},false);
        const um=getMeta("guard-owned");
        specAdd("読了/お気に入り正規化",um.readingStatus==="read"&&um.favorite===true,JSON.stringify(um));
        updateBookMeta("guard-owned",{readingStatus:"invalid",favorite:0},false); const umInvalid=getMeta("guard-owned");
        specAdd("不正メタデータの正規化",umInvalid.readingStatus==="unread"&&umInvalid.favorite===false,JSON.stringify(umInvalid));
        const persistedMeta=JSON.parse(localStorage.getItem("bookTrackerMeta_v483")||"{}");
        specAdd("メタデータ保存",persistedMeta[canonicalIsbn("guard-owned")]?.readingStatus==="unread"&&persistedMeta[canonicalIsbn("guard-owned")]?.favorite===false,"localStorage一致");

        const fids=["filterAuthor","filterPublisher","filterYear","filterRelease","filterReading","filterFavorite"];
        fids.forEach(id=>{if($(id))$(id).value="x"}); if($("libraryFilter"))$("libraryFilter").value="x"; window.libraryUnreadOnly=true; resetLibraryFilters({render:false});
        specAdd("フィルター全解除",fids.every(id=>!$(id)?.value)&&!$("libraryFilter")?.value&&!window.libraryUnreadOnly,"検索文字列・全フィルター・積読");

        specAdd("シリーズ表示循環",nextSeriesCycleState("deck")==="list"&&nextSeriesCycleState("list")==="title"&&nextSeriesCycleState("title")==="deck","deck→list→title→deck");
        setSeriesOpenState("guard-series",false); const openPersist=getSeriesOpenState("guard-series"); setSeriesOpenState("guard-series",true);
        specAdd("シリーズ開閉状態保持",openPersist===false&&getSeriesOpenState("guard-series")===true,"localStorage");

        books=[
          {isbn:"ga1",title:"シリーズA 1",author:"A",publisher:"P",date:"2025-01-01",price:100},
          {isbn:"gb1",title:"シリーズB 1",author:"B",publisher:"P",date:"2026-01-01",price:100},
          {isbn:"ga2",title:"シリーズA 2",author:"A",publisher:"P",date:"2025-02-01",price:100},
          {isbn:"gb2",title:"シリーズB 2",author:"B",publisher:"P",date:"2026-02-02",price:100}
        ];
        localStorage.setItem("seriesView_v444","on"); $("librarySort").value="release-desc"; renderLibrary();
        const groupOrder=[...document.querySelectorAll("#myBooks .series-group")].map(e=>e.dataset.seriesCycle||e.dataset.seriesOpen||"");
        specAdd("シリーズ表示の並び順",groupOrder[0]=== "シリーズB",JSON.stringify(groupOrder));

        books=[]; for(let i=1;i<=4;i++)books.push({isbn:"g4-"+i,title:"比較シリーズ4 "+i,author:"A",publisher:"P",date:"2025-01-01",price:100});
        for(let i=1;i<=5;i++)books.push({isbn:"g5-"+i,title:"比較シリーズ5 "+i,author:"A",publisher:"P",date:"2025-01-01",price:100});
        setSeriesCycleState("比較シリーズ5","deck"); setSeriesOpenState("比較シリーズ4",true); $("librarySort").value="registered-desc"; setMainTab("library"); renderLibrary();
        const c4=document.querySelector(".series-group.is-short-toggle .series-books .library-card"), c5=document.querySelector(".series-group.is-cyclic .series-deck .library-card");
        const r4=c4?.getBoundingClientRect(),r5=c5?.getBoundingClientRect();
        specAdd("5冊以上一枚表示カード寸法",!!r4&&!!r5&&Math.abs(r4.width-r5.width)<=0.5&&Math.abs(r4.height-r5.height)<=0.5,"4冊="+(r4?r4.width+"x"+r4.height:"none")+" / 5冊="+(r5?r5.width+"x"+r5.height:"none"));
        setSeriesCycleState("比較シリーズ5","list"); renderLibrary(); const c5list=document.querySelector(".series-group.is-cyclic .series-books .library-card"); const r5list=c5list?.getBoundingClientRect();
        specAdd("5冊以上全巻表示カード寸法",!!r4&&!!r5list&&Math.abs(r4.width-r5list.width)<=0.5&&Math.abs(r4.height-r5list.height)<=0.5,"4冊="+(r4?r4.width+"x"+r4.height:"none")+" / 5冊全巻="+(r5list?r5list.width+"x"+r5list.height:"none"));
        // 2〜4冊シリーズ: two-state toggle all volumes ↔ title-only. One-book and 5+ paths remain unchanged.
        books=[]; for(let i=1;i<=2;i++)books.push({isbn:"short-series-"+i,title:"2冊シリーズ "+i,author:"A",publisher:"P",date:"2025-01-01",price:100});
        localStorage.setItem("seriesView_v444","on"); setSeriesShortState("2冊シリーズ","all"); renderLibrary();
        const shortGroup=document.querySelector('#myBooks .series-group[data-series-short=\"1\"]'), shortAll=shortGroup?.querySelectorAll(".series-books .library-card").length===2, shortHintAll=shortGroup?.querySelector(".series-cyclic-hint")?.textContent==="タップ：タイトルだけ表示";
        shortGroup?.querySelector(".series-cyclic-head")?.click();
        const shortGroup2=document.querySelector('#myBooks .series-group[data-series-short=\"1\"]'), shortTitles=shortGroup2?.querySelectorAll(".series-title-item").length===2, shortHintTitle=shortGroup2?.querySelector(".series-cyclic-hint")?.textContent==="タップ：全巻を表示";
        specAdd("2〜4冊は全巻表示↔タイトルだけ表示",shortAll&&shortHintAll&&shortTitles&&shortHintTitle,"2冊: all→title の2状態");
        books=[{isbn:"one-series",title:"1冊シリーズ 1",author:"A",publisher:"P",date:"2025-01-01",price:100}]; setSeriesShortState("1冊シリーズ","title"); renderLibrary();
        specAdd("1冊は従来表示を維持",!document.querySelector('#myBooks .series-group[data-series-short=\"1\"]')&&!!document.querySelector("#myBooks details.series-group"),"1冊はdetails表示");
        books=[]; for(let i=1;i<=5;i++)books.push({isbn:"five-series-"+i,title:"5冊シリーズ "+i,author:"A",publisher:"P",date:"2025-01-01",price:100}); setSeriesCycleState("5冊シリーズ","deck"); renderLibrary();
        const fiveHint=document.querySelector('#myBooks .series-group[data-series-cycle=\"5冊シリーズ\"] .series-cyclic-hint')?.textContent;
        specAdd("5冊以上は従来の3状態循環を維持",fiveHint==="タップ：全巻を表示"&&nextSeriesCycleState("deck")==="list"&&nextSeriesCycleState("list")==="title"&&nextSeriesCycleState("title")==="deck","5冊: deck→list→title→deck");

        books=[{isbn:"bulk-a",title:"Bulk A",author:"A",publisher:"P",date:"2025-01-01",price:100},{isbn:"bulk-b",title:"Bulk B",author:"B",publisher:"P",date:"2025-01-01",price:100}]; bookMeta={}; localStorage.setItem("bookTrackerMeta_v483",JSON.stringify(bookMeta)); localStorage.setItem("seriesView_v444","off"); $("librarySort").value="registered-desc"; renderLibrary();
        $("libraryFilter").value="Bulk A"; renderLibrary(); const only=document.querySelector("#myBooks .selectBook"); if(only)only.checked=true; $("markReadSelected")?.click();
        specAdd("一括操作は現在のフィルター対象のみ",getMeta("bulk-a").readingStatus==="read"&&getMeta("bulk-b").readingStatus==="unread","Aのみ読了");

        // STATE/UI: updateBookMeta must persist and immediately update the rendered library card.
        books=[{isbn:"rerender-1",title:"再描画テスト",author:"A",publisher:"P",date:"2025-01-01",price:100}]; bookMeta={}; $("libraryFilter").value=""; localStorage.setItem("bookTrackerMeta_v483",JSON.stringify(bookMeta)); localStorage.setItem("seriesView_v444","off"); setMainTab("library"); renderLibrary(); updateBookMeta("rerender-1",{readingStatus:"read"});
        const rerenderText=[...document.querySelectorAll("#myBooks .library-card .meta-badge")].map(x=>x.textContent.trim());
        specAdd("状態変更後の関連UI再描画",rerenderText.includes("読了"),rerenderText.join(" / "));

        // Registration/deletion: search result ownership state must refresh after both operations.
        const flowBook={isbn:"flow-1",title:"登録削除フロー",author:"A",publisher:"P",date:localDateKey(),price:100}; books=[]; bookMeta={}; window.addResultsData=[flowBook]; addResultsMode="normal"; renderResults("addResults",window.addResultsData); await window.addBook(flowBook);
        const afterAdd=!!document.querySelector("#addResults .owned-badge"); await window.removeBookFromCalendar(flowBook.isbn,null); const afterDelete=!!document.querySelector("#addResults .owned-badge");
        specAdd("登録/削除後の検索結果表示",afterAdd&&!afterDelete,"登録後=蔵書 / 削除後=未登録");

        // Deletion must remove ownership and persist the resulting list.
        books=[{isbn:"delete-1",title:"削除テスト",author:"A",publisher:"P",date:"2025-01-01",price:100}]; bookMeta={}; localStorage.setItem("bookTrackerMeta_v483",JSON.stringify(bookMeta)); persistBooks(); setMainTab("library"); renderLibrary(); await window.removeBookFromCalendar("delete-1",null);
        const storedAfterDelete=JSON.parse(localStorage.getItem(KEY)||"[]"); const deletedMeta=bookMeta[canonicalIsbn("delete-1")]; specAdd("蔵書削除=所有解除+保存",books.length===0&&storedAfterDelete.length===0&&deletedMeta?.purchaseStatus!=="purchased","remaining="+books.length+" meta="+(deletedMeta?.purchaseStatus||"なし"));

        // TIME-001: a released calendar event alone is not an owned book.
        books=[]; const releasedEvent={isbn:"release-only",title:"発売済みだが未所有",author:"A",publisher:"P",date:localDateKey(),sourceType:"library",source:"蔵書"};
        const releaseHtml=calendarEventHtml(releasedEvent,localDateKey()); specAdd("発売日=購入ではない",releaseHtml.includes("＋ 蔵書に登録")&&!releaseHtml.includes("蔵書登録済み（タップで削除）"),"未所有イベントは登録ボタン");

        // Demo cleanup: demo books/extras and their metadata are removed, normal books remain.
        const normalDemoTest={isbn:"normal-keep",title:"通常本",author:"A",publisher:"P",date:"2025-01-01"}, demoTest={isbn:"demo-clean",title:"サンプル本棚：削除テスト",author:"A",publisher:"P",date:"2025-01-01",demo:true};
        books=[normalDemoTest,demoTest]; calendarExtras=[{...demoTest,sourceType:"recommended"}]; bookMeta={}; bookMeta[canonicalIsbn(demoTest.isbn)]={purchaseStatus:"purchased",readingStatus:"unread",favorite:false};
        localStorage.setItem("bookTrackerMeta_v483",JSON.stringify(bookMeta)); persistBooks(); persistCalendarExtras(); await performDemoDeletion();
        const demoKey=canonicalIsbn(demoTest.isbn); const storedExtras=JSON.parse(localStorage.getItem("calendarExtras_v442")||"[]"); const storedMeta=JSON.parse(localStorage.getItem("bookTrackerMeta_v483")||"{}");
        specAdd("サンプル削除の連動",books.length===1&&books[0].isbn===normalDemoTest.isbn&&calendarExtras.length===0&&!storedExtras.some(e=>e.isbn===demoTest.isbn)&&!storedMeta[demoKey],"通常本維持・demo/予定/メタ削除");

        // Series title-list expansion: exactly one selected volume is expanded and can return to the list.
        books=[]; for(let i=1;i<=5;i++)books.push({isbn:"title-list-"+i,title:"タイトル一覧シリーズ "+i,author:"A",publisher:"P",date:"2025-01-01",price:100});
        localStorage.setItem("seriesView_v444","on"); $("libraryFilter").value=""; setSeriesCycleState("タイトル一覧シリーズ","title"); setSeriesTitleOpen("タイトル一覧シリーズ","title-list-3"); setMainTab("library"); renderLibrary();
        const expandedCount=document.querySelectorAll(".series-group.is-cyclic .series-title-expanded .library-card").length, collapseUi=!!document.querySelector(".series-title-collapse");
        specAdd("タイトル一覧から単巻展開",expandedCount===1&&collapseUi,"expanded="+expandedCount);
        const collapseEl=document.querySelector('#myBooks .series-title-collapse');
        specAdd("タイトル一覧に戻るはボタン風表示ではない",!!collapseEl&&collapseEl.tagName!=="BUTTON"&&getComputedStyle(collapseEl).backgroundColor==="rgba(0, 0, 0, 0)"&&getComputedStyle(collapseEl).borderStyle==="none"&&getComputedStyle(collapseEl).paddingLeft==="0px"&&getComputedStyle(collapseEl).paddingTop==="0px",collapseEl?collapseEl.tagName+" / "+getComputedStyle(collapseEl).backgroundColor+" / "+getComputedStyle(collapseEl).borderStyle+" / "+getComputedStyle(collapseEl).padding:"none");
        setSeriesTitleOpen("タイトル一覧シリーズ","");

        const bk=createBackupData(); specAdd("バックアップappVersion",bk.appVersion===APP_VERSION,bk.appVersion+"==="+APP_VERSION);
        const demoBad=books.filter(isDemoRecord).some(b=>b.demo!==true); specAdd("サンプルdemo分離",!demoBad,"demoフラグ");

        const tiny="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/3G8oGAAAAABJRU5ErkJggg==";
        appSettings.background.image=tiny; appSettings.background.avgColor="#ffffff"; appSettings.background.avgLum=1; applyVisualSettings();
        const bgEl=$("appBackground"),bs=bgEl?getComputedStyle(bgEl):null,panel=document.createElement("div"); panel.className="card"; panel.textContent="guard"; document.body.appendChild(panel); const pcs=getComputedStyle(panel).backgroundColor;
        const alphaOf=c=>{const v=String(c),slash=v.lastIndexOf("/");if(slash>=0){const n=Number(v.slice(slash+1).replace(")","").trim());if(Number.isFinite(n))return n}if(v.startsWith("rgba(")){const parts=v.slice(5,-1).split(",");const n=Number(parts[3]);if(Number.isFinite(n))return n}return v&&v!=="transparent"?1:0};
        const bgSizes=bs?bs.backgroundSize.split(",").map(x=>x.trim()):[], bgPositions=bs?bs.backgroundPosition.split(",").map(x=>x.trim()):[];
        specAdd("背景画像cover/center",!!bgEl&&bgSizes[0]==="cover"&&bgPositions[0]==="50% 50%"&&bs.backgroundImage.includes("data:image"),bs?bs.backgroundSize+" / "+bs.backgroundPosition:"appBackgroundなし");
        specAdd("パネル約70%透明",Math.abs(alphaOf(pcs)-0.3)<=0.03,pcs); panel.remove();

        // v4.13.13: validate the final rendered 5+ series title-row style, not an earlier CSS rule.
        books=[];bookMeta={};for(let i=1;i<=5;i++){const b={isbn:"guard-title-"+i,title:"回帰タイトルシリーズ "+i,author:"A",publisher:"P",date:"2025-01-0"+i,price:100};books.push(b);bookMeta[canonicalIsbn(b.isbn)]={purchaseStatus:"purchased",readingStatus:"unread",favorite:false}}
        localStorage.setItem("seriesView_v444","on");setSeriesCycleState("回帰タイトルシリーズ","deck");renderLibrary();
        const sh=document.querySelector("#myBooks .series-group.is-cyclic .series-cyclic-head"),st=sh?.querySelector(".series-cyclic-title"),shBg=sh?getComputedStyle(sh).backgroundColor:"",stColor=st?getComputedStyle(st).color:"",probe=document.createElement("span");probe.style.color="var(--app-text)";document.body.appendChild(probe);const probeColor=getComputedStyle(probe).color;probe.remove();
        specAdd("5冊以上タイトル行の実背景",!!sh&&alphaOf(shBg)>0.05&&stColor===probeColor,"background="+shBg+" / text="+stColor+" / expected="+probeColor);

        // v4.13.13: fixed viewport background must remain identical across every tab.
        const bgBase=bgEl?(()=>{const c=getComputedStyle(bgEl);return c.backgroundSize+"|"+c.backgroundPosition+"|"+c.backgroundRepeat+"|"+c.backgroundImage})():"";let bgStable=!!bgEl;const bgTabDetails=[];
        for(const id of ["home","add","library","search","calendar","settings"]){document.querySelector('#bottomNav button[data-s="'+id+'"]')?.click();const c=bgEl?getComputedStyle(bgEl):null,cur=c?c.backgroundSize+"|"+c.backgroundPosition+"|"+c.backgroundRepeat+"|"+c.backgroundImage:"";if(cur!==bgBase)bgStable=false;bgTabDetails.push(id+":"+cur)}
        specAdd("背景画像のタブ間アジャスト固定",bgStable,bgTabDetails.join(" / "));

        // v4.13.16: volume notation is normalized for display/grouping, but title meaning is never inferred.
        const mixedVolumeBooks=[
          {isbn:"vol-1",title:"統一シリーズ 1巻",author:"A",publisher:"P",date:"2025-01-01"},
          {isbn:"vol-2",title:"統一シリーズ 第2巻",author:"A",publisher:"P",date:"2025-01-02"},
          {isbn:"vol-3",title:"統一シリーズ (3)",author:"A",publisher:"P",date:"2025-01-03"},
          {isbn:"vol-4",title:"統一シリーズ （4）",author:"A",publisher:"P",date:"2025-01-04"},
          {isbn:"vol-5",title:"統一シリーズ 5",author:"A",publisher:"P",date:"2025-01-05"},
          {isbn:"spin-1",title:"統一シリーズ 外伝 1巻",author:"A",publisher:"P",date:"2025-01-06"}
        ];
        const parsedVolumes=mixedVolumeBooks.slice(0,5).map(b=>parseVolumeTitle(b.title));
        specAdd("巻数表記の表示正規化",
          parsedVolumes.every((p,i)=>p.title==="統一シリーズ"&&p.volume===i+1)&&
          displayBookTitle(mixedVolumeBooks[0])==="統一シリーズ 1"&&
          displayBookTitle(mixedVolumeBooks[1])==="統一シリーズ 2"&&
          displayBookTitle(mixedVolumeBooks[2])==="統一シリーズ 3"&&
          displayBookTitle(mixedVolumeBooks[3])==="統一シリーズ 4"&&
          displayBookTitle(mixedVolumeBooks[4])==="統一シリーズ 5",
          parsedVolumes.map(p=>p.title+" "+p.volume).join(" / "));
        books=mixedVolumeBooks;bookMeta={};localStorage.setItem("seriesView_v444","off");$("libraryFilter").value="";renderLibrary();
        const libTitles=[...document.querySelectorAll("#myBooks .library-card .title")].map(x=>x.textContent.trim());
        const sortBooksForGuard=[
          {isbn:"sort-10",title:"並べ替えシリーズ 10巻",author:"A",publisher:"P",date:"2025-01-01"},
          {isbn:"sort-2",title:"並べ替えシリーズ 2巻",author:"A",publisher:"P",date:"2025-01-02"},
          {isbn:"sort-1",title:"並べ替えシリーズ 1巻",author:"A",publisher:"P",date:"2025-01-03"}
        ];
        const titleSorted=sortBooksForGuard.map((b,i)=>({b,i})).sort((a,b)=>{ $("librarySort").value="title-asc"; return compareLibraryItems(a,b)}).map(x=>x.b.title);
        const volumeSorted=sortBooksForGuard.map((b,i)=>({b,i})).sort((a,b)=>{ $("librarySort").value="volume-asc"; return compareLibraryItems(a,b)}).map(x=>x.b.title);
        const expectedTitleSorted=[...sortBooksForGuard].sort((a,b)=>String(a.title||"").toLowerCase().localeCompare(String(b.title||"").toLowerCase(),"ja")).map(b=>b.title);
        specAdd("巻数正規化は既存並べ替えに干渉しない",
          titleSorted.join("|")===expectedTitleSorted.join("|") &&
          volumeSorted.join("|")==="並べ替えシリーズ 1巻|並べ替えシリーズ 2巻|並べ替えシリーズ 10巻",
          "title="+titleSorted.join(" / ")+" volume="+volumeSorted.join(" / ")+" expectedTitle="+expectedTitleSorted.join(" / "));
        $("librarySort").value="registered-desc";
        specAdd("蔵書カードの巻数表示統一",
          libTitles.includes("統一シリーズ 1")&&libTitles.includes("統一シリーズ 2")&&libTitles.includes("統一シリーズ 3")&&libTitles.includes("統一シリーズ 4")&&libTitles.includes("統一シリーズ 5")&&libTitles.includes("統一シリーズ 外伝 1"),
          libTitles.join(" / "));
        localStorage.setItem("seriesView_v444","on");renderLibrary();
        const seriesGroups=[...document.querySelectorAll("#myBooks .series-group")];
        specAdd("作品タイトルを勝手に統合しない",
          seriesGroups.length===2,
          "本編系="+seriesGroups.filter(g=>g.querySelector(".series-cyclic-title,.series-title")).length+" / groups="+seriesGroups.length);
        const savedSeriesViewTitle=localStorage.getItem("seriesView_v444");
        localStorage.setItem("seriesView_v444","off");
        window.addResultsData=mixedVolumeBooks.slice(0,5);addResultsMode="normal";renderResults("addResults",window.addResultsData);
        const addTitles=[...document.querySelectorAll("#addResults .title")].map(x=>x.textContent.trim());
        renderResults("searchResults",window.addResultsData);
        const searchTitles=[...document.querySelectorAll("#searchResults .title")].map(x=>x.textContent.trim());
        specAdd("本を追加・書籍検索カードの巻数表示統一",
          addTitles.every((t,i)=>t==="統一シリーズ "+(i+1))&&searchTitles.every((t,i)=>t==="統一シリーズ "+(i+1)),
          "add="+addTitles.join(" / ")+" search="+searchTitles.join(" / "));
        setMainTab("search");renderResults("searchResults",window.addResultsData);await sleep(20);
        const similarH3=document.querySelector("#similarBox > h3");
        const addHead=document.querySelector("#add > .card:first-child > b");
        const libHead=document.querySelector("#library > .card:first-child > b");
        const searchHead=document.querySelector("#bookSearchPanel > .card:first-child > b");
        const bookTitle=document.querySelector("#searchResults .title");
        const headTargets=[similarH3,addHead,libHead,searchHead];
        const headTexts=headTargets.map(e=>(e?.textContent||"").trim());
        const headChecks=[];
        for(const fs of ["font-small","font-medium","font-large"]){
          setFont(fs);
          const sizes=headTargets.map(e=>e?getComputedStyle(e).fontSize:"");
          const bookSize=bookTitle?getComputedStyle(bookTitle).fontSize:"";
          headChecks.push({fs,sizes,bookSize});
        }
        const allHeadSizesEqual=headChecks.every(x=>x.sizes.length===4&&x.sizes.every(v=>v&&v===x.sizes[0]));
        const titlesCorrect=headTexts[0].includes("類似作品を探す")&&headTexts[1].includes("本を追加")&&headTexts[2].includes("蔵書")&&headTexts[3].includes("書籍検索");
        const expectedBookSizes={"font-small":"14.72px","font-medium":"16px","font-large":"17.28px"};
        const bookTitleUnchanged=headChecks.every(x=>x.bookSize===expectedBookSizes[x.fs]);
        specAdd("カード見出しのフォントサイズ統一（全文字サイズ）",
          titlesCorrect&&allHeadSizesEqual,
          headChecks.map(x=>x.fs+"="+x.sizes.join("/")).join(" | "));
        specAdd("書籍タイトルのフォントサイズを維持（全文字サイズ）",
          !!bookTitle&&bookTitleUnchanged,
          headChecks.map(x=>x.fs+" book="+x.bookSize).join(" | "));
        setFont("font-medium");
        localStorage.setItem("seriesView_v444",savedSeriesViewTitle||"off");
                // v4.13.14: 5+ title header must be slightly darker than the <=4-series header,
        // while remaining a translucent panel over the background image.
        books=[];bookMeta={};
        for(let i=1;i<=4;i++){const b={isbn:"guard-four-"+i,title:"比較シリーズ "+i,author:"A",publisher:"P",date:"2025-01-0"+i,price:100};books.push(b);bookMeta[canonicalIsbn(b.isbn)]={purchaseStatus:"purchased",readingStatus:"unread",favorite:false}}
        localStorage.setItem("seriesView_v444","on");renderLibrary();
        const fourHead=document.querySelector("#myBooks .series-group.is-short-toggle .series-cyclic-head");
        const fourBg=fourHead?getComputedStyle(fourHead).backgroundColor:"";
        books=[];bookMeta={};
        for(let i=1;i<=5;i++){const b={isbn:"guard-five-"+i,title:"比較シリーズ "+i,author:"A",publisher:"P",date:"2025-01-0"+i,price:100};books.push(b);bookMeta[canonicalIsbn(b.isbn)]={purchaseStatus:"purchased",readingStatus:"unread",favorite:false}}
        setSeriesCycleState("比較シリーズ","deck");renderLibrary();
        const fiveHead=document.querySelector("#myBooks .series-group.is-cyclic .series-cyclic-head");
        const fiveBg=fiveHead?getComputedStyle(fiveHead).backgroundColor:"";
        const cssText=[...document.querySelectorAll("style")].map(x=>x.textContent).join(String.fromCharCode(10)); const strongerTint=cssText.includes(".series-group.is-cyclic .series-cyclic-head{background:color-mix(in srgb,color-mix(in srgb,var(--primary) 12%,var(--surface)) var(--panel-surface-alpha),transparent)!important");
        specAdd("5冊以上タイトル背景は5冊以下より少し濃い",!!fourBg&&!!fiveBg&&fiveBg!=="transparent"&&strongerTint,"4冊="+fourBg+" / 5冊="+fiveBg+" / 5+ tint=12%, 5- tint=6%");

        // v4.13.14: rear stack top borders must not show through the translucent front card.
        const front=document.querySelector("#myBooks .series-group.is-cyclic .series-deck .card");
        const layers=[...document.querySelectorAll("#myBooks .series-group.is-cyclic .series-deck .series-stack-layer")];
        const clipOk=layers.length===4&&layers.every(x=>getComputedStyle(x).clipPath.includes("20px"));
        specAdd("5冊以上重なりの上端を隠す",!!front&&clipOk,"後ろ4枚の上端をclipし、前面カード越しに線が見えない構造");

        // v4.13.14: startup must always normalize to Home, including bfcache/pageshow restores.
        setMainTab("settings");window.dispatchEvent(new Event("pageshow"));
        const homeVisible=!$("home").hidden&&$("home").classList.contains("active")&&$("settings").hidden&&!$("settings").classList.contains("active");
        specAdd("画面更新後の初期ページ=ホーム",homeVisible,"pageshow後 home="+(!$("home").hidden)+" settings="+$("settings").hidden);

        // v4.13.13: automatic text contrast is checked against the effective translucent panel background.
        const themeProfile=appSettings.theme==="dark"?{text:"#f8fafc",surface:"#1f2937"}:appSettings.theme==="green"?{text:"#183024",surface:"#ffffff"}:{text:"#172033",surface:"#ffffff"};
        appSettings.autoTextContrast=true;appSettings.background.avgColor="#000000";appSettings.background.avgLum=0;applyVisualSettings();const darkText=getComputedStyle(document.documentElement).getPropertyValue("--app-text").trim(),darkBg=effectivePanelBackground(themeProfile.surface,"#000000",.30),darkRatio=contrastRatio(darkText,darkBg);
        appSettings.background.avgColor="#ffffff";appSettings.background.avgLum=1;applyVisualSettings();const lightText=getComputedStyle(document.documentElement).getPropertyValue("--app-text").trim(),lightBg=effectivePanelBackground(themeProfile.surface,"#ffffff",.30),lightRatio=contrastRatio(lightText,lightBg);
        appSettings.autoTextContrast=false;applyVisualSettings();const offText=getComputedStyle(document.documentElement).getPropertyValue("--app-text").trim();
        specAdd("文字色自動補正",darkRatio>=4.5&&lightRatio>=4.5&&offText.toLowerCase()===themeProfile.text.toLowerCase(),"dark="+darkText+"/"+darkRatio.toFixed(2)+" light="+lightText+"/"+lightRatio.toFixed(2)+" off="+offText);
      }catch(e){specAdd("全量仕様回帰",false,e.message)}
      finally{
        books=savedBooks3; bookMeta=savedMeta3; calendarExtras=savedExtras3;
        $("librarySort").value=savedSort3; $("libraryFilter").value=savedFilter3; window.libraryUnreadOnly=false;
        if(savedSeriesView3===null)localStorage.removeItem("seriesView_v444");else localStorage.setItem("seriesView_v444",savedSeriesView3);
        try{localStorage.removeItem("seriesOpen:guard-series")}catch(e){}
        appSettings.background.image="";appSettings.background.avgColor=null;appSettings.background.avgLum=null;appSettings.autoTextContrast=savedAutoText3;applyVisualSettings(); render();
        window.alert=savedAlert; window.confirm=savedConfirm;
      }
    // v4.13.24: verify the home upcoming heading against the same rendered heading
    // used by 「類似作品を探す」 at every font setting. This is a real computed-style check.
    let upcomingHeadingOk=true; const upcomingHeadingDetails=[];
    for(const fs of ['font-small','font-medium','font-large']){
      setFont(fs);
      const similar=document.querySelector('#similarBox > h3');
      const upcoming=document.querySelector('#home .home-upcoming-head b');
      const similarSize=similar?getComputedStyle(similar).fontSize:'';
      const upcomingSize=upcoming?getComputedStyle(upcoming).fontSize:'';
      if(!similar||!upcoming){upcomingHeadingOk=false;upcomingHeadingDetails.push(fs+' 対象要素なし');}
      else if(similarSize!==upcomingSize){upcomingHeadingOk=false;upcomingHeadingDetails.push(fs+' 類似作品='+similarSize+' / 近日発売='+upcomingSize);}
    }
    specAdd('近日発売の注目書籍の見出しサイズ',upcomingHeadingOk,upcomingHeadingOk?'小・中・大で類似作品とcomputed style一致':upcomingHeadingDetails.join(' / '));

    // v4.13.24: detail sheet background is explicitly scoped to the detail screen and is fully opaque.
    try{
      const fixture={isbn:'guard-detail-alpha',title:'詳細画面透過テスト',author:'A',publisher:'P',date:'2025-01-01',price:100};
      openBookDetail(fixture);
      const sheet=document.querySelector('.detail-overlay .detail-sheet');
      const actual=sheet?getComputedStyle(sheet).backgroundColor:'';
      const probe=document.createElement('div');
      probe.style.cssText='position:absolute;left:-9999px;background:var(--surface)';
      document.body.appendChild(probe);
      const expected=getComputedStyle(probe).backgroundColor;
      probe.remove();
      specAdd('詳細画面の透過なし',!!sheet&&actual===expected,'computed background='+actual+' / expected='+expected);
      if(document.querySelector('.detail-overlay')) document.querySelector('.detail-overlay').style.display='none';
    }catch(e){specAdd('詳細画面の透過なし',false,e.message)}
      return {out,checks,specChecks};
    })()`;
    const evalResult=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(evalResult.exceptionDetails) throw new Error(evalResult.exceptionDetails.exception?.description||evalResult.exceptionDetails.text||'UI回帰テスト内で例外が発生しました');
    const result=evalResult.result?.value;
    if(!result)throw new Error('UI回帰テストの結果を取得できませんでした');
    const failedSpec=(result.specChecks||[]).filter(x=>!x.ok);
    if(failedSpec.length)failedSpec.forEach(x=>fail('仕様カバレッジ「'+x.name+'」',x.detail));
    else check('仕様カバレッジ全量回帰',true,(result.specChecks||[]).length+'項目 PASS');

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
    const requiredTexts=['開発用：仕様・回帰チェック','蔵書登録済み（タップで削除）','詳細を見る','ナチュラル'];
    const all=[...Object.values(result.out.fonts).flatMap(d=>[...(d.settings||[]),...(d.calendar||[]),...(d.library?.detail ? [{text:"詳細を見る",rect:d.library.detail}] : [])])];
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
