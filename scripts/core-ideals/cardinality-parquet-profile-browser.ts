/** Native container discovery and source preservation, not Cardinality acceptance. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {importParquetSchema,inspectParquetContainers} from '../../src';

const proof='fixtures/validation/cardinality-parquet-profile-native.json';
const native=await Bun.file(proof).json();
assert.equal(native.runtime,'PyArrow 21.0.0');
const rows=await Promise.all(native.cases.map(async(row:any)=>{
 const bytes=new Uint8Array(await Bun.file(row.path).arrayBuffer());
 assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
 const inspection=inspectParquetContainers(importParquetSchema(bytes,{id:row.id}));
 assert.equal(inspection.status,'checked');
 return {...row,sourceBytes:Array.from(bytes),containers:inspection.containers};
}));
const build=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm'});
assert.ok(build.success,JSON.stringify(build.logs));
const bundle=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return Response.json(rows);
 return new Response('<!doctype html><html><body>Parquet Cardinality discovery</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{
  if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}
  return route.continue();
 });
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();
  let recoveries=0,columns=0,containers=0,embeddedSchemas=0;
  for(const row of rows){
   const source=u.importParquetSchema(new Uint8Array(row.sourceBytes),{id:row.id});
   const inspected=u.inspectParquetContainers(source),inventory=u.getParquetFieldMetadata(source);
   if(inspected.status!=='checked'||inventory.status!=='checked')throw Error('Unchecked source: '+row.id);
   if(JSON.stringify(inspected.containers)!==JSON.stringify(row.containers))throw Error('Container parity: '+row.id);
   const outer=inspected.containers.find((c:any)=>c.index===1);
   if(row.observations.shape==='array'&&outer?.kind!=='list')throw Error('Missing outer LIST');
   if(row.observations.shape==='map'&&outer?.kind!=='map')throw Error('Missing outer MAP');
   if(row.observations.shape==='one'&&outer)throw Error('Scalar mislabeled container');
   containers+=inspected.containers.length;
   const leaves=inventory.fields.filter((f:any)=>Object.hasOwn(f.nativeField,'type'));
   if(leaves.length!==row.columns.length)throw Error('Column count');
   for(let i=0;i<leaves.length;i++){
    const f=leaves[i],n=row.columns[i];
    if(f.path.join('.')!==n.path||f.definitionLevel!==n.definitionLevel||f.repetitionLevel!==n.repetitionLevel)throw Error('Native level mismatch');
    columns++;
   }
   const arrow=u.getParquetArrowSchema(source);
   if(arrow.status!==(row.storeSchema?'decoded':'absent'))throw Error('Embedded Arrow mismatch');
   if(arrow.status==='decoded')embeddedSchemas++;
   for(const format of ['json','yaml']){
    const back=u.exportParquetCapture(u.readDocument(u.writeDocument(source,format),format));
    if(back.length!==row.sourceBytes.length||back.some((b:number,i:number)=>b!==row.sourceBytes[i]))throw Error('Native bytes changed');
    recoveries++;
   }
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');
  return {files:rows.length,columns,containers,embeddedSchemas,recoveries};
 });
 assert.equal(external.length,0);assert.equal(checks.files,30);assert.equal(checks.recoveries,60);assert.equal(checks.embeddedSchemas,15);
 const paths=[proof,'scripts/core-ideals/cardinality-parquet-native.py','scripts/core-ideals/cardinality-parquet-profile-browser.ts','src/adapters/parquet/containers.ts','src/adapters/parquet/field-metadata.ts','src/adapters/parquet/index.ts',...rows.map((r:any)=>r.path)];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-parquet-profile-browser.json',JSON.stringify({scope:'Native container inspection, level parity and source-byte recovery; no core Cardinality classification/projection acceptance',browser:browser.version(),checks,externalRequests:external,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256,limits:['Browser checks schema metadata and native archive recovery; PyArrow independently checks values.','MAP inspection does not certify uniqueness or string-key compatibility.','Physical and embedded Arrow schemas remain distinct observations.']},null,2)+'\n');
 console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
