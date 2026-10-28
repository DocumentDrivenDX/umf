import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {extname,join,normalize,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const playwrightModule=process.env.UMF_R5_PLAYWRIGHT_MODULE??'/Users/erik/Projects/umf/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(playwrightModule));
const pkg=resolve(process.env.UMF_R5_INSTALLED_PACKAGE),root=process.env.UMF_R5_WORKTREE;
const evidence=resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-record-values');
const packet=JSON.parse(await readFile(join(evidence,'frozen-typescript.json'),'utf8'));
const host=JSON.parse(await readFile(join(evidence,'host-admission.json'),'utf8'));
const metadata=JSON.parse(await readFile(join(pkg,'package.json'),'utf8'));
const browserTarget=metadata.exports['.'].browser,referenceTarget=metadata.exports['./reference'].import;
const hash=b=>createHash('sha256').update(b).digest('hex');
const contentType=p=>({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css'}[extname(p)]??'application/octet-stream');
const browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage(),errors=[],requests=[]; page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
 let instrumentedGlueSha256;
 await page.route('http://umf-r5-next.local/**',async route=>{
  try{const url=new URL(route.request().url());
   if(url.pathname==='/'){await route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><script type="importmap">${JSON.stringify({imports:{'@umf/core':'/package/'+browserTarget.replace(/^\.\//,''),'@umf/core/reference':'/package/'+referenceTarget.replace(/^\.\//,'')}})}</script>`});return}
   if(url.pathname==='/packet.json'){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({packet,host})});return}
   const rel=decodeURIComponent(url.pathname.replace(/^\/package\//,'')),file=resolve(pkg,normalize(rel));if(!file.startsWith(pkg+sep))throw Error('unsafe path');let body=await readFile(file);
   if(file===join(pkg,'dist','umf-browser.js')){let s=body.toString();const needle='function executeValidateCoreRecordValuesHostJson(resources_wire, source, identity, values, dispatcher, control_dispatcher) {';assert.equal(s.split(needle).length-1,1,'installed WASM bridge needle count');body=Buffer.from(s.replace(needle,needle+'\n  globalThis.__rvWasmCalls=(globalThis.__rvWasmCalls||0)+1;'));instrumentedGlueSha256=hash(body)}
   await route.fulfill({status:200,contentType:contentType(file),body});
  }catch(e){await route.fulfill({status:404,body:String(e)})}
 });
 await page.goto('http://umf-r5-next.local/');
 const result=await page.evaluate(async()=>{
  globalThis.__rvWasmCalls=0;
  const {packet,host}=await fetch('/packet.json').then(r=>r.json());
  const api=await import('@umf/core'),ref=await import('@umf/core/reference');
  if(api.validateCoreRecordValues===ref.validateCoreRecordValues)throw Error('default/reference same function');
  const canon=x=>Array.isArray(x)?`[${x.map(canon).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canon(x[k])}`).join(',')}}`:JSON.stringify(x);
  const cap=fn=>{try{return{ok:true,value:fn()}}catch(e){return{ok:false,error:{name:e?.name??'Error',code:e?.code??'',message:String(e?.message??e),path:e?.path??''}}}};
  const cmp=(got,want,label)=>{if(want?.ok===false&&want.error&&!Object.hasOwn(want.error,'name'))delete got.error?.name;if(canon(got)!==canon(want))throw Error(`${label} differs`)};
  const exp=c=>c.thrown?{ok:false,error:{...c.thrown}}:{ok:true,value:c.result};let semanticDispatches=0;
  for(const c of packet.cases){const n=globalThis.__rvWasmCalls;const got=cap(()=>api.validateCoreRecordValues(c.source,c.identity,c.values));if(globalThis.__rvWasmCalls!==n+1)throw Error(`default WASM dispatch missing for ${c.id}`);semanticDispatches++;cmp(got,exp(c),`default ${c.id}`)}
  const afterSemantic=globalThis.__rvWasmCalls;
  for(const c of packet.cases)cmp(cap(()=>ref.validateCoreRecordValues(c.source,c.identity,c.values)),exp(c),`reference ${c.id}`);
  if(globalThis.__rvWasmCalls!==afterSemantic)throw Error('reference semantic cases dispatched WASM');
  const {source,identity,values}=host.fixture,o=host.outcomes.rawCases;
  const ids=['sourceAccessor','identityAccessor','valuesAccessorBeforeSourceVersion','hiddenSource','symbolSource','customPrototypeSource','sparseValues','cyclicSource',...o.invalidNumbers.map(x=>x.id),'nonJsonValues','hiddenIdentity','symbolIdentity','customPrototypeIdentity','crossedInvalidSemanticSource','sourceThenIdentityThenValuesGetterCounts'];
  let rawCalls=0;const dispatchByCase={};
  for(const id of ids){let s=0,i=0,v=0;const counts=()=>({source:s,identity:i,values:v});let args;
   const src={...source},ia={get module(){i++;return'fixture'},element:'item'},va=[{field:{module:'fixture',element:'label'},state:'present',get value(){v++;return{string:'x'}}}];
   switch(id){
    case'sourceAccessor':Object.defineProperty(src,'future',{enumerable:true,get(){s++;return true}});args=[src,identity,values];break;
    case'identityAccessor':args=[source,ia,va];break;
    case'valuesAccessorBeforeSourceVersion':args=[{...source,umf:'0.7.0'},identity,va];break;
    case'hiddenSource':{const x={...source};Object.defineProperty(x,'hidden',{value:true});args=[x,identity,values];break}
    case'symbolSource':args=[{...source,[Symbol('future')]:true},identity,values];break;
    case'customPrototypeSource':args=[Object.assign(Object.create({future:true}),source),identity,values];break;
    case'sparseValues':args=[source,identity,new Array(1)];break;
    case'cyclicSource':{const x={...source};x.cycle=x;args=[x,identity,values];break}
    case'nonJsonValues':args=[source,identity,[undefined]];break;
    case'hiddenIdentity':{const x={module:'fixture'};Object.defineProperty(x,'element',{value:'item'});args=[source,x,values];break}
    case'symbolIdentity':args=[source,{...identity,[Symbol('future')]:true},values];break;
    case'customPrototypeIdentity':args=[source,Object.assign(Object.create({future:true}),identity),values];break;
    case'crossedInvalidSemanticSource':args=[{...source,umf:'0.7.0'},{module:''},[null]];break;
    case'nan':case'positiveInfinity':case'negativeInfinity':case'negativeZero':case'unsafeInteger':{const nums={nan:NaN,positiveInfinity:Infinity,negativeInfinity:-Infinity,negativeZero:-0,unsafeInteger:Number.MAX_SAFE_INTEGER+1};args=[source,identity,[{field:{module:'fixture',element:'label'},state:'present',value:{number:nums[id]}}]];break}
    case'sourceThenIdentityThenValuesGetterCounts':{const argsA=[{...source,umf:'0.7.0'},{module:''},values],argsB=[source,{module:''},[null]];let n=globalThis.__rvWasmCalls;const a=cap(()=>api.validateCoreRecordValues(...argsA));if(globalThis.__rvWasmCalls!==n+1)throw Error('source semantic trace default dispatch');cmp(a,host.outcomes.semanticOrder.invalidSourceBeforeIdentityMeaning,id+' source trace');if(canon(counts())!==canon({source:0,identity:0,values:0}))throw Error('unexpected default source trace getter');s=i=v=0;n=globalThis.__rvWasmCalls;const b=cap(()=>api.validateCoreRecordValues(...argsB));if(globalThis.__rvWasmCalls!==n+1)throw Error('value-copy semantic trace default dispatch');cmp(b,host.outcomes.semanticOrder.copiedValuesBeforeIdentityMeaning,id+' value trace');if(canon(counts())!==canon({source:0,identity:0,values:0}))throw Error('unexpected default value trace getter');s=i=v=0;n=globalThis.__rvWasmCalls;cmp(cap(()=>ref.validateCoreRecordValues(...argsA)),host.outcomes.semanticOrder.invalidSourceBeforeIdentityMeaning,id+' reference source trace');if(globalThis.__rvWasmCalls!==n)throw Error('reference source trace dispatched WASM');if(canon(counts())!==canon({source:0,identity:0,values:0}))throw Error('unexpected reference source trace getter');s=i=v=0;n=globalThis.__rvWasmCalls;cmp(cap(()=>ref.validateCoreRecordValues(...argsB)),host.outcomes.semanticOrder.copiedValuesBeforeIdentityMeaning,id+' reference value trace');if(globalThis.__rvWasmCalls!==n)throw Error('reference value trace dispatched WASM');if(canon(counts())!==canon({source:0,identity:0,values:0}))throw Error('unexpected reference value trace getter');dispatchByCase[id]={default:2,reference:0,orderProbes:2};rawCalls+=2;continue}
    default:throw Error('unhandled '+id)
   }
   const want=['nan','positiveInfinity','negativeInfinity','negativeZero','unsafeInteger'].includes(id)?o.invalidNumbers.find(x=>x.id===id).outcome:o[id];let n=globalThis.__rvWasmCalls;const got=cap(()=>api.validateCoreRecordValues(...args));if(globalThis.__rvWasmCalls!==n+1)throw Error('default WASM dispatch '+id);rawCalls++;dispatchByCase[id]={default:1,reference:0};cmp(got,want,id);if(canon(counts())!==canon({source:0,identity:0,values:0}))throw Error('default getter invoked '+id);
   n=globalThis.__rvWasmCalls;cmp(cap(()=>ref.validateCoreRecordValues(...args)),want,'reference '+id);if(globalThis.__rvWasmCalls!==n)throw Error('reference WASM dispatch '+id);if(canon(counts())!==canon({source:0,identity:0,values:0}))throw Error('reference getter invoked '+id);
  }
  if(ids.length!==19)throw Error(`case count ${ids.length}`);
  const big={...source};big['x-future-assertion']={opaque:'x'.repeat(host.outcomes.large.units)};let n=globalThis.__rvWasmCalls;const bigResult=cap(()=>api.validateCoreRecordValues(big,identity,values));if(globalThis.__rvWasmCalls!==n+1)throw Error('large control dispatch');if(!bigResult.ok||bigResult.value.source['x-future-assertion'].opaque.length!==host.outcomes.large.units)throw Error('700k retained content differs');
  const many=new Array(host.outcomes.countLimit.inputLength).fill(null);n=globalThis.__rvWasmCalls;const limit=cap(()=>api.validateCoreRecordValues(source,identity,many));if(globalThis.__rvWasmCalls!==n+1)throw Error('count limit dispatch');cmp(limit,host.outcomes.countLimit.outcome,'100001 count limit');
  n=globalThis.__rvWasmCalls;const refLimit=cap(()=>ref.validateCoreRecordValues(source,identity,many));cmp(refLimit,host.outcomes.countLimit.outcome,'reference 100001 count limit');if(globalThis.__rvWasmCalls!==n)throw Error('reference count-limit dispatch');
  if('process'in globalThis||'Buffer'in globalThis)throw Error('Node globals present');
  return{semanticCases:packet.cases.length,semanticDefaultDispatches:semanticDispatches,semanticReferenceDispatches:0,rawHostCases:ids.length,rawDefaultDispatches:rawCalls,rawReferenceDispatches:0,dispatchByCase,large700k:{preservedLength:host.outcomes.large.units},countLimit:{inputLength:many.length,error:limit.error},wasmBridgeCalls:globalThis.__rvWasmCalls,nodeGlobalsAbsent:true,userAgent:navigator.userAgent};
 });
 assert.deepEqual(errors,[]);assert(requests.some(x=>x.endsWith('/umf_core_wasm_bg.wasm')),'installed WASM asset not requested');
 console.log(JSON.stringify({status:'pass',runtime:browser.version(),packageVersion:metadata.version,sourceClosureSha256:JSON.parse(await readFile(join(pkg,'dist/rust-default-manifest.json'),'utf8')).sourceClosure.sha256,wasmRequested:true,instrumentedGlueSha256,result}));
}finally{await browser.close()}
