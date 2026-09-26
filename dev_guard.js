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
const apiSourcePath = path.join(path.dirname(target), 'api_management.js');
const apiSource = fs.existsSync(apiSourcePath) ? fs.readFileSync(apiSourcePath, 'utf8') : '';

const results = [];
function pass(name, detail='') { results.push({name, ok:true, detail}); }
function fail(name, detail='') { results.push({name, ok:false, detail}); }
function check(name, ok, detail='') { (ok ? pass : fail)(name, detail); }

// ---------------- static contract checks ----------------
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const dupIds = [...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
check('STATIC-001 unique DOM ids', dupIds.length===0, dupIds.join(', '));
check('STATIC-002 required version marker', /DEV_GUARD_VERSION\s*=\s*["']4\.\d+\.\d+["']/.test(html), 'version marker present');
const escapeHtmlRefs=(html.match(/\bescapeHtml\s*\(/g)||[]).length;
check('STATIC-048 escapeHtml helper is defined', escapeHtmlRefs===0 || /(?:const|let|var)\s+escapeHtml\s*=|function\s+escapeHtml\s*\(/.test(html), `references=${escapeHtmlRefs}`);

const packagePath=path.join(path.dirname(target),'package.json');
let packageVersion='';
try{packageVersion=JSON.parse(fs.readFileSync(packagePath,'utf8')).version||''}catch(e){}
const appVersionMatch=html.match(/const APP_VERSION=\"([^\"]+)\"/);
const guardVersionMatch=html.match(/const DEV_GUARD_VERSION=\"([^\"]+)\"/);
const readUtf8=p=>{try{return fs.readFileSync(p,'utf8')}catch(e){return ''}};
const readmeText=readUtf8(path.join(path.dirname(target),'README.md'));
const specText=readUtf8(path.join(path.dirname(target),'SPEC.md'));
const headerVersionMatch=html.match(/id="appHeaderSub">v([^<]+)<br\/>/);
const currentDocVersion=(readmeText.match(/## 現在のリリース\s*\n\s*\*\*v([^*]+)\*\*/)||[])[1]||'';
const specCurrentVersion=(specText.match(/^# v([^ ]+) 現行リリース契約/m)||[])[1]||'';
check('STATIC-018 version sources are consistent', !!packageVersion&&appVersionMatch?.[1]===packageVersion&&guardVersionMatch?.[1]===packageVersion, `package=${packageVersion} app=${appVersionMatch?.[1]||''} guard=${guardVersionMatch?.[1]||''}`);
check('STATIC-044 release version is consistent across package/app/docs', !!packageVersion&&headerVersionMatch?.[1]===packageVersion&&currentDocVersion===packageVersion&&specCurrentVersion===packageVersion, `package=${packageVersion} header=${headerVersionMatch?.[1]||''} README=${currentDocVersion} SPEC=${specCurrentVersion}`);

const visibleVersionMatch=html.match(/id="appVersionText">バージョン：([0-9.]+)/);
check('STATIC-046 visible appVersionText uses current release', !!packageVersion&&visibleVersionMatch?.[1]===packageVersion, `visible=${visibleVersionMatch?.[1]||''} package=${packageVersion}`);check('STATIC-019 persistence/backup gap audit exists', fs.existsSync(path.join(path.dirname(target),'RULE_GAP_AUDIT_v4_13_44.md'))&&fs.existsSync(path.join(path.dirname(target),'NEXT_IMPLEMENTATION_PRIORITY_v4_13_44.md')), 'persistence/backup/priority contracts');
check('STATIC-020 backup schema validation contract', /Number\(d\.schemaVersion\)!==3/.test(html) && /function validateBackupData/.test(html) && /function restoreBackupData/.test(html), 'backup schemaVersion/key validation and atomic restore');
check('STATIC-022 registration performance measurement contract', /bookTrackerRegistrationMetrics/.test(html) && /サンプルデータ：1冊登録/.test(html) && /検索結果：1冊登録/.test(html) && /検索結果：選択した本を一括登録/.test(html), 'operation label + timing metrics are explicit');
check('STATIC-028 provider phase measurement is connected to active metric token', /token\.addApiPhase\s*=/.test(html) && /apiPhases/.test(html) && /rateLimitWait/.test(html) && /json/.test(html), 'phase durations are stored on the same metric token rendered in Settings');
check('STATIC-030 Google Books response body is cancelled on provider timeout', /r\.body\?\.cancel/.test(html) && /addEventListener\(\"abort\"/.test(html), 'Response body cancellation is wired to the Provider AbortSignal');

check('STATIC-031 Google Books response/json phases are explicit', html.includes('\"response\",0') && html.includes('\"json-start\",0') && html.includes('\"json\"'), 'response, json-start and json phases are separately recorded');
check('STATIC-033 HTTP status/retry measurement is explicit', /HTTP \"\+String\(r\.status\)/.test(html) && /retry-after-429/.test(html), 'non-JSON HTTP failures and 429 retries are visible in Provider metrics');
check('STATIC-034 Google Books 429 retry propagation', /googleBooks:\{[\s\S]*?getJSON\(u,\{searchOnline:true,signal:opts\.signal,metrics:opts\.metrics,onRetry:opts\.onRetry\}\)/.test(apiSource), 'Google Books Adapter propagates onRetry into getJSON');
check('STATIC-035 header version/title contract', /id="appHeaderTitle">📚 本棚スケジュール/.test(html) && new RegExp('v'+packageVersion.replace(/\./g,'\\.')).test(html) && /id="appHeaderSub">v/.test(html) && /複数ISBN・詳細\/関連検索・発売日カレンダー対応/.test(html), 'header shows app name, current version, and feature descriptor');
check('STATIC-036 HTTP 429 response body release before retry', html.includes('retry-response-body-cancel') && html.includes('await r.body.cancel()'), '429 response body is released before the dedicated retry');
check('STATIC-037 HTTP 429 retry attempt diagnostic', html.includes('retry-attempt-2') && html.includes('retry-aborted-before-fetch'), '429 retry attempt and abort state are explicitly measured');
check('STATIC-038 HTTP 429 header diagnostic', html.includes('429-Retry-After=') && html.includes('retry-429-Retry-After='), '429 Retry-After and rate-limit headers are measured without exposing credentials');
check('STATIC-039 HTTP 429 body diagnostic', html.includes('429-error-reason=') && html.includes('retry-429-error-reason='), '429 public response reason/message are measured without storing the raw body');
check('STATIC-041 daily quota user-facing error is preserved', html.includes('GOOGLE_BOOKS_DAILY_QUOTA_EXCEEDED') && html.includes('Google Books APIの日次クォータ（Queries per day）を超過しています。') && html.includes('daily-quota-no-retry'), 'daily quota error propagation is present');check('STATIC-040 daily Google Books quota classification', html.includes('GOOGLE_BOOKS_DAILY_QUOTA_EXCEEDED') && html.includes('daily-quota-no-retry') && /Queries per day/.test(html), 'daily quota exhaustion is classified and does not perform short-delay retries');
check('STATIC-032 Abort polling guard exists for WebKit body waits', html.includes('setInterval(()=>{if(opts.signal?.aborted)abortJsonReject()},25)'), 'AbortSignal state is polled as a WebKit-safe fallback');check('STATIC-029 settings version is derived from APP_VERSION', /id=\"appVersionText\"/.test(html) && /renderAppVersion\(\)/.test(html) && /firstChild\.nodeValue=/.test(html), 'Settings version display uses APP_VERSION as the source of truth');
check('STATIC-027 search performance measurement contract', /bookTrackerSearchMetrics/.test(html) && /検索処理の計測/.test(html) && /追加：ISBN検索/.test(html) && /検索全体：/.test(html) && /Provider別：/.test(html), 'search start-to-result timing and API/provider breakdown are explicit');
check('STATIC-022 search measurement operation labels are explicit', ['追加：作品＋巻数検索','書籍検索：キーワード検索','書籍検索：作家検索','書籍検索：作家新刊検索','類似作品検索：基礎作品検索','類似作品検索：候補検索','書籍詳細：関連書籍検索'].every(x=>html.includes(x)), 'all user-facing search flows have explicit measurement labels');
    check('STATIC-021 calendar/settings/ICS contracts exist', /function buildICS\(/.test(html) && /function escapeICSValue\(/.test(html) && /function getReleaseNotificationTargets\(/.test(html) && /persistedSettingsSnapshot/.test(html), 'calendar filters, settings rollback, ICS semantics, notification window');

check('STATIC-003 required six tabs', ['home','add','library','search','calendar','settings'].every(id=>new RegExp(`id=["']${id}["']`).test(html)), 'home/add/library/search/calendar/settings');
check('STATIC-004 price filter exists', /id=["']filterPrice["']/.test(html), 'library price filter');
check('STATIC-005 canonical registration routes exist', /window\.addBook\s*=/.test(html) && /window\.bulkAdd\s*=/.test(html), 'addBook/bulkAdd');
const addBookStart=html.indexOf('window.addBook=async');
const addBookEnd=html.indexOf('window.addAllFound=',addBookStart);
const addBookBody=addBookStart>=0&&addBookEnd>addBookStart?html.slice(addBookStart,addBookEnd):'';
check('STATIC-023 addBook does not finish caller-owned metrics', addBookBody.length>0&&!/bookTrackerRegistrationMetrics\?\.finish/.test(addBookBody), 'single-book registration metrics are finalized by operation entry points');
check('STATIC-024 processing excludes API measurement', /measureProcessing/.test(html) && !/metrics\.processingMs\+=/.test(html), 'data-processing timing excludes API communication timing');
check('STATIC-026 single-book notices are deferred until metrics finish', /deferNotice:true/.test(html) && /if\(options\.notice\)alert\(options\.notice\)/.test(html) && !/metrics\?\.renderMs\+=\(performance\.now\(\)-rt\);alert\("登録しました/.test(html), 'single-book user notices are shown after caller-owned metric finish');
check('STATIC-025 processing measurement receives token', /window\.bookTrackerRegistrationMetrics\.measureProcessing\(metrics,/.test(html) && !/metrics\.measureProcessing\(metrics,/.test(html), 'processing measurement API is called with the registration token');
check('STATIC-009 global registration lock contract', /registrationBusy/.test(html) && /runRegistrationAction/.test(html) && /data-register-action/.test(html), 'individual/bulk/detail/calendar registration shares one lock');
check('STATIC-010 search generation contract', /searchGenerations/.test(html) && /runSearchSingleFlight/.test(html) && /isCurrentSearch/.test(html), 'stale search responses cannot overwrite current results');
check('STATIC-011 data operation lock contract', /dataOperationBusy/.test(html) && /setDataOperationUiBusy/.test(html) && /data-data-operation/.test(html), 'registration and series repair share a data-operation lock');
check('STATIC-046 library diagnostics share operation lock', ['seriesCheckBtn','seriesDiagnoseBtn','bibliographyCompareBtn','isbnRegistrationPrepBtn','seriesRepairBtn'].every(id=>new RegExp('id=\"'+id+'\"[^>]*data-data-operation=\"1\"').test(html)) && /runLibraryDiagnosticAction/.test(html), 'all library diagnostics use the shared operation lock');
check('STATIC-047 library diagnostic result separation', /id="seriesCheckResults"/.test(html) && /id="seriesDiagnoseResults"/.test(html) && /id="bibliographyCompareResults"/.test(html) && /id="isbnRegistrationPrepResults"/.test(html) && /id="seriesRepairResults"/.test(html) && /function buildLibraryDiagnosticReport\(/.test(html), 'each library diagnostic retains its own result area and bundle report');
check('STATIC-048 NDL diagnostic individual action wiring', ['copyNdlProviderScopeBtn','clearNdlProviderScopeBtn','copyNdlSeriesCandidateBtn','clearNdlSeriesCandidateBtn'].every(id=>new RegExp('id=\"'+id+'\"').test(html)) && /copyNdlProviderScopeBtn\"\)\?\.addEventListener/.test(html) && /clearNdlProviderScopeBtn\"\)\?\.addEventListener/.test(html) && /copyNdlSeriesCandidateBtn\"\)\?\.addEventListener/.test(html) && /clearNdlSeriesCandidateBtn\"\)\?\.addEventListener/.test(html), 'NDL range/candidate copy and clear handlers are wired');
check('STATIC-049 library aggregate includes NDL diagnostics', /section\('NDLデータプロバイダ範囲診断','ndlProviderScopeResults'\)/.test(html) && /section\('NDLシリーズ候補取得診断','ndlSeriesCandidateResults'\)/.test(html), 'library bundle copy includes both NDL diagnostics');
check('STATIC-050 NDL scope diagnostic has bounded request timeout', /const queryWithTimeout=async\(isbn,scopeId\)=>/.test(html) && /setTimeout\(\(\)=>controller\.abort\(\),8000\)/.test(html), 'each diagnostic provider-range request cannot hang indefinitely');
check('STATIC-051 ISBN series source diagnostic is fully wired', ['isbnSeriesSourceBtn','isbnSeriesSourceResults','copyIsbnSeriesSourceBtn','clearIsbnSeriesSourceBtn'].every(id=>new RegExp('id=\"'+id+'\"').test(html)) && /function diagnoseIsbnSeriesSources\(\)/.test(html) && /isbnSeriesSourceBtn\"\)\.onclick=diagnoseIsbnSeriesSources/.test(html) && /copyIsbnSeriesSourceBtn\"\)\?\.addEventListener/.test(html) && /clearIsbnSeriesSourceBtn\"\)\?\.addEventListener/.test(html), 'ISBN series source diagnostic has action, result, copy, clear and execution wiring');
check('STATIC-052 ISBN series source diagnostic classifies provider outcomes', /FOUND/.test(html) && /NO_MATCH/.test(html) && /TIMEOUT/.test(html) && /SKIPPED/.test(html) && /楽天Books未設定/.test(html) && /Google Books無効/.test(html), 'provider diagnostic distinguishes usable data from absence, timeout and disabled providers');
check('STATIC-053 ISBN series source diagnostic is included in aggregate report and clear', /section\('ISBNシリーズ供給源診断','isbnSeriesSourceResults'\)/.test(html) && /clearIsbnSeriesSourceResult\(\)/.test(html), 'new diagnostic participates in aggregate report and clear-all flow');
check('STATIC-012 series repair excludes demo records', /isDemoRecord\(b\)/.test(html) && /通常の蔵書/.test(html), 'demo/sample records are excluded from repair');
check('STATIC-013 resolver session cache contract', /resolverCache/.test(fs.readFileSync(path.join(path.dirname(target),'api_management.js'),'utf8')), 'ISBN resolver results are cached per session');
check('STATIC-014 rule/test ledger exists', fs.existsSync(path.join(path.dirname(target),'RULE_LEDGER_v4_13_40.md')) && fs.existsSync(path.join(path.dirname(target),'RULE_TEST_MATRIX_v4_13_40.md')), 'rule ledger and verification matrix');
check('STATIC-015 UI display contract exists', /scrollWidth<=el\.clientWidth/.test(fs.readFileSync(path.join(path.dirname(target),'dev_guard.js'),'utf8')) && /E2E-UI-002 compact library statistics keep labels visible/.test(fs.readFileSync(path.join(path.dirname(target),'dev_guard.js'),'utf8')), 'visible/readable/clipping contract');
check('STATIC-042 diagnostic output containment contract exists', /diagnostic-output\{[^}]*max-height:42vh;overflow:auto/.test(html) && /registration-trace\{[^}]*max-height:34vh;overflow:auto/.test(html), 'long investigation results are bounded and scrollable');
check('STATIC-043 diagnostic copy controls exist', /copySeriesDiagnosticBtn/.test(html) && /copyDevGuardBtn/.test(html) && /copyRegistrationMetrics/.test(html) && /copySearchMetrics/.test(html) && /function copyElementText\(/.test(html), 'investigation results can be copied as full text');
check('STATIC-045 diagnostic copy/clear hierarchy exists', /copyLibraryDiagnosticReportBtn/.test(html) && /copySettingsDiagnosticReportBtn/.test(html) && /copyAllDiagnosticReportBtn/.test(html) && /clearSeriesDiagnosticBtn/.test(html) && /clearDevGuardBtn/.test(html) && /clearLibraryDiagnosticResultsBtn/.test(html) && /clearSettingsDiagnosticResultsBtn/.test(html) && /clearAllDiagnosticResultsBtn/.test(html) && /function clearAllDiagnosticResults\(/.test(html), 'individual/tab/session copy and clear controls are wired');
check('STATIC-016 sort tie-break contract exists', /REG-002B/.test(fs.readFileSync(target,'utf8')), 'all sort modes use deterministic tie-breaks');
check('STATIC-017 operation catalog exists', fs.existsSync(path.join(path.dirname(target),'OPERATION_CATALOG_v4_13_40.md')), 'data mutation operation catalog');


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
    const makeBrowserHtml=(seed={})=>{const seeded=JSON.stringify(seed);const shim=`<script>(function(){const initial=${seeded};const s=new Map(Object.entries(initial));window.__guardStorage={get length(){return s.size},key(i){return [...s.keys()][i]??null},getItem(k){return s.has(String(k))?s.get(String(k)):null},setItem(k,v){s.set(String(k),String(v))},removeItem(k){s.delete(String(k))},clear(){s.clear()}}})();<\/script>`;return shim+html.replace(/(?<![.\w])localStorage\b/g,'__guardStorage').replace(/<script src=\"\.\/api_management\.js(?:\?[^\"]*)?\"><\/script>/,`<script>${apiCode}</script>`)};
    const browserHtml=makeBrowserHtml();
    await cdp.send('Page.setDocumentContent',{frameId:(await cdp.send('Page.getFrameTree')).frameTree.frame.id,html:browserHtml}); await wait(1200);

    const loadState=await evalJS('({url:location.href,ready:document.readyState,title:document.title,storage:(()=>{try{__guardStorage.setItem("__guard","1");__guardStorage.removeItem("__guard");return true}catch(e){return false}})()})');
    check('E2E-000 target loaded',loadState && loadState.ready==='complete' && loadState.title==='本棚スケジュール' && loadState.storage===true,JSON.stringify(loadState));


    const requiredTabs=['home','add','library','search','calendar','settings'];
    const tabState=await evalJS(`(()=>{const ids=${JSON.stringify(requiredTabs)};return ids.map(id=>({id,exists:!!document.getElementById(id),hidden:document.getElementById(id)?.hidden}));})()`);
    check('E2E-001 all six tabs exist', tabState.every(x=>x.exists), JSON.stringify(tabState));

    const tabContracts={
      home:['homeBookCount','homeBookTotal','homePurchaseCount','homeUnreadCount','homeFavoriteCount','homeUpcomingBooks'],
      add:['scan','isbnRows','isbnSearch','work','vol','workSearch'],
      library:['libraryStats','libraryFilter','libraryFilterToggle','seriesViewToggle','librarySort','filterAuthor','filterPublisher','filterYear','filterRelease','filterReading','filterFavorite','filterPrice','filterReset','myBooks','seriesCheckBtn','shareDiagnosticReportBtn','seriesRepairBtn','unreadOnlyBtn'],
      search:['searchModeBook','searchModeAuthor','query','searchBtn','searchUnownedOnly','searchResults','similarBox','similarBtn','author','authorBtn','authorNewBtn','authorResults'],
      calendar:['calendarMonthCard','prevMonth','todayMonth','monthTitle','nextMonth','calHead','calendarGrid','calendarDayCard','calendarMonthReleasedCard','ics'],
      settings:['profileName','profileGenre','profileAuthor','profileMemo','profileSave','themeCurrent','fontCurrent','theme-choice','font-choice','skinSave','skinApply','bgImageInput','bgImageRemove','autoTextContrast','backupDataBtn','restoreDataBtn','setSearchCount','setSearchSort','setWeekStart','setICS']
    };
    for(const [tab,selectors] of Object.entries(tabContracts)){
      const missing=await evalJS(`(()=>${JSON.stringify(selectors)}.filter(x=>x==='theme-choice'||x==='font-choice'? !document.querySelector('.'+x):!document.getElementById(x)))()`);
      check(`CONTRACT-${tab}-001 required controls`,missing.length===0,missing.join(', '));
    }
    const apiAdapterContracts=await evalJS(`(()=>{try{
      const api=window.bookTrackerApiManagement;
      const rak=api?.normalizeRakuten?.({itemCode:'9784088720715',title:'レベルE 1巻',subTitle:'',seriesName:'レベルE',author:'冨樫義博',publisherName:'集英社',salesDate:'1996年01月',itemPrice:550,listPrice:0,largeImageUrl:'https://example.invalid/a.jpg'});
      const xml="<?xml version='1.0'?><searchRetrieveResponse xmlns='http://www.loc.gov/zing/srw/' xmlns:dcterms='http://purl.org/dc/terms/' xmlns:dcndl='http://ndl.go.jp/dcndl/terms/' xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'><records><record><recordData><dcterms:title>レベルE</dcterms:title><dcndl:seriesTitle><rdf:Description><rdf:value>レベルE</rdf:value></rdf:Description></dcndl:seriesTitle><dcndl:volume>3</dcndl:volume><dcterms:creator>冨樫義博</dcterms:creator><dcterms:publisher>集英社</dcterms:publisher><dcterms:issued>1996</dcterms:issued><dcterms:identifier rdf:resource='http://iss.ndl.go.jp/isbn/9784088720739'/></recordData></record></records></searchRetrieveResponse>";
      const ndl=api?.normalizeNDLFixture?.(xml,'9784088720739')?.[0];
      return {adapterMethods:typeof api?.adapters?.rakuten?.isbn==='function'&&typeof api?.adapters?.rakuten?.search==='function'&&typeof api?.adapters?.ndl?.isbn==='function'&&typeof api?.adapters?.ndl?.search==='function',ndlAdapterInstalled:typeof api?.adapters?.ndl?.search==='function'&&api?.providers?.ndl?.capabilities?.titleSearch===true,ndlSearchEnabled:api?.providers?.ndl?.enabled===true,rakuten:rak?.source==='rakuten'&&rak?.series?.name==='レベルE'&&rak?.series?.volumeNumber===1&&rak?.priceMeta?.listPrice===null&&rak?.priceMeta?.salePrice===550,ndl:ndl?.source==='ndl'&&ndl?.series?.name==='レベルE'&&ndl?.series?.volumeNumber===3&&canonicalIsbn(ndl?.isbn)==='9784088720739'};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-API-006B Rakuten/NDL adapters are installed safely',apiAdapterContracts?.adapterMethods===true&&apiAdapterContracts?.ndlAdapterInstalled===true,JSON.stringify(apiAdapterContracts));
    check('E2E-API-006C Rakuten normalization separates sale price from list price',apiAdapterContracts?.rakuten===true,JSON.stringify(apiAdapterContracts));
    check('E2E-API-006D NDL normalization maps series/volume/ISBN',apiAdapterContracts?.ndl===true,JSON.stringify(apiAdapterContracts));
    const ndlOpenSearchFixture=await evalJS(`(()=>{const api=window.bookTrackerApiManagement;const xml="<?xml version='1.0'?><rss xmlns:dc='http://purl.org/dc/elements/1.1/' xmlns:dcterms='http://purl.org/dc/terms/' xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance' xmlns:dcndl='http://ndl.go.jp/dcndl/terms/'><channel><item><title>レベルE</title><dc:title>レベルE</dc:title><dc:creator>冨樫義博</dc:creator><dc:publisher>集英社</dc:publisher><dcterms:issued>1996</dcterms:issued><dcndl:volume>3</dcndl:volume><dcndl:volumeTitle>3巻</dcndl:volumeTitle><dcndl:seriesTitle>レベルE</dcndl:seriesTitle><dc:identifier xsi:type='dcndl:ISBN'>9784088720739</dc:identifier></item></channel></rss>";const rows=api.normalizeNDLOpenSearch?.(xml)||[];const x=rows[0]||{};return {ok:rows.length===1&&x.title==='レベルE'&&canonicalIsbn(x.isbn)==='9784088720739'&&x.author==='冨樫義博'&&x.publisher==='集英社'&&x.date==='1996'&&x.series?.name==='レベルE'&&x.series?.volumeNumber===3,rows:rows.map(x=>({title:x.title,isbn:x.isbn,author:x.author,publisher:x.publisher,date:x.date,series:x.series}))};})()`);
    check('E2E-API-006L NDL OpenSearch normalization',ndlOpenSearchFixture?.ok===true,JSON.stringify(ndlOpenSearchFixture));
    const ndlSearchContract=await evalJS(`(()=>{const api=window.bookTrackerApiManagement;const u=api?.buildNDLSruSearchUrl?.({title:'鬼滅の刃',limit:20,booksOnly:true})||'';const p=new URL(u).searchParams,q=p.get('query')||'';return {ok:q.includes('dpid=iss-ndl-opac')&&!q.includes('dpgroupid=')&&q.includes('mediatype=books')&&p.get('recordSchema')==='dcndl'&&p.get('onlyBib')==='true'&&q.includes('title=')&&q.includes('鬼滅の刃')&&!p.has('dpid'),url:u,query:q}})()`);
    check('E2E-API-006N NDL SRUは図書/DC-NDL書誌条件を付与',ndlSearchContract?.ok===true,JSON.stringify(ndlSearchContract));
    const searchTitleVolumeContract=await evalJS(`(()=>{const a=displayBookTitle?.({title:'鬼滅の刃',series:{name:'鬼滅の刃',volumeNumber:1}});return {ok:a==='鬼滅の刃 1',value:a}})()`);
    check('E2E-SEARCH-007 API取得巻数を検索結果タイトルへ表示',searchTitleVolumeContract?.ok===true,JSON.stringify(searchTitleVolumeContract));
    const registerButtonContract=await evalJS(`(()=>{const s=registerFromCardButton?.toString?.()||'';return {ok:s.includes('succeeded=result===true')&&s.includes("cardEl.outerHTML=card(book,true,'result',index)")&&!s.includes('finally{if(document.body.contains(btn)){btn.disabled=false;btn.dataset.busy="0";btn.textContent=oldText}}')}})()`);
    check('E2E-REG-006 単冊登録成功後のボタン状態更新',registerButtonContract?.ok===true,JSON.stringify(registerButtonContract));
    // Phase 5/6: real resolver/search routing is tested with deterministic adapter doubles.
    const failoverSmoke=await evalJS(`(async()=>{try{
      const api=window.bookTrackerApiManagement, old={google:api.adapters.googleBooks.isbn,rak:api.adapters.rakuten.isbn,searchG:api.adapters.googleBooks.search,searchR:api.adapters.rakuten.search};
      const saved={g:api.providers.googleBooks.enabled,r:api.providers.rakuten.enabled,o:api.providers.openBD.enabled,threshold:api.runtimePolicy.failureThreshold,cooldown:api.runtimePolicy.cooldownMs,timeout:api.runtimePolicy.requestTimeoutMs,providerTimeouts:{...(api.runtimePolicy.providerTimeoutMs||{})},search:[...api.priority.search],isbn:[...api.priority.isbnSearch],rakutenConfig:globalThis.bookTrackerProviderConfig?.rakuten};
      api.providers.googleBooks.enabled=true;api.providers.rakuten.enabled=true;api.providers.openBD.enabled=false;globalThis.bookTrackerProviderConfig={rakuten:{applicationId:'guard-app',accessKey:'guard-key'}};api.priority.search=['googleBooks','rakuten','ndl'];api.priority.isbnSearch=['googleBooks','rakuten','openBD','ndl'];api.clearResolverCache();api.runtimePolicy.failureThreshold=1;api.runtimePolicy.cooldownMs=60000;api.runtimePolicy.requestTimeoutMs=50;
      let gCalls=0,rCalls=0,sgCalls=0,srCalls=0;
      api.adapters.googleBooks.isbn=async()=>{gCalls++;throw Error('synthetic Google outage')};
      api.adapters.rakuten.isbn=async isbn=>{rCalls++;return [{isbn,title:'楽天フォールバック本',author:'A',publisher:'P',date:'2026-01-01',source:'rakuten',series:null,priceMeta:{listPrice:null,salePrice:500,taxIncluded:true},fieldEvidence:{title:api.evidenceFor('title','楽天フォールバック本',{identifierMatched:true,countryMatched:true})}}]};
      const one=await api.resolveIsbn('9784088720715',{full:true});
      const firstFallback=one?.resolution?.attempts?.some(x=>x.provider==='googleBooks'&&x.ok===false)&&one?.resolution?.attempts?.some(x=>x.provider==='rakuten'&&x.ok===true);
      const gh=api.providerHealth.get('googleBooks');gh.failures=0;gh.temporarilyDisabledUntil=0;
      api.adapters.googleBooks.search=async()=>{sgCalls++;throw Error('synthetic Google search outage')};
      api.adapters.rakuten.search=async()=>{srCalls++;return [{isbn:'9784088720715',title:'検索フォールバック',author:'A',source:'rakuten'}]};
      const sr=await api.search('検索フォールバック',5);
      const searchFallback=sr?.results?.[0]?.title==='検索フォールバック'&&sr?.attempts?.some(x=>x.provider==='googleBooks'&&x.ok===false)&&sr?.attempts?.some(x=>x.provider==='rakuten'&&x.ok===true);
      gh.failures=0;gh.temporarilyDisabledUntil=0;
      api.adapters.googleBooks.search=async()=>{sgCalls++;await new Promise(r=>setTimeout(r,100));return [{isbn:'9784088720999',title:'タイムアウト元',author:'A',source:'googleBooks'}]};
      api.adapters.rakuten.search=async()=>{srCalls++;return [{isbn:'9784088720998',title:'タイムアウト後フォールバック',author:'A',source:'rakuten'}]};
      const st=await api.search('タイムアウト後フォールバック',5);
      const timeoutFallback=st?.results?.[0]?.title==='タイムアウト後フォールバック'&&st?.attempts?.some(x=>x.provider==='googleBooks'&&x.ok===false&&String(x.error||'').includes('timeout'))&&st?.attempts?.some(x=>x.provider==='rakuten'&&x.ok===true);
      const before=gCalls;const two=await api.resolveIsbn('9784088720722',{full:true}).catch(()=>null);const cooldownSkip=gCalls===before&&two?.resolution?.attempts?.some(x=>x.provider==='googleBooks'&&x.skipped===true);
      api.adapters.googleBooks.isbn=old.google;api.adapters.rakuten.isbn=old.rak;api.adapters.googleBooks.search=old.searchG;api.adapters.rakuten.search=old.searchR;
      api.providers.googleBooks.enabled=saved.g;api.providers.rakuten.enabled=saved.r;api.providers.openBD.enabled=saved.o;globalThis.bookTrackerProviderConfig={rakuten:saved.rakutenConfig||{applicationId:'',accessKey:''}};api.priority.search=saved.search;api.priority.isbnSearch=saved.isbn;api.runtimePolicy.failureThreshold=saved.threshold;api.runtimePolicy.cooldownMs=saved.cooldown;api.runtimePolicy.requestTimeoutMs=saved.timeout;api.runtimePolicy.providerTimeoutMs=saved.providerTimeouts;api.clearResolverCache();
      return {firstFallback,searchFallback,timeoutFallback,cooldownSkip,gCalls,rCalls,sgCalls,srCalls};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-API-006E ISBN自動フェイルオーバー',failoverSmoke?.firstFallback===true,JSON.stringify(failoverSmoke));
    check('E2E-API-006F 検索自動フェイルオーバー',failoverSmoke?.searchFallback===true,JSON.stringify(failoverSmoke));
    const ndlSearchFallback=await evalJS(`(async()=>{try{const api=window.bookTrackerApiManagement;const oldG=api.adapters.googleBooks.search,oldN=api.adapters.ndl.search;const saved={g:api.providers.googleBooks.enabled,n:api.providers.ndl.enabled,threshold:api.runtimePolicy.failureThreshold,cooldown:api.runtimePolicy.cooldownMs,timeout:api.runtimePolicy.requestTimeoutMs,pt:{...(api.runtimePolicy.providerTimeoutMs||{})},search:[...api.priority.search]};api.clearResolverCache();for(const h of api.providerHealth.values()){h.failures=0;h.temporarilyDisabledUntil=0;h.lastError='';}api.providers.googleBooks.enabled=true;api.providers.ndl.enabled=true;api.priority.search=['googleBooks','ndl'];api.runtimePolicy.failureThreshold=99;api.runtimePolicy.cooldownMs=1000;api.runtimePolicy.requestTimeoutMs=500;api.runtimePolicy.providerTimeoutMs={googleBooks:40,ndl:100};let gc=0,nc=0;api.adapters.googleBooks.search=async()=>{gc++;return await new Promise(r=>setTimeout(()=>r([]),200))};api.adapters.ndl.search=async()=>{nc++;return [{isbn:'9784088720739',title:'レベルE',author:'冨樫義博',source:'ndl'}]};const r=await api.search('レベルE',5);const g=r?.attempts?.find(x=>x.provider==='googleBooks'),n=r?.attempts?.find(x=>x.provider==='ndl');const ok=gc===1&&nc===1&&g?.ok===false&&String(g?.error||'').toLowerCase().includes('timeout')&&n?.ok===true&&r?.results?.[0]?.title==='レベルE';api.adapters.googleBooks.search=oldG;api.adapters.ndl.search=oldN;api.providers.googleBooks.enabled=saved.g;api.providers.ndl.enabled=saved.n;api.priority.search=saved.search;api.runtimePolicy.failureThreshold=saved.threshold;api.runtimePolicy.cooldownMs=saved.cooldown;api.runtimePolicy.requestTimeoutMs=saved.timeout;api.runtimePolicy.providerTimeoutMs=saved.pt;api.clearResolverCache();return {ok,gc,nc,google:g,ndl:n};}catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-API-006K 検索 timeout -> NDL fallback',ndlSearchFallback?.ok===true,JSON.stringify(ndlSearchFallback));
    check('E2E-API-006G 障害Provider一時クールダウン',failoverSmoke?.cooldownSkip===true,JSON.stringify(failoverSmoke));
    check('E2E-API-006H timeout時の自動フェイルオーバー',failoverSmoke?.timeoutFallback===true,JSON.stringify(failoverSmoke));
    const isbnTimeoutFallback=await evalJS(`(async()=>{try{
      const api=window.bookTrackerApiManagement, oldG=api.adapters.googleBooks.isbn, oldO=api.adapters.openBD.isbn;
      const saved={g:api.providers.googleBooks.enabled,o:api.providers.openBD.enabled,threshold:api.runtimePolicy.failureThreshold,cooldown:api.runtimePolicy.cooldownMs,timeout:api.runtimePolicy.requestTimeoutMs,providerTimeouts:{...(api.runtimePolicy.providerTimeoutMs||{})}};
      api.clearResolverCache(); for(const h of api.providerHealth.values()){h.failures=0;h.temporarilyDisabledUntil=0;h.lastError='';}
      api.providers.googleBooks.enabled=true;api.providers.openBD.enabled=true;api.runtimePolicy.failureThreshold=99;api.runtimePolicy.cooldownMs=1000;api.runtimePolicy.requestTimeoutMs=500;api.runtimePolicy.providerTimeoutMs={googleBooks:40};
      let gCalls=0,oCalls=0;
      api.adapters.googleBooks.isbn=async()=>{gCalls++;return await new Promise((resolve,reject)=>setTimeout(()=>resolve([]),200))};
      api.adapters.openBD.isbn=async isbn=>{oCalls++;return [{isbn,title:'ISBN timeout fallback test',author:'A',publisher:'P',date:'2026-01-01',source:'openBD',series:null,priceMeta:{listPrice:null},fieldEvidence:{title:api.evidenceFor('title','ISBN timeout fallback test',{identifierMatched:true,countryMatched:true})}}]};
      const r=await api.resolveIsbn('9784086191524',{full:true});
      const attempts=r?.resolution?.attempts||[];
      const g=attempts.find(x=>x.provider==='googleBooks'),o=attempts.find(x=>x.provider==='openBD');
      const ok=gCalls===1&&oCalls===1&&g?.ok===false&&String(g?.error||'').toLowerCase().includes('timeout')&&g?.timeoutMs===40&&o?.ok===true&&r?.title==='ISBN timeout fallback test';
      api.adapters.googleBooks.isbn=oldG;api.adapters.openBD.isbn=oldO;api.providers.googleBooks.enabled=saved.g;api.providers.openBD.enabled=saved.o;api.runtimePolicy.failureThreshold=saved.threshold;api.runtimePolicy.cooldownMs=saved.cooldown;api.runtimePolicy.requestTimeoutMs=saved.timeout;api.runtimePolicy.providerTimeoutMs=saved.providerTimeouts;api.clearResolverCache();
      return {ok,gCalls,oCalls,google:g,openBD:o};
    }catch(e){return {error:String(e?.message||e)}}})()`)
    check('E2E-API-006J ISBN timeout -> openBD fallback',isbnTimeoutFallback?.ok===true,JSON.stringify(isbnTimeoutFallback));
    const providerTimeoutContract=await evalJS(`(()=>{const api=window.bookTrackerApiManagement;return {googleBooks:api.runtimePolicy.providerTimeoutMs?.googleBooks,ndl:api.runtimePolicy.providerTimeoutMs?.ndl,defaultTimeout:api.runtimePolicy.requestTimeoutMs}})()`); check('E2E-API-006I Provider別タイムアウト設定',providerTimeoutContract?.googleBooks===4000&&providerTimeoutContract?.ndl===8000,JSON.stringify(providerTimeoutContract));
    const ndlDefaultContract=await evalJS(`(()=>{const api=window.bookTrackerApiManagement;return {enabled:api.providers.ndl?.enabled,hasSearch:typeof api.adapters.ndl?.search==='function'}})()`); check('E2E-API-006L NDL OpenSearch通常検索Provider',ndlDefaultContract?.enabled===true&&ndlDefaultContract?.hasSearch===true,JSON.stringify(ndlDefaultContract));
    const ndlDisabledSkip=await evalJS(`(async()=>{try{const api=window.bookTrackerApiManagement,oldG=api.adapters.googleBooks.search,savedG=api.providers.googleBooks.enabled,savedN=api.providers.ndl.enabled,savedT=api.runtimePolicy.providerTimeoutMs?.googleBooks;let gc=0,nc=0;api.providers.googleBooks.enabled=true;api.providers.ndl.enabled=false;api.runtimePolicy.providerTimeoutMs={...(api.runtimePolicy.providerTimeoutMs||{}),googleBooks:40};api.adapters.googleBooks.search=async()=>{gc++;return await new Promise(r=>setTimeout(()=>r([]),100))};api.adapters.ndl.search=async()=>{nc++;return [{title:'should-not-run',source:'ndl'}]};const r=await api.search('NDL disabled contract',5).catch(e=>({error:String(e?.message||e),attempts:e?.attempts||[]}));const n=r?.attempts?.find(x=>x.provider==='ndl');api.adapters.googleBooks.search=oldG;api.providers.googleBooks.enabled=savedG;api.providers.ndl.enabled=savedN;api.runtimePolicy.providerTimeoutMs={...(api.runtimePolicy.providerTimeoutMs||{}),googleBooks:savedT};return {ok:gc===1&&nc===0&&n?.skipped===true&&n?.reason==='provider disabled',googleCalls:gc,ndlCalls:nc,ndlAttempt:n};}catch(e){return {error:String(e?.message||e)}}})()`); check('E2E-API-006M NDL無効時は追加待ちせず明示スキップ',ndlDisabledSkip?.ok===true,JSON.stringify(ndlDisabledSkip));

    // Phase 7: bounded/config-aware resolver cache and critical-field non-downgrade contracts.
    const phase7Cache=await evalJS(`(async()=>{try{
      const api=window.bookTrackerApiManagement, old={isbn:api.adapters.googleBooks.isbn},oldPriority=[...api.priority.isbnSearch];
      api.clearResolverCache();
      for(const h of api.providerHealth.values()){h.failures=0;h.temporarilyDisabledUntil=0;h.lastError='';}
      api.providers.googleBooks.enabled=true;api.priority.isbnSearch=['googleBooks','openBD','rakuten','ndl'];
      api.runtimePolicy.requestTimeoutMs=500;
      let calls=0;
      api.adapters.googleBooks.isbn=async isbn=>{calls++;return [{isbn,title:'Cache Test '+calls,author:'A',publisher:'P',source:'googleBooks',fieldEvidence:{title:api.evidenceFor('title','Cache Test '+calls,{identifierMatched:true,countryMatched:true})}}]};
      const a=await api.resolveIsbn('9784088720999',{full:true});
      const b=await api.resolveIsbn('9784088720999',{full:true});
      const cacheHit=calls===1&&a.title===b.title;
      const oldEnabled={g:api.providers.googleBooks.enabled,r:api.providers.rakuten.enabled,n:api.providers.ndl.enabled,o:api.providers.openBD.enabled};
      api.providers.googleBooks.enabled=false;api.providers.rakuten.enabled=false;api.providers.ndl.enabled=false;api.providers.openBD.enabled=false;
      const invalidated=api.cacheInfo().size===1 && (await api.resolveIsbn('9784088720999',{full:true}).catch(()=>null))===null;
      api.providers.googleBooks.enabled=oldEnabled.g;api.providers.rakuten.enabled=oldEnabled.r;api.providers.ndl.enabled=oldEnabled.n;api.providers.openBD.enabled=oldEnabled.o;
      api.adapters.googleBooks.isbn=old.isbn;api.priority.isbnSearch=oldPriority;
      api.clearResolverCache();
      return {cacheHit,invalidated,cacheInfo:api.cacheInfo()};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-API-007A resolver cache is bounded and config-aware',phase7Cache?.cacheHit===true&&phase7Cache?.invalidated===true,JSON.stringify(phase7Cache));

    const phase7Critical=await evalJS(`(()=>{try{
      const bad={resolution:{accepted:{series:false,listPrice:false}},series:{id:'BAD',name:'別作品',volumeNumber:9},priceMeta:{listPrice:100,taxIncluded:false},title:'API title'};
      const base={isbn:'9784088720715',title:'既存タイトル',series:{id:'GOOD',name:'レベルE',volumeNumber:1},price:{listPrice:550,status:'confirmed',currency:'JPY',taxIncluded:true,source:'manual',confidence:'HIGH'}};
      const merged=mergeRegistrationBook(base,bad);
      const seriesKept=merged.series?.id==='GOOD'&&merged.series?.name==='レベルE'&&merged.series?.volumeNumber===1;
      const priceKept=merged.price?.listPrice===550&&merged.price?.status==='confirmed'&&merged.price?.taxIncluded===true;
      return {seriesKept,priceKept};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('LOGIC-API-007B critical fields are never downgraded by rejected resolver data',phase7Critical?.seriesKept===true&&phase7Critical?.priceKept===true,JSON.stringify(phase7Critical));

    const providerContracts=await evalJS(`(()=>{const api=window.bookTrackerApiManagement;return Object.entries(api.adapters).every(([name,a])=>{if(!a||typeof a.isbn!=='function')return false;if(api.providers[name]?.capabilities?.titleSearch&&typeof a.search!=='function')return false;return true})})()`);
    check('STATIC-API-007C enabled Adapter capability contract',providerContracts===true,'ISBN adapter and titleSearch capability must match implementation');

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
      out.registrationSeriesPreserved=(()=>{const base={isbn:"logic-series",title:"レベルE 2",price:550,series:null};const resolved={title:"レベルE",author:"冨樫義博",publisher:"集英社",series:{id:"LEVEL-E",name:"レベルE",volumeNumber:2},resolution:{accepted:{series:true}}};const x=mergeRegistrationBook(base,resolved);return x.series?.id==="LEVEL-E"&&x.series?.name==="レベルE"&&x.series?.volumeNumber===2})();
      out.searchSingleFlight=typeof runSingleFlight==='function'&&activeActions instanceof Set;
      out.globalRegistrationLock=typeof runRegistrationAction==='function'&&typeof setRegistrationUiBusy==='function'&&registrationBusy===false;
      const regA=registrationKey({isbn:"9780000000000",title:"A"}),regB=registrationKey({isbn:"9780000000000",title:"A"});registrationLocks.add(regA);out.registrationLockShared=regA===regB&&registrationLocks.has(regB);registrationLocks.delete(regA);
      const sg1=beginSearchRequest('guard-search-target'),sg2=beginSearchRequest('guard-search-target');out.searchGenerationInvalidation=sg2>sg1&&!isCurrentSearch('guard-search-target',sg1)&&isCurrentSearch('guard-search-target',sg2);
      out.registrationActionDataAttrs=document.documentElement.innerHTML.includes('data-register-action="1"');
      out.existingSeriesRepairContract=typeof repairExistingSeries==='function'&&typeof safeSeriesRepairCandidate==='function'&&(()=>{const s={id:'LEVEL-E',name:'レベルE',volumeNumber:2,confidence:{seriesName:'HIGH',volumeNumber:'HIGH',seriesId:'HIGH'}};const r={series:s,resolution:{accepted:{series:true}}};const ok=safeSeriesRepairCandidate({title:'レベルE 2'},r);const no=safeSeriesRepairCandidate({title:'レベルE 外伝 1'},r);const sub=safeSeriesRepairCandidate({title:'レベルE v.2 (Full moon…!)'},r);return ok?.id==='LEVEL-E'&&ok?.volumeNumber===2&&!no&&sub?.id==='LEVEL-E'})();
      return out;
    })()`);
    for(const [name,ok] of Object.entries(logic)) check(`LOGIC-${name}`,ok,ok?'OK':'spec contract failed');
    const concurrencySmoke=await evalJS(`(async()=>{
      const first=runSearchSingleFlight('guard-search-a','guard-concurrency',null,async token=>{await sleep(80);return isCurrentSearch('guard-concurrency',token)});
      await sleep(10);
      const second=runSearchSingleFlight('guard-search-b','guard-concurrency',null,async token=>isCurrentSearch('guard-concurrency',token));
      const r=await Promise.all([first,second]);
      const regFirst=runRegistrationAction(async()=>{await sleep(40);return 'first'});
      await sleep(5);const regSecond=runRegistrationAction(async()=> 'second');
      const rr=await Promise.all([regFirst,regSecond]);
      return {staleRejected:r[0]===false,currentAccepted:r[1]===true,registrationSecondRejected:rr[1]===false,registrationFirstCompleted:rr[0]==='first'};
    })()`);
    check('E2E-CONCURRENCY-001 stale search response cannot win',concurrencySmoke?.staleRejected===true&&concurrencySmoke?.currentAccepted===true,JSON.stringify(concurrencySmoke));
    check('E2E-CONCURRENCY-002 registration actions are globally serialized',concurrencySmoke?.registrationSecondRejected===true&&concurrencySmoke?.registrationFirstCompleted===true,JSON.stringify(concurrencySmoke));
    const dataLockSmoke=await evalJS(`(async()=>{const before=dataOperationBusy;dataOperationBusy=true;const searchBlocked=await runSearchSingleFlight('guard-data-lock','guard-data-lock-target',null,async()=>true)===null;const regBlocked=await runRegistrationAction(async()=>true)===false;dataOperationBusy=before;return {searchBlocked,regBlocked};})()`);
    check('E2E-CONCURRENCY-003 data operation lock blocks competing actions',dataLockSmoke?.searchBlocked===true&&dataLockSmoke?.regBlocked===true,JSON.stringify(dataLockSmoke));
    const libraryDiagnosticLockSmoke=await evalJS(`(async()=>{const before=dataOperationBusy;dataOperationBusy=true;syncOperationUi();const ids=['seriesCheckBtn','seriesDiagnoseBtn','bibliographyCompareBtn','isbnRegistrationPrepBtn','seriesRepairBtn'];const disabled=ids.every(id=>document.getElementById(id)?.disabled===true);const a=await runSeriesCheck()===false;const b=await diagnoseSeriesGrouping()===false;const c=await compareBibliographyPaths()===false;const d=await diagnoseIsbnRegistrationPreparation()===false;const e=await repairExistingSeries()===false;dataOperationBusy=before;syncOperationUi();return {disabled,blocked:[a,b,c,d,e].every(Boolean)}})()`);
    check('E2E-CONCURRENCY-004 all library diagnostics are mutually exclusive',libraryDiagnosticLockSmoke?.disabled===true&&libraryDiagnosticLockSmoke?.blocked===true,JSON.stringify(libraryDiagnosticLockSmoke));
    const repairSmoke=await evalJS(`(async()=>{
      const api=window.bookTrackerApiManagement, oldResolve=api.resolveIsbn, oldConfirm=window.confirm, oldAlert=window.alert, oldBooks=books.slice();
      const sample=[
        {isbn:'9784088720715',title:'レベルE 1',author:'冨樫義博',publisher:'集英社',date:'1996-01-01',price:makeConfirmedListPrice(550,'manual','HIGH'),series:{id:'WRONG-1',name:'レベルE 1',volumeNumber:1},marker:'keep1'},
        {isbn:'9784088720722',title:'レベルE 第2巻',author:'冨樫義博',publisher:'集英社',date:'1996-02-01',price:makeConfirmedListPrice(550,'manual','HIGH'),series:{id:'WRONG-2',name:'レベルE 2',volumeNumber:2},marker:'keep2'},
        {isbn:'9784088720739',title:'レベルE （3）',author:'冨樫義博',publisher:'集英社',date:'1996-03-01',price:makeConfirmedListPrice(550,'manual','HIGH'),series:{id:'WRONG-3',name:'レベルE 3',volumeNumber:3},marker:'keep3'},
        {isbn:'9784088720746',title:'レベルE 外伝 1',author:'冨樫義博',publisher:'集英社',series:{id:'SPIN',name:'レベルE 外伝',volumeNumber:1},marker:'keep-side'},
        {isbn:'demo-002',title:'サンプルシリーズ：星の余白 1巻',author:'サンプル作家',publisher:'サンプル出版社',series:{id:'WRONG-DEMO',name:'星の余白 1',volumeNumber:1},demo:true,marker:'keep-demo'}
      ];
      const byIsbn={
        '9784088720715':1,'9784088720722':2,'9784088720739':3,'9784088720746':1
      };
      api.resolveIsbn=async isbn=>{const n=byIsbn[canonicalIsbn(isbn)];return {series:{id:'LEVEL-E',name:'レベルE',volumeNumber:n,confidence:{seriesId:'HIGH',seriesName:'HIGH',volumeNumber:'HIGH'}},resolution:{accepted:{series:true}}};};
      let calls=0; const orig=api.resolveIsbn; api.resolveIsbn=async isbn=>{calls++;return orig(isbn)};
      window.confirm=()=>true; window.alert=()=>{}; books=sample; await repairExistingSeries();
      const ok=books[0].series?.id==='LEVEL-E'&&books[1].series?.id==='LEVEL-E'&&books[2].series?.id==='LEVEL-E'&&books[0].series?.volumeNumber===1&&books[1].series?.volumeNumber===2&&books[2].series?.volumeNumber===3&&books[3].series?.id==='SPIN'&&books[0].marker==='keep1'&&books[1].marker==='keep2'&&books[2].marker==='keep3'&&books[3].marker==='keep-side'&&books[4].series?.id==='WRONG-DEMO'&&books[4].marker==='keep-demo';
      api.resolveIsbn=oldResolve; window.confirm=oldConfirm; window.alert=oldAlert; books=oldBooks; renderLibrary();
      return {ok,calls};
    })()`)
    check('E2E-REPAIR-001 existing series repair preserves metadata and separates variants',repairSmoke?.ok===true,JSON.stringify(repairSmoke));
    check('E2E-REPAIR-002 resolver cache is ISBN-scoped',repairSmoke?.calls===4,'one resolver call per distinct ISBN');
    const repairUi=await evalJS(`(()=>{const b=document.getElementById('seriesRepairBtn'),old=b?.textContent;setLongOperationUi(b,true,'シリーズ再整理中…');const ok=b?.disabled===true&&b?.textContent==='シリーズ再整理中…'&&b?.dataset.busy==='1';setLongOperationUi(b,false);return ok&&b?.textContent===old})()`);
    check('E2E-REPAIR-003 repair action exposes busy state',repairUi===true,'button becomes disabled and shows progress text');

    const sharedStatsUi=await evalJS(`(()=>{
      const nav=id=>document.querySelector('#bottomNav button[data-s="'+id+'"]')?.click();
      const props=['paddingTop','paddingRight','paddingBottom','paddingLeft','borderRadius','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','boxShadow'];
      const styleSig=el=>{const c=getComputedStyle(el);return props.map(k=>c[k]).join('|')};
      const geometrySig=el=>{const r=el.getBoundingClientRect();return [Math.round(r.width*10)/10,Math.round(r.height*10)/10].join('x')};
      const labels=e=>[...e.querySelectorAll('.statbox .library-stat-label')].map(x=>x.textContent.trim());
      nav('home');
      const home=document.getElementById('homeStats');
      const homeBoxes=[...(home?.querySelectorAll('.statbox')||[])];
      const homeGrid=getComputedStyle(home||document.body);
      const homeStyle=homeBoxes.map(styleSig),homeGeometry=homeBoxes.map(geometrySig);
      const homeGridSig=[homeGrid.gridTemplateColumns,homeGrid.gap,homeGrid.marginTop].join('|');
      nav('library');
      const lib=document.getElementById('libraryStats');
      lib?.classList.remove('is-compact');
      const libBoxes=[...(lib?.querySelectorAll('.statbox')||[])];
      const libGrid=getComputedStyle(lib||document.body);
      const libStyle=libBoxes.map(styleSig),libGeometry=libBoxes.map(geometrySig);
      const libGridSig=[libGrid.gridTemplateColumns,libGrid.gap,libGrid.marginTop].join('|');
      const sameStyles=homeBoxes.length===5&&libBoxes.length===5&&homeStyle.join('||')===libStyle.join('||');
      const sameGeometry=homeBoxes.length===5&&libBoxes.length===5&&homeGeometry.join('|')===libGeometry.join('|');
      const sameGrid=!!home&&!!lib&&homeGridSig===libGridSig;
      const sameStructure=homeBoxes.length===5&&libBoxes.length===5&&homeBoxes.every((b,i)=>b.children.length===libBoxes[i].children.length&&[...b.children].map(x=>x.tagName+':'+x.className).join('|')===[...libBoxes[i].children].map(x=>x.tagName+':'+x.className).join('|'));
      const sameLabels=homeBoxes.length===5&&libBoxes.length===5&&labels(home).join('|')===labels(lib).join('|');
      const sharedRenderer=typeof renderStatBoxes==='function'&&renderHome.toString().includes('renderStatBoxes')&&renderLibrary.toString().includes('renderStatBoxes');
      return {sameStyles,sameGeometry,sameGrid,sameStructure,sameLabels,sharedRenderer,homeCount:homeBoxes.length,libraryCount:libBoxes.length,homeGrid:homeGridSig,libraryGrid:libGridSig};
    })()`);
    check('E2E-UI-001 home/library statistics panels are unified',sharedStatsUi?.sameStyles===true&&sharedStatsUi?.sameGeometry===true&&sharedStatsUi?.sameGrid===true&&sharedStatsUi?.sameStructure===true&&sharedStatsUi?.sameLabels===true&&sharedStatsUi?.sharedRenderer===true,JSON.stringify(sharedStatsUi));

    const compactStatsUi=await evalJS(`(()=>{
      const nav=id=>document.querySelector('#bottomNav button[data-s="'+id+'"]')?.click();
      nav('library');
      const lib=document.getElementById('libraryStats');
      if(!lib)return {ok:false,reason:'libraryStats missing'};
      lib.classList.add('is-compact');
      const labels=[...lib.querySelectorAll('.library-stat-label')];
      const visible=labels.length===5&&labels.every(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();const noClip=el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1;const range=document.createRange();range.selectNodeContents(el);const rr=range.getBoundingClientRect();const fullyInside=rr.left>=r.left-1&&rr.right<=r.right+1&&rr.top>=r.top-1&&rr.bottom<=r.bottom+1;return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&noClip&&fullyInside;});
      const text=labels.map(x=>x.textContent.trim());
      lib.classList.remove('is-compact');
      return {ok:visible,visible,text,display:labels.map(x=>getComputedStyle(x).display)};
    })()`);
    check('E2E-UI-002 compact library statistics keep labels visible',compactStatsUi?.ok===true,JSON.stringify(compactStatsUi));

    const compactTopUi=await evalJS(`(async()=>{
      const nav=id=>document.querySelector('#bottomNav button[data-s="'+id+'"]')?.click();
      nav('library');
      window.scrollTo(0,Math.max(0,document.documentElement.scrollHeight-innerHeight));
      await new Promise(r=>setTimeout(r,50));
      if(typeof updateLibraryStatsCompact==='function')updateLibraryStatsCompact();
      const lib=document.getElementById('libraryStats');
      const cs=getComputedStyle(lib),r=lib.getBoundingClientRect();
      const topOk=Math.abs(r.top)<=1;
      const fixedOk=cs.position==='fixed';
      const noHeaderOffset=cs.top==='0px';
      return {ok:topOk&&fixedOk&&noHeaderOffset,top:r.top,position:cs.position,cssTop:cs.top};
    })()`);
    check('E2E-UI-005 compact library statistics stick to viewport top',compactTopUi?.ok===true,JSON.stringify(compactTopUi));

    const diagnosticUi=await evalJS(`(()=>{
      const details=[...document.querySelectorAll('.diagnostic-tools')];
      const allClosed=details.every(d=>!d.open);
      const outputs=[...document.querySelectorAll('.diagnostic-output')];
      const bounded=outputs.every(e=>{const s=getComputedStyle(e);return s.overflowY==='auto'&&s.maxHeight!=='none'});
      const copyIds=['copySeriesDiagnosticBtn','copyDevGuardBtn','copyRegistrationMetrics','copySearchMetrics'];
      const copies=copyIds.every(id=>!!document.getElementById(id));
      return {details:details.length,allClosed,bounded,copies};
    })()`);
    check('E2E-UI-003 investigation UI is collapsed and bounded',diagnosticUi?.allClosed===true&&diagnosticUi?.bounded===true&&diagnosticUi?.copies===true,JSON.stringify(diagnosticUi));

    const investigationExpandedUi=await evalJS(`(()=>{try{
      const long='長文調査結果 '.repeat(600);
      const nav=id=>document.querySelector('#bottomNav button[data-s="'+id+'"]')?.click();
      nav('library');
      const libDetails=[...document.querySelectorAll('#library .diagnostic-tools')];
      libDetails.forEach(d=>d.open=true);
      const series=document.getElementById('seriesCheckResults');
      if(series)series.innerHTML='<div class=\"series-box\">'+long+'</div>';
      const libraryOutputs=[...document.querySelectorAll('#library .diagnostic-output')];
      const libraryBounded=libraryOutputs.every(e=>{const st=getComputedStyle(e),r=e.getBoundingClientRect();return st.overflowY==='auto'&&st.maxHeight!=='none'&&r.height<=innerHeight});
      const normalSeriesButton=document.getElementById('seriesCheckBtn');
      const insideDetails=!!normalSeriesButton?.closest('.diagnostic-tools');
      nav('settings');
      const setDetails=[...document.querySelectorAll('#settings .diagnostic-tools')];
      setDetails.forEach(d=>d.open=true);
      for(const id of ['devGuardStatus','registrationMetricsList','searchMetricsList']){const e=document.getElementById(id);if(e)e.innerHTML='<div>'+long+'</div>';}
      const settingsOutputs=[...document.querySelectorAll('#settings .diagnostic-output')];
      const settingsBounded=settingsOutputs.every(e=>{const st=getComputedStyle(e),r=e.getBoundingClientRect();return st.overflowY==='auto'&&st.maxHeight!=='none'&&r.height<=innerHeight});
      nav('library');
      const report=typeof buildDiagnosticReport==='function'?buildDiagnosticReport():'';
      const reportOk=report.includes('本棚スケジュール 調査結果')&&report.includes('長文調査結果');
      libDetails.forEach(d=>d.open=false);setDetails.forEach(d=>d.open=false);
      if(series)series.innerHTML='';
      return {libraryBounded,settingsBounded,insideDetails,reportOk,libraryDetails:libDetails.length,settingsDetails:setDetails.length};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-UI-004 expanded investigation results remain bounded',investigationExpandedUi?.libraryBounded===true&&investigationExpandedUi?.settingsBounded===true&&investigationExpandedUi?.insideDetails===false&&investigationExpandedUi?.reportOk===true,JSON.stringify(investigationExpandedUi));

    const diagnosticCopyClearUi=await evalJS(`(()=>{try{
  const series=document.getElementById('seriesCheckResults'),seriesDiag=document.getElementById('seriesDiagnoseResults'),bib=document.getElementById('bibliographyCompareResults'),prep=document.getElementById('isbnRegistrationPrepResults'),repair=document.getElementById('seriesRepairResults'),dev=document.getElementById('devGuardStatus'),reg=document.getElementById('registrationMetricsList'),search=document.getElementById('searchMetricsList');
  series.innerHTML='<div>LIB-GAP</div>';seriesDiag.innerHTML='<div>LIB-SERIES</div>';bib.innerHTML='<div>LIB-BIB</div>';prep.innerHTML='<div>LIB-PREP</div>';repair.innerHTML='<div>LIB-REPAIR</div>';dev.textContent='SET-RESULT';reg.innerHTML='<div>REG-RESULT</div>';search.innerHTML='<div>SEARCH-RESULT</div>';
  const lib=buildLibraryDiagnosticReport(),set=buildSettingsDiagnosticReport(),all=buildDiagnosticReport();
  const copies=['LIB-GAP','LIB-SERIES','LIB-BIB','LIB-PREP','LIB-REPAIR'].every(x=>lib.includes(x)&&all.includes(x))&&set.includes('SET-RESULT')&&set.includes('REG-RESULT')&&set.includes('SEARCH-RESULT');
  clearLibraryDiagnosticResults();
  const libraryCleared=[series,seriesDiag,bib,prep,repair].every(e=>!(e.textContent||'').trim())&&(dev.textContent||'').includes('SET-RESULT');
  clearSettingsDiagnosticResults();
  const settingsCleared=!(dev.textContent||'').trim()&&!(reg.textContent||'').trim()&&!(search.textContent||'').trim();
  series.innerHTML='<div>LIB-RESULT</div>';seriesDiag.innerHTML='<div>LIB-SERIES</div>';repair.innerHTML='<div>LIB-REPAIR</div>';dev.textContent='SET-RESULT';
  clearAllDiagnosticResults();
  const allCleared=[series,seriesDiag,bib,prep,repair].every(e=>!(e.textContent||'').trim())&&!(dev.textContent||'').trim();
  return {copies,libraryCleared,settingsCleared,allCleared};
}catch(e){return {error:String(e?.message||e)}}})()`);
check('E2E-UI-006 diagnostic copy/clear hierarchy works',diagnosticCopyClearUi?.copies===true&&diagnosticCopyClearUi?.libraryCleared===true&&diagnosticCopyClearUi?.settingsCleared===true&&diagnosticCopyClearUi?.allCleared===true,JSON.stringify(diagnosticCopyClearUi));

    const isbnSeriesSourceSmoke=await evalJS(`(async()=>{try{
      const btn=document.getElementById('isbnSeriesSourceBtn'),box=document.getElementById('isbnSeriesSourceResults'),api=window.bookTrackerApiManagement;
      const originalBooks=books, originalEnabled=api.providerEnabled, originals={};
      const targets=[
        {isbn:'9784065380161',title:'転生したらスライムだった件(028)'},
        {isbn:'9784065396889',title:'転生したらスライムだった件(029)'},
        {isbn:'9784065410561',title:'転生したらスライムだった件(030)'},
        {isbn:'9784065423844',title:'転生したらスライムだった件 31'},
        {isbn:'9784065437544',title:'転生したらスライムだった件(032)'}
      ];
      books=targets.map(x=>({isbn:x.isbn,title:x.title,series:null}));
      for(const n of ['openBD','ndl','rakuten','googleBooks']) originals[n]=api.adapters[n].isbn;
      api.providerEnabled=()=>true;
      for(const n of Object.keys(originals)) api.adapters[n].isbn=async isbn=>{await new Promise(r=>setTimeout(r,25));return [{isbn,title:'fixture-'+n,series:{id:'SID-'+n,name:'fixture-series-'+n,volumeNumber:1,displayVolume:'1'},source:n,fieldEvidence:{seriesName:{confidence:'VERIFIED'},volumeNumber:{confidence:'VERIFIED'}}}]};
      box.innerHTML='';
      const before=books.map(b=>JSON.stringify(b));
      const promise=diagnoseIsbnSeriesSources();
      const running=await new Promise(resolve=>setTimeout(()=>resolve({disabled:!!btn.disabled,text:btn.textContent||''}),20));
      const ok=await promise;
      const text=box.textContent||'';
      const after=books.map(b=>JSON.stringify(b));
      const diff=[]; for(let di=0;di<Math.max(before.length,after.length);di++){if(before[di]!==after[di])diff.push({i:di,before:before[di],after:after[di]});}
      const unchanged=before.length===after.length&&before.every((v,i)=>v===after[i]);
      const complete=ok===true&&text.includes('[5/5]')&&text.includes('openBD')&&text.includes('ndl')&&text.includes('rakuten')&&text.includes('googleBooks')&&text.includes('FOUND')&&text.includes('判定：');
      let copied=''; const oldCopy=window.copyTextValue; window.copyTextValue=(value)=>{copied=String(value||'')}; document.getElementById('copyIsbnSeriesSourceBtn').click(); window.copyTextValue=oldCopy; const copiedOk=copied.includes('[5/5]')&&copied.includes('fixture-googleBooks'); document.getElementById('clearIsbnSeriesSourceBtn').click(); const cleared=!(box.textContent||'').trim(); const copyClearWired=!!document.getElementById('copyIsbnSeriesSourceBtn')&&!!document.getElementById('clearIsbnSeriesSourceBtn')&&copiedOk&&cleared;
      for(const n of Object.keys(originals)) api.adapters[n].isbn=originals[n]; api.providerEnabled=originalEnabled; books=originalBooks;
      box.innerHTML='';
      return {ok:complete&&unchanged&&copyClearWired,running,complete,unchanged,copyClearWired,copiedOk,cleared,diff,finalText:text.slice(-500)};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-LIB-ISBN-SOURCE-001 ISBN series source diagnostic executes 5ISBN x 4Provider to completion',isbnSeriesSourceSmoke?.ok===true,JSON.stringify(isbnSeriesSourceSmoke));



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

    // E2E-UI-MATRIX: representative iPhone widths.
    for(const width of [375,390,414]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
      await wait(80);
      const matrix=await evalJS(`(()=>{const els=[...document.querySelectorAll('body *')].filter(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.matches('script,style,input,textarea,select,option,html,body')});const overflow=els.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({id:e.id,cls:String(e.className),text:(e.textContent||'').trim().slice(0,60),sw:e.scrollWidth,cw:e.clientWidth}));return {width:innerWidth,overflow};})()`);
      check(`E2E-UI-MATRIX-${width} no unexpected content overflow`,matrix?.overflow?.length===0,JSON.stringify(matrix?.overflow?.slice(0,8)));
    }
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});

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
    const atomicitySmoke=await evalJS(`(()=>{const before=JSON.parse(JSON.stringify(purchaseGroups));const oldPersist=persistPurchaseGroups;persistPurchaseGroups=()=>false;const ok=setPurchaseGroupForBooks(['9784000000001'],1234,'atomicity-test');persistPurchaseGroups=oldPersist;return {rejected:ok===false,unchanged:JSON.stringify(purchaseGroups)===JSON.stringify(before)}})()`);
    check('E2E-PERSIST-002 purchase-group write failure rolls back memory state',atomicitySmoke?.rejected===true&&atomicitySmoke?.unchanged===true,JSON.stringify(atomicitySmoke));

    // P0 persistence contract: verify the exact bytes written by each persistent domain, then
    // feed those bytes through the same boot readers. The browser harness uses an isolated storage shim,
    // so a second document is reconstructed from the captured storage snapshot rather than relying on Chrome's disk localStorage.
    const persistenceRoundTrip=await evalJS(`(()=>{try{
      const isbn='9784000000999';
      const settings=JSON.parse(JSON.stringify(appSettings));
      settings.profile={name:'永続化テスト',genre:'漫画',author:'検証作家',memo:'reload契約'};
      settings.search={...settings.search,resultCount:40,sort:'title-asc',jpPriority:true,unownedFirst:true,cache:true};
      settings.calendar={...settings.calendar,weekStart:1,showLibrary:true,showRelated:true,showRecommended:false,openToday:true,ics:true};
      settings.theme='green';settings.font='large';settings.autoTextContrast=false;
      const fixtureBook={isbn,title:'永続化テスト本',author:'検証作家',publisher:'検証出版社',date:'2020-01-02',price:{listPrice:880,status:'confirmed',currency:'JPY',taxIncluded:true,source:'fixture',fetchedAt:null,confidence:'HIGH'},cover:'',upcoming:[],series:{id:'PERSIST-1',name:'永続化シリーズ',volumeNumber:2}};
      const fixtureMeta={[isbn]:{purchaseStatus:'purchased',readingStatus:'read',favorite:true,memo:'保存メモ',rating:5,notify:true}};
      const fixtureCalendar=[{key:'persist-test|2020-01-02|'+isbn,isbn,title:'永続化テスト本',date:'2020-01-02',sourceType:'extra',source:'検証'}];
      const fixtureGroups={pg_persist:{id:'pg_persist',totalAmount:1234,currency:'JPY',bookKeys:[isbn],note:'セット購入',createdAt:'2026-01-01T00:00:00.000Z'}};
      const seed={books_v41:JSON.stringify([fixtureBook]),calendarExtras_v442:JSON.stringify(fixtureCalendar),book_tracker_settings_v449:JSON.stringify(settings),seriesView_v444:'off',bookTrackerMeta_v483:JSON.stringify(fixtureMeta),bookTrackerPurchaseGroups_v1:JSON.stringify(fixtureGroups),bookTrackerDemoDeleted:'true',bookTrackerDemoResetVersion:APP_VERSION};
      for(const [k,v] of Object.entries(seed))__guardStorage.setItem(k,v);
      const snapshot={};for(const k of APP_STORAGE_KEYS)snapshot[k]=__guardStorage.getItem(k);
      const bootBooks=readJSONStorage(KEY,[]),bootCalendar=readJSONStorage('calendarExtras_v442',[]),bootSettings=readJSONStorage(SETTINGS_KEY,{}),bootMeta=readJSONStorage('bookTrackerMeta_v483',{}),bootGroups=readJSONStorage(PURCHASE_GROUPS_KEY,{});
      return {snapshot,boot:{book:bootBooks[0],calendar:bootCalendar,settings:bootSettings,meta:bootMeta[isbn],group:bootGroups.pg_persist,seriesView:__guardStorage.getItem('seriesView_v444')},expected:{isbn,bookTitle:fixtureBook.title}};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    const reloaded=persistenceRoundTrip?.boot;
    const pOk=!!reloaded&&reloaded.book?.title===persistenceRoundTrip.expected.bookTitle&&reloaded.meta?.memo==='保存メモ'&&reloaded.meta?.favorite===true&&reloaded.calendar?.length===1&&reloaded.group?.totalAmount===1234&&reloaded.settings?.profile?.name==='永続化テスト'&&reloaded.settings?.search?.resultCount===40&&reloaded.settings?.calendar?.weekStart===1&&reloaded.settings?.theme==='green'&&reloaded.settings?.font==='large'&&reloaded.seriesView==='off';
    check('E2E-PERSIST-001 save/reload preserves all persistent domains',pOk,JSON.stringify({book:reloaded?.book?.title,metaMemo:reloaded?.meta?.memo,calendar:reloaded?.calendar?.length,groupTotal:reloaded?.group?.totalAmount,profile:reloaded?.settings?.profile?.name,searchCount:reloaded?.settings?.search?.resultCount,weekStart:reloaded?.settings?.calendar?.weekStart,theme:reloaded?.settings?.theme,font:reloaded?.settings?.font,seriesView:reloaded?.seriesView}));

    const backupRoundTrip=await evalJS(`(()=>{try{
      const localStorageData={};for(const k of APP_STORAGE_KEYS){const v=__guardStorage.getItem(k);if(v!==null)localStorageData[k]=v}
      const before={schemaVersion:3,appVersion:APP_VERSION,exportedAt:'2026-01-01T00:00:00.000Z',localStorage:localStorageData};
      for(const k of APP_STORAGE_KEYS)__guardStorage.removeItem(k);
      const valid=validateBackupData(before); const restored=restoreBackupData(before);
      const after={};for(const k of APP_STORAGE_KEYS)after[k]=__guardStorage.getItem(k);
      const equal=APP_STORAGE_KEYS.every(k=>(after[k]??null)===(before.localStorage[k]??null));
      const invalid={...before,localStorage:{...before.localStorage,UNKNOWN_KEY:'x'}};
      const badSchema=restoreBackupData({...before,schemaVersion:2});
      const badKey=restoreBackupData(invalid);
      return {valid,restored,equal,badSchemaRejected:badSchema===false,badKeyRejected:badKey===false,unknownAccepted:validateBackupData(invalid)};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-PERSIST-003 backup export/import round-trip',backupRoundTrip?.restored===true&&backupRoundTrip?.equal===true,JSON.stringify(backupRoundTrip));
    check('E2E-PERSIST-004 backup schema/key validation rejects invalid input',backupRoundTrip?.badSchemaRejected===true&&backupRoundTrip?.badKeyRejected===true&&backupRoundTrip?.unknownAccepted===false,JSON.stringify(backupRoundTrip));

    const atomicBackup=await evalJS(`(()=>{try{
      const before={};for(const k of APP_STORAGE_KEYS)before[k]=__guardStorage.getItem(k);
      const backup=createBackupData(); backup.localStorage={...backup.localStorage,seriesView_v444:'on',bookTrackerMeta_v483:JSON.stringify({sentinel:{purchaseStatus:'wanted'}})};
      const realSet=__guardStorage.setItem.bind(__guardStorage);let writes=0;__guardStorage.setItem=(k,v)=>{writes++;if(writes===2)throw Error('synthetic quota failure');return realSet(k,v)};
      const ok=restoreBackupData(backup);__guardStorage.setItem=realSet;
      const after={};for(const k of APP_STORAGE_KEYS)after[k]=__guardStorage.getItem(k);
      return {rejected:ok===false,unchanged:JSON.stringify(before)===JSON.stringify(after)};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-PERSIST-005 backup restore failure rolls back atomically',atomicBackup?.rejected===true&&atomicBackup?.unchanged===true,JSON.stringify(atomicBackup));

    // P1: every persistent setting field must survive a save/read round-trip, and a failed
    // settings write must roll the in-memory object back to the last durable snapshot.
    const settingsRoundTrip=await evalJS(`(()=>{try{
      const before=JSON.parse(JSON.stringify(appSettings));
      const next={...JSON.parse(JSON.stringify(appSettings)),profile:{name:'P1名',genre:'P1ジャンル',author:'P1作者',memo:'P1メモ'},theme:'green',font:'large',skin:{primary:'#123456',bg:'#abcdef',surface:'#fedcba',text:'#102030'},background:{image:'data:image/png;base64,P1',avgLum:.42,avgColor:'#667788'},autoTextContrast:false,search:{resultCount:40,sort:'title-asc',jpPriority:false,unownedFirst:true,cache:false},calendar:{weekStart:1,showLibrary:false,showRelated:true,showRecommended:false,openToday:false,ics:true},rakuten:{applicationId:'guard-app',accessKey:'guard-key'}};
      appSettings=next;const saved=saveSettings();const loaded=readJSONStorage(SETTINGS_KEY,null);const fields=['profile','theme','font','skin','background','autoTextContrast','search','calendar','rakuten'];
      const equal=saved&&fields.every(k=>JSON.stringify(loaded?.[k])===JSON.stringify(next[k]));
      const durable=JSON.stringify(loaded);
      const realSet=__guardStorage.setItem.bind(__guardStorage);__guardStorage.setItem=()=>{throw Error('synthetic settings quota failure')};
      appSettings={...next,theme:'dark',font:'small',calendar:{...next.calendar,ics:false},rakuten:{applicationId:'changed',accessKey:'changed'}};const failed=!saveSettings();__guardStorage.setItem=realSet;
      const rolledBack=appSettings.theme==='green'&&appSettings.font==='large'&&appSettings.calendar?.ics===true&&appSettings.search?.resultCount===40;
      const uiRolledBack=$('setWeekStart')?.value==='1'&&$('setICS')?.checked===true&&$('themeCurrent')?.textContent==='現在：ナチュラル'&&$('fontCurrent')?.textContent==='現在：大';
      __guardStorage.setItem(SETTINGS_KEY,durable);appSettings=before;saveSettings();
      return {saved,fields,equal,failed,rolledBack,uiRolledBack};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-SETTINGS-001 all settings survive save/read round-trip',settingsRoundTrip?.saved===true&&settingsRoundTrip?.equal===true,JSON.stringify(settingsRoundTrip));
    check('E2E-SETTINGS-002 settings write failure rolls back memory state',settingsRoundTrip?.failed===true&&settingsRoundTrip?.rolledBack===true&&settingsRoundTrip?.uiRolledBack===true,JSON.stringify(settingsRoundTrip));

    // P1: calendar-tab filters are temporary; reopening the tab must restore the persistent defaults.
    const calendarFilterReset=await evalJS(`(()=>{try{
      const old={...calFilters};const oldCal={...appSettings.calendar};
      appSettings.calendar={...appSettings.calendar,showLibrary:false,showRelated:true,showRecommended:false,openToday:false};
      calFilters={library:true,related:false,recommended:true};
      setMainTab('calendar');
      const out={library:calFilters.library,related:calFilters.related,recommended:calFilters.recommended,ui:[$('calFilterLibrary')?.checked,$('calFilterRelated')?.checked,$('calFilterRecommended')?.checked]};
      appSettings.calendar=oldCal;calFilters=old;renderCalendar();return out;
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-CALENDAR-001 temporary filters reset from saved defaults',calendarFilterReset?.library===false&&calendarFilterReset?.related===true&&calendarFilterReset?.recommended===false&&JSON.stringify(calendarFilterReset?.ui)==='[false,true,false]',JSON.stringify(calendarFilterReset));

    // P1: calendar registration must carry existing series metadata forward and avoid an unnecessary ISBN re-query.
    const calendarRegistrationMetadata=await evalJS(`(async()=>{try{
      const oldResolve=window.bookTrackerApiManagement.resolveIsbn;let calls=0;
      window.bookTrackerApiManagement.resolveIsbn=async()=>{calls++;throw Error('unexpected ISBN re-query')};
      const b=calendarBookFromEvent({isbn:'demo-002',title:'サンプルシリーズ：星の余白 1巻',series:'サンプルシリーズ：星の余白'});
      const prepared=await prepareRegistrationBook(b,{interactive:false});
      window.bookTrackerApiManagement.resolveIsbn=oldResolve;
      return {seriesName:b?.series?.name||'',volume:b?.series?.volumeNumber??null,preparedSeriesName:prepared?.series?.name||'',calls};
    }catch(e){try{window.bookTrackerApiManagement.resolveIsbn=oldResolve}catch(_){};return {error:String(e?.message||e)}}})()`);
    check('E2E-CALENDAR-003 existing series metadata is preserved and avoids ISBN re-query',calendarRegistrationMetadata?.seriesName==='サンプルシリーズ：星の余白'&&calendarRegistrationMetadata?.volume===1&&calendarRegistrationMetadata?.preparedSeriesName==='サンプルシリーズ：星の余白'&&calendarRegistrationMetadata?.calls===0,JSON.stringify(calendarRegistrationMetadata));

    // P1: calendar-extra writes must be atomic.
    const calendarExtraAtomic=await evalJS(`(()=>{try{
      const oldExtras=calendarExtras.slice(),oldAlert=window.alert;window.alert=()=>{};
      const before=calendarExtras.length;const realPersist=persistCalendarExtras;persistCalendarExtras=()=>false;
      const result=addCalendarExtra({isbn:'9784000000998',title:'P1 Extra Unique',author:'A',date:'2026-09-20'},'related');
      persistCalendarExtras=realPersist;calendarExtras=oldExtras;window.alert=oldAlert;render();
      return {rejected:result===false,rollback:calendarExtras.length===before};
    }catch(e){try{window.alert=oldAlert}catch(_){};return {error:String(e?.message||e)}}})()`);
    check('E2E-CALENDAR-002 calendar-extra failure rolls back',calendarExtraAtomic?.rejected===true&&calendarExtraAtomic?.rollback===true,JSON.stringify(calendarExtraAtomic));

    // P1: ICS is date-only because the app has release dates but no release time; values are escaped and UIDs are deterministic.
    const icsContract=await evalJS(`(()=>{try{
      const events=[{isbn:'9784000000001',title:'A,B;C\\nD',base:'Base;X',date:'2026-09-20',sourceType:'related'},{isbn:'9784000000002',title:'Invalid',date:'bad',sourceType:'library'}];
      const x=buildICS(events),uid1=(x.match(/UID:([^\\r\\n]+)/)||[])[1],uid2=calendarEventUID(events[0]);
      return {crlf:x.slice(-2)==='\\r\\n',dateOnly:x.includes('DTSTART;VALUE=DATE:20260920'),escaped:x.includes('SUMMARY:A\\\\,B\\\\;C\\\\nD 発売予定'),oneEvent:x.split('BEGIN:VEVENT').length===2,stableUid:uid1===uid2};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-ICS-001 ICS has semantic date/escaping/stable UID contract',icsContract?.crlf===true&&icsContract?.dateOnly===true&&icsContract?.escaped===true&&icsContract?.oneEvent===true&&icsContract?.stableUid===true,JSON.stringify(icsContract));

    // P1: notification target selection is inclusive of today and +7 days, excludes non-notify/invalid dates.
    const notificationWindow=await evalJS(`(()=>{try{
      const oldBooks=books.slice(),oldMeta=bookMeta;books=[
       {isbn:'9784000000100',title:'today',date:'2026-09-16'},
       {isbn:'9784000000101',title:'day7',date:'2026-09-23'},
       {isbn:'9784000000102',title:'day8',date:'2026-09-24'},
       {isbn:'9784000000103',title:'off',date:'2026-09-20'},
       {isbn:'9784000000104',title:'bad',date:'2026-09-20x'}
      ];bookMeta={'9784000000100':{notify:true},'9784000000101':{notify:true},'9784000000102':{notify:true},'9784000000103':{notify:false},'9784000000104':{notify:true}};
      const r=getReleaseNotificationTargets('2026-09-16',7).map(x=>x.isbn).sort();books=oldBooks;bookMeta=oldMeta;render();return {r};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-NOTIFY-001 release notification window is today through +7 days',JSON.stringify(notificationWindow?.r)==='["9784000000100","9784000000101"]',JSON.stringify(notificationWindow));

    // Restore the pristine document before the rest of the release gate so P1 fixtures cannot contaminate UI tests.
    await cdp.send('Page.setDocumentContent',{frameId:(await cdp.send('Page.getFrameTree')).frameTree.frame.id,html:browserHtml}); await wait(1000);


    // Screenshot smoke at the final state. This catches catastrophic blank pages in addition to geometry tests.
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
    const phaseMetricContract=await evalJS(`(()=>{try{const sm=window.bookTrackerSearchMetrics;const t=sm.start('計測テスト','phase');t.addApiPhase('googleBooks','fetch',12);sm.finish(t,true,'',0,[]);return {ok:t.apiPhases?.googleBooks?.fetch===12};}catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    const postFinishPhaseContract=await evalJS(`(()=>{try{const sm=window.bookTrackerSearchMetrics;const t=sm.start('計測テスト','post-finish');sm.beginApi('googleBooks');sm.endApi('googleBooks',false);sm.finish(t,true,'',0,[]);t.addApiPhase('googleBooks','json',34);return {ok:t.apiPhases?.googleBooks?.json===34,rendered:document.getElementById('searchMetricsList')?.textContent?.includes('json：34 ms')};}catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-SEARCH-001 provider phase attaches to search record',phaseMetricContract?.ok===true,JSON.stringify(phaseMetricContract));
    check('E2E-SEARCH-002 post-timeout phase can update completed record',postFinishPhaseContract?.ok===true&&postFinishPhaseContract?.rendered===true,JSON.stringify(postFinishPhaseContract));
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
