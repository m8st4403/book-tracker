const fs=require('fs');
const path=require('path');
const root=__dirname;
const file=path.join(root,'DEVELOPMENT_ROADMAP_DECISION.json');
if(!fs.existsSync(file)) throw new Error('DEVELOPMENT_ROADMAP_DECISION.json missing');
const d=JSON.parse(fs.readFileSync(file,'utf8'));
if(d.release!=='4.13.244') throw new Error(`roadmap release mismatch: ${d.release}`);
if(!Array.isArray(d.priorityOrder)||d.priorityOrder.length!==6) throw new Error('priority order must contain 6 decisions');
const ranks=d.priorityOrder.map(x=>x.rank);
if(JSON.stringify(ranks)!==JSON.stringify([1,2,3,4,5,6])) throw new Error('priority ranks must be 1..6');
for(const x of d.priorityOrder){ if(!x.id||!x.status||!x.scope||!x.reason) throw new Error(`incomplete roadmap decision: ${x.id}`); }
const p=d.plannedFeatureDisposition||{};
const expected=['RELEASE-MODEL','RELEASE-SOURCE','RELEASE-REGION','RELEASE-CHANGE','RELEASE-CONFLICT','REC-BEHAVIOR','REC-SERIES','REC-AUTHOR','REC-REASON','REC-NO-ATTRIBUTE','REC-USER-CONTROL','IOS-SWIFTUI','IOS-DYNAMIC-TYPE','IOS-VOICEOVER','IOS-CAMERA','IOS-EVENTKIT','IOS-NOTIFY','IOS-DATA','IOS-CLOUD','OCR-ISBN','OCR-COVER','OCR-SPINE','OCR-CANDIDATE','OCR-SEARCH','MON-AFF','MON-PRO','MON-SUB','MON-B2B'];
const missing=expected.filter(k=>!p[k]); if(missing.length) throw new Error(`planned disposition missing: ${missing.join(',')}`);
if(!d.exitCriteriaForNextStep||d.exitCriteriaForNextStep.length<4) throw new Error('next-step exit criteria incomplete');
console.log('DEVELOPMENT_ROADMAP_GATE: PASS');
console.log('priority decisions: 6');
console.log('planned feature dispositions: 28/28');
