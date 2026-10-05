#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=process.cwd();
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const failures=[];
const req=(c,m)=>{if(!c)failures.push(m)};
req(pkg.version==='4.13.245',`version mismatch: ${pkg.version}`);
// Diagnostic copy controls: source/result/wiring must all exist. This is a generic
// interaction regression gate, not a release-date-only feature gate.
const pairs=[
 ['copyReleaseDateRepairBtn','releaseDateRepairResults'],
 ['copyReleaseDateAuditBtn','releaseDateAuditResults'],
 ['copyBibliographyAuditBtn','bibliographyAuditResults'],
 ['copySeriesDiagnosticBtn','seriesDiagnoseResults'],
 ['copyBibliographyCompareBtn','bibliographyCompareResults'],
 ['copyIsbnRegistrationPrepBtn','isbnRegistrationPrepResults'],
 ['copySeriesRepairBtn','seriesRepairResults'],
 ['copyNdlProviderScopeBtn','ndlProviderScopeResults'],
 ['copyIsbnSeriesSourceBtn','isbnSeriesSourceResults'],
 ['copyNdlSeriesCandidateBtn','ndlSeriesCandidateResults']
];
for(const [btn,out] of pairs){
 req(html.includes(`id="${btn}"`),`copy button missing: ${btn}`);
 req(html.includes(`id="${out}"`),`copy result missing: ${out}`);
 req(html.includes(`$("${btn}")?.addEventListener("click",function(){copyElementText("${out}",this)})`),`copy wiring missing: ${btn} -> ${out}`);
}
req(html.includes('function copyTextValue(text,button)'), 'copyTextValue missing');
req(html.includes('function copyElementText(id,button)'), 'copyElementText missing');
req(html.includes('navigator.clipboard?.writeText'), 'clipboard API path missing');
req(html.includes('document.execCommand("copy")'), 'legacy clipboard fallback missing');
req(html.includes('コピーしました ✓'), 'copy success feedback missing');
// Year view must include year-only release records in the release list while keeping
// month grid semantics unchanged.
req(html.includes('e.releasePrecision==="year"'), 'year-only release records missing from year-view source');
req(html.includes('発売年のみ'), 'year-only release section label missing');
req(html.includes('releasePrecision!=="year"'), 'year-only records must not be forced into a month grid');
// Semantic-equivalence fallback protects compact/dotted/ISO month forms from a false conflict.
req(html.includes('releaseDateProviderValuesAreSemanticallyEquivalent'), 'semantic release-date equivalence helper missing');
if(failures.length){console.error('INTERACTION-REGRESSION-GATE FAIL');failures.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log('INTERACTION-REGRESSION-GATE PASS | diagnostic copy wiring='+pairs.length+' | year-only year-view=enabled | semantic month-equivalence=guarded');
