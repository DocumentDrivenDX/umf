import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {classifySqlServerKeys} from '../../src/core-ideals/key-sqlserver';
import {importSqlServerCatalog} from '../../src/adapters/sqlserver';
const proof=await Bun.file('fixtures/validation/key-sqlserver-discovery-native.json').json(),nativeSource=proof.sourceText;
const request={nativeSource,mode:'report',profile:'captured-stored-values'} as const;
const expected=classifySqlServerKeys(importSqlServerCatalog(nativeSource,{id:'browser-keys'}),request);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=new URL(req.url).pathname;if(path==='/source')return Response.json({request,expected});if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>SQL Server Key classification</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),{request,expected}=await(await fetch('/source')).json(),source=(text=request.nativeSource)=>u.importSqlServerCatalog(text,{id:'browser-keys'}),r=u.classifySqlServerKeys(source(),request);
  if(JSON.stringify(r)!==JSON.stringify(expected))throw Error('Bun/browser parity mismatch');
  for(const table of ['binary_value','binary_text','folded_text'])if(r.observations.find((o:any)=>o.identity.table===table&&o.identity.indexId>0).equality!=='incompatible')throw Error('Native padding/folding claimed exact equality');
  let recoveries=0;for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(u.recoverSqlServerKeySource(saved,saved.target)!==request.nativeSource)throw Error('Native source changed');recoveries++;}
  const strict=u.classifySqlServerKeys(source(),{...request,mode:'strict'});if(strict.status!=='blocked'||strict.target!==undefined)throw Error('Strict loss emitted a candidate');
  const future=request.nativeSource.replace('"profile"','"future/~":{"n":9007199254740993,"fraction":1.2300,"zero":-0},"profile"'),unknown=u.classifySqlServerKeys(source(future),{...request,nativeSource:future});if(u.recoverSqlServerKeySource(unknown,unknown.target)!==future)throw Error('Unknown numeric tokens changed');
  let refusals=0;const refuse=(fn:()=>unknown)=>{let caught=false;try{fn();}catch{caught=true;}if(!caught)throw Error('Unsafe claim accepted');refusals++;};
  const forged=structuredClone(r);forged.observations.find((o:any)=>o.identity.table==='binary_value'&&o.identity.indexId>0).equality='exact-on-representable-values';refuse(()=>u.verifySqlServerKeyClassification(forged,r.target));
  const stale=structuredClone(r.target);stale.id='stale';refuse(()=>u.verifySqlServerKeyClassification(r,stale));
  for(const mutate of [(v:any)=>v.tables.find((t:any)=>t.name==='enforced').keys[0].is_disabled=true,(v:any)=>v.tables.find((t:any)=>t.name==='enforced').keys.pop(),(v:any)=>v.tables.find((t:any)=>t.name==='compound').indexes[0].columns[1].key_ordinal=3,(v:any)=>v.state='modified',(v:any)=>v.serverVersion='17.0.1']){const v=JSON.parse(request.nativeSource);mutate(v);const text=JSON.stringify(v);refuse(()=>u.classifySqlServerKeys(source(text),{...request,nativeSource:text}));}
  let reads=0;refuse(()=>u.classifySqlServerKeys(source(),{...request,get mode(){reads++;return 'report';}}));if(reads)throw Error('Getter executed');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals present');return {observations:r.observations.length,recoveries,refusals,strictBlocked:true,unknownTokensPreserved:true,accessorReads:reads};
 });
 assert.equal(checks.observations,25);assert.equal(checks.recoveries,2);assert.equal(checks.refusals,8);assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/key-sqlserver-browser.ts','scripts/core-ideals/key-sqlserver-schema.ts','src/core-ideals/key-sqlserver.ts','src/adapters/sqlserver/index.ts','src/index.ts','tests/core-ideals/key-sqlserver.test.ts','spec/core/sqlserver-key-classification.schema.json','spec/extensions/sqlserver-keys/schema.json','spec/extensions/sqlserver-keys/package.json','fixtures/validation/key-sqlserver-discovery-native.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/key-sqlserver-browser.json',JSON.stringify({scope:'Pinned SQL Server native Key classification, exact retained source recovery and refusal parity only. Authored projection, full binding acceptance and ideal admission remain unfinished.',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
