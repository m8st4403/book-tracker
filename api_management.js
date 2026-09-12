/* API Management v1.1 — Phase 3.
 * Bundled adapters normalize provider responses, then a field-wise resolver
 * validates evidence and merges compatible sources. Remote configuration may
 * change data values only; it must never supply executable code.
 */
(function(){
  "use strict";
  const VERSION="1.2";
  const CONF={UNKNOWN:0,LOW:1,MEDIUM:2,HIGH:3,VERIFIED:4};
  const CRITICAL=new Set(["isbn13","seriesId","seriesName","volumeNumber","listPrice","taxIncluded"]);
  const providers={
    googleBooks:{enabled:true,capabilities:{isbnSearch:true,titleSearch:true,bibliographicRecord:true,seriesId:true,seriesName:true,volumeNumber:true,listPrice:true,taxIncluded:false,releaseDate:true,cover:true,author:true,publisher:true,pages:true}},
    openBD:{enabled:true,capabilities:{isbnSearch:true,titleSearch:false,bibliographicRecord:true,seriesId:false,seriesName:true,volumeNumber:true,listPrice:true,taxIncluded:false,releaseDate:true,cover:true,author:true,publisher:true,pages:true}},
    rakuten:{enabled:false,capabilities:{isbnSearch:true,titleSearch:true,bibliographicRecord:true,seriesId:false,seriesName:true,volumeNumber:true,listPrice:true,taxIncluded:true,releaseDate:true,cover:true,author:true,publisher:true,pages:true}},
    ndl:{enabled:false,capabilities:{isbnSearch:true,titleSearch:true,bibliographicRecord:true,seriesId:false,seriesName:true,volumeNumber:true,listPrice:true,taxIncluded:true,releaseDate:true,cover:false,author:true,publisher:true,pages:true}}
  };
  const priority={
    search:["googleBooks","rakuten","ndl"],
    seriesId:["googleBooks"],
    seriesName:["googleBooks","rakuten","openBD","ndl"],
    volumeNumber:["googleBooks","rakuten","ndl","openBD","titleParser"],
    listPrice:["rakuten","openBD","googleBooks","ndl"],
    releaseDate:["rakuten","openBD","ndl","googleBooks"],
    bibliographicRecord:["ndl","openBD","googleBooks","rakuten"],
    cover:["googleBooks","openBD","ndl","rakuten"]
  };
  const thresholds=Object.fromEntries(Object.keys(priority).map(k=>[k,CRITICAL.has(k)?"HIGH":"MEDIUM"]));
  function rank(x){return CONF[String(x||"UNKNOWN")]??0}
  function evidenceFor(field,value,ctx={}){
    const e={
      identifierMatched:!!ctx.identifierMatched,
      schemaValidated:ctx.schemaValidated!==false,
      semanticValidated:ctx.semanticValidated!==false,
      crossSourceAgreement:!!ctx.crossSourceAgreement,
      countryMatched:ctx.countryMatched!==false,
      taxIncludedConfirmed:!!ctx.taxIncludedConfirmed
    };
    if(field==="isbn13")e.semanticValidated=typeof valid13==="function"?valid13(String(value)): /^97[89]\d{10}$/.test(String(value));
    if(field==="volumeNumber")e.semanticValidated=Number.isInteger(Number(value))&&Number(value)>=1;
    if(field==="listPrice")e.semanticValidated=Number.isFinite(Number(value))&&Number(value)>=0;
    if(field==="taxIncluded")e.semanticValidated=value===true;
    let confidence="UNKNOWN";
    if(e.identifierMatched&&e.schemaValidated&&e.semanticValidated&&((field!=="listPrice"&&field!=="taxIncluded")||e.taxIncludedConfirmed))confidence="VERIFIED";
    else if(e.identifierMatched&&e.schemaValidated&&e.semanticValidated&&(!CRITICAL.has(field)||e.countryMatched))confidence="HIGH";
    else if(e.schemaValidated&&e.semanticValidated)confidence="MEDIUM";
    else if(e.schemaValidated)confidence="LOW";
    return {value,confidence,evidence:e};
  }
  function acceptable(field,result){
    if(!result||result.value===null||result.value===undefined||result.value==="")return false;
    return rank(result.confidence)>=rank(thresholds[field]||"MEDIUM");
  }
  function providerEnabled(name){return !!providers[name]?.enabled}
  function hasCapability(name,cap){return !!providers[name]?.enabled&&providers[name]?.capabilities?.[cap]===true}

  const adapters={
    googleBooks:{
      async isbn(isbn){
        const u="https://www.googleapis.com/books/v1/volumes?q="+encodeURIComponent("isbn:"+isbn)+"&maxResults=20&country=JP";
        const d=await getJSON(u,{searchOnline:true});
        return (d.items||[]).map(v=>normalizeGoogle(v,isbn));
      },
      async search(q,limit){
        const u="https://www.googleapis.com/books/v1/volumes?q="+encodeURIComponent(q)+"&maxResults="+Math.min(40,limit)+"&country=JP&langRestrict=ja";
        const d=await getJSON(u,{searchOnline:true});
        return (d.items||[]).map(v=>normalizeGoogle(v));
      }
    },
    openBD:{
      async isbn(isbn){
        const d=await getJSON("https://api.openbd.jp/v1/get?isbn="+encodeURIComponent(isbn),{searchOnline:true});
        const x=d?.[0];if(!x)return [];
        return [normalizeOpenBD(x,isbn)].filter(x=>x?.title);
      }
    }
  };
  function normalizeGoogle(raw,hint=""){
    const b=gbook(raw,hint),x=raw?.volumeInfo||{},vs=x.seriesInfo?.volumeSeries||[],sv=vs.find(v=>v?.seriesId)||vs[0]||null;
    const isbn=b.isbn||hint,match=canonicalIsbn(isbn)===canonicalIsbn(hint)||!hint;
    const price=raw?.saleInfo?.listPrice;
    const out={...b,source:"googleBooks",series:sv?{id:sv.seriesId||"",name:sv.seriesName||"",volumeNumber:Number.isFinite(Number(sv.orderNumber))?Number(sv.orderNumber):null,displayVolume:sv.bookDisplayNumber||"",bookType:sv.seriesBookType||""}:null,priceMeta:price?{listPrice:Number(price.amount),currency:price.currencyCode||"JPY",taxIncluded:null}:null,identifiers:{googleVolumeId:raw?.id||"",googleSeriesId:sv?.seriesId||""},fieldEvidence:{}};
    for(const [field,value] of [["isbn13",/^97[89]\d{10}$/.test(String(isbn))?isbn:null],["title",b.title],["author",b.author],["publisher",b.publisher],["releaseDate",b.date],["seriesId",out.series?.id],["seriesName",out.series?.name],["volumeNumber",out.series?.volumeNumber]])if(value!==null&&value!==undefined&&value!=="")out.fieldEvidence[field]=evidenceFor(field,value,{identifierMatched:match,countryMatched:true});
    if(out.priceMeta?.listPrice!=null)out.fieldEvidence.listPrice=evidenceFor("listPrice",out.priceMeta.listPrice,{identifierMatched:match,countryMatched:true,taxIncludedConfirmed:false});
    out.fieldEvidence.taxIncluded=evidenceFor("taxIncluded",out.priceMeta?.taxIncluded,{identifierMatched:match,countryMatched:true,taxIncludedConfirmed:out.priceMeta?.taxIncluded===true});
    out.fieldEvidence._source={provider:"googleBooks",identifierMatched:match};
    return out;
  }
  function normalizeOpenBD(raw,hint=""){
    const s=raw?.summary||{},isbn=s.isbn||hint,match=canonicalIsbn(isbn)===canonicalIsbn(hint);
    const series=extractOpenBDSeries(raw);
    const price=extractOpenBDListPrice(raw);
    const out={isbn,title:s.title||"",author:s.author||"",publisher:s.publisher||"",date:s.pubdate||"",cover:s.cover||"",price:price?.amount??0,currency:price?.currency||"JPY",upcoming:[],source:"openBD",raw,series,priceMeta:price,identifiers:{},fieldEvidence:{}};
    for(const [field,value] of [["isbn13",/^97[89]\d{10}$/.test(String(isbn))?isbn:null],["title",out.title],["author",out.author],["publisher",out.publisher],["releaseDate",out.date],["seriesName",series?.name],["volumeNumber",series?.volumeNumber]])if(value!==null&&value!==undefined&&value!=="")out.fieldEvidence[field]=evidenceFor(field,value,{identifierMatched:match,countryMatched:true});
    if(price?.listPrice!=null)out.fieldEvidence.listPrice=evidenceFor("listPrice",price.listPrice,{identifierMatched:match,countryMatched:true,taxIncludedConfirmed:price.taxIncluded===true});
    out.fieldEvidence.taxIncluded=evidenceFor("taxIncluded",price?.taxIncluded,{identifierMatched:match,countryMatched:true,taxIncludedConfirmed:price?.taxIncluded===true});
    out.fieldEvidence._source={provider:"openBD",identifierMatched:match};
    return out;
  }
  function walk(obj,fn,path=[]){
    if(!obj||typeof obj!=="object")return;
    fn(obj,path);
    if(Array.isArray(obj))obj.forEach((v,i)=>walk(v,fn,path.concat(i))); else Object.keys(obj).forEach(k=>walk(obj[k],fn,path.concat(k)));
  }
  function textOf(v){return v==null?"":String(v).trim()}
  function extractOpenBDSeries(raw){
    let best=null;
    walk(raw,(node,path)=>{
      if(!node||typeof node!=="object")return;
      const keys=Object.keys(node);
      if(!keys.some(k=>/Collection/i.test(k)))return;
      const cols=node.Collection;
      const arr=Array.isArray(cols)?cols:(cols?[cols]:[]);
      for(const c of arr){
        const name=findDeepText(c,["TitleText","TitleWithoutPrefix","CollectionTitle","Title"]);
        if(!name)continue;
        const id=findDeepText(c,["IDValue","CollectionIdentifier","ID"]);
        const vol=findDeepNumber(c,["PartNumber","CollectionPartNumber","SequenceNumber"]);
        if(!best)best={id:id||"",name,volumeNumber:vol??null,displayVolume:vol!=null?String(vol):"",bookType:""};
      }
    });
    return best;
  }
  function findDeepText(obj,names){let hit="";walk(obj,(n)=>{if(hit||!n||typeof n!=="object")return;for(const k of names)if(n[k]!=null&&typeof n[k]!=="object"){hit=textOf(n[k]);if(hit)return}});return hit}
  function findDeepNumber(obj,names){const s=findDeepText(obj,names);const n=Number(String(s).replace(/[^0-9.\-]/g,""));return Number.isFinite(n)&&n>=1?Math.floor(n):null}
  function extractOpenBDListPrice(raw){
    let best=null;
    walk(raw,(node)=>{
      if(best||!node||typeof node!=="object"||node.Price==null)return;
      const arr=Array.isArray(node.Price)?node.Price:[node.Price];
      for(const p of arr){
        const amount=Number(p?.PriceAmount ?? p?.PriceValue);
        if(!Number.isFinite(amount)||amount<0)continue;
        const currency=p?.CurrencyCode||p?.Currency||"JPY";
        const type=String(p?.PriceTypeCode||p?.PriceType||"");
        if(!type||["01","LIST","RETAIL"].includes(type.toUpperCase())){best={listPrice:amount,amount,currency,taxIncluded:detectTaxIncluded(p)}}
      }
    });
    return best;
  }
  function detectTaxIncluded(p){
    const v=p?.TaxIncluded,pct=p?.TaxRateCode;
    if(v===true||String(v).toLowerCase()==="true"||String(v)==="01")return true;
    if(v===false||String(v).toLowerCase()==="false")return false;
    if(pct!=null&&String(pct).trim()!=="")return null;
    return null;
  }
  function fieldsFor(row){return Object.keys(row?.fieldEvidence||{}).filter(k=>!k.startsWith("_"))}
  function sourcePriority(field,provider){const arr=priority[field]||[];const i=arr.indexOf(provider);return i<0?999:i}
  function listPriceAccepted(result){
    return !!result&&result.value!=null&&Number(result.value)>0&&result.evidence?.taxIncludedConfirmed===true&&rank(result.confidence)>=rank("HIGH");
  }
  function priceResult(row,ctx){
    const value=row?.priceMeta?.listPrice;
    if(value==null)return null;
    const ev=row?.fieldEvidence?.listPrice||evidenceFor("listPrice",value,{identifierMatched:canonicalIsbn(row?.isbn)===canonicalIsbn(ctx?.isbn),countryMatched:true,taxIncludedConfirmed:row?.priceMeta?.taxIncluded===true});
    return {value:Number(value),confidence:ev.confidence,evidence:ev.evidence,provider:row.source,row};
  }
  function candidate(field,row,ctx){
    let value;
    if(field==="seriesId")value=row?.series?.id||row?.identifiers?.googleSeriesId||"";
    else if(field==="seriesName")value=row?.series?.name||"";
    else if(field==="volumeNumber")value=row?.series?.volumeNumber??null;
    else if(field==="listPrice")value=row?.priceMeta?.listPrice??null;
    else if(field==="taxIncluded")value=row?.priceMeta?.taxIncluded??null;
    else value=row?.[field]??null;
    if(value===null||value===undefined||value==="")return null;
    const ev=row?.fieldEvidence?.[field]||evidenceFor(field,value,{identifierMatched:canonicalIsbn(row?.isbn)===canonicalIsbn(ctx.isbn),countryMatched:true});
    return {field,value,confidence:ev.confidence,evidence:ev.evidence,provider:row.source,priority:sourcePriority(field,row.source),row};
  }
  function normalizeComparable(field,v){return field==="seriesName"?norm(v):field==="volumeNumber"?Number(v):String(v??"").trim()}
  function mergeCandidates(field,cands,ctx){
    if(!cands.length)return null;
    const groups=new Map();
    for(const c of cands){const k=normalizeComparable(field,c.value);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(c)}
    for(const list of groups.values()){
      if(list.length>=2){
        for(const c of list){c.evidence={...c.evidence,crossSourceAgreement:true};if(rank(c.confidence)<rank("VERIFIED")&&c.evidence.identifierMatched&&c.evidence.schemaValidated&&c.evidence.semanticValidated)c.confidence=field==="listPrice"&&!c.evidence.taxIncludedConfirmed?"HIGH":"VERIFIED";}
      }
    }
    cands.sort((a,b)=>rank(b.confidence)-rank(a.confidence)||a.priority-b.priority);
    return cands[0];
  }
  async function resolveIsbn(isbn,opts={}){
    const ctx={isbn:canonicalIsbn(isbn)||isbn};
    const names=["googleBooks","openBD","rakuten","ndl"].filter(n=>providerEnabled(n)&&hasCapability(n,"isbnSearch")&&adapters[n]?.isbn);
    const rows=[];
    const attempts=[];
    for(const name of names){
      try{
        const got=await adapters[name].isbn(isbn);
        const exact=got.filter(r=>canonicalIsbn(r?.isbn)===ctx.isbn);
        const usable=exact.length?exact:got;
        if(usable.length){rows.push(...usable.map(r=>({...r,source:r.source||name})));attempts.push({provider:name,ok:true,count:usable.length})}
        else attempts.push({provider:name,ok:false,reason:"no matching record"});
      }catch(e){attempts.push({provider:name,ok:false,error:String(e?.message||e)})}
    }
    if(!rows.length)throw Error("このISBNに一致する書誌情報が見つかりませんでした。");
    const fields=["isbn13","title","author","publisher","releaseDate","seriesId","seriesName","volumeNumber","listPrice","taxIncluded","cover","description","categories"];
    const out={isbn:ctx.isbn,title:"",author:"",publisher:"",date:"",cover:"",description:"",categories:[],source:"apiManager",sources:[],series:null,priceMeta:null,price:0,currency:"JPY",identifiers:{},fieldEvidence:{},resolution:{version:VERSION,attempts,fields:{}}};
    for(const row of rows){out.sources.push({provider:row.source,fields:fieldsFor(row)});if(row.identifiers)Object.assign(out.identifiers,row.identifiers)}
    for(const field of fields){
      const cs=rows.map(r=>candidate(field,r,ctx)).filter(Boolean);
      const win=mergeCandidates(field,cs,ctx);if(!win)continue;
      out.resolution.fields[field]={provider:win.provider,confidence:win.confidence,evidence:win.evidence,agreement:!!win.evidence.crossSourceAgreement};
      out.fieldEvidence[field]={value:win.value,confidence:win.confidence,evidence:win.evidence};
      if(field==="seriesId"||field==="seriesName"||field==="volumeNumber"){
        out.series??={id:"",name:"",volumeNumber:null,displayVolume:"",bookType:"",confidence:{}};
        if(field==="seriesId")out.series.id=win.value;
        if(field==="seriesName")out.series.name=win.value;
        if(field==="volumeNumber")out.series.volumeNumber=Number(win.value);
        out.series.confidence[field]=win.confidence;
      } else if(field==="isbn13")out.isbn=win.value;
      else if(field==="title")out.title=win.value;
      else if(field==="author")out.author=win.value;
      else if(field==="publisher")out.publisher=win.value;
      else if(field==="releaseDate")out.date=win.value;
      else if(field==="cover")out.cover=win.value;
      else if(field==="description")out.description=win.value;
      else if(field==="categories")out.categories=Array.isArray(win.value)?win.value:[];
      else if(field==="listPrice"){out.priceMeta={...(out.priceMeta||{}),listPrice:Number(win.value),currency:win.row?.priceMeta?.currency||"JPY",taxIncluded:out.fieldEvidence.taxIncluded?.value??win.row?.priceMeta?.taxIncluded??null};if(listPriceAccepted(win)){out.price=Number(win.value);out.currency=out.priceMeta.currency}}
      else if(field==="taxIncluded"){out.priceMeta={...(out.priceMeta||{}),taxIncluded:win.value}}
    }
    if(out.series&&!out.series.id&&!out.series.name)out.series=null;
    out.series?.confidence&&(out.series.confidence.overall=seriesConfidence(out.series));
    out.resolution.accepted={series:!!out.series&&seriesAcceptable(out.series),listPrice:acceptable("listPrice",out.fieldEvidence.listPrice)};
    return out;
  }
  function seriesConfidence(s){const a=[s.confidence.seriesId,s.confidence.seriesName,s.confidence.volumeNumber].filter(Boolean).map(rank);if(!a.length)return"UNKNOWN";return Object.keys(s.confidence).filter(k=>k!=="overall").length&&a.every(x=>x>=rank("VERIFIED"))?"VERIFIED":a.every(x=>x>=rank("HIGH"))?"HIGH":a.some(x=>x>=rank("MEDIUM"))?"MEDIUM":"LOW"}
  function seriesAcceptable(s){return !!s&&!!s.name&&rank(s.confidence.seriesName)>=rank("HIGH")&&(s.volumeNumber==null||rank(s.confidence.volumeNumber)>=rank("HIGH"))}
  async function runField(field,ctx={}){
    const list=priority[field]||[];const attempts=[];
    for(const name of list){if(name==="titleParser")continue;const ad=adapters[name];if(!providerEnabled(name)||!hasCapability(name,ctx.capability||field)||!ad)continue;try{const rows=ctx.isbn&&ad.isbn?await ad.isbn(ctx.isbn):[];for(const row of rows){const c=candidate(field,row,ctx);if(!c){attempts.push({provider:name,confidence:"UNKNOWN",accepted:false,reason:"required field unavailable"});continue}const result={value:c.value,confidence:c.confidence,evidence:c.evidence};attempts.push({provider:name,confidence:c.confidence,accepted:acceptable(field,result)});if(acceptable(field,result))return {value:c.value,confidence:c.confidence,provider:name,evidence:c.evidence,attempts}}}catch(e){attempts.push({provider:name,ok:false,error:String(e?.message||e)})}}
    return {value:null,confidence:"UNKNOWN",provider:null,evidence:null,attempts};
  }
  function config(){return {version:VERSION,providers:JSON.parse(JSON.stringify(providers)),priority:JSON.parse(JSON.stringify(priority)),thresholds:JSON.parse(JSON.stringify(thresholds))}}
  window.bookTrackerApiManagement={VERSION,CONFIDENCE:CONF,CRITICAL_FIELDS:[...CRITICAL],providers,priority,thresholds,adapters,evidenceFor,acceptable,listPriceAccepted,runField,resolveIsbn,seriesAcceptable,mergeCandidates,config};
})();
