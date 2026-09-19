/* API Management v1.3 — Phase 4/5.
 * Bundled adapters normalize provider responses, then a field-wise resolver
 * validates evidence and merges compatible sources. Remote configuration may
 * change data values only; it must never supply executable code.
 */
(function(){
  "use strict";
  const VERSION="1.4";
  const CONF={UNKNOWN:0,LOW:1,MEDIUM:2,HIGH:3,VERIFIED:4};
  const CRITICAL=new Set(["isbn13","seriesId","seriesName","volumeNumber","listPrice","taxIncluded"]);
  const providers={
    googleBooks:{enabled:true,capabilities:{isbnSearch:true,titleSearch:true,bibliographicRecord:true,seriesId:true,seriesName:true,volumeNumber:true,listPrice:true,taxIncluded:false,releaseDate:true,cover:true,author:true,publisher:true,pages:true}},
    openBD:{enabled:true,capabilities:{isbnSearch:true,titleSearch:false,bibliographicRecord:true,seriesId:false,seriesName:true,volumeNumber:true,listPrice:true,taxIncluded:false,releaseDate:true,cover:true,author:true,publisher:true,pages:true}},
    rakuten:{enabled:false,capabilities:{isbnSearch:true,titleSearch:true,bibliographicRecord:true,seriesId:false,seriesName:true,volumeNumber:true,listPrice:false,taxIncluded:true,releaseDate:true,cover:true,author:true,publisher:true,pages:true}},
    // NDL OpenSearch adapter is installed/testable, but disabled for direct browser use until its transport is verified.
    ndl:{enabled:false,capabilities:{isbnSearch:true,titleSearch:true,bibliographicRecord:true,seriesId:false,seriesName:true,volumeNumber:true,listPrice:true,taxIncluded:true,releaseDate:true,cover:false,author:true,publisher:true,pages:true}}
  };
  const priority={
    search:["googleBooks","ndl","rakuten"],
    // ISBN照会は titleSearch の優先順位と分離する。openBD は ISBN照会を提供するため、Google Books障害時の次候補に含める。
    isbnSearch:["googleBooks","openBD","rakuten","ndl"],
    seriesId:["googleBooks"],
    seriesName:["googleBooks","rakuten","openBD","ndl"],
    volumeNumber:["googleBooks","rakuten","ndl","openBD","titleParser"],
    listPrice:["openBD","googleBooks","ndl"],
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
    else if(e.identifierMatched&&e.schemaValidated&&e.semanticValidated&&(!CRITICAL.has(field)||e.countryMatched) && (field!=="listPrice" || e.taxIncludedConfirmed))confidence="HIGH";
    else if(e.schemaValidated&&e.semanticValidated)confidence="MEDIUM";
    else if(e.schemaValidated)confidence="LOW";
    return {value,confidence,evidence:e};
  }
  function acceptable(field,result){
    if(!result||result.value===null||result.value===undefined||result.value==="")return false;
    return rank(result.confidence)>=rank(thresholds[field]||"MEDIUM");
  }
  function providerEnabled(name){return !!providers[name]?.enabled}
  function hasCapability(name,cap){return providers[name]?.capabilities?.[cap]===true}

  const resolverCache=new Map();
  // Phase 7: session cache is bounded and configuration-aware. A cached answer must
  // never survive indefinitely or cross a Provider-priority/enabled-state change.
  const cachePolicy={ttlMs:10*60*1000,maxEntries:200};
  function providerConfigSignature(){
    return JSON.stringify({providers,priority});
  }
  function cacheGet(key){
    const entry=resolverCache.get(key);
    if(!entry)return null;
    if(entry.signature!==providerConfigSignature()||entry.expiresAt<=Date.now()){
      resolverCache.delete(key);return null;
    }
    return cloneCached(entry.value);
  }
  function cacheSet(key,value){
    if(resolverCache.size>=cachePolicy.maxEntries){const first=resolverCache.keys().next().value;if(first)resolverCache.delete(first);}
    resolverCache.set(key,{value:cloneCached(value),createdAt:Date.now(),expiresAt:Date.now()+cachePolicy.ttlMs,signature:providerConfigSignature()});
  }
  function clearResolverCache(){resolverCache.clear();}
  function cacheInfo(){return {size:resolverCache.size,ttlMs:cachePolicy.ttlMs,maxEntries:cachePolicy.maxEntries};}
  // Phase 6: provider health is runtime state, not remote executable configuration.
  // A provider is temporarily skipped after repeated request failures, then retried after cooldown.
  const runtimePolicy={
    failureThreshold:2,
    cooldownMs:30000,
    requestTimeoutMs:12000,
    // Providerごとの応答特性を踏まえた個別上限。未指定Providerは共通上限を使用する。
    // Google Booksが応答しない環境で12秒待ち続けるケースを4秒で切り上げ、
    // 次順位Provider（openBD等）へ速やかにフェイルオーバーする。
    providerTimeoutMs:{googleBooks:4000,ndl:4000}
  };
  const providerHealth=new Map(Object.keys(providers).map(name=>[name,{failures:0,temporarilyDisabledUntil:0,lastFailureAt:0,lastSuccessAt:0,lastError:""}]));
  function health(name){if(!providerHealth.has(name))providerHealth.set(name,{failures:0,temporarilyDisabledUntil:0,lastFailureAt:0,lastSuccessAt:0,lastError:""});return providerHealth.get(name)}
  function providerTemporarilyDisabled(name,now=Date.now()){return (health(name).temporarilyDisabledUntil||0)>now}
  function recordProviderSuccess(name){const h=health(name);h.failures=0;h.temporarilyDisabledUntil=0;h.lastSuccessAt=Date.now();h.lastError=""}
  function recordProviderFailure(name,error){const h=health(name);h.failures+=1;h.lastFailureAt=Date.now();h.lastError=String(error?.message||error||"Provider error");if(h.failures>=runtimePolicy.failureThreshold)h.temporarilyDisabledUntil=Date.now()+runtimePolicy.cooldownMs}
  function timeoutForProvider(name){
    const globalMs=Number(runtimePolicy.requestTimeoutMs);
    const specific=Number(runtimePolicy.providerTimeoutMs?.[name]);
    const base=Number.isFinite(globalMs)&&globalMs>0?globalMs:12000;
    return Number.isFinite(specific)&&specific>0?Math.min(base,specific):base;
  }
  async function withTimeout(task,ms){
    const controller=new AbortController(); let timer;
    try{
      return await Promise.race([
        Promise.resolve().then(()=>task(controller.signal)),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("Provider timeout"))},ms)})
      ]);
    }finally{clearTimeout(timer)}
  }
  function cloneCached(v){try{return JSON.parse(JSON.stringify(v))}catch(_){return v}}
  function metricApiStart(provider,explicit){try{if(explicit?.beginApi)explicit.beginApi(provider);else if(globalThis.bookTrackerRegistrationMetrics?.active?.())globalThis.bookTrackerRegistrationMetrics.beginApi(provider);else globalThis.bookTrackerSearchMetrics?.beginApi(provider)}catch(_){}}
  function metricApiEnd(provider,ok,explicit){try{if(explicit?.endApi)explicit.endApi(provider,ok);else if(globalThis.bookTrackerRegistrationMetrics?.active?.())globalThis.bookTrackerRegistrationMetrics.endApi(provider,ok);else globalThis.bookTrackerSearchMetrics?.endApi(provider,ok)}catch(_){}}
  function metricApiPhase(provider,phase,ms,explicit){try{const t=explicit||globalThis.bookTrackerSearchMetrics?.active?.();if(t?.addApiPhase)t.addApiPhase(provider,phase,ms)}catch(_){} }
  const adapters={
    googleBooks:{
      async isbn(isbn,opts={}){
        const u="https://www.googleapis.com/books/v1/volumes?q="+encodeURIComponent("isbn:"+isbn)+"&maxResults=20&country=JP";
        const d=await getJSON(u,{searchOnline:true,signal:opts.signal,metrics:opts.metrics});
        return (d.items||[]).map(v=>normalizeGoogle(v,isbn));
      },
      async search(q,limit,opts={}){
        const u="https://www.googleapis.com/books/v1/volumes?q="+encodeURIComponent(q)+"&maxResults="+Math.min(40,limit)+"&country=JP&langRestrict=ja";
        const d=await getJSON(u,{searchOnline:true,signal:opts.signal,metrics:opts.metrics});
        return (d.items||[]).map(v=>normalizeGoogle(v));
      }
    },
    openBD:{
      async isbn(isbn,opts={}){
        const d=await getJSON("https://api.openbd.jp/v1/get?isbn="+encodeURIComponent(isbn),{searchOnline:true,signal:opts.signal,metrics:opts.metrics});
        const x=d?.[0];if(!x)return [];
        return [normalizeOpenBD(x,isbn)].filter(x=>x?.title);
      }
    },
    rakuten:{
      async isbn(isbn,opts={}){
        const cfg=getRakutenConfig();
        if(!cfg) return [];
        const u=rakutenUrl({isbn,applicationId:cfg.applicationId,accessKey:cfg.accessKey,hits:10});
        const d=await getJSON(u,{searchOnline:true,headers:{},signal:opts.signal,metrics:opts.metrics});
        return (d.items||[]).map(x=>normalizeRakuten(x)).filter(x=>x?.title);
      },
      async search(q,limit=20,opts={}){
        const cfg=getRakutenConfig();
        if(!cfg) return [];
        const p={applicationId:cfg.applicationId,accessKey:cfg.accessKey,hits:Math.min(30,limit)};
        const qq=String(q||'').trim();
        if(/^inauthor:/i.test(qq))p.author=qq.replace(/^inauthor:/i,'').trim();
        else if(/^intitle:/i.test(qq))p.title=qq.replace(/^intitle:/i,'').trim();
        else p.title=qq;
        const d=await getJSON(rakutenUrl(p),{searchOnline:true,signal:opts.signal});
        return (d.items||[]).map(x=>normalizeRakuten(x)).filter(x=>x?.title);
      }
    },
    ndl:{
      async isbn(isbn,opts={}){
        return searchNDL({isbn,limit:10,signal:opts.signal,metrics:opts.metrics});
      },
      async search(q,limit=20,opts={}){
        const qq=String(q||'').trim();
        if(/^inauthor:/i.test(qq))return searchNDLOpenSearch({creator:qq.replace(/^inauthor:/i,'').trim(),limit,signal:opts.signal,metrics:opts.metrics});
        if(/^intitle:/i.test(qq))return searchNDLOpenSearch({title:qq.replace(/^intitle:/i,'').trim(),limit,signal:opts.signal,metrics:opts.metrics});
        return searchNDLOpenSearch({any:qq,limit,signal:opts.signal,metrics:opts.metrics});
      }
    }
  };
  function getRakutenConfig(){
    const c=globalThis.bookTrackerProviderConfig?.rakuten;
    if(!c?.applicationId||!c?.accessKey)return null;
    return {applicationId:String(c.applicationId),accessKey:String(c.accessKey)};
  }
  function rakutenUrl(p){
    const q=new URLSearchParams({applicationId:p.applicationId,accessKey:p.accessKey,format:"json",formatVersion:"2",hits:String(p.hits||20)});
    if(p.isbn)q.set("isbn",String(p.isbn));
    if(p.title)q.set("title",String(p.title));
    if(p.author)q.set("author",String(p.author));
    return "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404?"+q.toString();
  }
  async function getText(url,opts={}){
    const metrics=opts.metrics;
    let err;
    for(let n=0;n<3;n++){
      try{
        const fetchStarted=performance.now();
        let r;
        try{r=await fetch(url,{cache:"no-store",signal:opts.signal});}
        finally{metricApiPhase(metrics?.activeProvider||"ndl", "fetch", performance.now()-fetchStarted, metrics);}
        if(r.ok){const parseStarted=performance.now();try{return await r.text()}finally{metricApiPhase(metrics?.activeProvider||"ndl","body",performance.now()-parseStarted,metrics)}}
        if(r.status===429||r.status===503){err=Error("HTTP "+r.status);if(opts.signal?.aborted)throw err;await sleep(700*Math.pow(2,n));continue;}
        throw Error("HTTP "+r.status);
      }catch(e){err=e;if(opts.signal?.aborted)throw e;if(n<2)await sleep(700*Math.pow(2,n));}
    }
    throw err||Error("通信エラー");
  }
  async function searchNDL({isbn,title,creator,anywhere,limit=20,signal,metrics}){
    const q=[];
    if(isbn)q.push('isbn="'+String(isbn).replace(/[-\s]/g,'')+'"');
    if(title)q.push('title="'+String(title).replace(/"/g,'')+'"');
    if(creator)q.push('creator="'+String(creator).replace(/"/g,'')+'"');
    if(anywhere)q.push('anywhere="'+String(anywhere).replace(/"/g,'')+'"');
    const url="https://ndlsearch.ndl.go.jp/api/sru?operation=searchRetrieve&version=1.2&maximumRecords="+Math.min(20,Math.max(1,limit))+"&query="+encodeURIComponent(q.join(" AND "));
    const xml=await getText(url,{signal,metrics});
    return normalizeNDLSru(xml,isbn||"");
  }
  function xmlText(node){return String(node?.textContent||"").trim();}
  function firstLocal(root,name){return [...(root?.getElementsByTagNameNS?.("*",name)||[])].find(Boolean)||null;}
  function firstLocalText(root,name){return xmlText(firstLocal(root,name));}
  function allLocal(root,name){return [...(root?.getElementsByTagNameNS?.("*",name)||[])].map(xmlText).filter(Boolean);}
  function normalizeRakuten(raw){
    const x=raw?.item||raw||{},isbn=canonicalIsbn(x.isbn||"");
    const parsed=parseVolumeTitle(x.title||"");
    const seriesName=textOf(x.seriesName);
    const out={isbn: x.isbn||"",title:textOf(x.title),subtitle:textOf(x.subTitle),author:textOf(x.author),publisher:textOf(x.publisherName),date:textOf(x.salesDate),cover:textOf(x.largeImageUrl||x.mediumImageUrl||x.smallImageUrl),description:textOf(x.itemCaption),categories:x.booksGenreId?[String(x.booksGenreId)]:[],source:"rakuten",series:seriesName?{id:"",name:seriesName,volumeNumber:null,displayVolume:"",bookType:""}:null,priceMeta:{listPrice:null,salePrice:Number.isFinite(Number(x.itemPrice))?Number(x.itemPrice):null,currency:"JPY",taxIncluded:Number.isFinite(Number(x.itemPrice))?true:null},identifiers:{rakutenItemId:textOf(x.itemCode||x.itemUrl)},fieldEvidence:{}};
    if(out.series&&parsed.volume!=null){out.series.volumeNumber=parsed.volume;out.series.displayVolume=String(parsed.volume);}
    const match=canonicalIsbn(out.isbn)===isbn;
    for(const [field,value] of [["isbn13",/^97[89]\d{10}$/.test(out.isbn)?out.isbn:null],["title",out.title],["author",out.author],["publisher",out.publisher],["releaseDate",out.date],["seriesName",seriesName]])if(value)out.fieldEvidence[field]=evidenceFor(field,value,{identifierMatched:match,countryMatched:true});
    out.fieldEvidence._source={provider:"rakuten",identifierMatched:match};
    return out;
  }
  function normalizeNDLSru(xml,hint=""){
    const doc=new DOMParser().parseFromString(xml,"application/xml");
    if(doc.querySelector("parsererror"))throw Error("NDL Search XMLを解析できませんでした。");
    const records=[...doc.getElementsByTagNameNS("*","record")];
    return records.map(rec=>normalizeNDLRecord(rec,hint)).filter(x=>x?.title);
  }
  function normalizeNDLOpenSearch(xml){
    const doc=new DOMParser().parseFromString(xml,"application/xml");
    if(doc.querySelector("parsererror"))throw Error("NDL OpenSearch XMLを解析できませんでした。");
    const items=[...doc.getElementsByTagNameNS("*","item")];
    return items.map(item=>{
      const text=(name)=>firstLocalText(item,name);
      const all=(name)=>allLocal(item,name);
      const title=text("dc:title")||text("title");
      const creators=all("dc:creator");
      const publisher=text("dc:publisher");
      const issued=text("dcterms:issued");
      const ids=[...item.getElementsByTagNameNS("*","identifier")].map(x=>({value:String(x.textContent||"").trim(),type:String(x.getAttribute("xsi:type")||x.getAttribute("type")||"")}));
      const isbnId=ids.find(x=>/isbn/i.test(x.type))?.value||ids.map(x=>x.value).find(v=>/^97[89][0-9-]{10,17}$/.test(v))||"";
      const isbn=canonicalIsbn(isbnId);
      const link=text("link");
      const description=text("description");
      const seriesMatch=description.match(/シリーズ名[：:]\s*([^<\n]+)/);
      const out={isbn:isbnId,title,subtitle:"",author:creators.join(", "),publisher,date:issued,cover:"",description, categories:[],source:"ndl",series:seriesMatch?{id:"",name:seriesMatch[1].trim(),volumeNumber:null,displayVolume:"",bookType:""}:null,priceMeta:null,identifiers:{ndlRecordId:link||""},fieldEvidence:{}};
      if(isbn)out.isbn=isbn;
      const match=!!isbn;
      for(const [field,value] of [["isbn13",/^97[89]\d{10}$/.test(String(out.isbn))?out.isbn:null],["title",out.title],["author",out.author],["publisher",out.publisher],["releaseDate",out.date],["seriesName",out.series?.name]])if(value)out.fieldEvidence[field]=evidenceFor(field,value,{identifierMatched:match,countryMatched:true});
      out.fieldEvidence._source={provider:"ndl",identifierMatched:match};
      return out;
    }).filter(x=>x.title);
  }
  async function searchNDLOpenSearch({title,creator,any,limit=20,signal,metrics}){
    const p=new URLSearchParams({cnt:String(Math.min(20,Math.max(1,limit)))});
    if(title)p.set("title",String(title));
    if(creator)p.set("creator",String(creator));
    if(any)p.set("any",String(any));
    const xml=await getText("https://ndlsearch.ndl.go.jp/api/opensearch?"+p.toString(),{signal});
    return normalizeNDLOpenSearch(xml);
  }
  function normalizeNDLRecord(rec,hint=""){
    const title=firstLocalText(rec,"title"),creator=allLocal(rec,"creator")[0]||"",publisher=allLocal(rec,"publisher")[0]||"",issued=firstLocalText(rec,"issued")||firstLocalText(rec,"date")||"";
    const seriesName=firstLocalText(rec,"seriesTitle");
    const volumeRaw=firstLocalText(rec,"volume");
    const ids=[...rec.getElementsByTagName("*")].map(e=>e.getAttribute("rdf:resource")||e.getAttribute("resource")||"").filter(Boolean);
    const isbnFromId=ids.map(x=>(x.match(/isbn\/(97[89]\d{10}|\d{9}[\dXx])/i)||[])[1]).find(Boolean)||firstLocalText(rec,"isbn")||hint;
    const isbn=canonicalIsbn(isbnFromId);
    const parsed=parseVolumeTitle(title);
    const volume=Number(String(volumeRaw).match(/\d+/)?.[0]||parsed.volume||"")||null;
    const priceRaw=firstLocalText(rec,"price");
    const price=Number(String(priceRaw).replace(/[^0-9.]/g,""));
    const out={isbn:isbnFromId||hint,title,subtitle:"",author:creator,publisher,date:issued,cover:"",description:firstLocalText(rec,"description")||firstLocalText(rec,"abstract"),categories:[],source:"ndl",series:seriesName?{id:"",name:seriesName,volumeNumber:volume,displayVolume:volume!=null?String(volume):"",bookType:""}:null,priceMeta:Number.isFinite(price)&&price>=0?{listPrice:price,currency:"JPY",taxIncluded:null}:null,identifiers:{ndlRecordId:rec.getAttribute("identifier")||""},fieldEvidence:{}};
    const match=canonicalIsbn(out.isbn)===canonicalIsbn(hint)||!hint;
    for(const [field,value] of [["isbn13",/^97[89]\d{10}$/.test(String(out.isbn))?out.isbn:null],["title",out.title],["author",out.author],["publisher",out.publisher],["releaseDate",out.date],["seriesName",seriesName],["volumeNumber",volume]])if(value!==null&&value!==undefined&&value!=="")out.fieldEvidence[field]=evidenceFor(field,value,{identifierMatched:match,countryMatched:true});
    if(out.priceMeta?.listPrice!=null)out.fieldEvidence.listPrice=evidenceFor("listPrice",out.priceMeta.listPrice,{identifierMatched:match,countryMatched:true,taxIncludedConfirmed:false});
    out.fieldEvidence.taxIncluded=evidenceFor("taxIncluded",out.priceMeta?.taxIncluded,{identifierMatched:match,countryMatched:true,taxIncludedConfirmed:false});
    out.fieldEvidence._source={provider:"ndl",identifierMatched:match};
    return out;
  }
  function normalizeNDLFixture(xml,hint=""){return normalizeNDLSru(xml,hint)}
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
  async function search(q,limit=20){
    const metrics=globalThis.bookTrackerSearchMetrics?.current?.();
    const candidateNames=(priority.search||[]).filter(n=>hasCapability(n,"titleSearch")&&adapters[n]?.search);
    const attempts=[],rows=[];
    for(const name of candidateNames){
      if(!providerEnabled(name)){attempts.push({provider:name,ok:false,skipped:true,reason:"provider disabled",detail:name==="ndl"?"NDL direct-browser adapter is disabled until a browser-safe transport is available":"provider disabled"});continue;}
      if(providerTemporarilyDisabled(name)){attempts.push({provider:name,ok:false,skipped:true,reason:"temporary provider cooldown"});continue;}
      try{
        metricApiStart(name); if(metrics)metrics.activeProvider=name; let got; try{got=await withTimeout(signal=>adapters[name].search(q,limit,{signal,metrics}),timeoutForProvider(name));metricApiEnd(name,true)}catch(e){metricApiEnd(name,false);throw e}finally{if(metrics)metrics.activeProvider=null}
        if(Array.isArray(got)&&got.length){rows.push(...got.map(r=>({...r,source:r.source||name})));attempts.push({provider:name,ok:true,count:got.length});recordProviderSuccess(name);}
        else{attempts.push({provider:name,ok:false,reason:"no results"});recordProviderSuccess(name);}
      }catch(e){recordProviderFailure(name,e);attempts.push({provider:name,ok:false,error:String(e?.message||e),temporaryCooldown:providerTemporarilyDisabled(name)});}
      if(rows.length)break;
    }
    if(!rows.length){
      const skippedCooldown=attempts.filter(x=>x.skipped&&x.reason==="temporary provider cooldown");
      const skippedDisabled=attempts.filter(x=>x.skipped&&x.reason==="provider disabled");
      const failed=attempts.filter(x=>!x.skipped&&x.ok===false);
      const e=Error(skippedCooldown.length&&failed.length===0&&skippedDisabled.length===0
        ?"書籍検索に利用できるAPIが一時停止中です。しばらく待ってから再検索してください。"
        :failed.length===0&&skippedDisabled.length===attempts.length
          ?"書籍検索に利用できるAPIがありません。設定または通信経路を確認してください。"
          :"書籍検索に利用できるAPIから結果を取得できませんでした。");
      e.attempts=attempts;
      throw e;
    }
    const seen=new Set(),out=[];
    for(const r of rows){const k=canonicalIsbn(r?.isbn)||norm((r?.title||"")+"|"+(r?.author||""));if(seen.has(k))continue;seen.add(k);out.push(r);}
    return {results:out.slice(0,Math.max(1,limit)),attempts};
  }
  async function resolveIsbn(isbn,opts={}){
    const ctx={isbn:canonicalIsbn(isbn)||isbn};
    const cacheKey=ctx.isbn+"|"+(opts.fast?"fast":"full");
    const cached=cacheGet(cacheKey);
    if(cached)return cached;
    let names=(priority.isbnSearch||priority.search||[]).filter(n=>providerEnabled(n)&&hasCapability(n,"isbnSearch")&&adapters[n]?.isbn);
    const rows=[];
    const attempts=[];
    for(const name of names){
      if(providerTemporarilyDisabled(name)) { attempts.push({provider:name,ok:false,skipped:true,reason:"temporary provider cooldown"}); continue; }
      let timeoutMs=timeoutForProvider(name);
      try{
        metricApiStart(name,opts.metrics); let got; try{got=await withTimeout(signal=>adapters[name].isbn(isbn,{signal}),timeoutMs);metricApiEnd(name,true,opts.metrics)}catch(e){metricApiEnd(name,false,opts.metrics);throw e}
        const exact=got.filter(r=>canonicalIsbn(r?.isbn)===ctx.isbn);
        const usable=exact.length?exact:got;
        if(usable.length){
          rows.push(...usable.map(r=>({...r,source:r.source||name})));attempts.push({provider:name,ok:true,count:usable.length,timeoutMs});recordProviderSuccess(name);
          if(opts.fast){
            const hasSeries=usable.some(r=>r?.series?.name&&((r?.series?.volumeNumber!=null)||r?.series?.id));
            if(hasSeries)break;
          }
        }
        else { attempts.push({provider:name,ok:false,reason:"no matching record",timeoutMs}); recordProviderSuccess(name); }
      }catch(e){recordProviderFailure(name,e);attempts.push({provider:name,ok:false,error:String(e?.message||e),timeoutMs,temporaryCooldown:providerTemporarilyDisabled(name)})}
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
    cacheSet(cacheKey,out);
    return cloneCached(out);
  }
  function seriesConfidence(s){const a=[s.confidence.seriesId,s.confidence.seriesName,s.confidence.volumeNumber].filter(Boolean).map(rank);if(!a.length)return"UNKNOWN";return Object.keys(s.confidence).filter(k=>k!=="overall").length&&a.every(x=>x>=rank("VERIFIED"))?"VERIFIED":a.every(x=>x>=rank("HIGH"))?"HIGH":a.some(x=>x>=rank("MEDIUM"))?"MEDIUM":"LOW"}
  function seriesAcceptable(s){return !!s&&!!s.name&&rank(s.confidence.seriesName)>=rank("HIGH")&&(s.volumeNumber==null||rank(s.confidence.volumeNumber)>=rank("HIGH"))}
  async function runField(field,ctx={}){
    const list=priority[field]||[];const attempts=[];
    for(const name of list){if(name==="titleParser")continue;const ad=adapters[name];if(!providerEnabled(name)||!hasCapability(name,ctx.capability||field)||!ad)continue;if(providerTemporarilyDisabled(name)){attempts.push({provider:name,skipped:true,reason:"temporary provider cooldown"});continue;}try{const timeoutMs=timeoutForProvider(name); metricApiStart(name); let rows=[]; try{rows=ctx.isbn&&ad.isbn?await withTimeout(signal=>ad.isbn(ctx.isbn,{signal}),timeoutMs):[];metricApiEnd(name,true)}catch(e){metricApiEnd(name,false);throw e}finally{if(metrics)metrics.activeProvider=null}for(const row of rows){const c=candidate(field,row,ctx);if(!c){attempts.push({provider:name,confidence:"UNKNOWN",accepted:false,reason:"required field unavailable"});continue}const result={value:c.value,confidence:c.confidence,evidence:c.evidence};attempts.push({provider:name,confidence:c.confidence,accepted:acceptable(field,result)});if(acceptable(field,result)){recordProviderSuccess(name);return {value:c.value,confidence:c.confidence,provider:name,evidence:c.evidence,attempts}}}}catch(e){recordProviderFailure(name,e);attempts.push({provider:name,ok:false,error:String(e?.message||e),timeoutMs,temporaryCooldown:providerTemporarilyDisabled(name)})}}
    return {value:null,confidence:"UNKNOWN",provider:null,evidence:null,attempts};
  }
  function config(){return {version:VERSION,runtimePolicy:JSON.parse(JSON.stringify(runtimePolicy)),providerHealth:JSON.parse(JSON.stringify(Object.fromEntries(providerHealth))),providers:JSON.parse(JSON.stringify(providers)),priority:JSON.parse(JSON.stringify(priority)),thresholds:JSON.parse(JSON.stringify(thresholds))}}
  window.bookTrackerApiManagement={VERSION,CONFIDENCE:CONF,CRITICAL_FIELDS:[...CRITICAL],providers,priority,thresholds,adapters,evidenceFor,acceptable,listPriceAccepted,runField,resolveIsbn,seriesAcceptable,mergeCandidates,config,normalizeRakuten,normalizeNDLFixture,normalizeNDLOpenSearch,providerHealth,runtimePolicy,providerTemporarilyDisabled,search,clearResolverCache,cacheInfo,cachePolicy};
})();
