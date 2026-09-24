import {chromium} from 'playwright';
const report=await Bun.file('fixtures/parquet/field-metadata.json').json(),cases=[];for(const c of report.results)cases.push({...c,bytes:Array.from(new Uint8Array(await Bun.file(c.path).arrayBuffer()))});
const renameBytes=Array.from(new Uint8Array(await Bun.file('fixtures/parquet/rename/none.parquet').arrayBuffer()));
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/parquet-field-browser',naming:'umf.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/parquet-field-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Parquet fields</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async({cases,renameBytes})=>{
  const path='/umf.js',u=await import(path);let recoveries=0;
  for(const c of cases){const doc=u.importParquetSchema(Uint8Array.from(c.bytes),{id:c.id});for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(doc,format),format);if(JSON.stringify(u.getParquetFieldMetadata(back))!==JSON.stringify(c.view))throw Error('Metadata differs');if(JSON.stringify(Array.from(u.exportParquetCapture(back)))!==JSON.stringify(c.bytes))throw Error('Bytes differ');recoveries++;}}
  const doc=u.importParquetSchema(Uint8Array.from(renameBytes),{id:'rename'}),renamed=u.renameParquetField(doc,1,'renamed');if(renamed.status!=='transformed'||u.getParquetFieldMetadata(renamed.output).fields[0].element.name!=='renamed')throw Error('Rename failed');
  return {schemas:cases.length,recoveries,renames:1,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },{cases,renameBytes});
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write('fixtures/parquet/field-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
