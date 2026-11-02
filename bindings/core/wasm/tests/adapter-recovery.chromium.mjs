// SPDX-License-Identifier: MIT OR Apache-2.0
// Exercise the distributed browser entry point. Build it separately, then pass
// its directory here; this harness neither compiles nor substitutes bindings.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const repository=fileURLToPath(new URL('../../../../',import.meta.url));

assert(process.argv[2], 'Pass the built SDK directory');
const sdk=resolve(process.argv[2]);
const entry=`
import * as umf from '/sdk/umf-browser.js';
const results=[];
function check(ok,message){if(!ok)throw Error(message);}
async function run(name,fn){try{await fn();results.push({name,status:'pass'});}catch(e){results.push({name,status:'fail',message:String(e),stack:e.stack});}}
async function fixture(path){return (await fetch('/fixture/'+path)).json();}
await run('parquet capture edit export and source refusal',async()=>{
 const bytes=new Uint8Array(await (await fetch('/fixture/parquet/logical/string.parquet')).arrayBuffer());
 const doc=umf.captureParquet(bytes,{id:'browser-parquet'});
 check(umf.inspectParquetMetadata(doc).status==='mapped','metadata');
 const edit=umf.appendParquetKeyValueMetadata(doc,[{key:'umf.browser',value:'retained'}]);
 check(edit.status==='transformed'&&edit.output,'edit');
 const output=umf.exportParquetCapture(edit.output);
 check(output.slice(0,edit.unchangedPrefixBytes).every((v,i)=>v===bytes[i]),'source prefix');
 let refused=false;try{umf.captureParquet(new Uint8Array(1000001),{id:'too-large'});}catch(e){refused=e instanceof umf.UmfError&&e.code==='PARQUET_LIMIT';}
 check(refused,'public source refusal');
});
await run('JSONL sidecar recovery and missing-supply refusal',async()=>{
 const sample=(await fixture('delta/sidecars/results.json')).results[0];
 const good=umf.reconcileDeltaCheckpointSidecars(sample.checkpoint,sample.sources,sample.sidecars);
 check(good.status==='reconciled'&&good.state.version===sample.checkpoint.version,'recovery');
 const bad=umf.reconcileDeltaCheckpointSidecars(sample.checkpoint,sample.sources,[]);
 check(bad.status==='blocked'&&bad.state===undefined,'atomic refusal');
});
await run('Parquet checkpoint recovery and missing-supply refusal',async()=>{
 const packet=await fixture('delta/parquet-checkpoint/results.json');
 const sample=packet.results.find(x=>x.id==='v1').result;
 const good=umf.reconcileDeltaParquetCheckpoint(sample.checkpoint,sample.sources,'v1');
 check(good.status==='reconciled'&&good.recovery.state.version===sample.checkpoint.version,'recovery');
 const v2=packet.results.find(x=>x.id==='v2-sidecars').result;
 const bad=umf.reconcileDeltaParquetCheckpoint(v2.checkpoint,v2.sources,'v2',[]);
 check(bad.status==='blocked'&&bad.recovery?.state===undefined,'atomic refusal');
});
await run('multipart recovery and duplicate-part refusal',async()=>{
 const sample=(await fixture('delta/multipart/results.json')).results[0];
 const good=umf.reconcileDeltaMultipartCheckpoint(sample.version,sample.partCount,sample.parts,sample.sources);
 check(good.status==='reconciled'&&good.recovery.state.version===sample.version,'recovery');
 const bad=umf.reconcileDeltaMultipartCheckpoint(sample.version,2,[sample.parts[0],sample.parts[0]],[]);
 check(bad.status==='blocked'&&bad.recovery===undefined,'atomic refusal');
});
await run('Smithy supplied browser runtime assembly selection and prevalidation',async()=>{
 const runtime=await import('/smithy-runtime.js');
 const backend=umf.createSmithyJavaScriptSelectionBackend(runtime);
 const doc=umf.importSmithySources({files:{'model.smithy':'$version: "2.0"\\nnamespace demo\\nstring Thing'}},{id:'smithy-browser'});
 const assembly=await umf.assembleSmithyDocument(doc,backend,{id:'assembled'});
 check(assembly.status==='assembled','assembly');
 const selected=await umf.selectSmithyShapes(doc,backend,'string',{id:'selected'});
 check(selected.status==='selected'&&selected.shapeIds.includes('demo#Thing'),'selection');
 const bad=structuredClone(doc);bad.modules.find(m=>m.id==='schema').elements.find(e=>e.id==='schema').extensions['umf.smithy'].files={'../escape.smithy':'namespace demo'};
 let calls=0,refused=false;const spy={identity:backend.identity,assemble(){calls++;throw Error('unexpected');},select(){calls++;throw Error('unexpected');}};
 try{await umf.assembleSmithyDocument(bad,spy,{id:'bad'});}catch(e){refused=e.code==='SMITHY_DOCUMENT';}
 check(refused&&calls===0,'prevalidation');
});
await run('PostgreSQL supplied browser parser edit export and callback retry',async()=>{
 const native=await import('/postgresql/runtime.js');
 let failOnce=true;
 const backend={...native.backend,async parse(sql){if(failOnce){failOnce=false;throw Error('supplied backend one-shot');}return native.parse(sql);}};
 let refused=false;try{await umf.importPostgresqlSql('SELECT 1 AS value',backend,{id:'failure'});}catch(e){refused=String(e).includes('supplied backend one-shot');}
 check(refused,'callback failure');
 const doc=await umf.importPostgresqlSql('SELECT 1 AS value',backend,{id:'pg-browser'});
 const edit=umf.proposePostgresqlNodeEdit(doc,'/stmts/0/stmt/SelectStmt/targetList/0/ResTarget/val/A_Const/ival/ival','2');
 check(edit.validation.valid,'edit admission');
 const sql=await umf.exportPostgresqlSql(edit.document,backend);
 check(sql.includes('2'),'native deparse');
});
window.umfResult={status:results.every(x=>x.status==='pass')?'pass':'fail',results,nodeGlobals:{process:typeof process,Buffer:typeof Buffer}};
`;
const server=createServer(async(request,response)=>{
 const path=new URL(request.url??'/', 'http://127.0.0.1').pathname;
 if(path==='/'){response.setHeader('content-type','text/html');return response.end('<!doctype html><script type="module" src="/entry.js"></script>');}
 if(path==='/entry.js'){response.setHeader('content-type','text/javascript');return response.end(entry);}
 if(path==='/postgresql/runtime.js'||path==='/postgresql/libpg-query.wasm'){
  const file=resolve(repository,'dist'+path);
  response.setHeader('content-type',file.endsWith('.wasm')?'application/wasm':'text/javascript');
  return response.end(await readFile(file));
 }
 if(path==='/smithy-runtime.js'){response.setHeader('content-type','text/javascript');return response.end(await readFile(resolve(repository,'native/smithy/browser/target/javascript/smithy.js')));}
 if(path.startsWith('/fixture/')){
  const root=resolve(repository,'fixtures');
  const file=resolve(root,decodeURIComponent(path.slice(9)));
  if(file.startsWith(root+sep))try{return response.end(await readFile(file));}catch{}
 }
 if(path.startsWith('/sdk/')){
  const file=resolve(sdk,decodeURIComponent(path.slice(5)));
  if(file.startsWith(sdk+sep))try{
   const body=await readFile(file);
   response.setHeader('content-type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.json')?'application/json':'text/javascript');
   return response.end(body);
  }catch{}
 }
 response.writeHead(404);response.end('not found');
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
 const address=server.address();assert(address&&typeof address!=='string');
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();
 const errors=[];const external=[];
 page.on('pageerror',error=>errors.push(String(error)));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){external.push(url.href);return route.abort();}return route.continue();});
 const failedPage=new Promise((_,reject)=>page.once('pageerror',reject));
 await page.goto('http://127.0.0.1:'+address.port+'/');
 await Promise.race([page.waitForFunction(()=>window.umfResult,undefined,{timeout:180000}),failedPage]);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const result=await page.evaluate(()=>window.umfResult);console.log(JSON.stringify(result));assert.equal(result.status,'pass');
 console.log(JSON.stringify({browser:browser.version(),...result}));
}finally{try{await browser?.close();}finally{await new Promise(done=>server.close(done));}}
