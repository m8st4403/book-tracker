#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=__dirname, html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const fail=[];
function req(c,m){if(!c)fail.push(m)}
const start=html.indexOf('function renderDiagnosticText(id,text){');
const end=html.indexOf('function getLibrarySelectLabel',start);
req(start>=0&&end>start,'diagnostic renderer/helper block missing');
const block=html.slice(start,end);
const elements=new Map();
function makeEl(){return {dataset:{},innerHTML:'',textContent:'',innerText:'',children:[],appendChild(x){this.children.push(x);this.textContent=x.textContent;this.innerText=x.textContent;return x}}}
const sandbox={console,document:{createElement(tag){return {tagName:tag.toUpperCase(),className:'',style:{},textContent:'',setAttribute(){}}}},$:(id)=>elements.get(id)};
vm.createContext(sandbox);vm.runInContext(block,sandbox,{timeout:1000});
const el=makeEl();elements.set('releaseDateRepairResults',el);
const sample='既存蔵書 発売日不足補完\\n<b>タグではなく文字列として保持</b>\\n<span class="muted">表示確認</span>';
sandbox.renderDiagnosticText('releaseDateRepairResults',sample);
req(el.children.length===1,'renderer did not create a single pre node');
req(el.children[0].tagName==='PRE','diagnostic renderer must use PRE');
req(el.children[0].textContent===sample,'diagnostic renderer must preserve literal text through textContent');
req(el.dataset.diagnosticText===sample,'canonical diagnostic text was not stored');
req(sandbox.getDiagnosticText('releaseDateRepairResults')===sample,'copy source did not reuse canonical diagnostic text');
req(!block.includes('innerHTML=value'),'diagnostic renderer must not inject diagnostic text as HTML');
req(html.includes('renderDiagnosticText("releaseDateAuditResults"'),'release-date audit uses generic renderer');
req(html.includes('renderDiagnosticText("releaseDateRepairResults"'),'release-date repair uses generic renderer');
req(html.includes('renderDiagnosticText("bibliographyAuditResults"'),'bibliography audit uses generic renderer');
if(fail.length){console.error('DIAGNOSTIC-RENDER-CONTRACT-GATE FAIL');fail.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log(`DIAGNOSTIC-RENDER-CONTRACT-GATE PASS | release=${pkg.version} | literal HTML safety + canonical copy source verified`);
