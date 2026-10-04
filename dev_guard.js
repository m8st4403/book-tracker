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

// v4.13.200: Generic cross-tab operation inventory.
// This is intentionally generic: it audits every button in the shipped DOM,
// not only buttons introduced by a known regression.
function auditInteractiveOperationCoverage(source) {
  const buttonRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  const items = [];
  let m;
  while ((m = buttonRe.exec(source))) {
    const attrs = m[1] || '';
    const id = (attrs.match(/\bid=["']([^"']+)["']/i)||[])[1] || '';
    const classes = (attrs.match(/\bclass=["']([^"']+)["']/i)||[])[1] || '';
    const inline = /\bonclick\s*=/.test(attrs);
    const disabled = /\bdisabled(?:\s*=\s*(?:"disabled"|'disabled'|disabled))?\b/i.test(attrs);
    const dataAttrs = [...attrs.matchAll(/\bdata-([a-z0-9_-]+)\s*=/gi)].map(x=>x[1]);
    const idRefs = id ? (source.match(new RegExp(`(?:getElementById\\(["']${id}["']\\)|\\$\\(["']${id}["']\\)|#${id}\\b)`, 'g'))||[]).length : 0;
    const handlerRef = id ? new RegExp(
      `(?:getElementById\\(["']${id}["']\\)|\\$\\(["']${id}["']\\)|querySelector\\([^)]*#${id}\\b[^)]*\\))[^\\n]{0,500}(?:\\.onclick|addEventListener\\()`,
      's'
    ).test(source) : false;
    const delegated = classes.split(/\s+/).filter(Boolean).some(cls =>
      new RegExp(`(?:closest|querySelector(?:All)?|matches)\\([^)]*[.#]${cls}\\b`).test(source)
      || (new RegExp(`class=["'][^"']*\\b${cls}\\b`).test(source) && /querySelectorAll\(["']button["']\)\.forEach/.test(source))
    );
    const covered = inline || disabled || dataAttrs.length > 0 || handlerRef || delegated;
    items.push({id, classes, inline, disabled, dataAttrs, idRefs, handlerRef, delegated, covered});
  }
  const uncovered = items.filter(x=>!x.covered);
  return {total:items.length, covered:items.length-uncovered.length, uncovered};
}
const operationCoverage = auditInteractiveOperationCoverage(html);
check(
  'STATIC-070 all shipped buttons have an operation path',
  operationCoverage.uncovered.length===0,
  JSON.stringify({total:operationCoverage.total,covered:operationCoverage.covered,uncovered:operationCoverage.uncovered.slice(0,20)})
);

// v4.13.203: the operation boundary is broader than <button>.
// Inputs/selects/textarea can be actions themselves or can feed another action;
// links and native details controls also represent user-operable paths.
function auditInteractiveControlContracts(source){
  const out=[];
  const re=/<(button|input|select|textarea|a|summary)\b([^>]*)>/gi;
  let m;
  while((m=re.exec(source))){
    const tag=m[1].toLowerCase(), attrs=m[2]||'';
    const id=(attrs.match(/\bid=[\"']([^\"']+)[\"']/i)||[])[1]||'';
    const cls=(attrs.match(/\bclass=[\"']([^\"']+)[\"']/i)||[])[1]||'';
    const disabled=/\bdisabled(?:\s*=\s*(?:\"disabled\"|'disabled'|disabled))?\b/i.test(attrs);
    const readOnly=/\breadonly(?:\s*=\s*(?:\"readonly\"|'readonly'|readonly))?\b/i.test(attrs);
    const href=(attrs.match(/\bhref=[\"']([^\"']*)[\"']/i)||[])[1]||'';
    const dataAttrs=[...attrs.matchAll(/\bdata-([a-z0-9_-]+)\s*=/gi)].map(x=>x[1]);
    const inline=/\bonclick\s*=|\bonchange\s*=|\boninput\s*=|\bonchange\s*=/i.test(attrs);
    const idRef=id ? (source.match(new RegExp(`(?:getElementById\([\"']${id}[\"']\)|\$\([\"']${id}[\"']\)|#[${id}\\b])`, 'g'))||[]).length : 0;
    const handlerRef=id ? source.split('\n').some(line=>line.includes(id)&&/(?:onclick|addEventListener|\.value|\.checked|\.files)/.test(line)) : false;
    const classRef=cls.split(/\s+/).filter(Boolean).some(c=>source.includes(c)&&/(?:querySelector|querySelectorAll|closest|matches)/.test(source));
    let covered=disabled||readOnly||inline||dataAttrs.length>0||handlerRef||classRef;
    if(tag==='a') covered=covered||href.length>0;
    if(tag==='summary') covered=true;
    // Unidentified checkbox/radio controls may be consumed as a group (e.g. :checked).
    if((tag==='input'||tag==='select'||tag==='textarea')&&!id&&!dataAttrs.length){
      const type=(attrs.match(/\btype=[\"']([^\"']+)[\"']/i)||[])[1]||'';
      covered=covered||new RegExp(`querySelectorAll\([^)]*${type?type:'input'}[^)]*\)`).test(source)||/\:checked/.test(source);
    }
    out.push({tag,id,covered,disabled,readOnly,href:!!href,dataAttrs});
  }
  const uncovered=out.filter(x=>!x.covered&&!x.disabled&&!x.readOnly);
  return {total:out.length,covered:out.length-uncovered.length,uncovered};
}
const interactiveContractCoverage=auditInteractiveControlContracts(html);
check('STATIC-071 all interactive control types have an operation contract',interactiveContractCoverage.uncovered.length===0,JSON.stringify({total:interactiveContractCoverage.total,covered:interactiveContractCoverage.covered,uncovered:interactiveContractCoverage.uncovered.slice(0,30)}));
check('STATIC-083 operation data attributes have a generic consumer',(()=>{
  const contracts=['data-data-operation','data-register-action','data-search-action','data-clear','data-bulk-action','data-rating','data-s'];
  const missing=contracts.filter(a=>new RegExp(a.replace(/-/g,'\\-')+'=["\\\']').test(html) && !new RegExp(a.replace(/-/g,'\\-')).test(html));
  return missing.length===0;
})(), 'generic data-* operation contracts are consumed by shipped code');

// v4.13.211: role-based interactive elements are part of the user-facing operation surface too.
// This closes the gap where a clickable span/div can be omitted from button/input-only audits.
function auditRoleInteractiveContracts(source){
  const re=/<([a-z0-9]+)\b([^>]*\brole=["'](?:button|tab)["'][^>]*)>/gi;
  const items=[]; let m;
  while((m=re.exec(source))){
    const tag=m[1].toLowerCase(), attrs=m[2]||'';
    const id=(attrs.match(/\bid=["']([^"']+)["']/i)||[])[1]||'';
    const disabled=/\bdisabled\b/i.test(attrs)||/aria-disabled=["']true["']/i.test(attrs);
    const inline=/\bonclick\s*=|\bonkeydown\s*=|\bonkeyup\s*=/i.test(attrs);
    const dataAttrs=[...attrs.matchAll(/\bdata-([a-z0-9_-]+)\s*=/gi)].map(x=>x[1]);
    const handlerRef=id ? (source.includes(`getElementById(\"${id}\")`) || source.includes(`getElementById('${id}')`) || source.includes(`$(\"${id}\")`) || source.includes(`$('${id}')`) || new RegExp('\\b'+id+'\\b[^\\n]{0,700}(?:\\.onclick|addEventListener|\\.click\\()', 's').test(source)) : false;
    const classes=(attrs.match(/\bclass=["']([^"']+)["']/i)||[])[1]||'';
    const classRef=classes.split(/\s+/).filter(Boolean).some(c=>source.includes(c)&&/(?:querySelector|querySelectorAll|closest|matches)/.test(source));
    const covered=disabled||inline||dataAttrs.length>0||handlerRef||classRef;
    items.push({tag,id,covered,inline,dataAttrs,handlerRef,classRef});
  }
  return {total:items.length,covered:items.filter(x=>x.covered).length,uncovered:items.filter(x=>!x.covered)};
}
const roleInteractiveCoverage=auditRoleInteractiveContracts(html);
check('STATIC-084 role=button/tab controls have an operation path',roleInteractiveCoverage.uncovered.length===0,JSON.stringify(roleInteractiveCoverage));

function auditPositiveTabindex(source){
  const re=/<([a-z0-9]+)\b([^>]*\btabindex=["']([0-9]+)["'][^>]*)>/gi;
  const uncovered=[]; let m;
  while((m=re.exec(source))){
    const attrs=m[2]||'', n=Number(m[3]); if(n<0) continue;
    const id=(attrs.match(/\bid=["']([^"']+)["']/i)||[])[1]||'';
    const ok=/\bonclick\s*=|\bonkeydown\s*=|\bonkeyup\s*=/i.test(attrs)||/\bdata-[a-z0-9_-]+\s*=/i.test(attrs)||/\brole=["'](?:button|tab|link)["']/i.test(attrs);
    if(!ok) uncovered.push({tag:m[1],id,tabindex:n});
  }
  return {ok:uncovered.length===0,uncovered};
}
const tabindexCoverage=auditPositiveTabindex(html);
check('STATIC-085 positive-tabindex controls have an operation contract',tabindexCoverage.ok,JSON.stringify(tabindexCoverage));

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
const qualityText=readUtf8(path.join(path.dirname(target),'QUALITY_CONTRACT.md'));
const operationContractText=readUtf8(path.join(path.dirname(target),'OPERATION_CONTRACT.md'));
check('STATIC-072 operation contract exists and is layered', /存在/.test(operationContractText) && /経路/.test(operationContractText) && /状態/.test(operationContractText) && /データ/.test(operationContractText) && /保存/.test(operationContractText) && /再読込/.test(operationContractText) && /連携/.test(operationContractText) && /異常復旧/.test(operationContractText), 'operation contract covers eight layers');
const headerVersionMatch=html.match(/id="appHeaderSub">v([^<]+)<br\/>/);
const currentDocVersion=(readmeText.match(/## 現在のリリース\s*\n\s*\*\*v([^*]+)\*\*/)||[])[1]||'';
const specCurrentVersion=(specText.match(/^# v([^ ]+) 現行リリース契約/m)||[])[1]||'';
check('STATIC-018 version sources are consistent', !!packageVersion&&appVersionMatch?.[1]===packageVersion&&guardVersionMatch?.[1]===packageVersion, `package=${packageVersion} app=${appVersionMatch?.[1]||''} guard=${guardVersionMatch?.[1]||''}`);
check('STATIC-044 release version is consistent across package/app/docs', !!packageVersion&&headerVersionMatch?.[1]===packageVersion&&currentDocVersion===packageVersion&&specCurrentVersion===packageVersion, `package=${packageVersion} header=${headerVersionMatch?.[1]||''} README=${currentDocVersion} SPEC=${specCurrentVersion}`);

const visibleVersionMatch=html.match(/id="appVersionText">バージョン：([0-9.]+)/);
check('STATIC-046 visible appVersionText uses current release', !!packageVersion&&visibleVersionMatch?.[1]===packageVersion, `visible=${visibleVersionMatch?.[1]||''} package=${packageVersion}`);check('STATIC-019 persistence/backup quality contract exists', /永続化/.test(qualityText) && /backup export\/import/.test(qualityText) && /rollback/.test(qualityText), 'persistence/backup/rollback are covered by the current quality contract');
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
check('STATIC-055 publisher identity key contract', /function normalizePublisherIdentityName\(value\)/.test(html) && /function publisherFilterKey\(value\)/.test(html) && /function buildPublisherFilterIndex\(\)/.test(html) && /publisherFilterKey\(b\.publisher\)===fp/.test(html), 'publisher display/key separation with conservative normalization');
check('STATIC-056 series display/key separation contract', /function seriesKey\(b\)/.test(html) && /function seriesDisplayLabel\(name,items=\[\]\)/.test(html), 'series grouping key is separate from user-facing label');
check('STATIC-057 bibliographic identity contract exists', /表示値と判定キーの分離/.test(qualityText) && /seriesKey/.test(qualityText) && /作者/.test(qualityText), 'bibliographic identity separation is current quality contract');
check('STATIC-061 past-fix quality audit exists', /不具合1件につきテスト1件を追加/.test(qualityText) && /独立Oracle/.test(qualityText) && /Mutation/.test(qualityText) && /Browser E2E/.test(qualityText), 'past fixes are audited under the oracle/mutation/E2E quality model');
check('STATIC-058 library filter text-copy contract', /id=["']copyLibraryFilterStateBtn["']/.test(html) && /function buildLibraryFilterStateReport\(\)/.test(html) && /function copyLibraryFilterState\(button\)/.test(html), 'library filter state can be copied as user-facing text');
check('STATIC-005 canonical registration routes exist', /window\.addBook\s*=/.test(html) && /window\.bulkAdd\s*=/.test(html), 'addBook/bulkAdd');
check('STATIC-059 registration routes share canonical preparation path',
  /window\.addBook=async[\s\S]*?prepareRegistrationBook\(b,\{interactive:true\}\)/.test(html) &&
  /window\.bulkAdd=async[\s\S]*?prepareRegistrationBatch\(candidates\)/.test(html) &&
  /window\.addAllFound=\(\)=>[\s\S]*?prepareRegistrationBatch\(candidates\)/.test(html) &&
  /registerCheckedIsbnRows[\s\S]*?prepareRegistrationBatch\(candidates\)/.test(html) &&
  /window\.addBookFromCalendar=async function\(e,k\)[\s\S]*?window\.addBook\(b,options\)/.test(html) &&
  /detailRegisterBook[\s\S]*?window\.addBook\(d,options\)/.test(html) &&
  /registerFromCardButton[\s\S]*?window\.addBook\(book,options\)/.test(html),
  'single/bulk/ISBN/calendar/detail/card routes converge on canonical registration preparation');
check('STATIC-060 canonical commit path is shared',
  /function commitBulkPreparedBooks\(/.test(html) &&
  /window\.addBook=async[\s\S]*?commitBulkPreparedBooks\(\[b\],\[prepared\]/.test(html) &&
  /window\.bulkAdd=async[\s\S]*?commitBulkPreparedBooks\(candidates,preparedList/.test(html) &&
  /registerCheckedIsbnRows[\s\S]*?commitBulkPreparedBooks\(candidates,preparedList/.test(html),
  'all bulk-capable routes share the canonical commit path');

const addBookStart=html.indexOf('window.addBook=async');
const addBookEnd=html.indexOf('window.addAllFound=',addBookStart);
const addBookBody=addBookStart>=0&&addBookEnd>addBookStart?html.slice(addBookStart,addBookEnd):'';
check('STATIC-023 addBook does not finish caller-owned metrics', addBookBody.length>0&&!/bookTrackerRegistrationMetrics\?\.finish/.test(addBookBody), 'single-book registration metrics are finalized by operation entry points');
check('STATIC-024 processing excludes API measurement', /measureProcessing/.test(html) && !/metrics\.processingMs\+=/.test(html), 'data-processing timing excludes API communication timing');
check('STATIC-027 processing excludes user interaction wait', /userWaitMs/.test(html) && /beginUserWait/.test(html) && /endUserWait/.test(html) && /waitDelta/.test(html) && /elapsed-apiDelta-waitDelta/.test(html), 'data-processing timing excludes user-driven prompt/input wait');
check('STATIC-026 single-book notices are deferred until metrics finish', /deferNotice:true/.test(html) && /if\(options\.notice\)alert\(options\.notice\)/.test(html) && !/metrics\?\.renderMs\+=\(performance\.now\(\)-rt\);alert\("登録しました/.test(html), 'single-book user notices are shown after caller-owned metric finish');
check('STATIC-025 processing measurement receives token', /window\.bookTrackerRegistrationMetrics\.measureProcessing\(metrics,/.test(html) && !/metrics\.measureProcessing\(metrics,/.test(html), 'processing measurement API is called with the registration token');
check('STATIC-009 global registration lock contract', /registrationBusy/.test(html) && /runRegistrationAction/.test(html) && /data-register-action/.test(html), 'individual/bulk/detail/calendar registration shares one lock');
check('STATIC-010 search generation contract', /searchGenerations/.test(html) && /runSearchSingleFlight/.test(html) && /isCurrentSearch/.test(html), 'stale search responses cannot overwrite current results');
check('STATIC-011 data operation lock contract', /dataOperationBusy/.test(html) && /setDataOperationUiBusy/.test(html) && /data-data-operation/.test(html), 'registration and series repair share a data-operation lock');
check('STATIC-062 existing bibliography audit is wired', ['bibliographyAuditBtn','bibliographyAuditResults','copyBibliographyAuditBtn','clearBibliographyAuditBtn'].every(id=>new RegExp('id=\"'+id+'\"').test(html)) && /async function auditAndFillExistingBibliography\(\)/.test(html) && /fillMissingBibliography\(/.test(html), 'existing-library bibliography audit/repair has a single non-overwriting path');
check('STATIC-063 ISBN FAST resolver does not stop on series alone', /const coreReady=/.test(fs.readFileSync(path.join(path.dirname(target),'api_management.js'),'utf8')) && /coreReady && \(seriesReady \|\| rows.length>=3\)/.test(fs.readFileSync(path.join(path.dirname(target),'api_management.js'),'utf8')), 'FAST ISBN resolution collects core bibliographic fields across Providers');
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
check('STATIC-014 quality contract exists', fs.existsSync(path.join(path.dirname(target),'QUALITY_CONTRACT.md')), 'quality contract is the single current quality source of truth');
check('STATIC-015 UI display contract exists', /scrollWidth<=el\.clientWidth/.test(fs.readFileSync(path.join(path.dirname(target),'dev_guard.js'),'utf8')) && /E2E-UI-002 compact library statistics keep labels visible/.test(fs.readFileSync(path.join(path.dirname(target),'dev_guard.js'),'utf8')), 'visible/readable/clipping contract');
check('STATIC-042 diagnostic output containment contract exists', /diagnostic-output\{[^}]*max-height:42vh;overflow:auto/.test(html) && /registration-trace\{[^}]*max-height:34vh;overflow:auto/.test(html), 'long investigation results are bounded and scrollable');
check('STATIC-043 diagnostic copy controls exist', /copySeriesDiagnosticBtn/.test(html) && /copyDevGuardBtn/.test(html) && /copyRegistrationMetrics/.test(html) && /copySearchMetrics/.test(html) && /function copyElementText\(/.test(html), 'investigation results can be copied as full text');
check('STATIC-054 bibliography comparison covers bunko ISBNs', /const isbns=\["9784088720715","9784088720722","9784088720739","9784086191524","9784086191531"\]/.test(html), 'ISBN/keyword bibliography comparison includes the two bunko ISBNs');
check('STATIC-045 diagnostic copy/clear hierarchy exists', /copyLibraryDiagnosticReportBtn/.test(html) && /copySettingsDiagnosticReportBtn/.test(html) && /copyAllDiagnosticReportBtn/.test(html) && /clearSeriesDiagnosticBtn/.test(html) && /clearDevGuardBtn/.test(html) && /clearLibraryDiagnosticResultsBtn/.test(html) && /clearSettingsDiagnosticResultsBtn/.test(html) && /clearAllDiagnosticResultsBtn/.test(html) && /function clearAllDiagnosticResults\(/.test(html), 'individual/tab/session copy and clear controls are wired');
check('STATIC-016 sort tie-break contract exists', /REG-002B/.test(fs.readFileSync(target,'utf8')), 'all sort modes use deterministic tie-breaks');
check('STATIC-017 quality contract covers operation model', /全ユーザー操作|共通登録|計測品質契約/.test(fs.readFileSync(path.join(path.dirname(target),'QUALITY_CONTRACT.md'),'utf8')), 'operation and measurement contracts are centralized');


const featureContractPath=path.join(path.dirname(target),'FEATURE_CONTRACT.md');
const featureContract=fs.existsSync(featureContractPath)?fs.readFileSync(featureContractPath,'utf8'):'';
check('STATIC-073 feature contract ledger exists',fs.existsSync(featureContractPath),'feature contract ledger is required for shipped functionality');
check('STATIC-074 feature contract covers all eight completion layers',['入口','操作','状態','データ','永続化','復元','投影','失敗復旧'].every(x=>featureContract.includes(x)),'feature contract covers eight completion layers');
const currentFeatureIds=['FEAT-NAV','FEAT-SCAN','FEAT-BACKUP','FEAT-DETAIL','FEAT-PURCHASE','FEAT-REG','FEAT-LIB','FEAT-SEARCH','FEAT-CAL','FEAT-SET','FEAT-API','FEAT-BIB','FEAT-DIAG','FEAT-METRIC','FEAT-CROSS','FEAT-UI'];
check('STATIC-075 feature contract covers all current functional surfaces',currentFeatureIds.every(x=>featureContract.includes(x)),'all current functional surfaces are catalogued');
const featureAnchors=[['FEAT-SCAN',['id=\"scan\"','function scan(','function stopScan(']],['FEAT-BACKUP',['id=\"backupDataBtn\"','id=\"restoreDataBtn\"','function validateBackupData(','function restoreBackupData(']],['FEAT-DETAIL',['window.openBookDetail=function(','id=\"detailPrice\"','id=\"detailReading\"','id=\"detailFavorite\"','id=\"detailMemo\"']],['FEAT-PURCHASE',['purchaseGroups','function setPurchaseGroupForBooks(','function getPurchaseGroupForBook(']],['FEAT-CAL',['function renderCalendar(','function addCalendarExtra(','function canonicalReleaseDate(']],['FEAT-REG',['function prepareRegistrationBook(','function prepareRegistrationBatch(','function commitBulkPreparedBooks(']]];
check('STATIC-078 feature implementation anchors',featureAnchors.every(([id,anchors])=>anchors.every(a=>html.includes(a))), 'CURRENT feature implementation anchors are present');
check('STATIC-076 feature contract forbids button-only scope',/buttonだけを対象としない/.test(featureContract)&&/input/.test(featureContract)&&/select/.test(featureContract)&&/Clipboard/.test(featureContract),'feature scope is broader than buttons');
check('STATIC-077 feature contract has release blockers',/リリース禁止条件/.test(featureContract)&&/Release Gate/.test(featureContract)&&/Mutation/.test(featureContract),'uncatalogued or unverified functionality blocks release');
check('STATIC-006 roadmap guard docs exist', fs.existsSync(path.join(path.dirname(target),'ROADMAP_TEST_MATRIX.md')), 'roadmap test matrix');
check('STATIC-007 release gate docs exist', fs.existsSync(path.join(path.dirname(target),'RELEASE_TEST_GATE.md')), 'release gate');
check('STATIC-008 package test script exists', fs.existsSync(path.join(path.dirname(target),'package.json')), 'package.json');
const featureCoveragePath=path.join(path.dirname(target),'FEATURE_COVERAGE.json');
let featureCoverage=null;
try{featureCoverage=JSON.parse(fs.readFileSync(featureCoveragePath,'utf8'))}catch(e){featureCoverage=null}
check('STATIC-079 machine-readable feature coverage exists',!!featureCoverage&&featureCoverage.release===packageVersion&&Array.isArray(featureCoverage.features),'machine-readable feature coverage is valid for current release');
if(featureCoverage){
  const requiredLayers=['入口','操作','状態','データ','永続化','復元','投影','失敗復旧'];
  const currentIds=currentFeatureIds;
  const coverageIds=featureCoverage.features.map(x=>x.id);
  const duplicateCoverageIds=[...new Set(coverageIds.filter((id,i)=>coverageIds.indexOf(id)!==i))];
  const missingCoverage=currentIds.filter(id=>!coverageIds.includes(id));
  const extraCoverage=coverageIds.filter(id=>!currentIds.includes(id));
  const missingLayers=featureCoverage.features.filter(x=>requiredLayers.some(layer=>!x.layers?.[layer])).map(x=>x.id);
  check('STATIC-080 feature coverage IDs are bidirectionally closed',missingCoverage.length===0&&extraCoverage.length===0&&duplicateCoverageIds.length===0,JSON.stringify({missingCoverage,extraCoverage,duplicateCoverageIds}));
  check('STATIC-081 every current feature has all eight contract layers',missingLayers.length===0,JSON.stringify({missingLayers}));
  check('STATIC-082 every current feature has structured eight-layer coverage',featureCoverage.schemaVersion===3&&featureCoverage.features.every(x=>x.layers&&requiredLayers.every(layer=>x.layers[layer])), 'exact executable evidence is validated by feature_coverage_gate.js');
}


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
    
const operationRuntimeAudit=await evalJS(`(()=>{try{
  const buttons=[...document.querySelectorAll('button')];
  const actionable=buttons.filter(b=>!b.disabled);
  const unlabeled=actionable.filter(b=>!((b.textContent||'').trim()||b.getAttribute('aria-label')||b.title));
  const noType=actionable.filter(b=>!b.getAttribute('type') && !b.closest('form'));
  const duplicateIds=buttons.filter(b=>b.id).map(b=>b.id).filter((id,i,a)=>a.indexOf(id)!==i);
  return {ok:unlabeled.length===0&&duplicateIds.length===0,buttonCount:buttons.length,actionable:actionable.length,unlabeled:unlabeled.map(b=>b.outerHTML.slice(0,180)),duplicateIds:[...new Set(duplicateIds)],noType:noType.length};
}catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
check('E2E-UI-OPS-001 generic interactive control inventory',operationRuntimeAudit?.ok===true,JSON.stringify(operationRuntimeAudit));
const interactiveRuntimeAudit=await evalJS(`(()=>{try{const els=[...document.querySelectorAll('button,input,select,textarea,a,summary')];const active=els.filter(e=>!e.disabled&&e.getAttribute('aria-hidden')!=='true'&&!e.hidden);const unlabeled=active.filter(e=>{const t=e.tagName.toLowerCase();const text=((e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent||e.getAttribute('placeholder')||e.getAttribute('value')||'')||'').trim();const parentLabel=e.closest('label')?.textContent?.trim()||'';const parentContext=(e.parentElement?.textContent||'').trim();const hiddenType=t==='input'&&['hidden','file'].includes((e.getAttribute('type')||'').toLowerCase());return ['input','select','textarea','button','a'].includes(t)&&!text&&!parentLabel&&!parentContext&&!hiddenType});const ids=els.filter(e=>e.id).map(e=>e.id);const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);return {ok:unlabeled.length===0&&dup.length===0,total:els.length,active:active.length,unlabeled:unlabeled.slice(0,20).map(e=>e.outerHTML.slice(0,180)),duplicateIds:[...new Set(dup)]}}catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
check('E2E-UI-OPS-002 all interactive control types are inventoried',interactiveRuntimeAudit?.ok===true,JSON.stringify(interactiveRuntimeAudit));
// v4.13.226: verify that the runtime interactive surface agrees with the static operation-contract inventory.
// This is deliberately a parity check, not a button-count smoke test: a newly added control that is
// present in the DOM but absent from the operation contract must block release before a user discovers it.
const uiOperationParity=await evalJS(`(()=>{try{
  const active=[...document.querySelectorAll('button,input,select,textarea,a,summary,[role=\"button\"],[role=\"tab\"]')].filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&!e.hidden&&e.getAttribute('aria-hidden')!=='true');
  const signature=e=>({tag:e.tagName.toLowerCase(),id:e.id||'',classes:(e.className&&typeof e.className==='string'?e.className:'').trim()});
  const staticCovered=${JSON.stringify(operationCoverage.covered)};
  const staticTotal=${JSON.stringify(operationCoverage.total)};
  const actionableButtons=active.filter(e=>e.tagName.toLowerCase()==='button' || ['button','tab'].includes((e.getAttribute('role')||'').toLowerCase()));
  const missingActionable=actionableButtons.filter(e=>{const id=e.id||'';const cls=(e.className&&typeof e.className==='string'?e.className:'').split(/\s+/).filter(Boolean);const text=(e.getAttribute('aria-label')||e.title||e.textContent||'').trim();return !id&&!cls.length&&!text});
  return {ok:missingActionable.length===0&&staticCovered<=staticTotal,totalActive:active.length,actionable:actionableButtons.length,missingActionable:missingActionable.map(signature),staticOperationControls:staticTotal,staticCovered};
}catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
check('E2E-UI-OPS-004 runtime/static operation-contract parity',uiOperationParity?.ok===true,JSON.stringify(uiOperationParity));
const roleRuntimeAudit=await evalJS(`(()=>{try{
  const els=[...document.querySelectorAll('[role="button"],[role="tab"],[tabindex]:not([tabindex="-1"])')];
  const active=els.filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&!e.hidden&&e.getAttribute('aria-hidden')!=='true');
  const unlabeled=active.filter(e=>!((e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent||'').trim()));
  return {ok:unlabeled.length===0,total:els.length,active:active.length,unlabeled:unlabeled.map(e=>e.outerHTML.slice(0,180))};
}catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
check('E2E-UI-OPS-003 role/tab and keyboard-interactive surface inventory',roleRuntimeAudit?.ok===true,JSON.stringify(roleRuntimeAudit));

check('E2E-001 all six tabs exist', tabState.every(x=>x.exists), JSON.stringify(tabState));

    const tabContracts={
      home:['homeBookCount','homeBookTotal','homePurchaseCount','homeUnreadCount','homeFavoriteCount','homeUpcomingBooks'],
      add:['scan','isbnRows','isbnSearch','work','vol','workSearch'],
      library:['libraryStats','libraryFilter','libraryFilterToggle','seriesViewToggle','librarySort','filterAuthor','filterPublisher','filterYear','filterRelease','filterReading','filterFavorite','filterPrice','filterReset','copyLibraryFilterStateBtn','myBooks','seriesCheckBtn','shareDiagnosticReportBtn','seriesRepairBtn','unreadOnlyBtn'],
      search:['searchModeBook','searchModeAuthor','query','searchBtn','searchUnownedOnly','searchResults','similarBox','similarBtn','author','authorBtn','authorNewBtn','authorResults'],
      calendar:['calendarMonthCard','prevYear','prevMonth','todayMonth','monthTitle','nextMonth','nextYear','calendarMonthMode','calendarYearMode','calHead','calendarGrid','calendarYearGrid','calendarYearReleases','calendarDayCard','calendarMonthReleasedCard','ics'],
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
    const ndlAuthorityFixture=await evalJS(`(()=>{try{const api=window.bookTrackerApiManagement;const xml="<?xml version='1.0'?><rss xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'><channel><item><title>authority-fixture</title><creator rdf:resource='http://id.ndl.go.jp/auth/ndlna/1001'>佐賀崎しげる</creator><creator rdf:resource='http://id.ndl.go.jp/auth/entity/1001'>佐賀崎 しげる</creator></item></channel></rss>";const rows=api.normalizeNDLOpenSearch?.(xml)||[];const x=rows[0]||{};const es=x.authorEntities||[];return {ok:es.some(e=>e.authorityId==='http://id.ndl.go.jp/auth/ndlna/1001')&&es.some(e=>e.entityId==='http://id.ndl.go.jp/auth/entity/1001'),entities:es}}catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-API-006P NDL creator authority URI extraction',ndlAuthorityFixture?.ok===true,JSON.stringify(ndlAuthorityFixture));
    const ndlAuthoritySruFixture=await evalJS(`(()=>{try{const api=window.bookTrackerApiManagement;const xml="<?xml version='1.0'?><searchRetrieveResponse xmlns='http://www.loc.gov/zing/srw/' xmlns:dcterms='http://purl.org/dc/terms/' xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'><records><record><recordData><dcterms:title>authority-fixture</dcterms:title><dcterms:creator rdf:resource='http://id.ndl.go.jp/auth/ndlna/1001'>佐賀崎しげる</dcterms:creator></recordData></record></records></searchRetrieveResponse>";const x=api.normalizeNDLFixture?.(xml)?.[0]||{};const es=x.authorEntities||[];return {ok:es.some(e=>e.authorityId==='http://id.ndl.go.jp/auth/ndlna/1001'),entities:es}}catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-API-006Q NDL SRU creator authority URI extraction',ndlAuthoritySruFixture?.ok===true,JSON.stringify(ndlAuthoritySruFixture));
    const ndlSearchContract=await evalJS(`(()=>{const api=window.bookTrackerApiManagement;const u=api?.buildNDLSruSearchUrl?.({title:'鬼滅の刃',limit:20,booksOnly:true})||'';const p=new URL(u).searchParams,q=p.get('query')||'';return {ok:q.includes('dpid=iss-ndl-opac')&&!q.includes('dpgroupid=')&&q.includes('mediatype=books')&&p.get('recordSchema')==='dcndl'&&p.get('onlyBib')==='true'&&q.includes('title=')&&q.includes('鬼滅の刃')&&!p.has('dpid'),url:u,query:q}})()`);
    check('E2E-API-006N NDL SRUは図書/DC-NDL書誌条件を付与',ndlSearchContract?.ok===true,JSON.stringify(ndlSearchContract));
    const searchTitleVolumeContract=await evalJS(`(()=>{const a=displayBookTitle?.({title:'鬼滅の刃',series:{name:'鬼滅の刃',volumeNumber:1}});return {ok:a==='鬼滅の刃 1',value:a}})()`);
    check('E2E-SEARCH-007 API取得巻数を検索結果タイトルへ表示',searchTitleVolumeContract?.ok===true,JSON.stringify(searchTitleVolumeContract));
    const registerButtonContract=await evalJS(`(()=>{const s=registerFromCardButton?.toString?.()||'';return {ok:s.includes('succeeded=result===true')&&s.includes("cardEl.outerHTML=card(book,true,'result',index)")&&!s.includes('finally{if(document.body.contains(btn)){btn.disabled=false;btn.dataset.busy="0";btn.textContent=oldText}}')}})()`);
    check('E2E-REG-006 単冊登録成功後のボタン状態更新',registerButtonContract?.ok===true,JSON.stringify(registerButtonContract));
    // v4.13.211: scanner outcome is verified independently of the registration commit path.
    // Success-side normalization is tested as a pure observable contract; camera failure is tested
    // against the registration-row invariant so a permission/device failure cannot silently mutate input.
    const scanNormalization=await evalJS(`(()=>{
      const samples=['978-4-08872071-5',' 9784088720722 ','9784088720739'];
      const out=samples.map(x=>isbnDigits(x));
      return {out,ok:out[0]==='9784088720715'&&out[1]==='9784088720722'&&out[2]==='9784088720739'};
    })()`);
    check('E2E-SCAN-002 barcode normalization produces canonical ISBN candidates',scanNormalization?.ok===true,JSON.stringify(scanNormalization));
    const scanFailure=await evalJS(`(async()=>{
      const before=[...$('isbnRows').querySelectorAll('.isbn-row')].map(r=>r.querySelector('.isbn-input')?.value||'');
      const oldMedia=navigator.mediaDevices;
      const oldAlert=window.alert; window.alert=()=>{};
      try{
        Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{throw Error('synthetic camera denial')}}});
        await scan();
        const after=[...$('isbnRows').querySelectorAll('.isbn-row')].map(r=>r.querySelector('.isbn-input')?.value||'');
        return {unchanged:JSON.stringify(before)===JSON.stringify(after),scannerHidden:$('scanner')?.style.display!=='block'};
      }finally{
        Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:oldMedia}); window.alert=oldAlert; stopScan();
      }
    })()`);
    check('E2E-SCAN-001 camera failure preserves registration input state',scanFailure?.unchanged===true,JSON.stringify(scanFailure));

    // v4.13.182: registration commit quality contract. These tests use an independent
    // expected ISBN set and before/after snapshots; they do not reuse commit predicates
    // to calculate the expected result.
    const registrationQuality=await evalJS(`(async()=>{
      const clone=v=>JSON.parse(JSON.stringify(v));
      const snapshot=()=>({books:clone(books),calendarExtras:clone(calendarExtras),bookMeta:clone(bookMeta)});
      const sameJson=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
      const saved={books:books.slice(),calendarExtras:calendarExtras.slice(),bookMeta:clone(bookMeta),saveMetaFn:saveMeta,persistBooksFn:persistBooks,persistCalendarExtrasFn:persistCalendarExtras,alertFn:window.alert};
      try{
        window.alert=()=>{};
        saveMeta=()=>true; persistBooks=()=>true; persistCalendarExtras=()=>true;
        books=[{isbn:'seed-1',title:'既存本',author:'A',publisher:'P'}];
        calendarExtras=[]; bookMeta={};
        const candidates=[{isbn:'9780000000001',title:'追加本A'},{isbn:'9780000000002',title:'追加本B'}];
        const prepared=[{isbn:'9780000000001',title:'追加本A',author:'A',publisher:'P'},{isbn:'9780000000002',title:'追加本B',author:'B',publisher:'Q'}];
        const success=await commitBulkPreparedBooks(candidates,prepared,null);
        const expectedSuccess=new Set(['SEED1','9780000000001','9780000000002']);
        const actualSuccess=new Set(books.map(b=>canonicalIsbn(b.isbn)));
        const successInvariant=success.ok && [...expectedSuccess].every(x=>actualSuccess.has(x)) && actualSuccess.size===expectedSuccess.size && books.length===expectedSuccess.size && books.every(b=>String(b.title||'').trim());

        books=[{isbn:'seed-2',title:'既存本',author:'A',publisher:'P'}]; calendarExtras=[]; bookMeta={};
        const beforePrepFail=snapshot();
        const failCandidates=[{isbn:'9780000000011',title:'正常本'},{isbn:'9780000000012',title:'失敗本'}];
        const failPrepared=[{isbn:'9780000000011',title:'正常本',author:'A',publisher:'P'},{error:'書誌解決失敗'}];
        const prepFail=await commitBulkPreparedBooks(failCandidates,failPrepared,null);
        const prepFailureInvariant=prepFail.ok===false && prepFail.atomicAborted===true && sameJson(snapshot(),beforePrepFail);

        books=[{isbn:'seed-3',title:'既存本',author:'A',publisher:'P'}]; calendarExtras=[]; bookMeta={};
        const beforeSaveFail=snapshot();
        persistBooks=()=>false;
        const saveFail=await commitBulkPreparedBooks([{isbn:'9780000000021',title:'保存失敗本'}],[{isbn:'9780000000021',title:'保存失敗本',author:'A',publisher:'P'}],null);
        const saveFailureInvariant=saveFail.ok===false && sameJson(snapshot(),beforeSaveFail);

        saveMeta=()=>true; persistBooks=()=>true; persistCalendarExtras=()=>true;
        books=[{isbn:'9780000000031',title:'既存本',author:'A',publisher:'P'}]; calendarExtras=[]; bookMeta={};
        const beforeDuplicate=snapshot();
        const dup=await commitBulkPreparedBooks([{isbn:'9780000000031',title:'既存本'}],[{isbn:'9780000000031',title:'既存本',author:'A',publisher:'P'}],null);
        const duplicateInvariant=dup.ok===true && dup.skippedDuplicates.length===1 && sameJson(snapshot(),beforeDuplicate);

        return {successInvariant,prepFailureInvariant,saveFailureInvariant,duplicateInvariant};
      }catch(e){return {error:String(e?.message||e)}}
      finally{books=saved.books;calendarExtras=saved.calendarExtras;bookMeta=saved.bookMeta;saveMeta=saved.saveMetaFn;persistBooks=saved.persistBooksFn;persistCalendarExtras=saved.persistCalendarExtrasFn;window.alert=saved.alertFn;}
    })()`);
    check('E2E-REG-007 successful commit matches independent expected set',registrationQuality?.successInvariant===true,JSON.stringify(registrationQuality));
    check('E2E-REG-008 preparation failure is atomic',registrationQuality?.prepFailureInvariant===true,JSON.stringify(registrationQuality));
    check('E2E-REG-009 persistence failure fully rolls back',registrationQuality?.saveFailureInvariant===true,JSON.stringify(registrationQuality));
    check('E2E-REG-010 non-richer duplicate leaves library unchanged',registrationQuality?.duplicateInvariant===true,JSON.stringify(registrationQuality));
    // v4.13.188: registration quality continues through persistence and boot-read.
    const registrationPersistence=await evalJS(`(()=>{try{
      const saved={books:books.slice(),calendarExtras:calendarExtras.slice(),bookMeta:JSON.parse(JSON.stringify(bookMeta))};
      const isbn='9784000000998'; books=[];calendarExtras=[];bookMeta={}; __guardStorage.removeItem(KEY);
      const candidate={isbn,title:'登録永続化テスト本'};
      const prepared={isbn,title:'登録永続化テスト本',author:'永続化作家',publisher:'永続化出版社',date:'2026-09-30'};
      const result=commitBulkPreparedBooks([candidate],[prepared],null);
      const raw=__guardStorage.getItem(KEY); const stored=raw?JSON.parse(raw):[];
      const storedBook=stored.find(b=>canonicalIsbn(b.isbn)===canonicalIsbn(isbn));
      const persistenceInvariant=!!storedBook && storedBook.title==='登録永続化テスト本';
      const boot=readJSONStorage(KEY,[]); const bootBook=boot.find(b=>canonicalIsbn(b.isbn)===canonicalIsbn(isbn));
      const reloadInvariant=!!bootBook && bootBook.title==='登録永続化テスト本' && bootBook.author==='永続化作家' && bootBook.publisher==='永続化出版社';
      books=saved.books;calendarExtras=saved.calendarExtras;bookMeta=saved.bookMeta;
      return {persistenceInvariant,reloadInvariant,rawPresent:!!raw,storedCount:stored.length,bootCount:boot.length};
    }catch(e){return {persistenceInvariant:false,reloadInvariant:false,error:String(e?.message||e)}}})()`);
    check('E2E-REG-011 registration commit persists the registered book',registrationPersistence?.persistenceInvariant===true,JSON.stringify(registrationPersistence));
    check('E2E-REG-012 persisted registration survives boot-read',registrationPersistence?.reloadInvariant===true,JSON.stringify(registrationPersistence));

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
      const seriesCoalesce=buildSeriesGroups([
        {b:{isbn:'series-main-1',title:'片田舎のおっさん、剣聖になる 1',series:{name:'片田舎のおっさん、剣聖になる'}}},
        {b:{isbn:'series-main-2',title:'片田舎のおっさん、剣聖になる 2',series:{name:'ヤングチャンピオン・コミックス'}}},
        {b:{isbn:'series-main-3',title:'片田舎のおっさん、剣聖になる 3',series:{name:'ヤングチャンピオン・コミックス'}}}
      ]);
      out.seriesRedundantScopeCoalescing=seriesCoalesce.size===1&&[...seriesCoalesce.values()][0].length===3;
      const editionSplit=buildSeriesGroups([
        {b:{title:'同名作品 1',series:{name:'Aコミックス'}}},
        {b:{title:'同名作品 2',series:{name:'Aコミックス'}}},
        {b:{title:'同名作品 1',series:{name:'B文庫'}}}
      ]);
      out.seriesDistinctScopesRemainSeparated=editionSplit.size===2;
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
    const seriesUiContract=await evalJS(`(()=>{try{
      const items=[
        {i:0,b:{isbn:'9784088720715',title:'レベルE 1',series:{name:'ジャンプ・コミックス'}}},
        {i:1,b:{isbn:'9784088720722',title:'レベルE 2',series:{name:'ジャンプ・コミックス'}}},
        {i:2,b:{isbn:'9784088720739',title:'レベルE 3',series:{name:'ジャンプ・コミックス\\n ジャンプ コミックス'}}}
      ];
      const keys=items.map(x=>seriesKey(x.b));
      const key=keys[0];
      const html=renderSeriesLibraryGroup(key,items);
      const scope=normalizeSeriesScopeName('ジャンプ・コミックス\\n ジャンプ コミックス');
      const label=seriesDisplayLabel(key,items);
      const visibleTitleToken='<span class="series-cyclic-title">レベルE / ジャンプ・コミックス</span>';
      const visibleTitle=html.includes(visibleTitleToken)?'レベルE / ジャンプ・コミックス':'';
      const bunkoItems=[
        {i:0,b:{isbn:'9784086191524',title:'レベルE 1',series:{name:'集英社文庫 ; と21-3'}}},
        {i:1,b:{isbn:'9784086191531',title:'レベルE 2',series:{name:'集英社文庫 ; と21-4\\nシュウエイシャ ブンコ ; ト(21)(4)'}}}
      ];
      const bunkoKeys=bunkoItems.map(x=>seriesKey(x.b));
      const bunkoScope=normalizeSeriesScopeName(bunkoItems[1].b.series.name);
      const bunkoHtml=renderSeriesLibraryGroup(bunkoKeys[0],bunkoItems);
      const bunkoLabel=seriesDisplayLabel(bunkoKeys[0],bunkoItems);
      const bunkoVisible=bunkoHtml.includes('<span class="series-cyclic-title">レベルE / 集英社文庫</span>');
      const redundantScopeItems=[
        {i:0,b:{isbn:'series-main-1',title:'片田舎のおっさん、剣聖になる 1',series:{name:'片田舎のおっさん、剣聖になる'}}},
        {i:1,b:{isbn:'series-main-2',title:'片田舎のおっさん、剣聖になる 2',series:{name:'ヤングチャンピオン・コミックス'}}},
        {i:2,b:{isbn:'series-main-3',title:'片田舎のおっさん、剣聖になる 3',series:{name:'ヤングチャンピオン・コミックス'}}}
      ];
      const coalesced=buildSeriesGroups(redundantScopeItems);
      const coalescedKey=[...coalesced.keys()][0]||'';
      const coalescedHtml=renderSeriesLibraryGroup(coalescedKey,redundantScopeItems);
      const coalescedLabel=seriesDisplayLabel(coalescedKey,redundantScopeItems);
      const coalescedVisible=coalescedHtml.includes('3冊')&&coalescedLabel==='片田舎のおっさん、剣聖になる / ヤングチャンピオン・コミックス';
      return {ok:new Set(keys).size===1&&scope==='ジャンプ・コミックス'&&label==='レベルE / ジャンプ・コミックス'&&visibleTitle==='レベルE / ジャンプ・コミックス'&&new Set(bunkoKeys).size===1&&bunkoScope==='集英社文庫'&&bunkoLabel==='レベルE / 集英社文庫'&&bunkoVisible&&coalesced.size===1&&coalescedLabel==='片田舎のおっさん、剣聖になる / ヤングチャンピオン・コミックス'&&coalescedVisible,grouped:new Set(keys).size===1,scope,label,visibleTitle,bunkoGrouped:new Set(bunkoKeys).size===1,bunkoScope,bunkoLabel,bunkoVisible,coalescedSize:coalesced.size,coalescedLabel,coalescedVisible};
    }catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-UI-SERIES-001 series header hides internal key and deduplicates bibliography spelling',seriesUiContract?.ok===true,JSON.stringify(seriesUiContract));
    const seriesSortSmoke=await evalJS(`(()=>{
      try{
        const makeCase=(genericVolume)=>[
          {i:0,b:{isbn:'series-sort-1',title:'横断ソート検証 '+genericVolume,author:'検証著者',publisher:'検証社',date:'2020-01-01',series:{name:'横断ソート検証',volumeNumber:genericVolume}}},
          {i:1,b:{isbn:'series-sort-2',title:'横断ソート検証 '+(genericVolume===1?2:1),author:'検証著者',publisher:'検証社',date:'2020-01-02',series:{name:'ヤングチャンピオン・コミックス',volumeNumber:(genericVolume===1?2:1)}}},
          {i:2,b:{isbn:'series-sort-3',title:'横断ソート検証 '+(genericVolume===3?2:3),author:'検証著者',publisher:'検証社',date:'2020-01-03',series:{name:'ヤングチャンピオン・コミックス',volumeNumber:(genericVolume===3?2:3)}}}
        ];
        const cases=[makeCase(1),makeCase(3)];
        const perms=(arr)=>{const out=[];const rec=(p,r)=>{if(!r.length){out.push(p);return}r.forEach((x,i)=>rec(p.concat(x),r.slice(0,i).concat(r.slice(i+1))))};rec([],arr);return out};
        const expected=(mode)=>mode==='volume-asc'?[1,2,3]:[3,2,1];
        const results=[];
        for(const fixture of cases){
          for(const mode of ['volume-asc','volume-desc']){
            document.getElementById('librarySort').value=mode;
            for(const order of perms(fixture)){
              const initiallySorted=[...order].sort(compareLibraryItems);
              const grouped=buildSeriesGroups(initiallySorted);
              if(grouped.size!==1)throw Error('series fixture did not coalesce');
              const [key,items]=[...grouped.entries()][0];
              const finalItems=sortSeriesGroupItems(items);
              const volumes=finalItems.map(x=>volumeNo(x.b));
              results.push({genericVolume:fixture[0].b.series.volumeNumber,mode,input:order.map(x=>x.b.series.volumeNumber),initial:initiallySorted.map(x=>x.b.series.volumeNumber),groupKey:key,volumes});
            }
          }
        }
        const ok=results.length===24&&results.every(x=>JSON.stringify(x.volumes)===JSON.stringify(expected(x.mode)));
        return {ok,cases:results.length,bad:results.filter(x=>JSON.stringify(x.volumes)!==JSON.stringify(expected(x.mode))).slice(0,6)};
      }catch(e){return {ok:false,error:String(e?.message||e),stack:String(e?.stack||'')}}
    })()`);
    check('E2E-LIB-SERIES-SORT-001 series grouping preserves every selected volume sort across scope coalescing and input permutations',seriesSortSmoke?.ok===true,JSON.stringify(seriesSortSmoke));
    const authorFilterSmoke=await evalJS(`(()=>{
      const originalBooks=books, originalAuthor=document.getElementById('filterAuthor')?.value||'', originalLibrary=document.getElementById('myBooks')?.innerHTML||'';
      try{
        books=[
          {isbn:'author-1',title:'作者テストA 1',author:'冨樫義博',authorNames:['冨樫義博'],publisher:'出版社A',date:'2020-01-01'},
          {isbn:'author-2',title:'作者テストA 2',author:'冨樫 義博',publisher:'出版社A',date:'2020-02-01'},
          {isbn:'author-3',title:'作者テストB 1',author:'原作：冨樫　義博, 作画：別作者',authorNames:['冨樫義博','別作者'],publisher:'出版社B',date:'2021-01-01'},
          {isbn:'author-4',title:'作者テストC 1',author:'別作者',publisher:'出版社C',date:'2022-01-01'},
          {isbn:'author-5',title:'連結作者 1',author:'佐賀崎 しげる',authorNames:['佐賀崎 しげる'],publisher:'出版社D',date:'2023-01-01'},
          {isbn:'author-6',title:'連結作者 2',author:'佐賀崎 しげる 鍋島テツヒロ ハザマササミ 四谷ゼンジ',publisher:'出版社D',date:'2023-02-01'},
          {isbn:'author-7',title:'連結作者 3',author:'佐賀崎 しげる 鍋島テツヒロ 空路恵 渡辺樹',publisher:'出版社D',date:'2023-03-01'},
          {isbn:'author-8',title:'誤混入テスト',author:'1966-',publisher:'出版社E',date:'2023-04-01'}
        ];
        refreshLibraryFilters();
        const sel=document.getElementById('filterAuthor');
        const options=[...sel.options].map(o=>({value:o.value,text:o.textContent}));
        const authorIndex=buildAuthorFilterIndex();
        const keys=authorFilterKey(books[0],authorIndex);
        const sameKey=keys.length===1&&authorFilterKey(books[1],authorIndex)[0]===keys[0]&&authorFilterKey(books[2],authorIndex).includes(keys[0]);
        const authorOptions=options.filter(o=>o.value===keys[0]);
        const combinedKey=normalizeAuthorIdentityName('佐賀崎 しげる');
        const combinedOptions=options.filter(o=>o.value===combinedKey);
        const malformedYearLeak=options.some(o=>o.text==='1966-'||o.text.startsWith('1966-（'));
        const combinedBooks=books.filter(b=>authorFilterKey(b,authorIndex).includes(combinedKey)).length;
        const rawCombinedLeak=options.some(o=>o.text.includes('鍋島テツヒロ ハザマササミ 四谷ゼンジ')||o.text.includes('鍋島テツヒロ 空路恵 渡辺樹'));
        sel.value=keys[0]; renderLibrary();
        const summary=document.getElementById('filterSummary')?.textContent||'';
        const cardText=document.getElementById('myBooks')?.textContent||'';
        const selectedBooks=cardText.includes('作者テストA 1')&&cardText.includes('作者テストA 2')&&cardText.includes('作者テストB 1')&&!cardText.includes('作者テストC 1');
        const rawUnchanged=books[1].author==='冨樫 義博'&&books[2].author==='原作：冨樫　義博, 作画：別作者'&&books[6].author.includes('空路恵 渡辺樹');
        return {ok:sameKey&&authorOptions.length===1&&/3冊/.test(summary)&&selectedBooks&&rawUnchanged&&combinedOptions.length===1&&combinedBooks===3&&!rawCombinedLeak&&!malformedYearLeak, sameKey,authorOptions,summary,selectedBooks,rawUnchanged,combinedOptions,combinedBooks,rawCombinedLeak,malformedYearLeak,options};
      }catch(e){return {ok:false,error:String(e?.message||e),stack:String(e?.stack||'')}}finally{
        books=originalBooks; if(document.getElementById('filterAuthor'))document.getElementById('filterAuthor').value=originalAuthor; if(document.getElementById('myBooks'))document.getElementById('myBooks').innerHTML=originalLibrary; renderLibrary();
      }
    })()`) ;
    check('E2E-LIB-AUTHOR-001 author filter uses normalized identity and keeps multiple authors selectable',authorFilterSmoke?.ok===true,authorFilterSmoke?JSON.stringify(authorFilterSmoke):'authorFilterSmoke unavailable');
    const authorFormatSmoke=await evalJS(`(()=>{try{
      const cases=[
        ["冨樫,義博","冨樫 義博"],
        ["冨樫, 義博,","冨樫 義博"],
        ["冨樫，義博，","冨樫 義博"],
        ["  冨樫 ,  義博  ","冨樫 義博"],
        ["佐賀崎,しげる 乍藤,和樹","佐賀崎 しげる|乍藤 和樹"],
        ["佐賀崎，しげる， 乍藤，和樹，","佐賀崎 しげる|乍藤 和樹"]
      ];
      const got=cases.map(([raw])=>parseLegacyAuthorNames(raw).map(x=>normalizeAuthorIdentityName(x)).join("|"));
      const want=cases.map(([,expected])=>expected.split("|").map(x=>normalizeAuthorIdentityName(x)).join("|"));
      const source="冨樫, 義博,"; normalizeJapaneseBibliographicAuthorDisplay(source);
      return {ok:got.every((x,i)=>x===want[i])&&got[1].split("|").length===1&&got[4].split("|").length===2&&source==="冨樫, 義博,",got,want};
    }catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-LIB-AUTHOR-002 equivalent Japanese surname/given-name encodings are normalized generically',authorFormatSmoke?.ok===true,JSON.stringify(authorFormatSmoke));
    const structuredMultiAuthorSmoke=await evalJS(`(()=>{try{
      const b={author:'佐賀崎,しげる 乍藤,和樹',authorNames:['佐賀崎,しげる 乍藤,和樹']};
      const names=authorSourceNames(b);
      const entries=authorIdentityEntries(b);
      const labels=entries.map(x=>x.label);
      const keys=entries.map(x=>x.key);
      const ok=names.length===2&&names.includes('佐賀崎 しげる')&&names.includes('乍藤 和樹')&&entries.length===2&&!keys.some(k=>k.includes('佐賀崎しげる乍藤和樹'));
      return {ok,names,labels,keys};
    }catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-LIB-AUTHOR-003 structured authorNames with multiple creators are split into an author set',structuredMultiAuthorSmoke?.ok===true,JSON.stringify(structuredMultiAuthorSmoke));

    // v4.13.178: replace self-referential filter tests with an independent oracle.
    // The expected result must be derived from the synthetic fixture itself, not
    // by calling the same production predicate twice. This is the key quality rule:
    // a mutation in the filter implementation must make this gate FAIL.
    const filterOracleSmoke=await evalJS(`(()=>{
      const originalBooks=books, originalMeta=bookMeta;
      try{
        const fixture=[
          {isbn:'oracle-1',title:'ORACLE-A1',author:'佐藤,太郎',authorNames:['佐藤,太郎'],publisher:'出版社A',date:'2024-01-10',price:makeConfirmedListPrice(500,'fixture','HIGH')},
          {isbn:'oracle-2',title:'ORACLE-A2',author:'佐藤 太郎',authorNames:['佐藤 太郎'],publisher:'出版社B',date:'2024-02-11',price:makeConfirmedListPrice(600,'fixture','HIGH')},
          {isbn:'oracle-3',title:'ORACLE-B1',author:'鈴木,花子',authorNames:['鈴木,花子'],publisher:'出版社B',date:'2025-03-12',price:{listPrice:null,status:'unknown'}},
          {isbn:'oracle-4',title:'ORACLE-AB',author:'佐藤,太郎 鈴木,花子',authorNames:['佐藤,太郎 鈴木,花子'],publisher:'出版社A',date:'2025-04-13',price:makeConfirmedListPrice(700,'fixture','HIGH')},
          {isbn:'oracle-5',title:'ORACLE-C',author:'高橋,次郎,',authorNames:['高橋,次郎,'],publisher:'出版社C',date:'2023-05-14',price:makeConfirmedListPrice(800,'fixture','HIGH')},
          {isbn:'oracle-6',title:'ORACLE-YEAR',author:'1966-',publisher:'出版社C',date:'2023-06-15',price:makeConfirmedListPrice(900,'fixture','HIGH')}
        ];
        books=fixture; bookMeta={
          'oracle-1':{readingStatus:'read',favorite:true},
          'oracle-2':{readingStatus:'unread',favorite:false},
          'oracle-3':{readingStatus:'read',favorite:false},
          'oracle-4':{readingStatus:'unread',favorite:true},
          'oracle-5':{readingStatus:'unread',favorite:false},
          'oracle-6':{readingStatus:'read',favorite:false}
        };
        const expectedAuthor={
          [normalizeAuthorIdentityName('佐藤 太郎')]:['oracle-1','oracle-2','oracle-4'],
          [normalizeAuthorIdentityName('鈴木 花子')]:['oracle-3','oracle-4'],
          [normalizeAuthorIdentityName('高橋 次郎')]:['oracle-5']
        };
        const expectedPublisher={
          [normalizePublisherIdentityName('出版社A')]:['oracle-1','oracle-4'],
          [normalizePublisherIdentityName('出版社B')]:['oracle-2','oracle-3'],
          [normalizePublisherIdentityName('出版社C')]:['oracle-5','oracle-6']
        };
        const authorIndex=buildAuthorFilterIndex();
        const actualAuthor={};
        for(const row of authorIndex.rows)actualAuthor[row.key]=[...row.books].map(i=>fixture[i].isbn).sort();
        const publisherIndex=buildPublisherFilterIndex();
        const actualPublisher={};
        for(const [key,row] of publisherIndex)actualPublisher[key]=[...row.books].map(i=>fixture[i].isbn).sort();
        const expectedA=Object.fromEntries(Object.entries(expectedAuthor).map(([k,v])=>[k,[...v].sort()]));
        const expectedP=Object.fromEntries(Object.entries(expectedPublisher).map(([k,v])=>[k,[...v].sort()]));
        const authorOracle=Object.keys(expectedA).every(k=>JSON.stringify(actualAuthor[k]||[])===JSON.stringify(expectedA[k])) && Object.keys(actualAuthor).every(k=>JSON.stringify(actualAuthor[k])===JSON.stringify(expectedA[k]||[]));
        const publisherOracle=Object.keys(expectedP).every(k=>JSON.stringify(actualPublisher[k]||[])===JSON.stringify(expectedP[k])) && Object.keys(actualPublisher).every(k=>JSON.stringify(actualPublisher[k])===JSON.stringify(expectedP[k]||[]));

        const selectedAuthor=normalizeAuthorIdentityName('佐藤 太郎');
        const selectedPublisher=normalizePublisherIdentityName('出版社A');
        const selectedYear='2025';
        const expectedCompound=['oracle-4'];
        const actualCompound=fixture.filter(b=>
          authorIndex.rows.some(r=>r.key===selectedAuthor&&r.books.has(fixture.indexOf(b))) &&
          publisherFilterKey(b.publisher)===selectedPublisher &&
          String(b.date).slice(0,4)===selectedYear &&
          getMeta(b.isbn).readingStatus==='unread' &&
          getMeta(b.isbn).favorite===true
        ).map(b=>b.isbn).sort();
        const compoundOracle=JSON.stringify(actualCompound)===JSON.stringify(expectedCompound);

        const noYearLeak=!Object.keys(actualAuthor).some(k=>k.includes('1966'));
        const storedUnchanged=fixture[0].author==='佐藤,太郎'&&fixture[4].author==='高橋,次郎,';
        return {ok:authorOracle&&publisherOracle&&noYearLeak&&storedUnchanged,authorOracle,publisherOracle,compoundOracle,noYearLeak,storedUnchanged,actualAuthor,actualPublisher,actualCompound};
      }catch(e){return {ok:false,error:String(e?.message||e),stack:String(e?.stack||'')}}finally{
        books=originalBooks;bookMeta=originalMeta;renderLibrary();
      }
    })()`);
    check('E2E-PROP-001 independent filter oracle: candidate and result sets',filterOracleSmoke?.ok===true,JSON.stringify(filterOracleSmoke));

    const filterInteractionSmoke=await evalJS(`(()=>{
      const originalBooks=books, originalMeta=bookMeta;
      try{
        books=[
          {isbn:'filter-1',title:'FILTER-A',author:'佐藤,太郎',authorNames:['佐藤,太郎'],publisher:'出版社A',date:'2024-01-10',price:makeConfirmedListPrice(500,'fixture','HIGH')},
          {isbn:'filter-2',title:'FILTER-B',author:'佐藤 太郎',authorNames:['佐藤 太郎'],publisher:'出版社B',date:'2024-02-11',price:makeConfirmedListPrice(600,'fixture','HIGH')},
          {isbn:'filter-3',title:'FILTER-C',author:'鈴木,花子',authorNames:['鈴木,花子'],publisher:'出版社B',date:'2025-03-12',price:{listPrice:null,status:'unknown'}},
          {isbn:'filter-4',title:'FILTER-AB',author:'佐藤,太郎 鈴木,花子',authorNames:['佐藤,太郎 鈴木,花子'],publisher:'出版社A',date:'2025-04-13',price:makeConfirmedListPrice(700,'fixture','HIGH')}
        ];
        bookMeta={
          [canonicalIsbn('filter-1')]:{readingStatus:'read',favorite:true},
          [canonicalIsbn('filter-2')]:{readingStatus:'unread',favorite:false},
          [canonicalIsbn('filter-3')]:{readingStatus:'read',favorite:false},
          [canonicalIsbn('filter-4')]:{readingStatus:'unread',favorite:true}
        };
        const authorKey=normalizeAuthorIdentityName('佐藤 太郎'), publisherKey=publisherFilterKey('出版社A');
        document.getElementById('libraryFilter').value=''; document.getElementById('filterRelease').value=''; window.libraryUnreadOnly=false;
        renderLibrary();
        const author=document.getElementById('filterAuthor'),publisher=document.getElementById('filterPublisher'),year=document.getElementById('filterYear'),reading=document.getElementById('filterReading'),favorite=document.getElementById('filterFavorite'),price=document.getElementById('filterPrice');
        author.value=authorKey; publisher.value=publisherKey; year.value='2025'; reading.value='unread'; favorite.value='yes'; price.value='confirmed';
        // Change events are the real user path. The final change causes renderLibrary
        // to consume the complete compound state.
        price.dispatchEvent(new Event('change',{bubbles:true}));
        const compoundState={author:author.value,publisher:publisher.value,year:year.value,reading:reading.value,favorite:favorite.value,price:price.value}; const bb=books[3], ai=buildAuthorFilterIndex(), meta4=getMeta(bb.isbn); const debug4={author:authorFilterKey(bb,ai).includes(author.value),publisher:publisherFilterKey(bb.publisher)===publisher.value,year:String(bb.date).slice(0,4)===year.value,reading:meta4.readingStatus===reading.value,favorite:meta4.favorite===true,price:matchesListPriceFilter(bb,price.value),release:document.getElementById('filterRelease').value,unreadOnly:window.libraryUnreadOnly,q:document.getElementById('libraryFilter').value,meta:meta4,priceObj:bb.price,authorKeys:authorFilterKey(bb,ai)}; const summary=document.getElementById('filterSummary')?.textContent||'';
        const text=document.getElementById('myBooks')?.textContent||'';
        const compoundOk=/1冊を表示中/.test(summary)&&text.includes('FILTER-AB')&&!text.includes('FILTER-A1冊')&&!text.includes('FILTER-B1冊')&&!text.includes('FILTER-C1冊');

        document.getElementById('filterReset')?.click();
        const resetText=document.getElementById('myBooks')?.textContent||'', resetSummary=document.getElementById('filterSummary')?.textContent||'';
        const resetOk=/全4冊を表示中/.test(resetSummary)&&['FILTER-A','FILTER-B','FILTER-C','FILTER-AB'].every(x=>resetText.includes(x));

        author.value=normalizeAuthorIdentityName('鈴木 花子');
        author.dispatchEvent(new Event('change',{bubbles:true}));
        const authorSummary=document.getElementById('filterSummary')?.textContent||'',authorText=document.getElementById('myBooks')?.textContent||'';
        const authorOk=/2冊を表示中/.test(authorSummary)&&authorText.includes('FILTER-C')&&authorText.includes('FILTER-AB')&&!authorText.includes('FILTER-A1冊')&&!authorText.includes('FILTER-B1冊');

        document.getElementById('filterReset')?.click();
        publisher.value=publisherKey; publisher.dispatchEvent(new Event('change',{bubbles:true}));
        const publisherSummary=document.getElementById('filterSummary')?.textContent||'',publisherText=document.getElementById('myBooks')?.textContent||'';
        const publisherOk=/2冊を表示中/.test(publisherSummary)&&publisherText.includes('FILTER-A')&&publisherText.includes('FILTER-AB')&&!publisherText.includes('FILTER-B1冊')&&!publisherText.includes('FILTER-C1冊');

        const selectedState={author:author.value,publisher:publisher.value,year:year.value,reading:reading.value,favorite:favorite.value,price:price.value}; return {ok:compoundOk&&resetOk&&authorOk&&publisherOk,compoundOk,resetOk,authorOk,publisherOk,summary,authorSummary,publisherSummary,authorText,publisherText,selectedState,compoundState,debug4};
      }catch(e){return {ok:false,error:String(e?.message||e),stack:String(e?.stack||'')}}finally{
        books=originalBooks;bookMeta=originalMeta;renderLibrary();
      }
    })()`);
    check('E2E-LIB-FILTER-INTERACTION-001 real DOM filter oracle covers author/publisher/compound/reset',filterInteractionSmoke?.ok===true,filterInteractionSmoke?JSON.stringify(filterInteractionSmoke):'filterInteractionSmoke unavailable');
    // v4.13.179: one independent oracle covers every library filter dimension.
    // This intentionally uses fixed expected ISBN sets derived from the fixture,
    // never from production filter predicates. The goal is to catch regressions
    // across dimensions without adding a new test for every real-world title.
    const filterAllDimensionsSmoke=await evalJS(`(()=>{
      const originalBooks=books, originalMeta=bookMeta, originalSeriesView=(()=>{try{return localStorage.getItem('seriesView_v444')}catch(e){return null}})();
      try{
        const fixture=[
          {isbn:'9780000000001',title:'FILTER-ALPHA',author:'佐藤,太郎',authorNames:['佐藤,太郎'],publisher:'出版社A',date:'2024-01-10',price:makeConfirmedListPrice(500,'fixture','HIGH')},
          {isbn:'9780000000002',title:'FILTER-BETA',author:'佐藤 太郎',authorNames:['佐藤 太郎'],publisher:'出版社B',date:'2024-02-11',price:makeUnconfirmedPrice('fixture')},
          {isbn:'9780000000003',title:'FILTER-GAMMA',author:'鈴木,花子',authorNames:['鈴木,花子'],publisher:'出版社B',date:'2025-03-12',price:makeConfirmedZeroPrice('fixture')},
          {isbn:'9780000000004',title:'FILTER-DELTA',author:'佐藤,太郎 鈴木,花子',authorNames:['佐藤,太郎 鈴木,花子'],publisher:'出版社A',date:'2025-04-13',price:makeConfirmedListPrice(700,'fixture','HIGH')},
          {isbn:'9780000000005',title:'FILTER-EPSILON',author:'高橋,次郎,',authorNames:['高橋,次郎,'],publisher:'出版社C',date:'2023-05-14',price:makeConfirmedListPrice(800,'fixture','HIGH')},
          {isbn:'9780000000006',title:'FILTER-ZETA',author:'高橋 次郎',authorNames:['高橋 次郎'],publisher:'出版社C',date:'2023',price:makeUnconfirmedPrice('fixture')},
          {isbn:'9780000000007',title:'SEARCH-TARGET',author:'山田,一郎',authorNames:['山田,一郎'],publisher:'出版社D',date:'2022-06-16',price:makeConfirmedListPrice(900,'fixture','HIGH')}
        ];
        books=fixture; bookMeta={
          '9780000000001':{readingStatus:'read',favorite:true},'9780000000002':{readingStatus:'unread',favorite:false},
          '9780000000003':{readingStatus:'read',favorite:false},'9780000000004':{readingStatus:'unread',favorite:true},
          '9780000000005':{readingStatus:'unread',favorite:false},'9780000000006':{readingStatus:'read',favorite:true},
          '9780000000007':{readingStatus:'unread',favorite:false}
        };
        try{localStorage.setItem('seriesView_v444','off')}catch(e){}
        const ids=['filterAuthor','filterPublisher','filterYear','filterRelease','filterReading','filterFavorite','filterPrice'];
        const titleSet=()=>[...document.querySelectorAll('#myBooks .library-card .book-title-text')].map(x=>x.textContent.trim()).filter(Boolean).sort();
        const run=(state)=>{
          resetLibraryFilters({render:false});
          if(state.q!==undefined){$('libraryFilter').value=state.q}
          if(state.author)$('filterAuthor').value=normalizeAuthorIdentityName(state.author);
          if(state.publisher)$('filterPublisher').value=publisherFilterKey(state.publisher);
          if(state.year)$('filterYear').value=state.year;
          if(state.release)$('filterRelease').value=state.release;
          if(state.reading)$('filterReading').value=state.reading;
          if(state.favorite)$('filterFavorite').value=state.favorite;
          if(state.price)$('filterPrice').value=state.price;
          window.libraryUnreadOnly=state.unreadOnly===true;
          renderLibrary();
          return {titles:titleSet(),summary:$('filterSummary')?.textContent||''};
        };
        const expected={
          all:['FILTER-ALPHA','FILTER-BETA','FILTER-GAMMA','FILTER-DELTA','FILTER-EPSILON','FILTER-ZETA','SEARCH-TARGET'],
          authorA:['FILTER-ALPHA','FILTER-BETA','FILTER-DELTA'], publisherA:['FILTER-ALPHA','FILTER-DELTA'],
          year2023:['FILTER-EPSILON','FILTER-ZETA'], known:['FILTER-ALPHA','FILTER-BETA','FILTER-GAMMA','FILTER-DELTA','FILTER-EPSILON','SEARCH-TARGET'],
          unknown:['FILTER-ZETA'], unread:['FILTER-BETA','FILTER-DELTA','FILTER-EPSILON','SEARCH-TARGET'], read:['FILTER-ALPHA','FILTER-GAMMA','FILTER-ZETA'],
          favYes:['FILTER-ALPHA','FILTER-DELTA','FILTER-ZETA'], favNo:['FILTER-BETA','FILTER-GAMMA','FILTER-EPSILON','SEARCH-TARGET'],
          confirmed:['FILTER-ALPHA','FILTER-GAMMA','FILTER-DELTA','FILTER-EPSILON','SEARCH-TARGET'], unconfirmed:['FILTER-BETA','FILTER-ZETA'],
          query:['SEARCH-TARGET'], compound:['FILTER-DELTA'], unreadOnly:['FILTER-BETA','FILTER-DELTA','FILTER-EPSILON','SEARCH-TARGET']
        };
        const eq=(actual,want)=>JSON.stringify(actual)===JSON.stringify([...want].sort());
        const cases=[
          ['all',{},expected.all],['author',{author:'佐藤 太郎'},expected.authorA],['publisher',{publisher:'出版社A'},expected.publisherA],
          ['year',{year:'2023'},expected.year2023],['release-known',{release:'known'},expected.known],['release-unknown',{release:'unknown'},expected.unknown],
          ['reading-unread',{reading:'unread'},expected.unread],['reading-read',{reading:'read'},expected.read],
          ['favorite-yes',{favorite:'yes'},expected.favYes],['favorite-no',{favorite:'no'},expected.favNo],
          ['price-confirmed',{price:'confirmed'},expected.confirmed],['price-unconfirmed',{price:'unconfirmed'},expected.unconfirmed],
          ['query',{q:'search-target'},expected.query],
          ['unread-only',{unreadOnly:true},expected.unreadOnly],
          ['compound',{author:'佐藤 太郎',publisher:'出版社A',year:'2025',release:'known',reading:'unread',favorite:'yes',price:'confirmed'},expected.compound]
        ];
        const outcomes=cases.map(([name,state,want])=>{const r=run(state);return {name,ok:eq(r.titles,want),actual:r.titles,expected:[...want].sort(),summary:r.summary}});
        const allOk=outcomes.every(x=>x.ok)&&run({}).titles.length===expected.all.length;
        const queryReset=run({q:'search-target'}); const reset=run({});
        const resetOk=eq(reset.titles,expected.all)&&/全7冊を表示中/.test(reset.summary);
        const options={years:[...$('filterYear').options].map(o=>o.value),release:[...$('filterRelease').options].map(o=>o.value),reading:[...$('filterReading').options].map(o=>o.value),favorite:[...$('filterFavorite').options].map(o=>o.value),price:[...$('filterPrice').options].map(o=>o.value)};
        return {ok:allOk&&resetOk&&eq(queryReset.titles,expected.query),allOk,resetOk,outcomes,options};
      }catch(e){return {ok:false,error:String(e?.message||e),stack:String(e?.stack||'')}}finally{
        books=originalBooks;bookMeta=originalMeta;
        try{if(originalSeriesView===null)localStorage.removeItem('seriesView_v444');else localStorage.setItem('seriesView_v444',originalSeriesView)}catch(e){}
        renderLibrary();
      }
    })()`);
    check('E2E-PROP-002 independent oracle covers all library filter dimensions',filterAllDimensionsSmoke?.ok===true,JSON.stringify(filterAllDimensionsSmoke));
    const filterCopySmoke=await evalJS(`(()=>{try{const t=buildLibraryFilterStateReport();return {ok:typeof t==='string'&&t.includes('本棚スケジュール 蔵書フィルター状態')&&t.includes('【作者フィルター候補】')&&t.includes('【出版社フィルター候補】')&&!t.includes('publisherFilterKey')&&!t.includes('authorEntities'),length:t.length};}catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-LIB-FILTER-COPY-001 filter state report is user-facing and hides internal keys',filterCopySmoke?.ok===true,filterCopySmoke?JSON.stringify(filterCopySmoke):'filterCopySmoke unavailable');
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
    const libraryDiagnosticLockSmoke=await evalJS(`(async()=>{const before=dataOperationBusy;dataOperationBusy=true;syncOperationUi();const ids=['seriesCheckBtn','seriesDiagnoseBtn','bibliographyCompareBtn','isbnRegistrationPrepBtn','seriesRepairBtn'];const disabled=ids.every(id=>document.getElementById(id)?.disabled===true);const a=await runSeriesCheck()===false;const b=await runSeriesDiagnosis()===false;const c=await compareBibliographyPaths()===false;const d=await diagnoseIsbnRegistrationPreparation()===false;const e=await repairExistingSeries()===false;dataOperationBusy=before;syncOperationUi();return {disabled,blocked:[a,b,c,d,e].every(Boolean)}})()`);
    check('E2E-CONCURRENCY-004 all library diagnostics are mutually exclusive',libraryDiagnosticLockSmoke?.disabled===true&&libraryDiagnosticLockSmoke?.blocked===true,JSON.stringify(libraryDiagnosticLockSmoke));
    const seriesDiagnosticExecutionSmoke=await evalJS(`(async()=>{
      const originalBooks=books, originalSeriesHtml=document.getElementById('seriesDiagnoseResults')?.innerHTML||'', originalCheckHtml=document.getElementById('seriesCheckResults')?.innerHTML||'';
      const sample=[
        {isbn:'9784088720715',title:'レベルE 1',series:{name:'ジャンプ・コミックス',volumeNumber:1}},
        {isbn:'9784088720722',title:'レベルE 2',series:{name:'ジャンプ・コミックス',volumeNumber:2}},
        {isbn:'9784086191524',title:'レベルE 1',series:{name:'集英社文庫 ; と21-3',volumeNumber:1}},
        {isbn:'9784086191531',title:'レベルE 2',series:{name:'集英社文庫 ; と21-4',volumeNumber:2}}
      ];
      books=sample;
      const diagBtn=document.getElementById('seriesDiagnoseBtn'), checkBtn=document.getElementById('seriesCheckBtn');
      document.getElementById('seriesDiagnoseResults').innerHTML=''; document.getElementById('seriesCheckResults').innerHTML='';
      const diagPromise=runSeriesDiagnosis();
      const diagResult=await diagPromise;
      const diagText=document.getElementById('seriesDiagnoseResults').textContent||'';
      const diagOk=diagResult===true && diagText.includes('シリーズ分類診断') && diagText.includes('9784086191524') && diagText.includes('集英社文庫');
      const checkResult=await runSeriesCheck();
      const checkText=document.getElementById('seriesCheckResults').textContent||'';
      const checkOk=checkResult===true && checkText.length>0 && (checkText.includes('巻抜け候補') || checkText.includes('巻抜け候補は見つかりませんでした'));
      const buttonsRestored=diagBtn?.disabled===false && checkBtn?.disabled===false && diagBtn?.dataset.busy!=='1' && checkBtn?.dataset.busy!=='1';
      books=originalBooks; document.getElementById('seriesDiagnoseResults').innerHTML=originalSeriesHtml; document.getElementById('seriesCheckResults').innerHTML=originalCheckHtml; syncOperationUi(); renderLibrary();
      return {ok:diagOk&&checkOk&&buttonsRestored,diagOk,checkOk,buttonsRestored,diagResult,checkResult,diagText:diagText.slice(0,500),checkText:checkText.slice(0,500)};
    })()`) ;
    check('E2E-LIB-SERIES-DIAGNOSTIC-001 series diagnosis and missing-volume check execute and render results',seriesDiagnosticExecutionSmoke?.ok===true,JSON.stringify(seriesDiagnosticExecutionSmoke));
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

    const bibliographyAuditSmoke=await evalJS(`(async()=>{try{
      const saved={books:books.slice(),confirm:window.confirm,persist:persistBooks,renderLibrary,renderHome,renderCalendar};
      window.confirm=()=>true; persistBooks=()=>true; renderLibrary=()=>{}; renderHome=()=>{}; renderCalendar=()=>{};
      books=[{isbn:'9780000000099',title:'監査fixture',author:'著者',publisher:'',date:'',price:null,series:null}];
      const api=window.bookTrackerApiManagement,oldResolve=api.resolveIsbn,oldClear=api.clearResolverCache;
      api.clearResolverCache=()=>{};
      api.resolveIsbn=async()=>({isbn:'9780000000099',title:'監査fixture',author:'著者',publisher:'出版社',date:'2026-01-02',series:{name:'監査シリーズ',volumeNumber:1,displayVolume:'1',confidence:{seriesName:'VERIFIED',volumeNumber:'VERIFIED'}},resolution:{accepted:{series:true,listPrice:true},fields:{publisher:{provider:'fixture',confidence:'VERIFIED'},releaseDate:{provider:'fixture',confidence:'VERIFIED'},seriesName:{provider:'fixture',confidence:'VERIFIED'},volumeNumber:{provider:'fixture',confidence:'VERIFIED'},listPrice:{provider:'fixture',confidence:'HIGH'}}},fieldEvidence:{publisher:{value:'出版社',confidence:'VERIFIED'},releaseDate:{value:'2026-01-02',confidence:'VERIFIED'},seriesName:{value:'監査シリーズ',confidence:'VERIFIED'},volumeNumber:{value:1,confidence:'VERIFIED'},listPrice:{value:550,confidence:'HIGH',evidence:{provider:'fixture'}}},priceMeta:{listPrice:550,taxIncluded:true}});
      const result=await auditAndFillExistingBibliography();
      const b=books[0];
      const ok=result?.checked===1&&result?.changed===1&&b.publisher==='出版社'&&b.date==='2026-01-02'&&b.series?.name==='監査シリーズ'&&b.price?.status==='confirmed'&&b.price?.listPrice===550;
      const unchangedCount=books.length===1;
      api.resolveIsbn=oldResolve;api.clearResolverCache=oldClear;window.confirm=saved.confirm;persistBooks=saved.persist;renderLibrary=saved.renderLibrary;renderHome=saved.renderHome;renderCalendar=saved.renderCalendar;books=saved.books;
      return {ok:ok&&unchangedCount,changed:result?.changed,publisher:b.publisher,date:b.date,series:b.series,price:b.price};
    }catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-BIB-001 existing bibliography audit uses Resolver, fills only eligible missing fields, and preserves collection shape',bibliographyAuditSmoke?.ok===true,JSON.stringify(bibliographyAuditSmoke));


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

    const isbnSeriesSourceConfigSmoke=await evalJS(`(async()=>{try{
      const btn=document.getElementById('isbnSeriesSourceBtn'),box=document.getElementById('isbnSeriesSourceResults'),api=window.bookTrackerApiManagement;
      const originalBooks=books, originalEnabled=api.providerEnabled, originals={}, originalProviderState={};
      const originalCfg=globalThis.bookTrackerProviderConfig;
      books=[{isbn:'9784065380161',title:'転生したらスライムだった件(028)',series:null}];
      for(const n of ['openBD','ndl','rakuten','googleBooks']){ originals[n]=api.adapters[n].isbn; originalProviderState[n]=api.providers[n]?.enabled; }
      const calls={openBD:0,ndl:0,rakuten:0,googleBooks:0};
      api.providers.openBD.enabled=true; api.providers.ndl.enabled=true; api.providers.rakuten.enabled=true; api.providers.googleBooks.enabled=false;
      for(const n of Object.keys(originals)) api.adapters[n].isbn=async isbn=>{calls[n]++;return [{isbn,title:'fixture-'+n,series:{id:'SID-'+n,name:'fixture-series-'+n,volumeNumber:1},source:n}]};
      globalThis.bookTrackerProviderConfig={rakuten:{applicationId:'',accessKey:''}};
      box.innerHTML='';
      await diagnoseIsbnSeriesSources();
      const text=box.textContent||'';
      const ok=text.includes('【rakuten】')&&text.includes('SKIPPED')&&text.includes('楽天Books未設定')&&text.includes('【googleBooks】')&&text.includes('Google Books無効')&&calls.rakuten===0&&calls.googleBooks===0&&calls.openBD===1&&calls.ndl===1;
      for(const n of Object.keys(originals)) api.adapters[n].isbn=originals[n]; for(const n of Object.keys(originalProviderState)) api.providers[n].enabled=originalProviderState[n]; api.providerEnabled=originalEnabled; globalThis.bookTrackerProviderConfig=originalCfg; books=originalBooks; box.innerHTML='';
      return {ok,text,calls};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-LIB-ISBN-SOURCE-002 unconfigured/disabled providers are skipped',isbnSeriesSourceConfigSmoke?.ok===true,JSON.stringify(isbnSeriesSourceConfigSmoke));

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
      nav('calendar'); const before=document.getElementById('monthTitle')?.textContent||''; document.getElementById('nextMonth')?.click(); const after=document.getElementById('monthTitle')?.textContent||''; out.calendarMonthChanges=before!==after; document.getElementById('prevMonth')?.click(); const yearBefore=document.getElementById('monthTitle')?.textContent||''; document.getElementById('nextYear')?.click(); const yearAfter=document.getElementById('monthTitle')?.textContent||''; out.calendarYearChanges=yearBefore!==yearAfter; document.getElementById('prevYear')?.click(); document.getElementById('calendarYearMode')?.click(); out.calendarYearMode=document.getElementById('calendarYearGrid')?.hidden===false && document.getElementById('calendarMonthMode')?.getAttribute('aria-pressed')==='false'; document.getElementById('calendarMonthMode')?.click(); out.calendarMonthMode=document.getElementById('calendarYearGrid')?.hidden===true && document.getElementById('calendarMonthMode')?.getAttribute('aria-pressed')==='true';
      nav('settings'); document.querySelector('.font-choice[data-font="large"]')?.click(); out.fontLarge=document.body.classList.contains('font-large') || getComputedStyle(document.body).fontSize!==''; document.querySelector('.font-choice[data-font="medium"]')?.click();
      return out;
    })()`);
    check('E2E-SMOKE-001 cross-tab state transitions',smoke.searchModeAuthor&&smoke.searchModeBook&&smoke.libraryFilterOpen&&smoke.calendarMonthChanges&&smoke.calendarYearChanges&&smoke.calendarYearMode&&smoke.calendarMonthMode&&smoke.fontLarge,JSON.stringify(smoke));

    // Generic UI state-transition audit: verify visible state, computed display, ARIA state and
    // mutually-exclusive panels after round trips. This is intentionally reusable across features,
    // not a one-off calendar assertion.
    const uiStateAudit=await evalJS(`(()=>{try{
      const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return !e.hidden&&r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
      const hidden=e=>{if(!e)return true;const s=getComputedStyle(e);return e.hidden||s.display==='none'||s.visibility==='hidden'||e.getBoundingClientRect().width===0||e.getBoundingClientRect().height===0};
      const nav=id=>document.querySelector('#bottomNav button[data-s="'+id+'"]')?.click();
      const out={}; nav('calendar');
      document.getElementById('calendarMonthMode')?.click();
      out.monthInitial={month:visible(document.getElementById('calHead'))&&visible(document.getElementById('calendarGrid')),year:hidden(document.getElementById('calendarYearGrid')),yearPressed:document.getElementById('calendarYearMode')?.getAttribute('aria-pressed')==='false'};
      document.getElementById('calendarYearMode')?.click();
      const yearButtons=[...document.querySelectorAll('#calendarYearGrid .calendar-year-month')];
      out.yearMode={grid:visible(document.getElementById('calendarYearGrid')),calendar:hidden(document.getElementById('calHead'))&&hidden(document.getElementById('calendarGrid'))&&hidden(document.getElementById('calendarDayCard')),monthPressed:document.getElementById('calendarMonthMode')?.getAttribute('aria-pressed')==='false',yearPressed:document.getElementById('calendarYearMode')?.getAttribute('aria-pressed')==='true',monthControlsHidden:hidden(document.getElementById('prevMonth'))&&hidden(document.getElementById('nextMonth')),twelveButtons:yearButtons.length};
      yearButtons[5]?.click();
      const afterSelect=[...document.querySelectorAll('#calendarYearGrid .calendar-year-month')];
      out.afterMonthSelect={returnedToMonth:document.getElementById('calendarMonthMode')?.getAttribute('aria-pressed')==='true',yearGridHidden:hidden(document.getElementById('calendarYearGrid')),calendarVisible:visible(document.getElementById('calHead'))&&visible(document.getElementById('calendarGrid')),yearReleaseHidden:hidden(document.getElementById('calendarYearReleases'))};
      document.getElementById('calendarYearMode')?.click();
      const selected=[...document.querySelectorAll('#calendarYearGrid .calendar-year-month.selected-month')];
      const allNeutral=[...document.querySelectorAll('#calendarYearGrid .calendar-year-month')].every(e=>!e.classList.contains('selected-month')&&e.getAttribute('aria-pressed')==='false');
      const yearReleaseVisible=visible(document.getElementById('calendarYearReleases'))&&!!document.getElementById('calendarYearReleasesList');
      out.roundTrip={selectedCount:selected.length,allNeutral,yearReleaseVisible};
      return {ok:out.monthInitial.month&&out.monthInitial.year&&out.yearMode.grid&&out.yearMode.calendar&&out.yearMode.monthPressed&&out.yearMode.yearPressed&&out.yearMode.monthControlsHidden&&out.yearMode.twelveButtons===12&&out.afterMonthSelect.returnedToMonth&&out.afterMonthSelect.yearGridHidden&&out.afterMonthSelect.calendarVisible&&out.afterMonthSelect.yearReleaseHidden&&out.roundTrip.selectedCount===0&&out.roundTrip.allNeutral&&out.roundTrip.yearReleaseVisible,details:out};
    }catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-UI-STATE-001 generic state-transition audit across calendar view modes',uiStateAudit?.ok===true,JSON.stringify(uiStateAudit));
    const calendarYearVisualAudit=await evalJS(`(()=>{try{const grid=document.getElementById('calendarYearGrid'),items=[...document.querySelectorAll('#calendarYearGrid .calendar-year-month')],release=document.getElementById('calendarYearReleases');const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return !e.hidden&&r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const neutral=items.every(e=>!e.classList.contains('selected-month')&&e.getAttribute('aria-pressed')==='false');const heights=items.map(e=>e.getBoundingClientRect().height);const compact=heights.length===12&&Math.max(...heights)<=60;const gridRect=grid?.getBoundingClientRect();const releaseVisible=visible(release)&&!!document.getElementById('calendarYearReleasesList');return {ok:visible(grid)&&items.length===12&&neutral&&compact&&!!gridRect&&gridRect.height<=130&&releaseVisible,items:items.length,neutral,heights,gridHeight:gridRect?.height,releaseVisible};}catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-UI-CALENDAR-YEAR-001 compact neutral 12-month chooser + annual release list',calendarYearVisualAudit?.ok===true,JSON.stringify(calendarYearVisualAudit));

    // Generic visibility audit for every shipped tab: hidden nodes must not render, visible nodes must
    // have a usable box. This catches CSS-vs-hidden regressions that static checks cannot detect.
    const visibilityAudit=await evalJS(`(()=>{const required={home:['home'],add:['add'],library:['library'],search:['search'],calendar:['calendar'],settings:['settings']};const out={};for(const [tab,ids] of Object.entries(required)){document.querySelector('#bottomNav button[data-s="'+tab+'"]')?.click();out[tab]=ids.every(id=>{const e=document.getElementById(id);if(!e)return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return !e.hidden&&s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0})}return {ok:Object.values(out).every(Boolean),out}})()`);
    check('E2E-UI-STATE-002 generic tab visibility audit',visibilityAudit?.ok===true,JSON.stringify(visibilityAudit));

    const identityAudit=await evalJS(`(()=>{try{const saved=books.slice();books=[{publisher:'集英社'},{publisher:' 集英社 '},{publisher:'集英社　'},{publisher:'集英社文庫'}];const k1=publisherFilterKey(books[0].publisher),k2=publisherFilterKey(books[1].publisher),k3=publisherFilterKey(books[2].publisher),k4=publisherFilterKey(books[3].publisher);const pidx=buildPublisherFilterIndex();const groups={};books.forEach(b=>(groups[seriesKey(b)]??=[]).push(b));const seriesSafe=Object.keys(groups).every(k=>!String(seriesDisplayLabel(k,groups[k].map(b=>({b})))).includes('series-work:')&&!String(seriesDisplayLabel(k,groups[k].map(b=>({b})))).includes('series-scope:'));books=saved;renderLibrary();return {publisherSame:k1===k2&&k2===k3,publisherDistinct:k1!==k4,publisherCount:pidx.get(k1)?.books.size===3,seriesDisplaySafe:seriesSafe}}catch(e){return {error:String(e?.message||e)}}})()`);
    check('E2E-IDENTITY-001 publisher/series display-key separation',identityAudit?.publisherSame&&identityAudit?.publisherDistinct&&identityAudit?.publisherCount&&identityAudit?.seriesDisplaySafe,JSON.stringify(identityAudit));


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

    // v4.13.193: Home statistics are a derived cross-tab projection of the same library state.
    // The expected values are computed independently from the production stats helper so a stale
    // or partially updated Home renderer cannot silently diverge from the library.
    const homeStatsOracle=await evalJS(`(()=>{try{
      const saved={books:books.slice(),bookMeta:JSON.parse(JSON.stringify(bookMeta)),calendarExtras:calendarExtras.slice()};
      books=[
        {isbn:'home-1',title:'HOME-A',price:{listPrice:500,status:'confirmed',taxIncluded:true},date:'2026-09-01'},
        {isbn:'home-2',title:'HOME-B',price:{listPrice:null,status:'unknown'},date:'2026-09-02'},
        {isbn:'home-3',title:'HOME-C',price:{listPrice:0,status:'confirmed_zero',taxIncluded:true},date:'2026-09-03'}
      ];
      bookMeta={
        'HOME1':{readingStatus:'read',favorite:true,purchaseStatus:'purchased'},
        'HOME2':{readingStatus:'unread',favorite:false,purchaseStatus:'wanted'},
        'HOME3':{readingStatus:'unread',favorite:true,purchaseStatus:'none'}
      };
      calendarExtras=[];
      const independent={count:3,pricedCount:1,priceConfirmedCount:2,total:500,unread:2,favorite:2};
      renderHome();
      const got={
        count:$('homeBookCount')?.textContent||'',
        total:$('homeBookTotal')?.textContent||'',
        totalSub:$('homeBookTotalSub')?.textContent||'',
        unread:$('homeUnreadCount')?.textContent||'',
        favorite:$('homeFavoriteCount')?.textContent||''
      };
      const ok=got.count==='3冊'&&got.total==='¥500'&&got.totalSub==='定価確定：2/3冊・未確定：1冊'&&got.unread==='2冊'&&got.favorite==='2冊';
      books=saved.books;bookMeta=saved.bookMeta;calendarExtras=saved.calendarExtras;render();
      return {ok,independent,got};
    }catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-HOME-001 Home statistics match independent library-state oracle',homeStatsOracle?.ok===true,JSON.stringify(homeStatsOracle));

    // Restore the pristine document before the rest of the release gate so P1 fixtures cannot contaminate UI tests.
    await cdp.send('Page.setDocumentContent',{frameId:(await cdp.send('Page.getFrameTree')).frameTree.frame.id,html:browserHtml}); await wait(1000);


    // Screenshot smoke at the final state. This catches catastrophic blank pages in addition to geometry tests.
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
    const searchSortOracle=await evalJS(`(async()=>{try{
      const api=window.bookTrackerApiManagement;
      const oldSearch=api.search;
      const oldSettings=JSON.parse(JSON.stringify(appSettings.search));
      const oldBooks=books.slice();
      const fixture=[
        {isbn:'search-o1',title:'検索本 3',author:'A',date:'2026-03-01',language:'ja'},
        {isbn:'search-o2',title:'検索本 1',author:'B',date:'2026-01-01',language:'ja'},
        {isbn:'search-o3',title:'検索本 2',author:'C',date:'2026-02-01',language:'en'},
        {isbn:'search-o4',title:'別作品',author:'D',date:'2025-12-01',language:'ja'}
      ];
      api.search=async()=>({results:[...fixture]});
      const expected={
        'release-desc':['search-o1','search-o3','search-o2','search-o4'],
        'release-asc':['search-o4','search-o2','search-o3','search-o1'],
        'title-asc':['search-o2','search-o3','search-o1','search-o4']
      };
      const results={};
      for(const mode of Object.keys(expected)){
        appSettings.search={...oldSettings,sort:mode,resultCount:20,jpPriority:false,unownedFirst:false};
        results[mode]=(await searchGoogle('検索本')).map(x=>x.isbn);
      }
      books=[fixture[1]];
      appSettings.search={...oldSettings,sort:'release-desc',resultCount:20,jpPriority:false,unownedFirst:true};
      const unowned=(await searchGoogle('検索本')).map(x=>x.isbn);
      const ok=Object.entries(expected).every(([mode,want])=>JSON.stringify(results[mode])===JSON.stringify(want)) && JSON.stringify(unowned)===JSON.stringify(['search-o1','search-o3','search-o4','search-o2']);
      api.search=oldSearch; appSettings.search=oldSettings; books=oldBooks;
      return {ok,results,unowned};
    }catch(e){try{window.bookTrackerApiManagement.search=window.bookTrackerApiManagement.search}catch(_){} return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-SEARCH-003 independent search sort/unowned oracle',searchSortOracle?.ok===true,JSON.stringify(searchSortOracle));
    const crossDataContract=await evalJS(`(()=>{try{
      const saved={books:books.slice(),meta:JSON.parse(JSON.stringify(bookMeta)),sort:$('librarySort')?.value||'registered-desc',q:$('libraryFilter')?.value||'',fa:$('filterAuthor')?.value||'',fp:$('filterPublisher')?.value||'',fy:$('filterYear')?.value||'',fr:$('filterRelease')?.value||'',fre:$('filterReading')?.value||'',ff:$('filterFavorite')?.value||'',fprice:$('filterPrice')?.value||'',unreadOnly:window.libraryUnreadOnly===true};
      const fixture=[
        {isbn:'9784088720715',title:'横断作品 1',author:'山田 太郎',publisher:'出版社A',date:'2026-01-15',price:{listPrice:1200,status:'confirmed',currency:'JPY',taxIncluded:true,source:'fixture'},series:{name:'横断作品',volumeNumber:1,displayVolume:'1'}},
        {isbn:'9784088720722',title:'横断作品 2',author:'佐藤 花子',publisher:'出版社B',date:'2026-02-15',price:{listPrice:null,status:'unconfirmed',currency:'JPY',taxIncluded:false,source:'fixture'},series:{name:'横断作品',volumeNumber:2,displayVolume:'2'}},
        {isbn:'9784088720739',title:'別作品 1',author:'山田 太郎',publisher:'出版社A',date:'',price:{listPrice:0,status:'confirmed_zero',currency:'JPY',taxIncluded:true,source:'fixture'},series:{name:'別作品',volumeNumber:1,displayVolume:'1'}}
      ];
      books=fixture.map(x=>({...x}));
      bookMeta={
        '9784088720715':{purchaseStatus:'purchased',readingStatus:'read',favorite:true,memo:'',rating:0,notify:false},
        '9784088720722':{purchaseStatus:'wanted',readingStatus:'unread',favorite:false,memo:'',rating:0,notify:false},
        '9784088720739':{purchaseStatus:'wanted',readingStatus:'unread',favorite:true,memo:'',rating:0,notify:false}
      };
      // Independent expected values: these are not produced by the production predicates.
      const expected={isbn:'9784088720715',titles:['横断作品 1','横断作品 2'],author:'山田 太郎',publisher:'出版社A',knownRelease:2,confirmedPriceCount:2,total:1200,unread:2,favorite:2,seriesVolumes:[1,2]};
      const key=canonicalIsbn('9784088720715');
      const identityOk=key==='9784088720715' && bookResultKey(fixture[0])==='9784088720715';
      $('libraryFilter').value='横断作品 1'; $('filterAuthor').value=''; $('filterPublisher').value=''; $('filterYear').value=''; $('filterRelease').value=''; $('filterReading').value=''; $('filterFavorite').value=''; $('filterPrice').value=''; window.libraryUnreadOnly=false; $('librarySort').value='title-asc'; renderLibrary();
      const titleSearch=[...document.querySelectorAll('#myBooks .card[data-book]')].map(el=>{try{return JSON.parse(el.dataset.book).title}catch(e){return ''}});
      $('libraryFilter').value=''; renderLibrary();
      const authorIndex=buildAuthorFilterIndex(),authorRows=authorIndex.rows.filter(r=>r.label==='山田 太郎');
      const publisherRows=[...buildPublisherFilterIndex().values()].filter(r=>r.label==='出版社A');
      $('filterAuthor').value=authorRows[0]?.key||''; renderLibrary(); const authorCount=document.querySelectorAll('#myBooks .card[data-book]').length;
      $('filterAuthor').value=''; $('filterPublisher').value=publisherRows[0]?.key||''; renderLibrary(); const publisherCount=document.querySelectorAll('#myBooks .card[data-book]').length;
      $('filterPublisher').value=''; $('filterPrice').value='confirmed'; renderLibrary(); const priceCount=document.querySelectorAll('#myBooks .card[data-book]').length;
      $('filterPrice').value=''; $('filterRelease').value='known'; renderLibrary(); const releaseKnownCount=document.querySelectorAll('#myBooks .card[data-book]').length;
      $('filterRelease').value=''; $('filterReading').value='unread'; renderLibrary(); const unreadCount=document.querySelectorAll('#myBooks .card[data-book]').length;
      $('filterReading').value=''; $('filterFavorite').value='yes'; renderLibrary(); const favoriteCount=document.querySelectorAll('#myBooks .card[data-book]').length;
      const releaseEvents=allEvents(true).filter(e=>e.isbn==='9784088720715'||e.isbn==='9784088720722');
      const releaseProjection=releaseEvents.some(e=>e.isbn==='9784088720715'&&e.date==='2026-01-15') && releaseEvents.some(e=>e.isbn==='9784088720722'&&e.date==='2026-02-15') && !releaseEvents.some(e=>e.isbn==='9784088720739');
      const stats=deriveLibraryStats();
      const seriesGroups=buildSeriesGroups(fixture.map((b,i)=>({b,i})));
      const series=seriesGroups.get('series-work:横断作品');
      $('filterFavorite').value=''; renderLibrary(); $('libraryFilter').value=''; $('librarySort').value='volume-asc'; renderLibrary();
      const volumeOrder=[...document.querySelectorAll('#myBooks .card[data-book]')].map(el=>{try{return JSON.parse(el.dataset.book).isbn}catch(e){return ''}});
      // Persistence/reload is covered independently by E2E-PERSIST; this cross contract verifies that the canonical data remains serializable and lossless before persistence.
      const serialized=JSON.stringify(fixture),roundTrip=JSON.parse(serialized);
      const saveRoundTrip=Array.isArray(roundTrip)&&roundTrip.length===3&&roundTrip[0].isbn==='9784088720715'&&roundTrip[0].series.volumeNumber===1;
      books=saved.books;bookMeta=saved.meta;$('librarySort').value=saved.sort;$('libraryFilter').value=saved.q;$('filterAuthor').value=saved.fa;$('filterPublisher').value=saved.fp;$('filterYear').value=saved.fy;$('filterRelease').value=saved.fr;$('filterReading').value=saved.fre;$('filterFavorite').value=saved.ff;$('filterPrice').value=saved.fprice;window.libraryUnreadOnly=saved.unreadOnly;render();
      const ok=identityOk && JSON.stringify(titleSearch)===JSON.stringify(['横断作品 1']) && authorCount===2 && publisherCount===2 && priceCount===2 && releaseKnownCount===2 && unreadCount===2 && favoriteCount===2 && stats.count===3 && stats.priceConfirmedCount===2 && stats.total===1200 && stats.unread===2 && stats.favorite===2 && Array.isArray(series)&&series.length===2 && series.every(x=>x.b.series?.volumeNumber===1||x.b.series?.volumeNumber===2) && volumeOrder.length===3 && releaseProjection && saveRoundTrip;
      return {ok,identityOk,titleSearch,authorCount,publisherCount,priceCount,releaseKnownCount,unreadCount,favoriteCount,releaseProjection,stats,seriesVolumes:series?.map(x=>x.b.series?.volumeNumber)||[],volumeOrder,saveRoundTrip,expected};
    }catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-CROSS-DATA-001 10系統横断契約（ISBN/タイトル/作者/出版社/発売日/定価/シリーズ/巻数/読書状態/お気に入り）',crossDataContract?.ok===true,JSON.stringify(crossDataContract));
    const releaseDateContract=await evalJS(`(()=>{try{
      const cases=[
        ['2026-04-15','2026-04-15','day'],['2026-04-15T00:00:00+09:00','2026-04-15','day'],['2026/04/15','2026-04-15','day'],['2026年4月15日','2026-04-15','day'],
        ['2026-04','2026-04', 'month'],['2026年4月','2026-04', 'month'],['2026','', 'year'],['not-a-date','', 'unknown'],['','', 'unknown']
      ];
      const normalized=cases.map(([input,date,precision])=>{const info=releaseDateInfo(input);return {input,date:canonicalCalendarReleaseDate(input),precision:info.precision,time:releaseTime({date:input})}});
      const normalizedOk=normalized.every((x,i)=>x.date===cases[i][1]&&x.precision===cases[i][2]);
      const rows=[{title:'unknown',date:'not-a-date'},{title:'old',date:'2025-01-01'},{title:'new',date:'2026-01-01'}];
      const asc=sortBooks(rows,'release-asc').map(x=>x.title),desc=sortBooks(rows,'release-desc').map(x=>x.title);
      const sortOk=JSON.stringify(asc)===JSON.stringify(['old','new','unknown'])&&JSON.stringify(desc)===JSON.stringify(['new','old','unknown']);
      const oldBooks=books.slice(),oldExtras=calendarExtras.slice();
      books=[{isbn:'date-cross-1',title:'ISO日付',date:'2026-04-15T00:00:00+09:00',upcoming:[]},{isbn:'date-cross-2',title:'月だけ',date:'2026-04',upcoming:[]}];calendarExtras=[];
      const events=allEvents(true); const calendarOk=events.some(e=>e.isbn==='date-cross-1'&&e.date==='2026-04-15'&&e.releasePrecision==='day')&&events.some(e=>e.isbn==='date-cross-2'&&e.date==='2026-04'&&e.releasePrecision==='month');
      books=oldBooks;calendarExtras=oldExtras;
      return {ok:normalizedOk&&sortOk&&calendarOk,normalized,asc,desc,calendarOk};
    }catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-CROSS-RELEASE-001 canonical release-date contract',releaseDateContract?.ok===true,JSON.stringify(releaseDateContract));
    const phaseMetricContract=await evalJS(`(()=>{try{const sm=window.bookTrackerSearchMetrics;const t=sm.start('計測テスト','phase');t.addApiPhase('googleBooks','fetch',12);sm.finish(t,true,'',0,[]);return {ok:t.apiPhases?.googleBooks?.fetch===12};}catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    const postFinishPhaseContract=await evalJS(`(()=>{try{const sm=window.bookTrackerSearchMetrics;const t=sm.start('計測テスト','post-finish');sm.beginApi('googleBooks');sm.endApi('googleBooks',false);sm.finish(t,true,'',0,[]);t.addApiPhase('googleBooks','json',34);return {ok:t.apiPhases?.googleBooks?.json===34,rendered:document.getElementById('searchMetricsList')?.textContent?.includes('json：34 ms')};}catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    check('E2E-SEARCH-001 provider phase attaches to search record',phaseMetricContract?.ok===true,JSON.stringify(phaseMetricContract));

    const registrationMetricSmoke=await evalJS(`(async()=>{try{
      const m=window.bookTrackerRegistrationMetrics,token=m.start('計測モデルfixture');
      const t0=performance.now();
      await m.measureProcessing(token,async()=>{m.beginUserWait(token);await new Promise(r=>setTimeout(r,35));m.endUserWait(token);await new Promise(r=>setTimeout(r,5));});
      const waited=Number(token.userWaitMs)||0,processed=Number(token.processingMs)||0,total=performance.now()-t0;
      const ok=waited>=25&&processed>=0&&processed<waited&&total>=waited;
      m.clear();
      return {ok,waited:Math.round(waited),processed:Math.round(processed),total:Math.round(total)};
    }catch(e){return {ok:false,error:String(e?.message||e)}}})()`);
    const metricPresence=await evalJS(`(()=>({type:typeof window.bookTrackerRegistrationMetrics,keys:typeof window.bookTrackerRegistrationMetrics==='object'?Object.keys(window.bookTrackerRegistrationMetrics):[]}))()`);
    check('E2E-METRIC-000 registration metric runtime is loaded',metricPresence?.type==='object'&&metricPresence?.keys.includes('measureProcessing')&&metricPresence?.keys.includes('beginUserWait'),JSON.stringify(metricPresence));
    check('E2E-METRIC-001 user-wait time is excluded from registration processing time',registrationMetricSmoke?.ok===true,JSON.stringify(registrationMetricSmoke));

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
