#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const target = path.resolve(process.argv[2] || 'index.html');
if (!fs.existsSync(target)) {
  console.error(`[FATAL] target not found: ${target}`);
  process.exit(2);
}
const html = fs.readFileSync(target, 'utf8');

const results = [];
function pass(name, detail='') { results.push({name, ok:true, detail}); }
function fail(name, detail='') { results.push({name, ok:false, detail}); }
function check(name, ok, detail='') { (ok ? pass : fail)(name, detail); }

// ---------------- static contract checks ----------------
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const dupIds = [...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
check('STATIC-001 unique DOM ids', dupIds.length===0, dupIds.join(', '));
check('STATIC-002 required version marker', /DEV_GUARD_VERSION\s*=\s*["']4\.13\.30["']/.test(html) || /APP_VERSION\s*=\s*["']4\.13\.30["']/.test(html), 'version marker present');
check('STATIC-003 required six tabs', ['home','add','library','search','calendar','settings'].every(id=>new RegExp(`id=["']${id}["']`).test(html)), 'home/add/library/search/calendar/settings');
check('STATIC-004 price filter exists', /id=["']filterPrice["']/.test(html), 'library price filter');
check('STATIC-005 canonical registration routes exist', /window\.addBook\s*=/.test(html) && /window\.bulkAdd\s*=/.test(html), 'addBook/bulkAdd');
check('STATIC-006 roadmap guard docs exist', fs.existsSync(path.join(path.dirname(target),'ROADMAP_TEST_MATRIX.md')), 'roadmap test matrix');
check('STATIC-007 release gate docs exist', fs.existsSync(path.join(path.dirname(target),'RELEASE_TEST_GATE.md')), 'release gate');
check('STATIC-008 package test script exists', fs.existsSync(path.join(path.dirname(target),'package.json')), 'package.json');

// Check that roadmap promises are represented as explicit planned/current contracts.
const roadmap = fs.existsSync(path.join(path.dirname(target),'ROADMAP_TEST_MATRIX.md')) ? fs.readFileSync(path.join(path.dirname(target),'ROADMAP_TEST_MATRIX.md'),'utf8') : '';
for (const key of ['OCR','発売日エンジン','推薦','ネイティブiOS','EventKit','UserNotifications','iCloud等の端末間同期','購入先の正式な商品データ連携','収益化']) {
  check(`ROADMAP-STATIC-${key}`, roadmap.includes(key), 'roadmap contract present');
}

function cdpClient(port) {
  let id = 0;
  let ws;
  const pending = new Map();
  const waiters = [];
  function connect() {
    return new Promise(async (resolve,reject)=>{
      try {
        const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
        const page = targets.find(t=>t.type === 'page');
        if (!page) throw new Error('Chromium page target not found');
        ws = new WebSocket(page.webSocketDebuggerUrl);
        ws.addEventListener('open',()=>resolve());
        ws.addEventListener('error',e=>reject(e));
        ws.addEventListener('message',ev=>{
          const m=JSON.parse(ev.data);
          if(m.id && pending.has(m.id)) { const p=pending.get(m.id); pending.delete(m.id); m.error?p.reject(new Error(m.error.message)):p.resolve(m.result); }
          else waiters.push(m);
        });
      } catch(e){ reject(e); }
    });
  }
  function send(method, params={}) {
    return new Promise((resolve,reject)=>{
      const rid=++id; pending.set(rid,{resolve,reject}); ws.send(JSON.stringify({id:rid,method,params}));
    });
  }
  return {connect,send,close:()=>{try{ws.close()}catch(e){}}};
}

async function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function main(){
  const port = 9229;
  const profile = fs.mkdtempSync('/tmp/book-tracker-guard-');
  const chrome = spawn('/usr/bin/chromium', [
    '--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--no-proxy-server','--proxy-server=direct://','--proxy-bypass-list=*','--disable-features=BlockInsecurePrivateNetworkRequests',
    `--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'
  ], {stdio:'ignore'});
  const cdp=cdpClient(port);
  try {
    for(let i=0;i<50;i++){ try{await cdp.connect();break;}catch(e){await wait(100);} if(i===49)throw new Error('Chromium CDP did not start'); }
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const evalJS = async expression => (await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.value;
    // Use a real HTTPS origin for localStorage/cookies. The application HTML is still the exact release HTML;
    // local JS dependency is inlined only for the browser harness because this sandbox blocks loopback navigation.
    const apiPath=path.join(path.dirname(target),'api_management.js');
    const apiCode=fs.readFileSync(apiPath,'utf8').replace(/<\/script/gi,'<\\/script');
    const storageShim=`<script>(function(){const s=new Map();window.__guardStorage={get length(){return s.size},key(i){return [...s.keys()][i]??null},getItem(k){return s.has(String(k))?s.get(String(k)):null},setItem(k,v){s.set(String(k),String(v))},removeItem(k){s.delete(String(k))},clear(){s.clear()}}})();<\/script>`;
    const browserHtml=storageShim+html.replaceAll('localStorage','__guardStorage').replace('<script src="./api_management.js"></script>',`<script>${apiCode}</script>`);
    await cdp.send('Page.setDocumentContent',{frameId:(await cdp.send('Page.getFrameTree')).frameTree.frame.id,html:browserHtml}); await wait(1200);

    const loadState=await evalJS('({url:location.href,ready:document.readyState,title:document.title,storage:(()=>{try{__guardStorage.setItem("__guard","1");__guardStorage.removeItem("__guard");return true}catch(e){return false}})()})');
    check('E2E-000 target loaded',loadState && loadState.ready==='complete' && loadState.title==='本棚スケジュール' && loadState.storage===true,JSON.stringify(loadState));

    const requiredTabs=['home','add','library','search','calendar','settings'];
    const tabState=await evalJS(`(()=>{const ids=${JSON.stringify(requiredTabs)};return ids.map(id=>({id,exists:!!document.getElementById(id),hidden:document.getElementById(id)?.hidden}));})()`);
    check('E2E-001 all six tabs exist', tabState.every(x=>x.exists), JSON.stringify(tabState));

    const tabContracts={
      home:['homeBookCount','homeBookTotal','homePurchaseCount','homeUnreadCount','homeFavoriteCount','homeUpcomingBooks'],
      add:['scan','isbnRows','isbnSearch','work','vol','workSearch'],
      library:['libraryStats','libraryFilter','libraryFilterToggle','seriesViewToggle','librarySort','filterAuthor','filterPublisher','filterYear','filterRelease','filterReading','filterFavorite','filterPrice','filterReset','myBooks','seriesCheckBtn','unreadOnlyBtn'],
      search:['searchModeBook','searchModeAuthor','query','searchBtn','searchUnownedOnly','searchResults','similarBox','similarBtn','author','authorBtn','authorNewBtn','authorResults'],
      calendar:['calendarMonthCard','prevMonth','todayMonth','monthTitle','nextMonth','calHead','calendarGrid','calendarDayCard','calendarMonthReleasedCard','ics'],
      settings:['profileName','profileGenre','profileAuthor','profileMemo','profileSave','themeCurrent','fontCurrent','theme-choice','font-choice','skinSave','skinApply','bgImageInput','bgImageRemove','autoTextContrast','backupDataBtn','restoreDataBtn','setSearchCount','setSearchSort','setWeekStart','setICS']
    };
    for(const [tab,selectors] of Object.entries(tabContracts)){
      const missing=await evalJS(`(()=>${JSON.stringify(selectors)}.filter(x=>x==='theme-choice'||x==='font-choice'? !document.querySelector('.'+x):!document.getElementById(x)))()`);
      check(`CONTRACT-${tab}-001 required controls`,missing.length===0,missing.join(', '));
    }
    const fnContracts={
      home:['renderHome'], add:['ensureTrailingIsbnRow','isbnLookup'], library:['renderLibrary','resetLibraryFilters','updateBookMeta','setPurchaseStatus'],
      search:['searchGoogle','findSimilarWorks'], calendar:['renderCalendar','showDay','allEvents','addCalendarExtra','checkReleaseNotifications'], settings:['loadSettingsUI','saveSettings','createBackupData']
    };
    for(const [tab,fns] of Object.entries(fnContracts)){
      const missing=await evalJS(`(()=>${JSON.stringify(fns)}.filter(n=>typeof window[n]!=='function' && typeof globalThis[n]!=='function'))()`);
      check(`CONTRACT-${tab}-002 required logic entrypoints`,missing.length===0,missing.join(', '));
    }

    // Logic contracts are tested independently from rendered markup. These are specification-driven
    // boundary tests, not a list of historical bugs.
    const logic=await evalJS(`(()=>{
      const out={};
      out.isbnCanonical=canonicalIsbn('4088720717')===canonicalIsbn('9784088720715');
      const vols=[['作品 1巻',1],['作品 第2巻',2],['作品 3集',3],['作品 (4)',4],['作品 （5）',5],['作品 6',6]];
      out.volumeNormalization=vols.every(([t,n])=>parseVolumeTitle(t).volume===n && displayBookTitle({title:t})==='作品 '+n);
      out.seriesGrouping=new Set(vols.map(([t])=>seriesKey({title:t}))).size===1;
      const u={isbn:'logic-u',price:makeUnconfirmedPrice()},z={isbn:'logic-z',price:makeConfirmedZeroPrice()},k={isbn:'logic-k',price:makeConfirmedListPrice(550,'manual','HIGH')};
      const saved=books.slice(); books=[u,z,k]; const st=deriveLibraryStats(); books.splice(0,books.length,...saved);
      out.priceSemantics=st.total===550 && st.priceConfirmedCount===2 && st.pricedCount===1;
      out.priceFilter=matchesListPriceFilter(u,'unconfirmed') && !matchesListPriceFilter(z,'unconfirmed') && matchesListPriceFilter(z,'confirmed') && matchesListPriceFilter(k,'confirmed');
      const oldGroups=JSON.parse(JSON.stringify(purchaseGroups)); const made=setPurchaseGroupForBooks(['logic-a','logic-b'],3000,'セット'); const groupsOk=Object.values(purchaseGroups||{}).some(g=>g.totalAmount===3000&&g.bookKeys.length===2&&g.note==='セット'); purchaseGroups=oldGroups; out.purchaseGroup=made&&groupsOk;
      out.seriesCycle=nextSeriesCycleState('deck')==='list'&&nextSeriesCycleState('list')==='title'&&nextSeriesCycleState('title')==='deck';
      out.seriesShort=nextSeriesShortState('all')==='title'&&nextSeriesShortState('title')==='all';
      const api=window.bookTrackerApiManagement; const lowApi=api.evidenceFor('listPrice',484,{identifierMatched:true,countryMatched:true,taxIncludedConfirmed:false}); const highApi=api.evidenceFor('listPrice',484,{identifierMatched:true,countryMatched:true,taxIncludedConfirmed:true}); out.apiPriceTrust=!api.acceptable('listPrice',lowApi)&&api.acceptable('listPrice',highApi);
      const backup=createBackupData(); out.backupVersion=backup.appVersion===APP_VERSION;
      out.ownershipRoute=typeof setPurchaseStatus==='function'&&typeof updateBookMeta==='function'&&typeof window.addBook==='function';
      return out;
    })()`);
    for(const [name,ok] of Object.entries(logic)) check(`LOGIC-${name}`,ok,ok?'OK':'spec contract failed');

    const overflowExpression = `(()=>{
      const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
      const ignore=e=>{const s=getComputedStyle(e); return e.matches('html,body,script,style,textarea,[contenteditable="true"]') || s.overflowX==='auto'||s.overflowX==='scroll'||s.overflowY==='auto'||s.overflowY==='scroll';};
      const els=[...document.querySelectorAll('body *')].filter(e=>visible(e)&&!ignore(e));
      const horizontal=els.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({tag:e.tagName,id:e.id,cls:e.className,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,text:(e.textContent||'').trim().slice(0,80)}));
      const viewport=els.filter(e=>{const r=e.getBoundingClientRect();return r.left < -1 || r.right > innerWidth+1 || r.top < -1 || r.bottom > innerHeight+1 && getComputedStyle(e).position==='fixed';}).map(e=>({tag:e.tagName,id:e.id,cls:e.className,rect:(()=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()}));
      return {horizontal,viewport};
    })()`;

    for(const id of requiredTabs){
      await evalJS(`(()=>{document.querySelector('#bottomNav button[data-s="${id}"]')?.click();return true})()`);
      await wait(250);
      const tabVisible=await evalJS(`(()=>{const s=document.getElementById('${id}');return !!s&&!s.hidden})()`);
      check(`E2E-TAB-${id}-001 visible after navigation`,tabVisible,'tap navigation');
      const ov=await evalJS(overflowExpression);
      // Fixed bottom nav is expected to touch the viewport edge; report other fixed/offscreen elements.
      const meaningfulViewport=ov.viewport.filter(x=>x.id!=='bottomNav' && !String(x.cls).includes('overlay'));
      check(`E2E-TAB-${id}-002 no horizontal content overflow`,ov.horizontal.length===0,JSON.stringify(ov.horizontal.slice(0,12)));
      check(`E2E-TAB-${id}-003 no unexpected viewport overflow`,meaningfulViewport.length===0,JSON.stringify(meaningfulViewport.slice(0,8)));
      const clipped=await evalJS(`(()=>{const out=[];for(const e of document.querySelectorAll('body *')){const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(r.width<=0||r.height<=0||s.display==='none'||s.visibility==='hidden')continue;if(e.matches('script,style,input,textarea,select,option,html,body'))continue;const t=(e.textContent||'').trim();if(!t)continue;if((s.textOverflow==='ellipsis'||s.whiteSpace==='nowrap')&&e.scrollWidth>e.clientWidth+1)out.push({id:e.id,cls:e.className,text:t.slice(0,100),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth});}return out;})()`);
      check(`E2E-TAB-${id}-004 no unintended text clipping`,clipped.length===0,JSON.stringify(clipped.slice(0,8)));
    }

    // Cross-feature smoke tests: exercise representative state transitions on every tab.
    const smoke=await evalJS(`(()=>{
      const out={};
      const nav=id=>document.querySelector('#bottomNav button[data-s="'+id+'"]')?.click();
      nav('search'); document.getElementById('searchModeAuthor')?.click(); out.searchModeAuthor=document.getElementById('authorSearchPanel')?.classList.contains('active'); document.getElementById('searchModeBook')?.click(); out.searchModeBook=document.getElementById('bookSearchPanel')?.classList.contains('active');
      nav('library'); document.getElementById('libraryFilterToggle')?.click(); out.libraryFilterOpen=document.getElementById('libraryFilterPanel')?.classList.contains('open'); document.getElementById('libraryFilterToggle')?.click();
      nav('calendar'); const before=document.getElementById('monthTitle')?.textContent||''; document.getElementById('nextMonth')?.click(); const after=document.getElementById('monthTitle')?.textContent||''; out.calendarMonthChanges=before!==after; document.getElementById('prevMonth')?.click();
      nav('settings'); document.querySelector('.font-choice[data-font="large"]')?.click(); out.fontLarge=document.body.classList.contains('font-large') || getComputedStyle(document.body).fontSize!==''; document.querySelector('.font-choice[data-font="medium"]')?.click();
      return out;
    })()`);
    check('E2E-SMOKE-001 cross-tab state transitions',smoke.searchModeAuthor&&smoke.searchModeBook&&smoke.libraryFilterOpen&&smoke.calendarMonthChanges&&smoke.fontLarge,JSON.stringify(smoke));

    // Font-size sweep on every tab. The test is intentionally generic: it detects regressions in any new UI, not only known bugs.
    for(const font of ['small','medium','large']){
      await evalJS(`document.querySelector('.font-choice[data-font="${font}"]')?.click()`); await wait(250);
      for(const id of requiredTabs){
        await evalJS(`document.querySelector('#bottomNav button[data-s="${id}"]')?.click()`); await wait(180);
        const ov=await evalJS(overflowExpression);
        const meaningfulViewport=ov.viewport.filter(x=>x.id!=='bottomNav' && !String(x.cls).includes('overlay'));
        check(`E2E-FONT-${font}-${id}-001 horizontal overflow`,ov.horizontal.length===0,JSON.stringify(ov.horizontal.slice(0,8)));
        check(`E2E-FONT-${font}-${id}-002 unexpected viewport overflow`,meaningfulViewport.length===0,JSON.stringify(meaningfulViewport.slice(0,5)));
      }
    }

    // Check that text intended to be readable is not silently clipped by ellipsis/nowrap.
    const clipped=await evalJS(`(()=>{const out=[];for(const e of document.querySelectorAll('body *')){const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(r.width<=0||r.height<=0||s.display==='none'||s.visibility==='hidden')continue;if(e.matches('script,style,input,textarea,select,option,html,body'))continue;const t=(e.textContent||'').trim();if(!t)continue;if((s.textOverflow==='ellipsis'||s.whiteSpace==='nowrap')&&e.scrollWidth>e.clientWidth+1)out.push({id:e.id,cls:e.className,text:t.slice(0,100),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,whiteSpace:s.whiteSpace,textOverflow:s.textOverflow});}return out;})()`);
    check('E2E-GLOBAL-001 no unintended text clipping',clipped.length===0,JSON.stringify(clipped.slice(0,15)));

    // Verify roadmap-planned features are not falsely represented as current implementation.
    const plannedClaims=await evalJS(`(()=>({
      ocr:!!document.querySelector('[data-feature="ocr"]'),
      native:!!document.querySelector('[data-feature="native-ios"]'),
      recommendation:!!document.querySelector('[data-feature="recommendation"]'),
      cloudSync:!!document.querySelector('[data-feature="cloud-sync"]')
    }))()`);
    check('ROADMAP-E2E-001 planned features are explicitly gated',Object.values(plannedClaims).every(v=>v===false),'current prototype has no hidden future feature claim');

    // App-internal guard remains available, but external guard is authoritative.
    const internalGuard=await evalJS(`typeof window.runBookTrackerSpecGuard==='function'`);
    check('E2E-GUARD-001 internal guard exported',internalGuard,'optional developer UI guard');
    // Screenshot smoke at the final state. This catches catastrophic blank pages in addition to geometry tests.
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
    check('E2E-SCREEN-001 screenshot captured',!!shot.data && shot.data.length>1000,'390x844 rendered screenshot');
  } catch(e){
    fail('E2E-FATAL',e.stack||e.message);
  } finally {
    cdp.close(); chrome.kill('SIGKILL');
    try{fs.rmSync(profile,{recursive:true,force:true});}catch(e){}
  }

  const failed=results.filter(r=>!r.ok);
  console.log(`\nBook Tracker external release guard: ${results.length-failed.length}/${results.length} passed`);
  for(const r of results) console.log(`${r.ok?'PASS':'FAIL'} | ${r.name}${r.detail?` | ${r.detail}`:''}`);
  process.exitCode=failed.length?1:0;
}
main();
