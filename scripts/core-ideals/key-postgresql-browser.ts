import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {postgresqlKeyProjectionCases} from './key-postgresql-projection-cases';
import {projectKeysToPostgresql} from '../../src/core-ideals/key-postgresql-projection';
import {backend} from '../../native/postgresql/runtime';
import {classifyPostgresqlKeys} from '../../src/core-ideals/key-postgresql';
import {importPostgresqlCatalogCapture} from '../../src/adapters/postgresql/catalog';
const proof=await Bun.file('fixtures/validation/key-postgresql-discovery-native.json').json();
const nativeSource=await Bun.file('fixtures/validation/key-postgresql-catalog-capture.json').text();
const query=await Bun.file('native/postgresql/keys/query.sql').text();
const supplement=JSON.stringify({profile:'umf-postgresql-key-observations-17-v1',serverVersion:170004,encoding:'UTF8',query,indexes:proof.indexes});
const request={nativeSource,supplement,mode:'report',profile:'captured-stored-values'} as const;
const expected=await classifyPostgresqlKeys(importPostgresqlCatalogCapture(nativeSource,{id:'browser-keys'}),request,backend);
const projectionCases=postgresqlKeyProjectionCases(),expectedProjections=await Promise.all(projectionCases.map(c=>projectKeysToPostgresql(c.source,c.authors,c.request,backend)));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){
 const p=new URL(req.url).pathname;
 if(p==='/source')return Response.json({request,expected,projectionCases,expectedProjections});
 if(p==='/umf.js'||p==='/postgresql/runtime.js')return new Response(Bun.file('dist'+p),{headers:{'content-type':'text/javascript'}});
 if(['/libpg-query.wasm','/postgresql/libpg-query.wasm'].includes(p))return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});
 return new Response('<!doctype html><title>PostgreSQL Key classification</title>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const library='/umf.js',runtime='/postgresql/runtime.js',u=await import(library),{backend}=await import(runtime),{request,expected,projectionCases,expectedProjections}=await(await fetch('/source')).json();
  const source=()=>u.importPostgresqlCatalogCapture(request.nativeSource,{id:'browser-keys'});
  const r=await u.classifyPostgresqlKeys(source(),request,backend);
  if(JSON.stringify(r)!==JSON.stringify(expected))throw Error('Bun/browser classification mismatch');
  let recoveries=0;for(const format of ['json','yaml']){const stored=u.readJsonValue(u.writeJsonValue(r,format),format),recovered=await u.recoverPostgresqlKeySource(stored,stored.target,backend);if(recovered.nativeSource!==request.nativeSource||recovered.supplement!==request.supplement)throw Error('Native archive changed');recoveries++;}
  const strict=await u.classifyPostgresqlKeys(source(),{...request,mode:'strict'},backend);if(strict.status!=='blocked'||strict.target!==undefined)throw Error('Strict loss emitted a target');
  const future=request.supplement.replace('"profile"','"future/~":{"n":9007199254740993,"zero":-0,"fraction":1.2300},"profile"'),unknown=await u.classifyPostgresqlKeys(source(),{...request,supplement:future},backend);
  if((await u.recoverPostgresqlKeySource(unknown,unknown.target,backend)).supplement!==future||!unknown.residuals.some((l:any)=>l.path==='/supplement/future~1~0'))throw Error('Unknown native tokens lost');
  let refusals=0;const refuse=async(fn:()=>Promise<unknown>)=>{let caught=false;try{await fn();}catch{caught=true;}if(!caught)throw Error('Unsafe operation accepted');refusals++;};
  const forged=structuredClone(r);forged.observations.find((o:any)=>o.identity.table==='partial').enforcement='immediate-unique-nonnull';await refuse(()=>u.verifyPostgresqlKeyClassification(forged,r.target,backend));
  const stale=structuredClone(r.target);stale.id='stale';await refuse(()=>u.verifyPostgresqlKeyClassification(r,stale,backend));
  const mismatch=JSON.parse(request.supplement);mismatch.indexes.find((i:any)=>i.table==='partial').predicate=null;await refuse(()=>u.classifyPostgresqlKeys(source(),{...request,supplement:JSON.stringify(mismatch)},backend));
  let reads=0;await refuse(()=>u.classifyPostgresqlKeys(source(),{...request,get mode(){reads++;return 'report';}},backend));if(reads)throw Error('Accessor executed');
  // Retained unknown JSON must not grow exponentially during receipt comparison.
  let deep:any={quoted:'"\\',array:['a','b']};for(let i=0;i<40;i++)deep={nested:deep};
  const text=JSON.stringify({version:'1.0',table_name:'Deep',columns:[{name:'id',data_type:'INTEGER'}],primary_key:['id'],future:deep});
  const tablespec=u.classifyTableSpecKeys(u.importTableSpec(text,{id:'deep',format:'json'}),{mode:'report',profile:'declared-metadata'});
  let deepRecoveries=0;for(const format of ['json','yaml']){const stored=u.readJsonValue(u.writeJsonValue(tablespec,format),format);if(u.recoverTableSpecKeySource(stored,stored.target)!==text)throw Error('Deep native recovery changed');deepRecoveries++;}
  let projected=0,projectionBlocks=0,idealRecoveries=0,nativeRecoveries=0;
  for(const [i,c] of projectionCases.entries()){
   const result=await u.projectKeysToPostgresql(c.source,c.authors,c.request,backend);if(JSON.stringify(result)!==JSON.stringify(expectedProjections[i])||result.status!==c.expected)throw Error('Projection parity mismatch');
   if(c.expectedEquality&&result.mappings[0].equality!==c.expectedEquality)throw Error('Unknown qualifier claimed exact equality');
   if(result.status==='blocked'){if(result.target||result.nativeSql)throw Error('Blocked projection emitted target');projectionBlocks++;continue;}projected++;
   const current=await u.importPostgresqlSql(result.nativeSql,backend,{id:c.request.id});
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(result,format),format),ideal=await u.recoverKeysPostgresqlIdeal(saved,current,backend);if(JSON.stringify(ideal)!==JSON.stringify(c.source))throw Error('Ideal recovery mismatch');idealRecoveries++;if(u.getPostgresqlSource(saved.target)!==result.nativeSql)throw Error('Native SQL recovery mismatch');nativeRecoveries++;}
   const fake=structuredClone(result);fake.mappings[0].keyId='forged';await refuse(()=>u.verifyKeysPostgresqlProjection(fake,current,backend));
   const stale=structuredClone(current);stale.id='stale';await refuse(()=>u.verifyKeysPostgresqlProjection(result,stale,backend));
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals present');
  return {observations:r.observations.length,recoveries,strictBlocked:true,unknownTokensPreserved:true,refusals,accessorReads:reads,deepRecoveries,projectionCases:projectionCases.length,projected,projectionBlocks,idealRecoveries,nativeRecoveries};
 });
 assert.equal(checks.observations,17);assert.equal(checks.recoveries,2);assert.equal(checks.refusals,4+checks.projected*2);assert.equal(checks.projected,17);assert.equal(checks.projectionBlocks,3);assert.equal(checks.idealRecoveries,34);assert.equal(checks.nativeRecoveries,34);assert.equal(checks.deepRecoveries,2);assert.deepEqual(externalRequests,[]);
 const paths=['src/core-ideals/key-postgresql-projection.ts','spec/core/key-postgresql-projection.schema.json','scripts/core-ideals/key-postgresql-projection-schema.ts','scripts/core-ideals/key-postgresql-projection-cases.ts','tests/core-ideals/key-postgresql-projection.test.ts','fixtures/validation/key-postgresql-projection-native.json','scripts/core-ideals/key-postgresql-browser.ts','scripts/core-ideals/key-postgresql-schema.ts','src/core-ideals/key-postgresql.ts','src/adapters/postgresql/key-correlation.ts','src/core-ideals/key-tablespec.ts','src/core-ideals/key-tablespec-projection.ts','src/validation/schema.ts','src/index.ts','tests/core/deep-json-equality.test.ts','tests/core-ideals/key-postgresql.test.ts','spec/core/postgresql-key-classification.schema.json','spec/extensions/postgresql-keys/schema.json','spec/extensions/postgresql-keys/package.json','fixtures/validation/key-postgresql-discovery-native.json','fixtures/validation/key-postgresql-catalog-capture.json','native/postgresql/keys/query.sql','dist/umf.js','dist/postgresql/runtime.js','dist/postgresql/libpg-query.wasm'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/key-postgresql-browser.json',JSON.stringify({scope:'PostgreSQL 17.4 captured Key classification with pinned WASM correlation, exact retained native archive recovery and deep JSON comparison regression. Also qualifies authored projection parity and retained ideal/native SQL recovery. Evidence covers only the declared PostgreSQL 17.4 binding subset; no all-five Key admission or native equivalence claim.',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
