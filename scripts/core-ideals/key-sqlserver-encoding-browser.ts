import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {classifySqlServerKeys} from '../../src/core-ideals/key-sqlserver';
import {importSqlServerCatalog} from '../../src/adapters/sqlserver';
import {encodeCoreKeyTuple} from '../../src/model/key-tuple';
import type {Document} from '../../src/model/types';
const proof=await Bun.file('fixtures/validation/key-sqlserver-encoding-native.json').json(),nativeSource=proof.sourceText;
const request={nativeSource,mode:'report',profile:'captured-stored-values'} as const,expected=classifySqlServerKeys(importSqlServerCatalog(nativeSource,{id:'encoding-browser'}),request);
const identity={module:'m',element:'record',key:'identity'};
const examples:{id:string;source:Document;value:{binaryHex:string}|{string:string};expected:string}[]=[];
for(const c of proof.cases.filter((c:any)=>c.id.endsWith('-stored-bytes'))){
 const family=c.id.startsWith('binary-')?'binary':'string',[hex]=c.actual.value.split(':');
 const source:Document={umf:'0.6.0',id:'encoding',vocabularies:{},modules:[{id:'m',namespace:'encoding',elements:[{id:'record',kind:'record',members:[{module:'m',element:'value'}],keys:[{id:'identity',name:'Identity',fields:[{module:'m',element:'value'}]}],extensions:{}},{id:'value',kind:'field',scalarType:family,cardinality:'one',nullability:'required',extensions:{}}]}]};
 const value=family==='binary'?{binaryHex:hex}:{string:Array.from({length:hex.length/4},(_,i)=>String.fromCharCode(parseInt(hex.slice(i*4+2,i*4+4)+hex.slice(i*4,i*4+2),16))).join('')};
 examples.push({id:c.id,source,value,expected:encodeCoreKeyTuple(source,identity,[value]).bytesHex});
}
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/source')return Response.json({request,expected,examples,identity});if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>SQL Server computed key encoding</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),{request,expected,examples,identity}=await(await fetch('/source')).json(),source=u.importSqlServerCatalog(request.nativeSource,{id:'encoding-browser'}),r=u.classifySqlServerKeys(source,request);
  if(JSON.stringify(r)!==JSON.stringify(expected))throw Error('Classification parity mismatch');
  const keys=r.observations.filter((o:any)=>o.identity.indexId>0);if(keys.length!==4||keys.some((o:any)=>o.enforcement!=='unknown'||o.equality!=='unknown'||o.authorIntent!=='unknown'))throw Error('Computed native key became authored equality');
  let recoveries=0;for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(u.recoverSqlServerKeySource(saved,saved.target)!==request.nativeSource)throw Error('Native computed metadata changed');recoveries++;}
  const tuples=new Set();for(const e of examples){const encoded=u.encodeCoreKeyTuple(e.source,identity,[e.value]).bytesHex;if(encoded!==e.expected||tuples.has(encoded))throw Error('Core tuple parity or distinctness failed');tuples.add(encoded);}
  let invalidUnicodeRefused=false;try{u.encodeCoreKeyTuple(examples.find((e:any)=>'string'in e.value).source,identity,[{string:'\ud800'}]);}catch{invalidUnicodeRefused=true;}if(!invalidUnicodeRefused)throw Error('Invalid core Unicode accepted');
  const forged=structuredClone(r);forged.observations.find((o:any)=>o.identity.indexId>0).equality='exact-on-representable-values';let forgedRefused=false;try{u.verifySqlServerKeyClassification(forged,r.target);}catch{forgedRefused=true;}if(!forgedRefused)throw Error('Inferred computed equality accepted');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals present');return {observations:r.observations.length,computedKeys:keys.length,recoveries,distinctCoreExamples:tuples.size,invalidUnicodeRefused,forgedRefused};
 });
 assert.equal(checks.observations,7);assert.equal(checks.recoveries,2);assert.equal(checks.distinctCoreExamples,19);assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/key-sqlserver-encoding-browser.ts','scripts/core-ideals/key-sqlserver-encoding-discovery.ts','scripts/core-ideals/key-sqlserver-encoding-cases.ts','fixtures/sqlserver/key-encodings.sql','fixtures/validation/key-sqlserver-encoding-native.json','tests/core-ideals/key-sqlserver-encoding.test.ts','src/core-ideals/key-sqlserver.ts','src/model/key-tuple.ts','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/key-sqlserver-encoding-browser.json',JSON.stringify({scope:'Computed SQL Server binary-plus-length native capture recovery and example core tuple parity. This does not implement authored SQL projection or establish complete binding acceptance.',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
