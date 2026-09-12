/* API Management v1.0 — foundation layer.
 * This file contains only bundled adapters, capability metadata, validation,
 * confidence/evidence evaluation, field priorities, and failover orchestration.
 * Remote configuration may change data values only; it must never supply code.
 */
(function(){
  "use strict";
  const VERSION="1.0";
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
        const x=d?.[0],s=x?.summary;if(!s)return [];
        const match=canonicalIsbn(s.isbn||isbn)===canonicalIsbn(isbn);
        return [{isbn:s.isbn||isbn,title:s.title||"",author:s.author||"",publisher:s.publisher||"",date:s.pubdate||"",cover:s.cover||"",price:0,currency:"JPY",source:"openBD",raw:x,fieldEvidence:{title:evidenceFor("title",s.title||"",{identifierMatched:match})}}];
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
    return out;
  }

  async function runField(field,ctx={}){
    const list=priority[field]||[];
    const attempts=[];
    for(const name of list){
      if(name==="titleParser")continue;
      const ad=adapters[name];
      if(!providerEnabled(name)||!hasCapability(name,ctx.capability||field)||!ad)continue;
      try{
        const rows=ctx.isbn&&ad.isbn?await ad.isbn(ctx.isbn):[];
        for(const row of rows){
          const value=ctx.valueOf?ctx.valueOf(row):row?.[ctx.sourceField||field];
          const result=row?.fieldEvidence?.[ctx.sourceField||field]||evidenceFor(field,value,{identifierMatched:canonicalIsbn(row?.isbn)===canonicalIsbn(ctx.isbn||row?.isbn),countryMatched:true});
          attempts.push({provider:name,confidence:result.confidence,accepted:acceptable(field,result)});
          if(acceptable(field,result))return {value:result.value,confidence:result.confidence,provider:name,evidence:result.evidence,attempts};
        }
        attempts.push({provider:name,confidence:"UNKNOWN",accepted:false,reason:"required field unavailable"});
      }catch(e){attempts.push({provider:name,ok:false,error:String(e?.message||e)})}
    }
    return {value:null,confidence:"UNKNOWN",provider:null,evidence:null,attempts};
  }
  function config(){return {version:VERSION,providers:JSON.parse(JSON.stringify(providers)),priority:JSON.parse(JSON.stringify(priority)),thresholds:JSON.parse(JSON.stringify(thresholds))}}
  window.bookTrackerApiManagement={VERSION,CONFIDENCE:CONF,CRITICAL_FIELDS:[...CRITICAL],providers,priority,thresholds,adapters,evidenceFor,acceptable,runField,config};
})();
