import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/parquet/avro/projection.json').json();
const embedded=await Bun.file('fixtures/parquet/arrow-schema/avro-losses.json').json(),boundaries=await Bun.file('fixtures/parquet/arrow-schema/boundaries.json').json();
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/parquet-avro-browser',naming:'umf.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/parquet-avro-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Parquet to Avro</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async ({f,embedded,boundaries})=>{
  const path='/umf.js',u=await import(path),r=u.projectParquetToAvro(f.result.source,f.policy);if(JSON.stringify(r)!==JSON.stringify(f.result))throw Error('Projection differs');
  for(const output of f.exports){const back=u.readDocument(u.writeDocument(r.target,output.format),output.format);if(u.exportAvroSchema(back)!==output.schema)throw Error('Target recovery differs');if(JSON.stringify([...u.exportParquetCapture(u.readDocument(u.writeDocument(r.source,output.format),output.format))])!==JSON.stringify([...u.exportParquetCapture(r.source)]))throw Error('Source bytes differ');}
  if(u.projectParquetToAvro(f.result.source,{...f.policy,lossPolicy:'strict'}).status!=='blocked')throw Error('Strict fidelity not enforced');
  let embeddedRecoveries=0,blockedEmbedded=0;
  for(const c of embedded.cases)for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(c.source,format),format);if(JSON.stringify(u.projectParquetToAvro(back,c.policy))!==JSON.stringify(c.result))throw Error('Embedded loss differs');embeddedRecoveries++;}
  for(const c of boundaries.cases){const result=u.projectParquetToAvro(c.source,embedded.cases[0].policy);if(c.result.status==='blocked'){if(result.status!=='blocked'||result.target||!result.issues.some((i:any)=>i.code==='EMBEDDED_ARROW_SCHEMA_UNINTERPRETED'))throw Error('Uninterpreted embedded schema accepted');blockedEmbedded++;}}
  const chain=u.projectToTableSpecViaAvro(embedded.cases[0].source,embedded.chain.policy);if(JSON.stringify(chain)!==JSON.stringify(embedded.chain))throw Error('Composed losses differ');
  return {mappings:r.mappings.length,recoveries:f.exports.length,issues:r.issues.length,embeddedRecoveries,blockedEmbedded,composedLosses:true,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },{f:fixture,embedded,boundaries});
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write('fixtures/parquet/avro/browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
